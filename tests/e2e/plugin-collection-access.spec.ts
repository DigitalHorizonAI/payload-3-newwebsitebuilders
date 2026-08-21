import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'

/**
 * What a key, and what a stranger, may do to the collections the plugins bring.
 *
 * Four collections — redirects, forms, form-submissions and search — arrive with
 * plugins rather than being written here, and for a long time nobody gave them
 * access rules. Payload fills what a collection does not declare with
 * `Boolean(user)`, which was a fair default until apiClients made "there is a
 * user" stop meaning "this is a person who runs the site". Measured before the
 * fix: a key scoped to publishing articles could repoint any URL on the site,
 * rewrite the contact form, and read and delete what visitors had sent through
 * it.
 *
 * `scripts/check-access.ts` covers the same ground far more cheaply and over
 * every collection at once. These tests exist for the part it cannot reach: a
 * real unauthenticated HTTP request arriving at a running server. The first one
 * below is the reason this file exists — it is the only assertion standing
 * between the lock-down and a site whose forms silently stop working for
 * visitors while continuing to work for everyone logged in.
 */

const FORM_TITLE = 'PLUGIN ACCESS SPEC — contact'

/**
 * `confirmationMessage` is richText and required — `confirmationType` defaults to
 * 'message', so leaving both out does not avoid it. Same lexical shape the other
 * specs build by hand.
 */
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

test.describe('plugin collection access', () => {
  let adminAuth: string
  let keyAuth: string
  let formId: number

  test.beforeAll(async ({ request }) => {
    adminAuth = await adminAuthHeader(request)

    const keyValue = crypto.randomUUID()
    const client = await request.post('/api/apiClients', {
      headers: { Authorization: adminAuth },
      data: { name: 'plugin access spec', enableAPIKey: true, apiKey: keyValue },
    })
    expect(client.ok(), 'mint api key').toBe(true)
    keyAuth = `apiClients API-Key ${keyValue}`

    const form = await request.post('/api/forms', {
      headers: { Authorization: adminAuth },
      data: {
        title: FORM_TITLE,
        fields: [{ blockType: 'text', name: 'name', label: 'Name', required: true }],
        confirmationType: 'message',
        confirmationMessage: lexical('Thanks, we will be in touch.'),
      },
    })
    expect(form.ok(), `create form: ${form.status()} ${await form.text()}`).toBe(true)
    formId = (await form.json()).doc.id
  })

  /**
   * The regression that would hurt most, because it fails invisibly: everyone
   * with a login would still see working forms, and only visitors — the people
   * the forms exist for — would hit a 403 nobody is watching for.
   */
  test('a visitor with no account can still submit a form', async ({ request }) => {
    const res = await request.post('/api/form-submissions', {
      data: {
        form: formId,
        submissionData: [{ field: 'name', value: 'Passing stranger' }],
      },
    })

    expect(res.status(), 'anonymous form submission').toBe(201)
  })

  test('a stranger cannot read what other people submitted', async ({ request }) => {
    const res = await request.get('/api/form-submissions')
    expect(res.status()).toBe(403)
  })

  test('the key cannot read what people submitted', async ({ request }) => {
    const res = await request.get('/api/form-submissions', {
      headers: { Authorization: keyAuth },
    })
    expect(res.status(), 'submissions hold visitors’ names and addresses').toBe(403)
  })

  test('the key cannot repoint a URL on the site', async ({ request }) => {
    const res = await request.post('/api/redirects', {
      headers: { Authorization: keyAuth },
      data: { from: '/plugin-access-spec', to: { type: 'custom', url: 'https://example.com' } },
    })
    expect(res.status()).toBe(403)
  })

  test('the key cannot rewrite a form', async ({ request }) => {
    const res = await request.patch(`/api/forms/${formId}`, {
      headers: { Authorization: keyAuth },
      data: { title: 'rewritten by a key' },
    })
    expect(res.status()).toBe(403)
  })

  test('an admin can still do all three', async ({ request }) => {
    const redirect = await request.post('/api/redirects', {
      headers: { Authorization: adminAuth },
      data: { from: '/plugin-access-spec-admin', to: { type: 'custom', url: 'https://example.com' } },
    })
    expect(redirect.ok(), 'admin creates a redirect').toBe(true)

    const submissions = await request.get('/api/form-submissions', {
      headers: { Authorization: adminAuth },
    })
    expect(submissions.ok(), 'admin reads submissions').toBe(true)

    const rename = await request.patch(`/api/forms/${formId}`, {
      headers: { Authorization: adminAuth },
      data: { title: FORM_TITLE },
    })
    expect(rename.ok(), 'admin edits a form').toBe(true)

    await request.delete(`/api/redirects/${(await redirect.json()).doc.id}`, {
      headers: { Authorization: adminAuth },
    })
  })
})
