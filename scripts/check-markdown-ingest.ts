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
 * converts Markdown on the way in. If it stops being attached, or stops
 * producing real headings and lists, every article the tool publishes either
 * 400s or lands as one flat blob of literal `##` and `-` characters.
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

// 3 — HTML is refused loudly, naming the fix. Silently feeding HTML to a
// Markdown parser stores mangled content and returns 201, which looks like
// success to everyone including us.
let htmlRejected = false
let htmlMessage = ''
try {
  await run('<h2>A section</h2><p>Some prose.</p>')
} catch (error) {
  htmlRejected = true
  htmlMessage = error instanceof Error ? error.message : String(error)
}
check('html', htmlRejected, 'an HTML string was accepted and parsed as Markdown')
check(
  'html',
  htmlMessage.includes('Markdown'),
  `the rejection does not name the fix: ${htmlMessage || '(no message)'}`,
)

// 4 — everything that is not a string passes through untouched, so the admin
// panel and existing articles never enter the converted path.
const alreadyLexical = { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } }
check('passthrough', (await run(alreadyLexical)) === alreadyLexical, 'a Lexical value was rewritten')
check('passthrough', (await run(undefined)) === undefined, 'undefined was rewritten')
check('passthrough', (await run('   ')) === '   ', 'a blank string was converted instead of left alone')

console.log(`Checked posts.content ingest: ${4} behaviours (wiring, markdown, html, passthrough).\n`)

if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`)
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('')
  process.exit(1)
}

console.log('The SEO tool\'s Markdown reaches posts.content as Lexical, with headings and lists intact.')
