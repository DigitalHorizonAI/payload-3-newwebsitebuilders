import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'
import { baseURL } from './env'

/**
 * coverImage was resolved against the public site's origin, which does not
 * serve /api/media. On 7 Oct every cover the API handed out 404'd at
 * newwebsite.builders while the same path answered 200 image/webp on the CMS.
 *
 * The link must point at this app and must actually load.
 */

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

let adminAuth: string
let mediaId: number | undefined
let postId: number | undefined

test.afterAll(async ({ request }) => {
  const headers = { Authorization: adminAuth }
  if (postId) await request.delete(`/api/posts/${postId}`, { headers })
  if (mediaId) await request.delete(`/api/media/${mediaId}`, { headers })
})

test('coverImage links to this app and loads as an image', async ({ request }) => {
  adminAuth = await adminAuthHeader(request)
  const headers = { Authorization: adminAuth }

  const upload = await request.post('/api/media', {
    headers,
    multipart: {
      file: { name: 'cover-image-url-e2e.png', mimeType: 'image/png', buffer: PNG },
      _payload: JSON.stringify({ alt: 'cover' }),
    },
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  mediaId = (await upload.json()).doc.id

  const post = await request.post('/api/posts?locale=en', {
    headers,
    data: {
      title: 'COVER IMAGE URL',
      _status: 'published',
      content: 'body',
      meta: { image: mediaId },
    },
  })
  expect(post.ok(), await post.text()).toBe(true)
  const { id, slug } = (await post.json()).doc
  postId = id

  const listing = (await (await request.get('/api/articles?locale=en&limit=500')).json()).docs
  const row = listing.find((d: { id: number }) => d.id === postId)
  const detail = await (await request.get(`/api/articles/${slug}?locale=en`)).json()

  for (const cover of [row?.coverImage, detail.coverImage]) {
    expect(cover?.startsWith(`${baseURL}/api/media/`), `coverImage ${cover} is on this app`).toBe(true)
    const res = await request.get(cover)
    expect(res.status(), `GET ${cover}`).toBe(200)
    expect(res.headers()['content-type']).toMatch(/^image\//)
  }
})
