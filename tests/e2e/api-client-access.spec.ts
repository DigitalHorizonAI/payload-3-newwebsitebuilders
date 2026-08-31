import { expect, test } from '@playwright/test'

import { ADMIN, adminAuthHeader } from './admin'

/**
 * What an API key may and may not do.
 *
 * Every access rule in this project used to be `Boolean(user)`, so enabling API
 * keys on the users collection would have handed an external tool full
 * administrator rights. The apiClients collection plus the collection checks in
 * src/access/* are what prevent that, and TypeScript cannot help:
 * AccessArgs<T> parametrises `data`, not `req.user`, so a rule that forgot to
 * check the collection still compiles. These assertions are the only thing
 * standing between a leaked key and the users table.
 *
 * Roles are a separate question, and live in user-roles.spec.ts.
 *
 * The negative cases are the point. Reverting authenticated/authenticatedOrPublished
 * to `Boolean(user)` was measured to turn eight of them red — the key could then
 * read every admin's email address, delete published articles, mint itself an
 * admin account and issue further API keys.
 *
 * Note Payload does not generate the key value; the admin UI does it client-side.
 * Over REST the caller supplies apiKey and Payload derives apiKeyIndex from it.
 */

/** Posts.content is required, and is lexical JSON — not HTML, not markdown. */
const lexical = (text: string) => ({
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

const DRAFT_TITLE = 'ACCESS SPEC — unpublished draft'
const PAGE_TITLE = 'ACCESS SPEC — unpublished page'

test.describe('api key access', () => {
  let adminAuth: string
  let keyAuth: string
  let draftId: number

  test.beforeAll(async ({ request }) => {
    adminAuth = await adminAuthHeader(request)

    const keyValue = crypto.randomUUID()
    const client = await request.post('/api/apiClients', {
      headers: { Authorization: adminAuth },
      data: { name: 'access spec', enableAPIKey: true, apiKey: keyValue },
    })
    expect(client.ok(), 'mint api key').toBe(true)
    keyAuth = `apiClients API-Key ${keyValue}`

    const draft = await request.post('/api/posts', {
      headers: { Authorization: adminAuth },
      data: { title: DRAFT_TITLE, _status: 'draft', content: lexical('secret') },
    })
    draftId = (await draft.json()).doc.id
  })

  test('the key can publish an article', async ({ request }) => {
    const res = await request.post('/api/posts', {
      headers: { Authorization: keyAuth },
      data: {
        title: 'ACCESS SPEC — published by key',
        _status: 'published',
        content: lexical('body'),
      },
    })
    expect(res.status()).toBe(201)

    const { doc } = await res.json()
    expect(doc._status).toBe('published')

    const patch = await request.patch(`/api/posts/${doc.id}`, {
      headers: { Authorization: keyAuth },
      data: { title: 'ACCESS SPEC — updated by key' },
    })
    expect(patch.status()).toBe(200)

    await request.delete(`/api/posts/${doc.id}`, { headers: { Authorization: adminAuth } })
  })

  test('the key cannot read the users table', async ({ request }) => {
    const res = await request.get('/api/users', { headers: { Authorization: keyAuth } })
    expect(res.status()).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain(ADMIN.email)
  })

  test('the key cannot delete an article', async ({ request }) => {
    const post = await request.post('/api/posts', {
      headers: { Authorization: adminAuth },
      data: { title: 'ACCESS SPEC — delete target', _status: 'published', content: lexical('x') },
    })
    const { doc } = await post.json()

    // The integration creates, reads and updates; it never removes an article.
    // Leaving delete on the key was reach it does not use, on a credential that
    // has been through several hands. Removing an article is an admin job.
    const res = await request.delete(`/api/posts/${doc.id}`, { headers: { Authorization: keyAuth } })
    expect(res.status()).toBe(403)

    const still = await request.get(`/api/posts/${doc.id}`, { headers: { Authorization: adminAuth } })
    expect(still.status(), 'the article survived the refused delete').toBe(200)

    await request.delete(`/api/posts/${doc.id}`, { headers: { Authorization: adminAuth } })
  })

  test('the key can file an article under a category it creates', async ({ request }) => {
    const created = await request.post('/api/categories', {
      headers: { Authorization: keyAuth },
      data: { title: 'ACCESS SPEC — new category' },
    })
    expect(created.status(), 'a tool covering a new topic must not need an admin').toBe(201)

    const categoryId = (await created.json()).doc.id

    const post = await request.post('/api/posts', {
      headers: { Authorization: keyAuth },
      data: {
        title: 'ACCESS SPEC — categorised article',
        _status: 'published',
        content: lexical('x'),
        categories: [categoryId],
      },
    })
    expect(post.status()).toBe(201)

    await request.delete(`/api/posts/${(await post.json()).doc.id}`, {
      headers: { Authorization: adminAuth },
    })
    await request.delete(`/api/categories/${categoryId}`, { headers: { Authorization: keyAuth } })
  })

  test('the key cannot escalate itself', async ({ request }) => {
    const newUser = await request.post('/api/users', {
      headers: { Authorization: keyAuth },
      data: { email: 'escalated@example.com', password: 'Test1234!', name: 'escalated' },
    })
    expect(newUser.status(), 'must not be able to create an admin').toBe(403)

    const newKey = await request.post('/api/apiClients', {
      headers: { Authorization: keyAuth },
      data: { name: 'second key', enableAPIKey: true, apiKey: crypto.randomUUID() },
    })
    expect(newKey.status(), 'must not be able to issue keys').toBe(403)

    const listKeys = await request.get('/api/apiClients', { headers: { Authorization: keyAuth } })
    expect(listKeys.status(), 'must not be able to read keys').toBe(403)
  })

  test('the key cannot rewrite the site chrome', async ({ request }) => {
    // Header and Footer declared only `read`, so `update` fell back to Payload's
    // default — any logged-in principal, an API key included. A key publishes
    // articles; the site's navigation is not its to edit.
    for (const global of ['header', 'footer']) {
      const res = await request.post(`/api/globals/${global}`, {
        headers: { Authorization: keyAuth },
        data: { navItems: [] },
      })
      expect(res.status(), `${global} must not be writable by a key`).toBe(403)
    }
  })

  test('the key can see its own drafts', async ({ request }) => {
    // A tool that cannot list its drafts cannot show, edit or later publish
    // them — it could only reach one by an id it happened to have stored.
    const listing = await request.get('/api/posts?draft=true&limit=100', {
      headers: { Authorization: keyAuth },
    })
    expect(JSON.stringify(await listing.json())).toContain(DRAFT_TITLE)

    const direct = await request.get(`/api/posts/${draftId}?draft=true`, {
      headers: { Authorization: keyAuth },
    })
    expect(JSON.stringify(await direct.json())).toContain(DRAFT_TITLE)
  })

  test('draft access stops at the blog', async ({ request }) => {
    // Posts has its own read rule precisely so this stays shut: Pages shares
    // authenticatedOrPublished with other collections, and widening that would
    // have handed the same key every unpublished marketing page.
    const page = await request.post('/api/pages', {
      headers: { Authorization: adminAuth },
      data: {
        title: PAGE_TITLE,
        slug: 'access-spec-unpublished',
        _status: 'draft',
        // Pages.layout is required and is not waived for drafts — a create
        // without it is rejected 400. `content` is the one block with no
        // required fields of its own, so it is the cheapest valid layout.
        layout: [{ blockType: 'content' }],
      },
    })

    // Assert the page exists before asserting it is invisible. Without this the
    // test passes for the wrong reason: Pages.layout is required, so a create
    // that silently fails leaves nothing to find and "not.toContain" succeeds
    // against every possible access rule. Verified by widening Pages to the
    // blog's reader — the original version of this test still passed.
    expect(page.status(), 'the draft page must actually be created').toBe(201)
    const pageId = (await page.json()).doc?.id
    expect(pageId, 'and it must have an id').toBeTruthy()

    const asAdmin = await request.get('/api/pages?draft=true&limit=100', {
      headers: { Authorization: adminAuth },
    })
    expect(JSON.stringify(await asAdmin.json()), 'an admin can see it').toContain(PAGE_TITLE)

    const listing = await request.get('/api/pages?draft=true&limit=100', {
      headers: { Authorization: keyAuth },
    })
    expect(JSON.stringify(await listing.json()), 'the key cannot').not.toContain(PAGE_TITLE)

    await request.delete(`/api/pages/${pageId}`, { headers: { Authorization: adminAuth } })
  })

  test('an administrator is unaffected', async ({ request }) => {
    const drafts = await request.get('/api/posts?draft=true&limit=100', {
      headers: { Authorization: adminAuth },
    })
    expect(JSON.stringify(await drafts.json())).toContain(DRAFT_TITLE)

    const users = await request.get('/api/users', { headers: { Authorization: adminAuth } })
    expect(users.status()).toBe(200)
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/posts/${draftId}`, { headers: { Authorization: adminAuth } })
  })
})
