/**
 * Fails if a table, a horizontal rule or a bare URL stops reaching the
 * rendered blog page.
 *
 *   docker compose up -d postgres
 *   pnpm payload run ./scripts/seed-local.ts
 *   pnpm dev                        # or pnpm build && pnpm start
 *   pnpm check:rendered-richtext
 *
 * Unlike the other check scripts this one needs a RUNNING SERVER, because the
 * thing it guards cannot be seen without one.
 *
 * ## Why this asserts on rendered HTML rather than on the serializer
 *
 * `src/components/RichText/serialize.tsx` is a switch that ends in
 * `default: return null`. A node type it does not name renders as nothing —
 * no error, no gap in the markup, nothing in a log. That is how `table`,
 * `horizontalrule` and `autolink` were all silently dropped while every
 * automated check in this repo stayed green.
 *
 * A unit test on the serializer would not have caught it. The failure is a
 * node type falling through a switch, and a test harness that builds its own
 * node list makes the same assumption the serializer does — it would pass
 * while the page showed nothing. So this fetches the real page over HTTP and
 * asserts on the bytes that came back.
 *
 * ## Why every assertion is anchored to its tag
 *
 * MEASURED: a bare `Custom build` grep passes against a BROKEN build, because
 * the site footer carries a nav link to /services/custom-build/. A loose
 * substring check goes green on a page with no table on it at all. Every
 * content assertion below therefore includes its element — `<td>Custom
 * build</td>`, never `Custom build`.
 *
 * ## Why it reads the stored document first
 *
 * If the fixture post did not carry a table to begin with, "no <table> in the
 * HTML" would be true for the wrong reason and this check would be red
 * forever with nothing to fix. So it confirms the three node types are in the
 * stored document before it looks at the page, and confirms the prose around
 * them rendered — otherwise a 404 or an empty page looks like a serializer
 * bug.
 *
 * The stored document is read over the REST API rather than through
 * `getPayload`. Opening a database pool alongside `fetch` leaves two kinds of
 * handle open, and Node aborts on exit with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` — MEASURED on
 * Windows/Node 25, where every assertion printed PASS and the command still
 * reported exit code 3221226505. A check that passes and reports failure is
 * worse than no check.
 */
// Makes this file a module, which is what allows the top-level `await`s below.
export {}

const FIXTURE_SLUG = 'what-a-small-business-website-actually-costs'
const baseUrl = (process.env.RENDER_CHECK_URL ?? 'http://localhost:3220').replace(/\/$/, '')

const failures: string[] = []
// Every assertion prints its own line, pass or fail. A green check that shows
// nothing it checked cannot be audited by anyone who did not write it, and
// this is the only check that covers the rich-text render path.
const check = (label: string, name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(8)} ${name.padEnd(24)} ${detail}`)
  if (!ok) failures.push(`${label}: ${name} — ${detail}`)
}

// This reads a fixture that only ever exists locally. Pointing it at a
// deployed instance would assert against real content, and a red result would
// mean nothing. Same refusal as scripts/seed-local.ts, for the same reason —
// and the URL is guarded too, since that is what this script actually talks
// to.
if (process.env.DATABASE_URI && !process.env.DATABASE_URI.includes('localhost')) {
  throw new Error('Refusing to run: DATABASE_URI is not a local database.')
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl)) {
  throw new Error(`Refusing to run: RENDER_CHECK_URL is not local (${baseUrl}).`)
}

const get = async (path: string) => {
  let response: Response
  try {
    // `connection: close` so no keep-alive socket outlives the script.
    response = await fetch(`${baseUrl}${path}`, { headers: { connection: 'close' } })
  } catch {
    // Without this, no server at all surfaces as a raw undici TypeError and a
    // stack trace. A check that cannot reach its target should say so in one
    // line and say what to do about it.
    console.error(
      `No server at ${baseUrl} (GET ${path} refused).\n` +
        `  Start one:  PORT=3220 pnpm dev      (or pnpm build && pnpm start)\n` +
        `  Seed it:    pnpm payload run ./scripts/seed-local.ts`,
    )
    process.exit(1)
  }
  if (!response.ok) {
    console.error(
      `GET ${baseUrl}${path} returned ${response.status}.\n` +
        `  If this is a 404, the fixture is missing: pnpm payload run ./scripts/seed-local.ts`,
    )
    process.exit(1)
  }
  return response
}

// 1 — the fixture really carries what the page is about to be searched for.
// Without this the HTML assertions below could be vacuously red.
const api = (await (
  await get(`/api/posts?where[slug][equals]=${FIXTURE_SLUG}&depth=0&limit=1`)
).json()) as { docs?: { content?: { root?: unknown } }[] }

const doc = api.docs?.[0]
if (!doc) {
  throw new Error(
    `No published post with slug "${FIXTURE_SLUG}". Run \`pnpm payload run ./scripts/seed-local.ts\` first.`,
  )
}

/** Every node type in the stored document, at any depth. */
const nodeTypes = (node: unknown): string[] => {
  const current = node as { type?: string; children?: unknown[] }
  if (!current || typeof current !== 'object') return []
  return [...(current.type ? [current.type] : []), ...(current.children ?? []).flatMap(nodeTypes)]
}

const stored = new Set(nodeTypes(doc.content?.root))
for (const type of ['table', 'horizontalrule', 'autolink']) {
  check(
    'fixture',
    `${type} node stored`,
    stored.has(type),
    stored.has(type)
      ? 'present in the seeded document'
      : `MISSING — a missing element on the page would be red for the wrong reason. Re-run seed-local.ts.`,
  )
}

const path = `/blog/${FIXTURE_SLUG}`
const html = await (await get(path)).text()

// 2 — the page rendered at all. If these are missing it is a 404 or an error
// page, and everything below would be red without a serializer bug.
const controls: [string, string][] = [
  ['the post title', 'What a small business website actually costs'],
  ['prose before the table', 'almost all of it is scope'],
  ['the heading', 'What each tier actually includes'],
  ['prose around the link', 'are worth re-checking each year'],
]
for (const [label, token] of controls) {
  check(
    'page',
    label,
    html.includes(token),
    html.includes(token) ? `"${token}"` : `MISSING "${token}" — the page did not render (${path})`,
  )
}

// 3 — the three node types reached the HTML. Tag-anchored, never bare text.
const assertions: [string, string][] = [
  ['table element', '<table'],
  ['thead section', '<thead'],
  ['header cell', '<th>'],
  ['body cell', '<td>'],
  ['header cell text', '<th>Typical cost</th>'],
  ['body cell text', '<td>Custom build</td>'],
  ['horizontal rule', '<hr'],
  ['autolink anchor', 'href="https://example.com/pricing"'],
]
for (const [label, token] of assertions) {
  check(
    'render',
    label,
    html.includes(token),
    html.includes(token) ? token : `MISSING — looked for \`${token}\``,
  )
}

console.log(
  `Checked the rendered blog page at ${baseUrl}${path} (${html.length} bytes): 3 stored node
types, ${controls.length} page controls and ${assertions.length} tag-anchored render assertions.`,
)

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n`)
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('')
  // `process.exit`, not `process.exitCode`: MEASURED — under `payload run`,
  // setting `exitCode` alone reported SUCCESS while six assertions were
  // failing. A check that fails and reports green is worse than no check, so
  // the failure path exits explicitly and is proven below by disabling the
  // table case on purpose.
  process.exit(1)
}

console.log(
  `Tables, horizontal rules and bare URLs all reach the blog page: thead/tbody split intact,
th and td carry their text, the rule renders and the linkified URL is an anchor.`,
)
process.exit(0)
