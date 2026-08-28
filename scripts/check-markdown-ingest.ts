/**
 * Fails if the SEO tool's Markdown can no longer reach `posts.content` as
 * Lexical.
 *
 *   pnpm check:markdown-ingest
 *
 * Needs no database, no browser and no server — like check-access.ts it loads
 * the config and calls the hook directly, so it runs in about a second.
 *
 * ## What this is guarding
 *
 * GetRanked's Payload connector can only emit a Markdown or HTML *string*.
 * `content` is a Lexical richText field, so a string is rejected with
 * `400 "Content > Content" — "This field is required."` — an error that points
 * at a missing field when the real problem is a format mismatch. The hook
 * converts Markdown *or* HTML on the way in. If it stops being attached, or
 * stops producing real headings and lists, every article the tool publishes
 * either 400s or lands as one flat blob of literal `##` and `-` characters.
 *
 * It also covers link safety, but asserts it at the RENDER sink rather than at
 * ingest: neither converter allowlists protocols (Lexical ships an allowlist
 * but applies it only when the editor draws a link), and the hook is only one
 * of four writers into posts.content. So the assertion is on articleHtml's
 * output, which every writer reaches.
 *
 * ## Why it asserts on headings and lists specifically
 *
 * The failure this exists to catch is silent. `editorConfigFactory.default()`
 * resolves to the config-level `defaultLexical` — five features, no headings —
 * and converting against it produces a *valid* Lexical document with every
 * heading flattened to a paragraph and every bullet dropped. It would return
 * 201 and look fine. So asserting "the result is Lexical" proves nothing;
 * asserting the heading and list nodes survived is what catches it.
 *
 * ## What this cannot prove
 *
 * That the hook runs *before* the field's `required` validation — that ordering
 * lives in Payload's own beforeValidate/beforeChange passes and needs a real
 * create against a database. Verified by hand against local Postgres; this
 * script covers everything that does not need one.
 */
import type { Field, RichTextField } from 'payload'

import config from '@payload-config'

import { articleHtml } from '../src/lib/articleHtml'

const resolved = await config
const failures: string[] = []

const check = (label: string, ok: boolean, detail: string) => {
  if (!ok) failures.push(`${label}: ${detail}`)
}

const posts = resolved.collections?.find((c) => c.slug === 'posts')
if (!posts) throw new Error('no `posts` collection in the resolved config')

/** Depth-first: `content` sits inside a tabs field, not at the top level. */
const findField = (fields: Field[], name: string): Field | undefined => {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field
    const nested =
      'fields' in field
        ? field.fields
        : 'tabs' in field
          ? field.tabs.flatMap((tab) => tab.fields)
          : undefined
    if (nested) {
      const hit = findField(nested, name)
      if (hit) return hit
    }
  }
  return undefined
}

const content = findField(posts.fields, 'content') as RichTextField | undefined
if (!content) throw new Error('no `content` field on the posts collection')

// 1 — the hook is actually wired in. Everything below would still pass if the
// field edit were reverted, because it calls the hook directly.
const hooks = content.hooks?.beforeValidate ?? []
check(
  'wiring',
  hooks.length > 0,
  'posts.content has no beforeValidate hook — the SEO tool cannot publish Markdown',
)
if (!hooks.length) {
  console.error(`${failures[0]}`)
  process.exit(1)
}

const run = (value: unknown) =>
  hooks[0]!({ field: content, value } as unknown as Parameters<(typeof hooks)[0]>[0])

// 2 — Markdown converts, and headings and lists survive the conversion.
const converted = (await run(
  ['# Title', '', 'Some prose.', '', '## A section', '', '- first', '- second'].join('\n'),
)) as { root?: { children?: { tag?: string; type?: string }[] } }

const types = converted?.root?.children?.map((child) => child.type) ?? []
check('markdown', types.includes('heading'), `no heading node in the result — got [${types}]`)
check('markdown', types.includes('list'), `no list node in the result — got [${types}]`)
check(
  'markdown',
  converted?.root?.children?.some((child) => child.type === 'heading' && child.tag === 'h2') ??
    false,
  'the `##` did not become an h2 — the editor config is probably the wrong one',
)

// 3 — HTML converts too. The generator emits HTML whatever the connection
// setting says, so refusing it refused every article. Asserted the same way as
// Markdown: it is the *shape* of the result that catches a wrong editor config,
// not the fact that something came back.
const fromHtml = (await run(
  '<h1>Title</h1><p>Some prose.</p><h2>A section</h2><ul><li>first</li><li>second</li></ul>',
)) as { root?: { children?: { tag?: string; type?: string }[] } }

const htmlTypes = fromHtml?.root?.children?.map((child) => child.type) ?? []
check('html', htmlTypes.includes('heading'), `no heading node from HTML — got [${htmlTypes}]`)
check('html', htmlTypes.includes('list'), `no list node from HTML — got [${htmlTypes}]`)
check(
  'html',
  fromHtml?.root?.children?.some((child) => child.type === 'heading' && child.tag === 'h2') ?? false,
  'the <h2> did not become an h2 heading — the editor config is probably the wrong one',
)

// 3b — a real generated article, not a toy string. These are the constructs the
// article writer actually produces, and the two that the repo's other HTML
// parser (scripts/reimport-blog-bodies.ts) throws on: a bare <table> with no
// div.table-scroll wrapper, and a top-level <img>. Measured against a real
// article on 28 Aug: every one of these survives, and the image does not.
const REAL_SHAPE = [
  '<p>Ever asked for a quote and been baffled by the answers?</p>',
  '<img src="https://newwebsite.builders/images/a.webp" alt="A calculator" />',
  '<h2>What drives the price</h2>',
  '<p>One person says <strong>$500</strong>, another says <em>$50,000</em>.</p>',
  '<h3>Scope</h3>',
  '<ul><li>Pages</li><li>Features</li></ul>',
  '<blockquote><p>Cheap work is not good.</p></blockquote>',
  '<table><thead><tr><th>Tier</th><th>Cost</th></tr></thead>',
  '<tbody><tr><td>Basic</td><td>$500</td></tr></tbody></table>',
].join('')

const real = (await run(REAL_SHAPE)) as { root?: { children?: { tag?: string; type?: string }[] } }
const realTypes = (real?.root?.children ?? []).map((child) =>
  child.type === 'heading' ? `heading:${child.tag}` : String(child.type),
)
for (const expected of ['heading:h2', 'heading:h3', 'list', 'quote', 'table', 'paragraph']) {
  check('real-article', realTypes.includes(expected), `no ${expected} — got [${realTypes}]`)
}

// Bold and italic are the only inline formats the article writer uses, and
// articleHtml renders only BOLD/ITALIC/CODE — an UNDERLINE would vanish at
// render time. Assert the two we rely on actually carry their format bits.
const textFormats = new Set<number>()
const collect = (node: { type?: string; format?: number; children?: unknown[] }) => {
  if (node?.type === 'text') textFormats.add(node.format ?? 0)
  for (const child of (node?.children ?? []) as typeof node[]) collect(child)
}
for (const child of (real?.root?.children ?? []) as Parameters<typeof collect>[0][]) collect(child)
check('real-article', textFormats.has(1), 'the <strong> did not produce a BOLD text node')
check('real-article', textFormats.has(2), 'the <em> did not produce an ITALIC text node')

// KNOWN CEILING, asserted so it stays a decision rather than a surprise: the
// content field registers no upload feature, so an <img> has no importer and is
// dropped. If this ever starts passing, images began surviving and the warning
// in the hook should go.
const imageNodes = realTypes.filter((type) => type === 'upload' || type === 'block').length
check(
  'known-ceiling',
  imageNodes === 0,
  `an <img> now produces a node (${imageNodes}) — images may be supported; revisit the hook's warning`,
)

// 3c — a disallowed protocol never reaches a rendered page.
//
// The guard lives at the RENDER sinks, not in the ingest hook, because
// posts.content has four writers and only one of them is the hook: the three
// import scripts and the admin panel write Lexical objects and return at the
// hook's `typeof value !== 'string'` gate. So this asserts on articleHtml's
// output — the string the static sites splice into their pages — rather than on
// the stored tree, which keeps the original URL by design.
//
// Every rejection case FIRST asserts that the input produced a link node at
// all. Without that the assertion is vacuous: `[click](javascript:alert(1))`
// produces no link node, because Payload's markdown link importer excludes
// parentheses from the destination (`([^()\s]+)`), so "no unsafe href
// survived" was trivially true and deleting the guard left the suite green.
const hrefs = (tree: unknown): string[] => {
  const node = tree as { type?: string; fields?: { url?: unknown }; children?: unknown[] }
  if (!node || typeof node !== 'object') return []
  const own =
    node.type === 'link' || node.type === 'autolink' ? [String(node.fields?.url ?? '')] : []
  return [...own, ...(node.children ?? []).flatMap(hrefs)]
}

const renderedHrefs = (html: string): string[] =>
  [...html.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]!)

/** [label, input, what the rendered href must be] */
const linkCases: [string, string, string][] = [
  // Rejected — the href is blanked, the words are kept.
  ['html javascript:', '<p><a href="javascript:alert(1)">click</a></p>', ''],
  // NOT `alert(1)`: the parens break markdown link parsing and no link node is
  // produced, which is what made the old version of this case untestable.
  ['markdown javascript:', '[click](javascript:alert)', ''],
  ['html data:', '<p><a href="data:text/html;base64,PHNjcmlwdD4=">click</a></p>', ''],
  // Nested inside a table cell — every other case is a top-level <p><a>, so a
  // shallow-recursion regression in the serializer would pass without this.
  [
    'html nested in <td>',
    '<table><tbody><tr><td><a href="javascript:alert">click</a></td></tr></tbody></table>',
    '',
  ],
  // Kept — a relative href must survive. This is the whole reason isSafeUrl
  // parses against a base URL; without it every relative link in every article
  // silently loses its href and CMSLink deletes the words from the sentence.
  ['html relative', '<p><a href="about.html">click</a></p>', 'about.html'],
  ['html absolute', '<p><a href="https://example.com/x?a=1">ok</a></p>', 'https://example.com/x?a=1'],
  ['markdown absolute', '[ok](https://example.com/y)', 'https://example.com/y'],
]

for (const [label, input, expected] of linkCases) {
  const tree = (await run(input)) as { root?: unknown }

  // The input must actually produce a link node, or nothing below is a test.
  check(
    'link-safety',
    hrefs(tree.root).length === 1,
    `${label}: expected exactly 1 link node in the tree, got ${hrefs(tree.root).length}. ` +
      'The input does not exercise the guard — this case would pass vacuously.',
  )

  const rendered = renderedHrefs(await articleHtml(tree as never))
  check(
    'link-safety',
    rendered.length === 1 && rendered[0] === expected,
    `${label}: articleHtml rendered href ${JSON.stringify(rendered)}, expected ["${expected}"]`,
  )
}

// 4 — everything that is not a string passes through untouched, so the admin
// panel and existing articles never enter the converted path.
const alreadyLexical = { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } }
check('passthrough', (await run(alreadyLexical)) === alreadyLexical, 'a Lexical value was rewritten')
check('passthrough', (await run(undefined)) === undefined, 'undefined was rewritten')
check('passthrough', (await run('   ')) === '   ', 'a blank string was converted instead of left alone')

console.log(
  `Checked posts.content ingest and link rendering: 7 behaviours (wiring, markdown, html,
real-article, known-ceiling, link-safety, passthrough) over ${linkCases.length} link cases.
`,
)

if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`)
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('')
  process.exit(1)
}

console.log(
  `The SEO tool's Markdown and HTML both reach posts.content as Lexical, with headings, lists,
tables and blockquotes intact, and no disallowed link protocol reaches a rendered page.
Images are dropped — the field has no upload feature.`,
)
