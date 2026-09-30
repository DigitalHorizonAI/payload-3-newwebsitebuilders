import type { APIRequestContext } from '@playwright/test'

import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'

/**
 * A rich-text link's url must keep its scheme.
 *
 * In the production admin a pasted `https://nplink.net/9izl9u2b` turned into
 * `https.nplink.net/9izl9u2b` before saving, in two browsers. The cause is not
 * found; the url field in src/fields/defaultLexical.ts refuses the mangled form
 * so it can no longer be published. It also refuses a doubled scheme
 * (`https://https…`), which pasting a full address after the drawer's
 * pre-filled `https://` produces.
 *
 * On a REST save the refusal comes from lexical's link-node validation, which
 * reports only "The following fields are invalid: url". Draft saves
 * (`?draft=true`, autosave) skip field validation because Posts does not set
 * `versions.drafts.validate`: the refusal lands at publish.
 */

const MANGLED = 'https.nplink.net/9izl9u2b'
const MESSAGE = 'This link is missing https:// — paste the full address again.'

const paragraph = (...children: object[]) => ({
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
        children,
      },
    ],
  },
})

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const link = (url: string) => ({
  type: 'link',
  format: '',
  indent: 0,
  version: 3,
  direction: 'ltr',
  fields: { linkType: 'custom', newTab: false, url },
  children: [text('link')],
})

const storedUrl = (doc: { content: { root: { children: { children: { fields: { url: string } }[] }[] } } }) =>
  doc.content.root.children[0].children[0].fields.url

test.describe('link url guard', () => {
  let adminAuth: string

  test.beforeAll(async ({ request }) => {
    adminAuth = await adminAuthHeader(request)
  })

  const save = (request: APIRequestContext, url: string, draft = false, query = '') =>
    request.post(`/api/posts?${draft ? 'draft=true&' : ''}${query}`, {
      headers: { Authorization: adminAuth },
      data: {
        title: `LINK GUARD SPEC ${url}`,
        _status: draft ? 'draft' : 'published',
        content: paragraph(link(url)),
      },
    })

  for (const [name, url, query] of [
    ['a link that lost its ://', MANGLED, ''],
    ['a link that lost its :// (nl)', MANGLED, 'locale=nl'],
    // The drawer pre-fills `https://`; a pasted full address doubles it.
    ['a doubled https://', 'https://https://nplink.net/9izl9u2b', ''],
    ['a doubled https:// that also lost its ://', 'https://https.nplink.net/9izl9u2b', ''],
  ]) {
    test(`${name} is refused on publish`, async ({ request }) => {
      const res = await save(request, url, false, query)
      expect(res.status()).toBe(400)
      expect(await res.text()).toContain('The following fields are invalid: url')
    })
  }

  for (const url of [
    // The pre-CMS articles link to each other this way.
    'hand-coded-versus-page-builders.html',
    'https://nplink.net/9izl9u2b',
    ' https://x.com',
    'mailto:hello@example.com',
    'tel:+31201234567',
    '/relative',
    '#anchor',
  ]) {
    test(`${JSON.stringify(url)} saves unchanged`, async ({ request }) => {
      const res = await save(request, url)
      expect(res.status(), await res.text()).toBe(201)
      const { doc } = await res.json()
      expect(storedUrl(doc)).toBe(url)
    })
  }

  test('a draft save is not validated', async ({ request }) => {
    const res = await save(request, MANGLED, true)
    expect(res.status(), await res.text()).toBe(201)
  })

  test('the admin will not publish a link that lost its ://', async ({ baseURL, page, request }) => {
    const created = await request.post('/api/posts', {
      headers: { Authorization: adminAuth },
      data: { title: 'LINK GUARD UI', _status: 'published', content: paragraph(text('link me')) },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { doc } = await created.json()

    await page
      .context()
      .addCookies([{ name: 'payload-token', value: adminAuth.replace('JWT ', ''), url: baseURL! }])
    await page.goto(`/admin/collections/posts/${doc.id}`)

    const editor = page.locator('[data-lexical-editor="true"]').first()
    await editor.getByText('link me').click({ clickCount: 3 })
    await page.locator('.toolbar-popup__button-link').first().click()

    const drawer = page.getByRole('dialog', { name: /lexical-rich-text-link/ })
    // Text to display, then Enter a URL. The drawer fills in `https://` once it
    // has loaded; typing before that gets overwritten.
    const url = drawer.getByRole('textbox').nth(1)
    await expect(url).toHaveValue('https://')
    // The pre-fill can land again after the first one; refill until it sticks.
    await expect(async () => {
      await url.fill(MANGLED)
      await expect(url).toHaveValue(MANGLED, { timeout: 1000 })
    }).toPass()
    await drawer.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(1500)

    // What the editor sees: the drawer (if it stayed open) and any toast.
    const drawerOpen = await drawer.isVisible()
    const drawerText = drawerOpen ? await drawer.innerText() : ''
    let toastText = ''
    if (!drawerOpen) {
      await page.getByRole('button', { name: /^Publish/ }).first().click()
      await page.waitForTimeout(2000)
      toastText = (await page.locator('.payload-toast-container').allInnerTexts()).join(' | ')
    }
    await page.screenshot({ path: test.info().outputPath('after-publish.png'), fullPage: true })
    console.log(JSON.stringify({ drawerOpen, drawerText, toastText }))

    if (drawerOpen) expect(drawerText).toContain(MESSAGE)
    else expect(toastText).toMatch(/invalid/i)

    // Whatever the screen shows, the published doc must not hold the mangled url.
    const after = await request.get(`/api/posts/${doc.id}?depth=0`, {
      headers: { Authorization: adminAuth },
    })
    expect(JSON.stringify((await after.json()).content)).not.toContain(MANGLED)
  })
})
