/**
 * Import the German and Spanish translations of the four articles.
 *
 * Same guard as reimport-blog-bodies.ts, whose parser this copies verbatim
 * (that script is a finished one-shot and stays untouched): parse each
 * translated HTML fragment into Lexical, render it back through the same
 * serializer the public API uses (src/lib/articleHtml.ts), and REFUSE to
 * write unless the round-trip is byte-identical to the source file.
 *
 * Unlike the re-import, a translation fills locales that are EMPTY, so this
 * writes every localized field, not just `content`: title, slug, legacyPath,
 * excerpt, h1Html and the meta tab all come from translations/meta.json;
 * the body comes from translations/<key>.<locale>.html.
 *
 * The front end treats a locale as untranslated when slug, title and body
 * all equal the English fallback (content.py _is_untranslated), so the
 * post-write verification also asserts each of the three differs from EN.
 *
 * Modes (env, because `payload run` strips argv):
 *
 *   TRANSLATE_MODE=check  (default) offline: round-trip all 8 files, write
 *                         nothing, exit non-zero on any mismatch.
 *   TRANSLATE_MODE=write  PATCH every localized field per post per locale
 *                         over REST. Needs CMS_TARGET_URL, CMS_EMAIL,
 *                         CMS_PASSWORD. Goes over HTTP so this laptop never
 *                         opens a direct database connection to production.
 *
 * Run: pnpm translate:check   /   pnpm translate:write
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

import { articleHtml } from '../src/lib/articleHtml'

const TRANSLATIONS_DIR = path.resolve(process.cwd(), 'scripts/translations')

/** English slug → source file key, as in reimport-blog-bodies.ts. */
const FILE_KEY_BY_EN_SLUG: Record<string, string> = {
  'seo-and-geo-getting-cited-in-ai-answers': 'geo',
  'hand-coded-versus-page-builders': 'handcoded',
  'what-a-cms-actually-gives-you': 'cms',
  'what-to-prepare-before-a-website-build': 'prepare',
}

const LOCALES = ['de', 'es'] as const
type Locale = (typeof LOCALES)[number]

type Meta = {
  title: string
  slug: string
  h1Html: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  keywords: string
}

const META: Record<string, Record<Locale, Meta>> = JSON.parse(
  readFileSync(path.join(TRANSLATIONS_DIR, 'meta.json'), 'utf8'),
)

// --- HTML → Lexical, copied verbatim from reimport-blog-bodies.ts ---------

const BOLD = 1
const ITALIC = 2
const CODE = 16

type Json = Record<string, unknown>

const oid = () => randomBytes(12).toString('hex')

const textNode = (text: string, format: number): Json => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
})

const element = (type: string, children: Json[], extra: Json = {}): Json => ({
  children,
  direction: null,
  format: '',
  indent: 0,
  type,
  version: 1,
  ...extra,
})

const rootOf = (children: Json[]): Json => ({
  root: element('root', children),
})

const parseInline = (container: Element, format = 0): Json[] => {
  const out: Json[] = []
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === 3) {
      const text = node.textContent ?? ''
      if (text) out.push(textNode(text, format))
      continue
    }
    if (node.nodeType !== 1) continue
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'strong' || tag === 'b') out.push(...parseInline(el, format | BOLD))
    else if (tag === 'em' || tag === 'i') out.push(...parseInline(el, format | ITALIC))
    else if (tag === 'code') out.push(...parseInline(el, format | CODE))
    else if (tag === 'br') out.push({ type: 'linebreak', version: 1 })
    else if (tag === 'a')
      out.push({
        ...element('link', parseInline(el, format), { version: 3 }),
        fields: {
          linkType: 'custom',
          newTab: false,
          url: el.getAttribute('href') ?? '',
        },
        id: oid(),
      })
    else throw new Error(`parseInline: unexpected <${tag}> in "${container.textContent?.slice(0, 60)}"`)
  }
  return out
}

const paragraph = (el: Element): Json =>
  element('paragraph', parseInline(el), { textFormat: 0, textStyle: '' })

const parseTable = (tableEl: Element): Json => {
  const rows: Json[] = []
  for (const tr of Array.from(tableEl.querySelectorAll('tr'))) {
    const cells = Array.from(tr.children).map((cell) => ({
      ...element('tablecell', [
        element('paragraph', parseInline(cell), { textFormat: 0, textStyle: '' }),
      ]),
      backgroundColor: null,
      colSpan: 1,
      headerState: cell.tagName.toLowerCase() === 'th' ? 1 : 0,
      rowSpan: 1,
    }))
    rows.push(element('tablerow', cells))
  }
  return element('table', rows)
}

const parseKeybox = (div: Element): Json => {
  const label = div.querySelector(':scope > span.label')?.textContent ?? null
  const paragraphs = Array.from(div.querySelectorAll(':scope > p')).map(paragraph)
  return {
    fields: {
      blockName: '',
      blockType: 'banner',
      content: rootOf(paragraphs),
      id: oid(),
      label,
      style: 'info',
    },
    format: '',
    type: 'block',
    version: 2,
  }
}

const parseCode = (pre: Element): Json => {
  const codeEl = pre.querySelector(':scope > code')
  if (!codeEl) throw new Error('parseCode: <pre> without <code>')
  const code = codeEl.innerHTML
  const language = code.includes('<span') ? 'plain' : code.trimStart().startsWith('{') ? 'json' : 'plain'
  return {
    fields: { blockName: '', blockType: 'code', code, id: oid(), language },
    format: '',
    type: 'block',
    version: 2,
  }
}

const parseBody = (html: string): Json[] => {
  const dom = new JSDOM(`<body>${html}</body>`)
  const body = dom.window.document.body
  const out: Json[] = []
  for (const node of Array.from(body.childNodes) as ChildNode[]) {
    if (node.nodeType === 3) {
      if ((node.textContent ?? '').trim()) throw new Error('parseBody: stray top-level text')
      continue
    }
    if (node.nodeType !== 1) continue
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'p') out.push(paragraph(el))
    else if (/^h[1-6]$/.test(tag)) out.push(element('heading', parseInline(el), { tag }))
    else if (tag === 'ul' || tag === 'ol')
      out.push(
        element(
          'list',
          Array.from(el.children).map((li, i) =>
            element('listitem', parseInline(li), { value: i + 1 }),
          ),
          { listType: tag === 'ol' ? 'number' : 'bullet', start: 1, tag },
        ),
      )
    else if (tag === 'blockquote')
      out.push(element('quote', Array.from(el.querySelectorAll(':scope > p')).map(paragraph)))
    else if (tag === 'div' && el.classList.contains('keybox')) out.push(parseKeybox(el))
    else if (tag === 'div' && el.classList.contains('table-scroll')) {
      const table = el.querySelector(':scope > table')
      if (!table) throw new Error('parseBody: table-scroll without a table')
      out.push(parseTable(table))
    } else if (tag === 'pre') out.push(parseCode(el))
    else if (tag === 'hr') out.push({ type: 'horizontalrule', version: 1 })
    else throw new Error(`parseBody: unexpected top-level <${tag}>`)
  }
  return out
}

// --- round-trip check ------------------------------------------------------

const readBody = (key: string, locale: string): string =>
  readFileSync(path.join(TRANSLATIONS_DIR, `${key}.${locale}.html`), 'utf8')
    .replace(/\r\n/g, '\n')
    .trimEnd()

const firstDiff = (a: string, b: string): string => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const from = Math.max(0, i - 60)
  return (
    `first difference at char ${i}\n` +
    `  source:     ...${JSON.stringify(a.slice(from, i + 80))}\n` +
    `  round-trip: ...${JSON.stringify(b.slice(from, i + 80))}`
  )
}

type RoundTrip = { key: string; locale: Locale; content: Json; html: string; meta: Meta }

const roundTripAll = async (): Promise<RoundTrip[]> => {
  const results: RoundTrip[] = []
  const failures: string[] = []
  for (const key of Object.values(FILE_KEY_BY_EN_SLUG)) {
    for (const locale of LOCALES) {
      const meta = META[key]?.[locale]
      if (!meta) throw new Error(`meta.json has no ${key}.${locale} entry`)
      const source = readBody(key, locale)
      const content = rootOf(parseBody(source))
      const rendered = await articleHtml(content as never, { strict: true })
      if (rendered === source) {
        console.log(`  OK   ${key}.${locale}.html  (${source.length} chars, byte-identical)  slug: ${meta.slug}`)
        results.push({ key, locale, content, html: source, meta })
      } else {
        failures.push(`${key}.${locale}.html: ${firstDiff(source, rendered)}`)
      }
    }
  }
  if (failures.length) {
    throw new Error(`round-trip NOT byte-identical:\n\n${failures.join('\n\n')}`)
  }
  return results
}

// --- write mode ------------------------------------------------------------

const api = (base: string, p: string) => `${base.replace(/\/$/, '')}/api${p}`

const writeAll = async (trips: RoundTrip[]) => {
  const base = process.env.CMS_TARGET_URL
  const email = process.env.CMS_EMAIL
  const password = process.env.CMS_PASSWORD
  if (!base || !email || !password) {
    throw new Error('write mode needs CMS_TARGET_URL, CMS_EMAIL and CMS_PASSWORD')
  }

  const login = await fetch(api(base, '/users/login'), {
    body: JSON.stringify({ email, password }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`)
  const token = ((await login.json()) as { token?: string }).token
  if (!token) throw new Error('login returned no token')
  const auth = { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }

  const enListing = (await (await fetch(api(base, '/articles?locale=en&limit=500'))).json()) as {
    docs: { id: number; slug: string; title: string; contentHtml?: string }[]
  }
  const idByKey: Record<string, number> = {}
  for (const doc of enListing.docs) {
    const key = FILE_KEY_BY_EN_SLUG[doc.slug]
    if (key) idByKey[key] = doc.id
  }
  const missing = Object.values(FILE_KEY_BY_EN_SLUG).filter((k) => !(k in idByKey))
  if (missing.length) throw new Error(`articles not found in the CMS: ${missing.join(', ')}`)

  for (const trip of trips) {
    const id = idByKey[trip.key]
    const m = trip.meta
    const res = await fetch(api(base, `/posts/${id}?locale=${trip.locale}&depth=0`), {
      body: JSON.stringify({
        _status: 'published',
        content: trip.content,
        excerpt: m.excerpt,
        h1Html: m.h1Html,
        legacyPath: `${trip.locale}/${m.slug}.html`,
        meta: { title: m.metaTitle, description: m.metaDescription, keywords: m.keywords },
        slug: m.slug,
        title: m.title,
      }),
      headers: auth,
      method: 'PATCH',
    })
    if (!res.ok) {
      throw new Error(`PATCH ${trip.key} [${trip.locale}] failed: ${res.status} ${await res.text()}`)
    }
    console.log(`  wrote ${trip.key} [${trip.locale}] -> post ${id}`)
  }

  // The proof, from the outside: the public API must serve the translated
  // slug and byte-identical HTML, and slug/title/body must each differ from
  // English - the three checks content.py uses to detect an untranslated
  // fallback locale.
  console.log('\nverifying through /api/articles:')
  const enByKey: Record<string, { slug: string; title: string; contentHtml?: string }> = {}
  for (const doc of enListing.docs) {
    const key = FILE_KEY_BY_EN_SLUG[doc.slug]
    if (key) {
      const detail = (await (
        await fetch(api(base, `/articles/${encodeURIComponent(doc.slug)}?locale=en`))
      ).json()) as { slug: string; title: string; contentHtml?: string }
      enByKey[key] = detail
    }
  }
  const failures: string[] = []
  for (const trip of trips) {
    const article = (await (
      await fetch(api(base, `/articles/${encodeURIComponent(trip.meta.slug)}?locale=${trip.locale}`))
    ).json()) as { slug?: string; title?: string; contentHtml?: string; path?: string }
    if (!article.slug) {
      failures.push(`${trip.key} [${trip.locale}]: /api/articles/${trip.meta.slug} not found`)
      continue
    }
    const en = enByKey[trip.key]
    if (article.contentHtml !== trip.html) {
      failures.push(`${trip.key} [${trip.locale}]: ${firstDiff(trip.html, article.contentHtml ?? '')}`)
    }
    if (article.slug === en.slug || article.title === en.title || article.contentHtml === en.contentHtml) {
      failures.push(`${trip.key} [${trip.locale}]: still equals the English fallback`)
    }
    if (article.path !== `/blog/${trip.locale}/${trip.meta.slug}.html`) {
      failures.push(`${trip.key} [${trip.locale}]: path is ${article.path}`)
    }
    if (!failures.some((f) => f.startsWith(`${trip.key} [${trip.locale}]`))) {
      console.log(`  OK   ${trip.key} [${trip.locale}] serves ${article.path}, byte-identical, distinct from EN`)
    }
  }
  if (failures.length) {
    throw new Error(`LIVE VERIFICATION FAILED:\n\n${failures.join('\n\n')}`)
  }
}

const run = async () => {
  const mode = process.env.TRANSLATE_MODE ?? 'check'
  console.log(`mode: ${mode}\ntranslations: ${TRANSLATIONS_DIR}\n\nround-trip check:`)
  const trips = await roundTripAll()
  if (mode === 'write') {
    console.log(`\nwriting to ${process.env.CMS_TARGET_URL}:`)
    await writeAll(trips)
  }
  console.log('\ndone')
  process.exit(0)
}

await run()
