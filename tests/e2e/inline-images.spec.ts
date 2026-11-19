import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'
import { baseURL } from './env'

/**
 * Pictures placed between paragraphs must reach the article API's contentHtml.
 *
 * On 18-19 Nov every new newwebsite.builders article carried in-text `upload`
 * nodes (post 544: three, as bare media ids even at depth 3) and the API's
 * contentHtml had no <img> at all, so the published pages showed none.
 *
 * Four pictures go in: one with alt, one without, a PDF and one whose media was
 * deleted. Only the first two may come out, each at its place, and the
 * endpoint must still answer 200.
 */

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
)

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})
const paragraph = (value: string) => ({
  type: 'paragraph',
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  textFormat: 0,
  children: [text(value)],
})
const upload = (id: number) => ({
  type: 'upload',
  version: 3,
  format: '',
  relationTo: 'media',
  value: id,
  fields: null,
})

let adminAuth: string
const mediaIds: number[] = []
let postId: number | undefined

test.afterAll(async ({ request }) => {
  const headers = { Authorization: adminAuth }
  if (postId) await request.delete(`/api/posts/${postId}`, { headers })
  for (const id of mediaIds) await request.delete(`/api/media/${id}`, { headers })
})

test('contentHtml carries each in-text picture between its paragraphs', async ({ request }) => {
  adminAuth = await adminAuthHeader(request)
  const headers = { Authorization: adminAuth }

  const addMedia = async (name: string, mimeType: string, buffer: Buffer, alt?: string) => {
    const res = await request.post('/api/media', {
      headers,
      multipart: { file: { name, mimeType, buffer }, _payload: JSON.stringify(alt ? { alt } : {}) },
    })
    expect(res.ok(), await res.text()).toBe(true)
    const id: number = (await res.json()).doc.id
    mediaIds.push(id)
    return id
  }

  const withAlt = await addMedia('inline-images-e2e-a.png', 'image/png', PNG, 'A "quoted" picture')
  const noAlt = await addMedia('inline-images-e2e-b.png', 'image/png', PNG)
  const pdf = await addMedia('inline-images-e2e.pdf', 'application/pdf', PDF, 'a document')
  const gone = await addMedia('inline-images-e2e-gone.png', 'image/png', PNG, 'deleted')

  const post = await request.post('/api/posts?locale=en', {
    headers,
    data: {
      title: 'INLINE IMAGES E2E',
      _status: 'published',
      content: {
        root: {
          type: 'root',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          children: [
            paragraph('first'),
            upload(withAlt),
            paragraph('second'),
            upload(noAlt),
            paragraph('third'),
            upload(pdf),
            upload(gone),
            paragraph('fourth'),
          ],
        },
      },
    },
  })
  expect(post.ok(), await post.text()).toBe(true)
  const { id, slug } = (await post.json()).doc
  postId = id

  const del = await request.delete(`/api/media/${gone}`, { headers })
  expect(del.ok(), await del.text()).toBe(true)
  mediaIds.splice(mediaIds.indexOf(gone), 1)

  const res = await request.get(`/api/articles/${slug}?locale=en`)
  expect(res.status()).toBe(200)
  const parts: string[] = (await res.json()).contentHtml.split('\n\n')

  const picture = (alt: string) =>
    new RegExp(
      `^<figure><img src="([^"]+)" alt="${alt}" width="1" height="1" loading="lazy" decoding="async" /></figure>$`,
    )
  expect(parts).toHaveLength(6)
  expect(parts[0]).toBe('<p>first</p>')
  expect(parts[1]).toMatch(picture('A &quot;quoted&quot; picture'))
  expect(parts[2]).toBe('<p>second</p>')
  expect(parts[3]).toMatch(picture(''))
  expect(parts[4]).toBe('<p>third</p>')
  expect(parts[5]).toBe('<p>fourth</p>')

  for (const part of [parts[1], parts[3]]) {
    const src = part.match(/src="([^"]+)"/)![1]
    expect(src.startsWith(`${baseURL}/api/media/`), `picture ${src} is on this app`).toBe(true)
    const file = await request.get(src)
    expect(file.status(), `GET ${src}`).toBe(200)
    expect(file.headers()['content-type']).toMatch(/^image\//)
  }
})
