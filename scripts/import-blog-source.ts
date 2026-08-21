/**
 * Load the four existing newwebsite.builders articles into this CMS, in both
 * languages, from scripts/blog-source.json (written by extract-from-repo.py
 * out of the front-end repo's blog/_build/content.py).
 *
 * Each article is ONE document with an `en` and an `nl` locale, not two
 * documents. That is what makes the admin's language switcher work and what
 * lets `de` and `es` be added later by translating in place.
 *
 * `legacyPath` carries the address the article already has on the live site,
 * including the `.html`, so the static builder can keep serving every URL
 * Google has already indexed. Losing none of them is the bar the 4 Aug
 * switchover set on the two SEO sites.
 *
 * Idempotent: re-running updates the same documents, matched on the English
 * slug. Creates nothing else, deletes nothing.
 */
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { getPayload } from 'payload'
import config from '@payload-config'

type Lang = { slug: string; title: string; h1: string | null; excerpt: string | null;
  description: string | null; keywords: string | null; body: string; legacyPath: string }
type Post = { id: string; topic: string; art: string | null; published: string;
  langs: Record<string, Lang> }

/** Visible text only, so two representations of the same article compare. */
const textOf = (node: any): string => {
  if (!node || typeof node !== 'object') return ''
  let out = typeof node.text === 'string' ? node.text : ''
  for (const child of node.children ?? []) out += ' ' + textOf(child)
  return out
}
const normalise = (s: string) => s.replace(/\s+/g, ' ').trim()

const run = async () => {
  const payload = await getPayload({ config })
  const editorConfig = await editorConfigFactory.default({ config: payload.config })
  const raw = readFileSync('scripts/blog-source.json', 'utf8')
  // extract-from-repo.py writes through a shell redirect, so the encoding is the
  // shell's and not ours. It emits pure ASCII for exactly that reason. A U+FFFD
  // here means it did not, and the 54 accents in the Dutch articles would land in
  // the CMS as garbage - which the 97% length check below cannot see, because a
  // replacement character is still one character.
  const replacementChars = (raw.match(/�/g) ?? []).length
  if (replacementChars > 0) {
    throw new Error(
      `blog-source.json holds ${replacementChars} replacement characters. ` +
        `Re-run: python scripts/extract-from-repo.py > scripts/blog-source.json`,
    )
  }
  const source = JSON.parse(raw) as {
    author: string
    topics: Record<string, Record<string, string>>
    posts: Post[]
  }

  // Topics become categories. The website keeps its own per-language labels
  // for them, so the CMS only has to carry the key.
  const categoryIds: Record<string, number> = {}
  for (const key of Object.keys(source.topics)) {
    const found = await payload.find({
      collection: 'categories', where: { title: { equals: key } }, limit: 1, pagination: false,
    })
    // Postgres ids are numbers; the generated types accept a number or a
    // populated Category, never a string.
    categoryIds[key] = Number(
      found.docs[0]?.id ?? (await payload.create({ collection: 'categories', data: { title: key } })).id,
    )
  }
  console.log(`categories: ${Object.keys(categoryIds).join(', ')}\n`)

  for (const post of source.posts) {
    const existing = await payload.find({
      collection: 'posts', locale: 'en',
      where: { slug: { equals: post.langs.en.slug } }, limit: 1, pagination: false,
    })
    let id: number | undefined = existing.docs[0]?.id ? Number(existing.docs[0].id) : undefined

    for (const locale of ['en', 'nl'] as const) {
      const src = post.langs[locale]
      const content = convertHTMLToLexical({ editorConfig, html: src.body, JSDOM })

      // The conversion must not quietly drop content. Compare the visible text
      // of the source HTML against the visible text of the Lexical tree: a
      // block the converter does not understand shows up here as missing
      // characters, which a heading count alone would not catch.
      const sourceText = normalise(new JSDOM(`<body>${src.body}</body>`).window.document.body.textContent ?? '')
      const lexicalText = normalise(textOf({ children: content.root.children }))
      const kept = lexicalText.length / Math.max(sourceText.length, 1)
      if (kept < 0.97) {
        throw new Error(
          `${src.slug} [${locale}]: conversion kept ${(kept * 100).toFixed(1)}% of the text ` +
            `(${lexicalText.length} of ${sourceText.length} chars) - content was dropped`,
        )
      }

      // The afterChange hook calls Next's revalidatePath, which only works
      // inside a request; the hook offers this opt-out for exactly this case.
      const context = { disableRevalidate: true }

      await (id
        ? payload.update({ collection: 'posts', id, locale, data: buildData(), context })
        : payload.create({ collection: 'posts', locale, data: buildData(), context }).then((d) => { id = Number(d.id); return d }))

      function buildData() {
        return {
          title: src.title,
          slug: src.slug,
          h1Html: src.h1 ?? undefined,
          excerpt: src.excerpt ?? undefined,
          legacyPath: src.legacyPath,
          byline: source.author,
          content,
          categories: [categoryIds[post.topic]],
          publishedAt: new Date(`${post.published}T09:00:00.000Z`).toISOString(),
          meta: { title: src.title, description: src.description, keywords: src.keywords },
          _status: 'published' as const,
        }
      }

      console.log(`  ${locale}  ${(kept * 100).toFixed(1)}% text kept  ${src.legacyPath}`)
    }
    console.log(`${post.id} -> id ${id}\n`)
  }

  console.log(`posts in collection: ${(await payload.count({ collection: 'posts' })).totalDocs}`)
  process.exit(0)
}

await run()
