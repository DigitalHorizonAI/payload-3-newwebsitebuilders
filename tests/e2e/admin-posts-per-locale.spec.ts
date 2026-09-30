import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'

/**
 * Posts are written per language, so most posts have no row at all in a given
 * locale. The admin Posts list showed every one of them anyway, as
 * `<No Title>` / `<No Slug>`: at `en`, 133 of the 189 published posts on
 * production. Fallback cannot help at `en`, which is the locale everything
 * falls back to.
 *
 * The list must show only the posts that exist in the locale being viewed.
 */

const content = {
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
          { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: 'body', version: 1 },
        ],
      },
    ],
  },
}

let adminAuth: string
const created: number[] = []

// The public listing without ?locale= still lists a post with no `en` row, so
// a de-only post left behind breaks articles-api.spec.ts, which runs later.
test.afterAll(async ({ request }) => {
  for (const id of created) {
    await request.delete(`/api/posts/${id}`, { headers: { Authorization: adminAuth } })
  }
})

test('the admin Posts list shows no untitled rows in any locale', async ({ baseURL, page, request }) => {
  adminAuth = await adminAuthHeader(request)
  const save = async (url: string, title: string) => {
    const res = await request[url.includes('/api/posts/') ? 'patch' : 'post'](url, {
      headers: { Authorization: adminAuth },
      data: { title, _status: 'published', content },
    })
    expect(res.ok(), await res.text()).toBe(true)
    const { doc } = await res.json()
    if (!created.includes(doc.id)) created.push(doc.id)
    return doc
  }

  // One post in en and nl, one in de only: the shape the pipeline publishes.
  const both = await save('/api/posts?locale=en', 'PER LOCALE EN')
  await save(`/api/posts/${both.id}?locale=nl`, 'PER LOCALE NL')
  await save('/api/posts?locale=de', 'PER LOCALE DE ONLY')

  await page
    .context()
    .addCookies([{ name: 'payload-token', value: adminAuth.replace('JWT ', ''), url: baseURL! }])

  for (const [locale, own] of [
    ['en', 'PER LOCALE EN'],
    ['nl', 'PER LOCALE NL'],
  ]) {
    await page.goto(`/admin/collections/posts?locale=${locale}&limit=100`)
    const table = page.locator('table')
    // Not vacuous: the locale's own post is listed, so the table did render rows.
    await expect(table.getByText(own)).toBeVisible()
    await expect(table, `${locale} list`).not.toContainText(/<No (Title|Slug)>/)
  }
})
