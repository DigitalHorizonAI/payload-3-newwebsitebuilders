import { expect, test } from '@playwright/test'

/**
 * The public article API is a contract: anything consuming the blog depends on
 * these field names staying put even when the Post collection is rearranged.
 * These assertions fail the moment the shape drifts.
 *
 * Written to pass with or without seeded content, so it does not depend on
 * app.spec.ts having run first.
 */

const LISTING_KEYS = [
  'title',
  'slug',
  'excerpt',
  'publishedAt',
  'coverImage',
  'categories',
  'url',
  'meta',
]

test.describe('public articles API', () => {
  test('GET /api/articles returns the documented listing shape', async ({ request }) => {
    const res = await request.get('/api/articles')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')

    const body = await res.json()
    expect(Array.isArray(body.docs)).toBe(true)
    for (const key of ['totalDocs', 'page', 'totalPages', 'hasNextPage', 'hasPrevPage']) {
      expect(body, `pagination key ${key}`).toHaveProperty(key)
    }

    for (const doc of body.docs) {
      for (const key of LISTING_KEYS) {
        expect(doc, `listing key ${key}`).toHaveProperty(key)
      }
      // The listing must stay small — the body belongs to the detail route.
      expect(doc).not.toHaveProperty('content')
      expect(doc.meta).toHaveProperty('title')
      expect(doc.meta).toHaveProperty('description')
    }
  })

  test('limit is clamped rather than trusted', async ({ request }) => {
    const res = await request.get('/api/articles?limit=100000')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.docs.length).toBeLessThanOrEqual(50)
  })

  test('GET /api/articles/:slug 404s for a slug that is not published', async ({ request }) => {
    const res = await request.get('/api/articles/definitely-not-a-real-article-slug')
    expect(res.status()).toBe(404)
    expect(await res.json()).toHaveProperty('error')
  })

  test('GET /api/articles/:slug returns the full article when one exists', async ({ request }) => {
    const listing = await (await request.get('/api/articles')).json()
    test.skip(listing.docs.length === 0, 'no published articles to fetch')

    const slug = listing.docs[0].slug
    const res = await request.get(`/api/articles/${slug}`)
    expect(res.status()).toBe(200)

    const article = await res.json()
    for (const key of [...LISTING_KEYS, 'content', 'authors', 'canonicalUrl', 'relatedPosts']) {
      expect(article, `article key ${key}`).toHaveProperty(key)
    }
    expect(article.slug).toBe(slug)
    expect(article.canonicalUrl).toContain(`/blog/${slug}`)
    expect(Array.isArray(article.relatedPosts)).toBe(true)
  })

  test('the article page carries BlogPosting JSON-LD', async ({ request }) => {
    const listing = await (await request.get('/api/articles')).json()
    test.skip(listing.docs.length === 0, 'no published articles to render')

    const slug = listing.docs[0].slug
    const html = await (await request.get(`/blog/${slug}`)).text()

    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )
    expect(match, 'a JSON-LD block is present').toBeTruthy()

    const schema = JSON.parse(match![1].replace(/\\u003c/g, '<'))
    expect(schema['@type']).toBe('BlogPosting')
    expect(schema.headline).toBeTruthy()
    expect(schema.headline.length).toBeLessThanOrEqual(110)
    expect(schema.url).toContain(`/blog/${slug}`)
    expect(schema.publisher?.name).toBeTruthy()
  })
})
