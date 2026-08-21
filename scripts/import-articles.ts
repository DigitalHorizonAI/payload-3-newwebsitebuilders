/**
 * Import articles from the Supabase backup JSON into Payload. Run with:
 *
 *   pnpm payload run ./scripts/import-articles.ts -- --limit 5
 *
 * Reads the dated backup produced by the pre-migration snapshot (article rows
 * + mirrored images) and creates categories, media and published posts via the
 * Local API. Idempotent: rows whose slug already exists are skipped, so it can
 * resume after a partial run.
 *
 * It WRITES to the database, so it refuses to run unless DATABASE_URI is
 * local. A production run must pass --allow-remote deliberately.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const BACKUP = 'C:/Dev/digital-horizon/backups/2026-08-03'
const SITE_DOMAIN = process.env.IMPORT_DOMAIN || 'newwebsite.builders'
const SOURCE_JSON = `${BACKUP}/supabase/generated_content-${SITE_DOMAIN === 'heelvrijeten.nl' ? 'heelvrijeten' : 'NewWebsite.builders'}.json`
const IMAGES_ROOT = `${BACKUP}/images/${SITE_DOMAIN}`

/**
 * Rows whose stored body is unrelated English placeholder text (watercolor art,
 * stargazing) under a real Dutch title, written as raw markdown with
 * example.com image URLs. They are broken at the source, not in the migration —
 * regenerate them there rather than carry them across.
 */
const CORRUPT_ROWS = new Set([
  '84ec2406-2840-48ad-9b45-045efbe70628',
  '08829337-018e-4d03-bf58-9e8bac0d4f60',
  '69c487e5-041d-488e-b565-b3d7c8a92da1',
])

const args = process.argv.slice(2)
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity
const ALLOW_REMOTE = args.includes('--allow-remote')

// Set both for a production run: media is uploaded to the live service so the
// files land on its volume. Unset (local runs) media is created in-process.
const MEDIA_UPLOAD_URL = process.env.MEDIA_UPLOAD_URL
const MEDIA_API_KEY = process.env.MEDIA_API_KEY
if (MEDIA_UPLOAD_URL && !MEDIA_API_KEY) throw new Error('MEDIA_UPLOAD_URL needs MEDIA_API_KEY.')

const uri = process.env.DATABASE_URI ?? ''
const isLocal = uri.includes('localhost') || uri.includes('127.0.0.1')
if (!isLocal && !ALLOW_REMOTE) {
  throw new Error(`DATABASE_URI is not local (${uri.replace(/:[^:@/]+@/, ':***@')}). Pass --allow-remote for a deliberate production run.`)
}

/** "https://<site>/images/x.webp" or "/images/x.webp" → local mirrored file, or null. */
function mirroredFile(ref: string | null): string | null {
  if (!ref) return null
  const m = ref.match(/\/images\/(.+?)(\?|$)/)
  if (!m) return null
  const p = path.join(IMAGES_ROOT, decodeURIComponent(m[1]))
  return fs.existsSync(p) && fs.statSync(p).size > 0 ? p : null
}

const run = async () => {
  console.log(`import-articles: domain=${SITE_DOMAIN} limit=${LIMIT} db=${uri.replace(/:[^:@/]+@/, ':***@')}`)
  const payload = await getPayload({ config })
  console.log('payload initialized')
  const editorConfig = await editorConfigFactory.default({ config: payload.config })

  const rows = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf8')) as any[]
  rows.sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''))

  const stats = { created: 0, skippedExisting: 0, skippedCorrupt: 0, noSlug: 0, heroReplaced: 0, heroStillMissing: 0, inlineImgs: 0, inlineDropped: 0, failed: [] as string[] }
  const categoryCache = new Map<string, number>()
  const mediaCache = new Map<string, number>()

  // First image reference per category that actually exists in the mirror, used
  // to give an article whose own hero is broken in production one that matches
  // the site's style. Built up front so it does not depend on import order.
  const categoryHeroRef = new Map<string, string>()
  for (const row of rows) {
    if (!row.category || categoryHeroRef.has(row.category)) continue
    if (mirroredFile(row.main_image)) categoryHeroRef.set(row.category, row.main_image)
  }

  /** Create (or reuse) a media doc for an image reference; null if the file is not in the mirror. */
  const ensureMedia = async (ref: string | null, alt: string): Promise<number | null> => {
    const file = mirroredFile(ref)
    if (!file) return null
    const cached = mediaCache.get(file)
    if (cached) return cached
    const id = MEDIA_UPLOAD_URL ? await uploadMedia(file, alt) : await createMediaLocally(file, alt)
    mediaCache.set(file, id)
    return id
  }

  const createMediaLocally = async (file: string, alt: string): Promise<number> => {
    const media = await payload.create({ collection: 'media', data: { alt }, filePath: file })
    return media.id as number
  }

  /**
   * There is no cloud storage adapter: Payload writes uploads to `public/media`
   * on whichever machine handles the request. Creating media through the Local
   * API from a workstation would therefore leave production rows pointing at
   * files that never left the workstation. Posting to the running service
   * instead puts the file on the server that will serve it.
   */
  const uploadMedia = async (file: string, alt: string): Promise<number> => {
    const ext = path.extname(file).toLowerCase()
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
    const form = new FormData()
    form.append('file', new Blob([fs.readFileSync(file)], { type }), path.basename(file))
    form.append('_payload', JSON.stringify({ alt }))
    const res = await fetch(`${MEDIA_UPLOAD_URL}/api/media`, {
      method: 'POST',
      headers: { Authorization: `apiClients API-Key ${MEDIA_API_KEY}` },
      body: form,
    })
    if (!res.ok) throw new Error(`media upload ${res.status} for ${path.basename(file)}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()).doc.id as number
  }

  /**
   * The HTML converter emits inline <img> as upload nodes stuck in `pending`
   * (the editor's paste flow) — and the site's serializer has no upload case,
   * so they render as nothing. Replace each with a mediaBlock node (which the
   * serializer already renders), and drop the ones whose file is broken in
   * production.
   */
  const resolvePendingUploads = async (node: any, alt: string): Promise<void> => {
    if (Array.isArray(node?.children)) {
      const kept: any[] = []
      for (const child of node.children) {
        if (child?.type === 'upload' && child.pending?.src) {
          const id = await ensureMedia(child.pending.src, alt)
          if (id == null) {
            stats.inlineDropped++
            continue
          }
          kept.push({
            type: 'block',
            fields: { id: randomUUID().replace(/-/g, '').slice(0, 24), blockType: 'mediaBlock', media: id },
            format: '',
            version: 2,
          })
        } else {
          await resolvePendingUploads(child, alt)
          kept.push(child)
        }
      }
      node.children = kept
    }
  }

  const categoryId = async (title: string): Promise<number> => {
    const cached = categoryCache.get(title)
    if (cached) return cached
    const found = await payload.find({ collection: 'categories', where: { title: { equals: title } }, limit: 1 })
    const doc = found.docs[0] ?? (await payload.create({ collection: 'categories', data: { title } }))
    categoryCache.set(title, doc.id as number)
    return doc.id as number
  }

  let processed = 0
  for (const row of rows) {
    if (processed >= LIMIT) break
    if (!row.slug) {
      stats.noSlug++
      continue
    }
    if (CORRUPT_ROWS.has(row.id)) {
      stats.skippedCorrupt++
      continue
    }
    // Source slugs are nested paths (category/subcategory/article). The live
    // SPA already serves the flat /blog/<article> form, and last segments are
    // unique across both sites (verified 390/390 and 180/180), so the post
    // slug is the last segment. Old nested URLs get a patterned redirect at
    // front-end switchover.
    const slug = String(row.slug).split('/').pop() as string
    const existing = await payload.find({ collection: 'posts', where: { slug: { equals: slug } }, limit: 1 })
    if (existing.docs.length) {
      stats.skippedExisting++
      continue
    }
    processed++
    try {
      const html: string = row.content_html || `<p>${row.content ?? ''}</p>`
      stats.inlineImgs += (html.match(/<img\s/g) ?? []).length

      let heroId = await ensureMedia(row.main_image, row.title)
      if (heroId == null && row.main_image) {
        // The hero is one of the images already broken on the live site. Reuse
        // an image the site is serving today — the article's own first working
        // inline image, else a working hero from the same category — so the
        // replacement matches the existing style instead of inventing one.
        const inlineSrcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/g)].map((m) => m[1])
        const fallback = inlineSrcs.find((src) => mirroredFile(src)) ?? categoryHeroRef.get(row.category) ?? null
        heroId = await ensureMedia(fallback, row.title)
        if (heroId == null) stats.heroStillMissing++
        else stats.heroReplaced++
      }

      const content = convertHTMLToLexical({ editorConfig, html, JSDOM })
      await resolvePendingUploads(content.root, row.title)

      const cats: number[] = []
      if (row.category) cats.push(await categoryId(row.category))

      await payload.create({
        collection: 'posts',
        context: { disableRevalidate: true },
        data: {
          title: row.title,
          slug,
          _status: 'published',
          publishedAt: row.published_at ?? row.created_at ?? new Date().toISOString(),
          categories: cats,
          content: content as never,
          meta: {
            title: row.meta_title || row.title,
            description: row.meta_description || row.summary || undefined,
            image: heroId ?? undefined,
          },
        },
      })
      stats.created++
      if (stats.created % 25 === 0) payload.logger.info(`created ${stats.created}...`)
    } catch (e) {
      stats.failed.push(`${row.slug}: ${(e as Error).message.slice(0, 200)}`)
    }
  }

  payload.logger.info(`IMPORT DONE ${JSON.stringify(stats, null, 2)}`)
  process.exit(0)
}

// Top-level await is required: `payload run` exits the process the moment the
// module finishes evaluating, so a fire-and-forget run() dies mid-import.
try {
  await run()
} catch (e) {
  console.error('IMPORT FAILED:', e)
  process.exit(1)
}
