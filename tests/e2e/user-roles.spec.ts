import { expect, test } from '@playwright/test'

import { ADMIN, adminAuthHeader } from './admin'

/**
 * What an editor may and may not do.
 *
 * This CMS was handed to five people in one week, two of them on personal Gmail
 * addresses, and every account was a full administrator: each could delete the
 * published site, delete the other four accounts, and mint an API key that
 * publishes articles. Roles exist to end that, and the negative cases below are
 * the entire guarantee — TypeScript cannot see an access rule that should have
 * been narrowed and was not.
 *
 * The positive cases matter just as much. An editor who cannot edit the website
 * text is not a safer editor, it is a broken CMS: the marketing team's whole job
 * is the site copy globals and the media library.
 */

const EDITOR = {
  email: 'roles-editor@example.com',
  password: 'Test1234!',
  name: 'Roles Editor',
  role: 'editor',
}

const SECOND_ADMIN = {
  email: 'roles-second-admin@example.com',
  password: 'Test1234!',
  name: 'Roles Second Admin',
  role: 'admin',
}

/**
 * Create the account, reusing it only if it already exists.
 *
 * Playwright restarts a worker after a failed test, which runs `beforeAll` again
 * against the same database, so a duplicate email is an expected second-pass
 * outcome and worth tolerating. A **403 is not** — that means an admin was
 * refused permission to create a user, which is the exact thing these tests
 * exist to detect. Falling back on it would find the leftover row from the first
 * pass and report a green bootstrap over a broken access rule.
 */
async function ensureUser(
  request: import('@playwright/test').APIRequestContext,
  adminAuth: string,
  data: Record<string, string>,
): Promise<number> {
  const created = await request.post('/api/users', {
    headers: { Authorization: adminAuth },
    data,
  })
  if (created.status() === 201) return (await created.json()).doc.id

  expect(
    created.status(),
    `an admin must be allowed to create ${data.email} — got ${await created.text()}`,
  ).toBe(400)

  const found = await request.get(
    `/api/users?where[email][equals]=${encodeURIComponent(data.email)}`,
    { headers: { Authorization: adminAuth } },
  )
  const doc = (await found.json()).docs?.[0]
  expect(doc, `${data.email} was rejected as a duplicate but does not exist`).toBeTruthy()
  return doc.id
}

test.describe('user roles', () => {
  let adminAuth: string
  let editorAuth: string
  let editorId: number
  let secondAdminId: number

  test.beforeAll(async ({ request }) => {
    adminAuth = await adminAuthHeader(request)

    editorId = await ensureUser(request, adminAuth, EDITOR)
    secondAdminId = await ensureUser(request, adminAuth, SECOND_ADMIN)

    const login = await request.post('/api/users/login', {
      data: { email: EDITOR.email, password: EDITOR.password },
    })
    expect(login.ok(), 'editor login').toBe(true)
    editorAuth = `JWT ${(await login.json()).token}`
  })

  test('the first account on a fresh deploy is an admin', async ({ request }) => {
    // `role` defaults to editor, and first-register bypasses collection access.
    // Without the bootstrap hook the person who claims a new CMS lands as an
    // editor and nobody can ever create an admin — the CMS is bricked on day one.
    const me = await request.get('/api/users/me', { headers: { Authorization: adminAuth } })
    expect((await me.json()).user.role).toBe('admin')
  })

  test('an editor can write and change articles', async ({ request }) => {
    // The reason the account exists. If this fails, roles have not made the CMS
    // safer, they have broken it. This CMS is a blog, so an editor's job is
    // posts — the sibling CMSs drive site-copy globals in their version of this test,
    // which do not exist here.
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
            children: [
              {
                type: 'text',
                text,
                mode: 'normal',
                style: '',
                detail: 0,
                format: 0,
                version: 1,
              },
            ],
          },
        ],
      },
    })

    const created = await request.post('/api/posts', {
      headers: { Authorization: editorAuth },
      data: {
        title: 'ROLES SPEC — written by an editor',
        content: lexical('First draft.'),
        _status: 'draft',
      },
    })
    expect(created.status(), 'an editor must be able to write an article').toBe(201)
    const id = (await created.json()).doc.id

    const edited = await request.patch(`/api/posts/${id}`, {
      headers: { Authorization: editorAuth },
      data: { content: lexical('Edited by the same editor.') },
    })
    expect(edited.status(), 'an editor must be able to change one').toBe(200)

    const read = await request.get(`/api/posts/${id}?draft=true&depth=0`, {
      headers: { Authorization: editorAuth },
    })
    const body = (await read.json())?.content?.root?.children?.[0]?.children?.[0]?.text
    expect(body, 'the edit really landed').toBe('Edited by the same editor.')
  })

  test('an editor cannot create or delete accounts', async ({ request }) => {
    const created = await request.post('/api/users', {
      headers: { Authorization: editorAuth },
      data: { email: 'roles-smuggled@example.com', password: 'Test1234!', name: 'Smuggled' },
    })
    expect(created.status(), 'must not be able to create an account').toBe(403)

    const deleted = await request.delete(`/api/users/${secondAdminId}`, {
      headers: { Authorization: editorAuth },
    })
    expect(deleted.status(), 'must not be able to delete another account').toBe(403)

    const stillThere = await request.get(`/api/users/${secondAdminId}`, {
      headers: { Authorization: adminAuth },
    })
    expect(stillThere.status(), 'the account really survived').toBe(200)
  })

  test('an editor cannot promote itself', async ({ request }) => {
    // The one that makes every other assertion here worth having: an editor may
    // edit its own record, and its own record holds its role.
    await request.patch(`/api/users/${editorId}`, {
      headers: { Authorization: editorAuth },
      data: { role: 'admin' },
    })

    const me = await request.get('/api/users/me', { headers: { Authorization: editorAuth } })
    expect((await me.json()).user.role, 'role must be unchanged').toBe('editor')
  })

  test('an editor cannot read the other accounts', async ({ request }) => {
    const listing = await request.get('/api/users?limit=100', {
      headers: { Authorization: editorAuth },
    })
    const body = JSON.stringify(await listing.json())
    expect(body, "must not see the admin's address").not.toContain(ADMIN.email)
    expect(body, 'must not see other accounts').not.toContain(SECOND_ADMIN.email)
    expect(body, 'must still see itself').toContain(EDITOR.email)
  })

  test('an editor cannot mint an API key', async ({ request }) => {
    const minted = await request.post('/api/apiClients', {
      headers: { Authorization: editorAuth },
      data: { name: 'roles spec key', enableAPIKey: true, apiKey: crypto.randomUUID() },
    })
    expect(minted.status(), 'a key publishes articles — admins only').toBe(403)

    const listed = await request.get('/api/apiClients', { headers: { Authorization: editorAuth } })
    expect(listed.status(), 'must not be able to read existing keys').toBe(403)
  })

  test('an editor can edit a page but cannot add or remove one', async ({ request }) => {
    // Pages are site structure: an editor rewrites what a page says, an admin
    // decides which pages exist. Deleting one takes a live URL off the internet.
    // Pages.layout is required and is not waived for drafts; `content` is the
    // cheapest valid block. The editor's attempt below carries a valid payload
    // too, so a rejection can only mean access — never a missing field.
    const validPage = (title: string, slug: string) => ({
      title,
      slug,
      _status: 'draft',
      layout: [{ blockType: 'content' }],
    })

    const page = await request.post('/api/pages', {
      headers: { Authorization: adminAuth },
      data: validPage('ROLES SPEC — page', 'roles-spec-page'),
    })
    expect(page.status(), 'an admin can create a page').toBe(201)
    const pageId = (await page.json()).doc.id

    const edited = await request.patch(`/api/pages/${pageId}`, {
      headers: { Authorization: editorAuth },
      data: { title: 'ROLES SPEC — page, retitled by an editor' },
    })
    expect(edited.status(), 'an editor must be able to edit page copy').toBe(200)

    const added = await request.post('/api/pages', {
      headers: { Authorization: editorAuth },
      data: validPage('ROLES SPEC — smuggled page', 'roles-spec-smuggled'),
    })
    expect(added.status(), 'must not be able to publish a new address').toBe(403)

    const removed = await request.delete(`/api/pages/${pageId}`, {
      headers: { Authorization: editorAuth },
    })
    expect(removed.status(), 'must not be able to delete a page').toBe(403)

    const survived = await request.get(`/api/pages/${pageId}?draft=true`, {
      headers: { Authorization: adminAuth },
    })
    expect(survived.status(), 'the page really survived').toBe(200)
  })

  test('the last administrator cannot be demoted or deleted', async ({ request }) => {
    // The lockout this whole design has to avoid: zero admins means nobody can
    // add a user, revoke a key, or promote anyone, ever again — recoverable only
    // with direct database access.
    const demoteSecond = await request.patch(`/api/users/${secondAdminId}`, {
      headers: { Authorization: adminAuth },
      data: { role: 'editor' },
    })
    expect(demoteSecond.status(), 'demoting a spare admin is fine').toBe(200)

    const me = await request.get('/api/users/me', { headers: { Authorization: adminAuth } })
    const lastAdminId = (await me.json()).user.id

    const selfDemote = await request.patch(`/api/users/${lastAdminId}`, {
      headers: { Authorization: adminAuth },
      data: { role: 'editor' },
    })
    expect(selfDemote.status(), 'the last admin must not be demotable').toBe(400)

    const selfDelete = await request.delete(`/api/users/${lastAdminId}`, {
      headers: { Authorization: adminAuth },
    })
    expect(selfDelete.status(), 'the last admin must not be deletable').toBe(400)

    const stillAdmin = await request.get('/api/users/me', {
      headers: { Authorization: adminAuth },
    })
    expect((await stillAdmin.json()).user.role, 'still an admin').toBe('admin')

    // Put the spare back so later runs and other specs are unaffected.
    await request.patch(`/api/users/${secondAdminId}`, {
      headers: { Authorization: adminAuth },
      data: { role: 'admin' },
    })
  })
})
