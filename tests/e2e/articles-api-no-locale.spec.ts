import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'

/**
 * Posts are written per language, so most have no English row. Without
 * ?locale= the listing answered in English but still listed every post, so a
 * German-only post came back with no title, no slug and the path
 * /blog/undefined: 135 of the 191 rows on production on 1 Oct.
 *
 * No locale must answer exactly as ?locale=en does.
 */

let adminAuth: string
const created: number[] = []

test.afterAll(async ({ request }) => {
  for (const id of created) {
    await request.delete(`/api/posts/${id}`, { headers: { Authorization: adminAuth } })
  }
})

test('GET /api/articles without a locale lists only the default locale’s posts', async ({
  request,
}) => {
  adminAuth = await adminAuthHeader(request)
  const publish = async (locale: string, title: string) => {
    const res = await request.post(`/api/posts?locale=${locale}`, {
      headers: { Authorization: adminAuth },
      data: { title, _status: 'published', content: 'body' },
    })
    expect(res.ok(), await res.text()).toBe(true)
    const { doc } = await res.json()
    created.push(doc.id)
    return doc as { id: number; slug: string }
  }
  // The English post keeps the comparisons below from passing on empty lists.
  const english = await publish('en', 'NO LOCALE EN')
  const germanOnly = (await publish('de', 'NO LOCALE DE ONLY')).id

  const list = async (query: string) =>
    (await (await request.get(`/api/articles?limit=500${query}`)).json()).docs as {
      id: number
      title?: string
      slug?: string
      path: string
    }[]
  const [none, en] = await Promise.all([list(''), list('&locale=en')])

  expect(none.map((d) => d.id)).toContain(english.id)
  expect(none.map((d) => d.id)).not.toContain(germanOnly)
  for (const doc of none) {
    expect(doc.title, `article ${doc.id} title`).toBeTruthy()
    expect(doc.slug, `article ${doc.id} slug`).toBeTruthy()
    expect(doc.path).not.toContain('undefined')
  }
  expect(none.map((d) => d.id)).toEqual(en.map((d) => d.id))

  // The detail route reads the same locale: an English slug still resolves.
  const detail = await request.get(`/api/articles/${english.slug}`)
  expect(detail.status()).toBe(200)
  expect((await detail.json()).title).toBe('NO LOCALE EN')
})
