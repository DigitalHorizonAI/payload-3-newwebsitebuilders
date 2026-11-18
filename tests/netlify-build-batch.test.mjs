// Drives the Netlify build batch with fake timers and a fake fetch: it never calls a real hook.
// Run: node --test tests/netlify-build-batch.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  startNetlifyBuildBatch,
  triggerNetlifyBuild,
  triggerNetlifyBuildOnDelete,
} from '../src/collections/Posts/hooks/triggerNetlifyBuild.ts'

const HOOK = 'https://api.netlify.example/build_hooks/secret-id'
const NOW = Date.parse('2026-11-18T10:00:00.000Z')

// A fresh fake Payload per test: the batch is kept per Payload instance.
async function setup({ env = { NETLIFY_BUILD_HOOK_URL: HOOK }, recentlyChanged = 0, hook = { ok: true, status: 200 } } = {}) {
  const lines = { info: [], error: [] }
  const timers = []
  const posts = []
  const counts = []
  const payload = {
    logger: { info: (m) => lines.info.push(m), error: (m) => lines.error.push(m) },
    count: async (args) => {
      counts.push(args)
      if (recentlyChanged instanceof Error) throw recentlyChanged
      return { totalDocs: recentlyChanged }
    },
  }
  await startNetlifyBuildBatch(payload, {
    env,
    now: () => NOW,
    setTimer: (fn, ms) => {
      const t = { fn, ms, fired: false }
      timers.push(t)
      return { unref() {} }
    },
    fetchFn: async (url, init) => {
      posts.push({ url, method: init?.method })
      if (hook instanceof Error) throw hook
      return hook
    },
  })
  const fire = async () => {
    const t = timers.find((x) => !x.fired)
    assert.ok(t, 'expected a pending wait')
    t.fired = true
    await t.fn()
  }
  const req = { payload }
  const save = (doc, context = {}) => triggerNetlifyBuild({ context, doc, req })
  const remove = (doc, context = {}) => triggerNetlifyBuildOnDelete({ context, doc, req })
  return { lines, timers, posts, counts, fire, save, remove, pending: () => timers.filter((t) => !t.fired).length }
}

const published = (slug = 'a-post') => ({ _status: 'published', slug })

test('saves inside one window make one build-hook call when the wait ends', async () => {
  const s = await setup()
  for (let i = 0; i < 5; i++) await s.save(published(`post-${i}`))
  assert.equal(s.timers.length, 1)
  assert.equal(s.posts.length, 0, 'no call before the wait ends')
  await s.fire()
  assert.deepEqual(s.posts, [{ url: HOOK, method: 'POST' }])
})

test('a save after the window starts a second wait and a second call', async () => {
  const s = await setup()
  await s.save(published())
  await s.fire()
  await s.save(published())
  assert.equal(s.pending(), 1)
  await s.fire()
  assert.equal(s.posts.length, 2)
})

test('the wait is 15 minutes by default and follows NETLIFY_BUILD_BATCH_MINUTES', async () => {
  const cases = [
    [undefined, 900_000],
    ['0.1', 6_000],
    ['5', 300_000],
    ['abc', 900_000],
    ['0', 900_000],
    ['-5', 900_000],
    ['', 900_000],
  ]
  for (const [minutes, ms] of cases) {
    const s = await setup({ env: { NETLIFY_BUILD_HOOK_URL: HOOK, NETLIFY_BUILD_BATCH_MINUTES: minutes } })
    await s.save(published())
    assert.equal(s.timers[0].ms, ms, `NETLIFY_BUILD_BATCH_MINUTES=${minutes}`)
  }
})

test('a delete starts a wait like a published save', async () => {
  const s = await setup()
  await s.remove({ slug: 'gone' })
  await s.fire()
  assert.equal(s.posts.length, 1)
})

test('a delete during a wait rides along', async () => {
  const s = await setup()
  await s.save(published())
  await s.remove({ slug: 'gone' })
  assert.equal(s.timers.length, 1)
})

test('a draft save (autosave) does not start a wait', async () => {
  const s = await setup()
  await s.save({ _status: 'draft', slug: 'a-post' })
  assert.equal(s.timers.length, 0)
})

test('disableRevalidate opts a script out on save and on delete', async () => {
  const s = await setup()
  await s.save(published(), { disableRevalidate: true })
  await s.remove({ slug: 'gone' }, { disableRevalidate: true })
  assert.equal(s.timers.length, 0)
})

test('hooks return the doc unchanged', async () => {
  const s = await setup()
  const doc = published()
  assert.equal(await s.save(doc), doc)
  assert.equal(await s.remove(doc), doc)
})

test('no hook URL: no wait, no call, no restart query, one info line', async () => {
  const s = await setup({ env: {}, recentlyChanged: 3 })
  await s.save(published())
  assert.equal(s.timers.length, 0)
  assert.equal(s.counts.length, 0)
  assert.equal(s.posts.length, 0)
  assert.ok(s.lines.info.some((l) => l.includes('NETLIFY_BUILD_HOOK_URL is not set')))
})

test('a hook that answers 500 is logged as an error, not thrown', async () => {
  const s = await setup({ hook: { ok: false, status: 500 } })
  await s.save(published())
  await s.fire()
  assert.equal(s.lines.error.length, 1)
  assert.match(s.lines.error[0], /500/)
})

test('an unreachable hook is logged as an error, not thrown, and the next save still batches', async () => {
  const s = await setup({ hook: new Error('ECONNREFUSED') })
  await s.save(published())
  await s.fire()
  assert.equal(s.lines.error.length, 1)
  await s.save(published())
  assert.equal(s.pending(), 1)
})

test('the hook URL never appears in a log line', async () => {
  const s = await setup({ hook: { ok: false, status: 404 } })
  await s.save(published())
  await s.fire()
  for (const line of [...s.lines.info, ...s.lines.error]) assert.ok(!line.includes('secret-id'), line)
})

test('restart: a published post updated within the last window starts one wait', async () => {
  const s = await setup({ recentlyChanged: 2 })
  assert.deepEqual(s.counts, [
    {
      collection: 'posts',
      where: {
        and: [{ _status: { equals: 'published' } }, { updatedAt: { greater_than: '2026-11-18T09:45:00.000Z' } }],
      },
    },
  ])
  assert.equal(s.pending(), 1)
  await s.save(published())
  assert.equal(s.timers.length, 1, 'a save after restart rides along')
  await s.fire()
  assert.equal(s.posts.length, 1)
})

test('restart: nothing updated within the window starts nothing', async () => {
  const s = await setup({ recentlyChanged: 0 })
  assert.equal(s.counts.length, 1)
  assert.equal(s.timers.length, 0)
})

test('restart: a failing count is logged and startup goes on', async () => {
  const s = await setup({ recentlyChanged: new Error('db down') })
  assert.equal(s.timers.length, 0)
  assert.equal(s.lines.error.length, 1)
  await s.save(published())
  assert.equal(s.timers.length, 1)
})

test('hooks on a Payload that never started the batch (local dev) do nothing', async () => {
  const req = { payload: { logger: { info() {}, error() {} } } }
  const doc = published()
  assert.equal(await triggerNetlifyBuild({ context: {}, doc, req }), doc)
  assert.equal(await triggerNetlifyBuildOnDelete({ context: {}, doc, req }), doc)
})
