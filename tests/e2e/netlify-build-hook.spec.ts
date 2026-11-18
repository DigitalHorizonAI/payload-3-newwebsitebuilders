import http from 'node:http'

import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'
import { buildHookPort } from './env'

/**
 * Every save of a published post used to call the Netlify build hook, and each
 * call is a whole-site deploy (15 credits). The publishing app saves a new
 * article and then edits older ones to link to it, so one article cost several
 * builds. Saves are now batched: the first starts a wait, the rest ride along,
 * and one call goes out when the wait ends.
 *
 * The e2e server's hook is this fake listener and its wait is 6 s
 * (playwright.config.ts), so the test sees the real REST path end to end.
 */

const WAIT_MS = 6_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let calls = 0
let server: http.Server
let adminAuth: string
let postId: number | undefined

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/netlify-build-hook') calls++
    res.writeHead(200).end()
  })
  await new Promise<void>((resolve) => server.listen(buildHookPort, '127.0.0.1', resolve))
})

test.afterAll(async ({ request }) => {
  if (postId) await request.delete(`/api/posts/${postId}`, { headers: { Authorization: adminAuth } })
  await new Promise((resolve) => server.close(resolve))
})

test('saves of a published post are batched into one build-hook call per wait', async ({ request }) => {
  test.setTimeout(120_000)
  adminAuth = await adminAuthHeader(request)
  const headers = { Authorization: adminAuth }

  // Earlier specs save published posts too; let any wait they started run out first.
  await sleep(WAIT_MS + 1_000)
  calls = 0

  const created = await request.post('/api/posts?locale=en', {
    headers,
    data: { title: 'BUILD HOOK BATCH', _status: 'published', content: 'body' },
  })
  expect(created.ok(), await created.text()).toBe(true)
  postId = (await created.json()).doc.id

  // The publishing app's follow-up link edits: published PATCHes.
  let lastUpdatedAt = ''
  for (let i = 1; i <= 3; i++) {
    const patched = await request.patch(`/api/posts/${postId}?locale=en`, {
      headers,
      data: { title: `BUILD HOOK BATCH ${i}`, _status: 'published' },
    })
    expect(patched.ok(), await patched.text()).toBe(true)
    lastUpdatedAt = (await patched.json()).doc.updatedAt
  }

  await sleep(1_000)
  expect(calls, 'no hook call while the wait runs').toBe(0)
  await expect.poll(() => calls, { timeout: WAIT_MS + 5_000 }).toBe(1)
  await sleep(2_000)
  expect(calls, 'the four saves made exactly one call').toBe(1)

  // A draft save (what autosave sends) starts no wait, and leaves updatedAt
  // alone: the restart check counts posts by updatedAt.
  const draft = await request.patch(`/api/posts/${postId}?locale=en&draft=true`, {
    headers,
    data: { title: 'BUILD HOOK BATCH DRAFT' },
  })
  expect(draft.ok(), await draft.text()).toBe(true)
  const changedSince = () =>
    request
      .get(`/api/posts?where[id][equals]=${postId}&where[updatedAt][greater_than]=${encodeURIComponent(lastUpdatedAt)}&depth=0`, { headers })
      .then((r) => r.json())
      .then((j) => j.totalDocs)
  expect(await changedSince(), 'a draft save does not move updatedAt').toBe(0)
  await sleep(WAIT_MS + 1_000)
  expect(calls, 'a draft save makes no call').toBe(1)

  // A save after the wait ended starts a new one.
  const again = await request.patch(`/api/posts/${postId}?locale=en`, {
    headers,
    data: { title: 'BUILD HOOK BATCH AGAIN', _status: 'published' },
  })
  expect(again.ok(), await again.text()).toBe(true)
  expect(await changedSince(), 'a published save moves updatedAt').toBe(1)
  await expect.poll(() => calls, { timeout: WAIT_MS + 5_000 }).toBe(2)

  // A delete counts too.
  const removed = await request.delete(`/api/posts/${postId}`, { headers })
  expect(removed.ok(), await removed.text()).toBe(true)
  postId = undefined
  await expect.poll(() => calls, { timeout: WAIT_MS + 5_000 }).toBe(3)
})
