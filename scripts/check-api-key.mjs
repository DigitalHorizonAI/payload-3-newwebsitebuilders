/**
 * What a live API key can and cannot do, checked against production.
 *
 * tests/e2e/api-client-access.spec.ts covers the same ground but bootstraps
 * itself by calling /api/users/first-register and creating its own apiClient.
 * Against production that would leave a junk admin account and a second live
 * key behind, so it stays a local-database spec and this exists instead.
 *
 * The negatives are the point. A key that can publish articles is not the
 * achievement — a key that can do nothing else is. Every negative expects a
 * 403 and therefore writes nothing; only the positive path creates anything,
 * and it is cleaned up as an admin, which the key itself cannot do.
 *
 *   API_KEY='<key>' ADMIN_EMAIL='...' ADMIN_PASSWORD='...' \
 *     node ./scripts/check-api-key.mjs
 */
// This repo's own CMS. It defaulted to cms.digital-horizon.io because this
// script was copied from that repo and never adapted - which would have run the
// positive path, creating and deleting a real article, against ANOTHER CLIENT'S
// live blog while appearing to test this one.
const BASE = process.env.BASE_URL ?? 'https://cms.newwebsite.builders'
const KEY = process.env.API_KEY

if (!KEY) throw new Error('API_KEY is required.')

// The auth scheme interpolates the collection slug verbatim, camelCase and all.
const keyAuth = { Authorization: `apiClients API-Key ${KEY}` }

let failures = 0
const check = (name, actual, expected) => {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}  (got ${actual}, want ${expected})`)
}

const lexical = (text) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [
          { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
        ],
      },
    ],
  },
})

const json = (headers, body) => ({
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const TITLE = `API KEY CHECK — delete me ${new Date().toISOString()}`

console.log(`\nChecking ${BASE}\n\npositive — the key must be able to publish:`)

const created = await fetch(
  `${BASE}/api/posts`,
  json(keyAuth, { title: TITLE, _status: 'published', content: lexical('Temporary.') }),
)
check('POST /api/posts (published)', created.status, 201)
const postId = created.ok ? (await created.json()).doc?.id : null

if (postId) {
  const patched = await fetch(`${BASE}/api/posts/${postId}`, {
    ...json(keyAuth, { title: `${TITLE} (edited)` }),
    method: 'PATCH',
  })
  check('PATCH /api/posts/:id', patched.status, 200)
}

// Cover images are the other half of what the tool does, and the upload shape is
// the part most likely to trip it up: `alt` is required, and the non-file fields
// travel as a JSON string in `_payload` rather than as ordinary form fields.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const form = new FormData()
form.append('file', new Blob([png], { type: 'image/png' }), 'api-key-check.png')
form.append('_payload', JSON.stringify({ alt: 'Temporary upload from the API key check.' }))

const uploaded = await fetch(`${BASE}/api/media`, { method: 'POST', headers: keyAuth, body: form })
check('POST /api/media (multipart)', uploaded.status, 201)
const mediaId = uploaded.ok ? (await uploaded.json()).doc?.id : null

console.log('\nnegative — everything else must be refused:')

// The whole reason apiClients exists rather than a key on Users: this one read
// would otherwise expose every administrator's email address.
check('GET /api/users', (await fetch(`${BASE}/api/users`, { headers: keyAuth })).status, 403)
check(
  'POST /api/users (mint itself an admin)',
  (await fetch(`${BASE}/api/users`, json(keyAuth, { email: 'nope@example.com', password: 'Test1234!' }))).status,
  403,
)
check(
  'POST /api/apiClients (issue itself another key)',
  (await fetch(`${BASE}/api/apiClients`, json(keyAuth, { name: 'second key', enableAPIKey: true, apiKey: crypto.randomUUID() }))).status,
  403,
)

// Blog drafts are readable — a tool that cannot list its own drafts cannot
// manage them. What must stay shut is the marketing site: Pages keeps the
// older rule, so an unpublished page must not be visible here.
const pages = await fetch(`${BASE}/api/pages?draft=true&limit=100`, { headers: keyAuth })
if (pages.ok) {
  const unpublished = (await pages.json()).docs.filter((d) => d._status !== 'published')
  check('GET /api/pages?draft=true leaks no unpublished pages', unpublished.length, 0)
} else {
  console.log(`  ok    GET /api/pages?draft=true refused outright (${pages.status})`)
}

console.log('\npositive — the key manages the blog, so it cleans up after itself:')

if (postId) {
  check(
    'DELETE /api/posts/:id',
    (await fetch(`${BASE}/api/posts/${postId}`, { method: 'DELETE', headers: keyAuth })).status,
    200,
  )
  // The key can no longer read what it deleted, so ask anonymously — the page
  // is public when published, and must be gone now.
  check(
    'test article is really gone',
    (await fetch(`${BASE}/api/posts/${postId}`)).status,
    404,
  )
}

if (mediaId) {
  check(
    'DELETE /api/media/:id',
    (await fetch(`${BASE}/api/media/${mediaId}`, { method: 'DELETE', headers: keyAuth })).status,
    200,
  )
  check('test image is really gone', (await fetch(`${BASE}/api/media/${mediaId}`)).status, 404)
}

console.log(failures === 0 ? '\n✅ all checks passed\n' : `\n❌ ${failures} check(s) failed\n`)
process.exit(failures === 0 ? 0 : 1)
