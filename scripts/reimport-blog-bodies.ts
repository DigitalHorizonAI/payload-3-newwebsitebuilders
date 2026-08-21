/**
 * Re-import the four articles' bodies from the hand-written source HTML,
 * without losing structure this time.
 *
 * The first import (import-blog-source.ts) converted with the config-level
 * editor and guarded only on text length, so every heading anchor, keybox,
 * code block and table kept its words and lost its markup. This importer is
 * built backwards from the fix's only real proof: parse the source HTML into
 * Lexical, render it back through the same serializer the public API uses
 * (src/lib/articleHtml.ts), and REFUSE to write unless the round-trip is
 * byte-identical to the source. One guard, and it cannot pass a lossy import.
 *
 * Modes (env, because `payload run` strips argv):
 *
 *   REIMPORT_MODE=check   (default) offline: round-trip all 8 files, write
 *                         nothing, exit non-zero on any mismatch.
 *   REIMPORT_MODE=write   PATCH the `content` field per post per locale over
 *                         REST. Needs CMS_TARGET_URL, CMS_EMAIL, CMS_PASSWORD.
 *                         Only `content` (and the already-true _status) is
 *                         sent — title, excerpt, h1 and SEO fields were
 *                         imported correctly the first time and are not
 *                         touched. Goes over HTTP so this laptop never opens
 *                         a direct database connection to production.
 *
 *   BODIES_DIR            where the source files live; defaults to the
 *                         sibling front-end repo checkout.
 *
 * Run: pnpm reimport:blog:check   /   pnpm reimport:blog:write
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

import { articleHtml } from '../src/lib/articleHtml'

const BODIES_DIR =
  process.env.BODIES_DIR ?? path.resolve(process.cwd(), '../newwebsitebuilders/blog/_build/bodies')

/** English slug → source file key, as /blog/posts.json has published them
 * since the feed existed (mirrors LEGACY_IDS in the front-end's content.py). */
const FILE_KEY_BY_EN_SLUG: Record<string, string> = {
  'seo-and-geo-getting-cited-in-ai-answers': 'geo',
  'hand-coded-versus-page-builders': 'handcoded',
  'what-a-cms-actually-gives-you': 'cms',
  'what-to-prepare-before-a-website-build': 'prepare',
}

const LOCALES = ['en', 'nl'] as const

// Lexical text-format bits.
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

/** Inline content: text with bold/italic/code formats, links, line breaks.
 * Throws on anything else — an unknown inline element is exactly the kind of
 * markup the first import silently flattened. */
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
  // innerHTML, deliberately: the hand-written highlight spans and any escaped
  // entities are part of the display-ready text the serializer emits verbatim.
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

const readBody = (key: string, locale: string): string =>
  readFileSync(path.join(BODIES_DIR, `${key}.${locale}.html`), 'utf8')
    .replace(/\r\n/g, '\n')
    .trimEnd()

/** First differing position, shown with context — "they differ" alone is not
 * actionable at 23:00. */
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

type RoundTrip = { key: string; locale: string; content: Json; html: string }

const roundTripAll = async (): Promise<RoundTrip[]> => {
  const results: RoundTrip[] = []
  const failures: string[] = []
  for (const key of Object.values(FILE_KEY_BY_EN_SLUG)) {
    for (const locale of LOCALES) {
      const source = readBody(key, locale)
      const content = rootOf(parseBody(source))
      const rendered = await articleHtml(content as never, { strict: true })
      if (rendered === source) {
        console.log(`  OK   ${key}.${locale}.html  (${source.length} chars, byte-identical)`)
        results.push({ key, locale, content, html: source })
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

// --- write mode -----------------------------------------------------------

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

  // The document ids, from the public listing - `id` is the one field the
  // API returns that is not localized.
  const listing = (await (await fetch(api(base, '/articles?locale=en&limit=500'))).json()) as {
    docs: { id: number; slug: string }[]
  }
  const idByKey: Record<string, number> = {}
  for (const doc of listing.docs) {
    const key = FILE_KEY_BY_EN_SLUG[doc.slug]
    if (key) idByKey[key] = doc.id
  }
  const missing = Object.values(FILE_KEY_BY_EN_SLUG).filter((k) => !(k in idByKey))
  if (missing.length) throw new Error(`articles not found in the CMS: ${missing.join(', ')}`)

  for (const trip of trips) {
    const id = idByKey[trip.key]
    const res = await fetch(api(base, `/posts/${id}?locale=${trip.locale}&depth=0`), {
      body: JSON.stringify({ _status: 'published', content: trip.content }),
      headers: auth,
      method: 'PATCH',
    })
    if (!res.ok) {
      throw new Error(`PATCH ${trip.key} [${trip.locale}] failed: ${res.status} ${await res.text()}`)
    }
    console.log(`  wrote ${trip.key} [${trip.locale}] -> post ${id}`)
  }

  // The proof, from the outside: what the public API now serves must equal
  // the source files byte for byte, per locale.
  console.log('\nverifying through /api/articles:')
  const failures: string[] = []
  for (const locale of LOCALES) {
    const localeListing = (await (
      await fetch(api(base, `/articles?locale=${locale}&limit=500`))
    ).json()) as { docs: { id: number; slug: string }[] }
    for (const doc of localeListing.docs) {
      const enSlug = listing.docs.find((d) => d.id === doc.id)?.slug ?? ''
      const key = FILE_KEY_BY_EN_SLUG[enSlug]
      if (!key) continue
      const article = (await (
        await fetch(api(base, `/articles/${encodeURIComponent(doc.slug)}?locale=${locale}`))
      ).json()) as { contentHtml?: string }
      const expected = readBody(key, locale)
      if (article.contentHtml === expected) {
        console.log(`  OK   ${key} [${locale}] serves byte-identical HTML`)
      } else {
        failures.push(
          `${key} [${locale}]: ${firstDiff(expected, article.contentHtml ?? '')}`,
        )
      }
    }
  }
  if (failures.length) {
    throw new Error(`LIVE VERIFICATION FAILED:\n\n${failures.join('\n\n')}`)
  }
}

const run = async () => {
  const mode = process.env.REIMPORT_MODE ?? 'check'
  console.log(`mode: ${mode}\nbodies: ${BODIES_DIR}\n\nround-trip check:`)
  const trips = await roundTripAll()
  if (mode === 'write') {
    console.log(`\nwriting to ${process.env.CMS_TARGET_URL}:`)
    await writeAll(trips)
  }
  console.log('\ndone')
  process.exit(0)
}

await run()
