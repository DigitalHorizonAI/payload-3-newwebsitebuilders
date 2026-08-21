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
  'id',
  'title',
  'slug',
  // The public address, and the only one a consumer may build a link from.
  // Articles imported from the old blog keep their indexed /<lang>/<slug>.html
  // path, so interpolating the slug produces a 404 on the live site.
  'path',
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

  test('excerpt is the editor’s card copy, not the SEO description', async ({ request }) => {
    const body = await (await request.get('/api/articles?limit=500')).json()
    test.skip(body.docs.length === 0, 'no published articles to compare')

    // The endpoint falls back to meta.description for an article whose author
    // left the excerpt blank, so equality on any single article is legitimate.
    // What must never happen is the fallback swallowing the field entirely —
    // that is the regression this guards, and it shows up as every article on
    // the site suddenly reading like a search result.
    const distinct = body.docs.filter(
      (d: { excerpt: string | null; meta: { description: string | null } }) =>
        d.excerpt && d.excerpt !== d.meta.description,
    )
    expect(distinct.length, 'at least one article serves its own excerpt').toBeGreaterThan(0)
  })

  test('id is the same article in every locale, and nothing else is', async ({ request }) => {
    const [en, nl] = await Promise.all(
      ['en', 'nl'].map(async (l) => (await request.get(`/api/articles?locale=${l}&limit=500`)).json()),
    )
    test.skip(en.docs.length === 0, 'no published articles to pair')

    // A consumer generating one page per language has to know which Dutch row
    // is the same article as which English row. Every other field it could
    // pair on - title, slug, path - is localized and therefore different by
    // design. This asserts the pairing works AND that it is not a tautology:
    // if slugs ever stopped being localized the second half would fail and the
    // first would keep passing, which is the failure worth catching.
    const byId = new Map(en.docs.map((d: { id: unknown }) => [d.id, d]))
    for (const doc of nl.docs) {
      expect(byId.has(doc.id), `nl article ${doc.id} has an en counterpart`).toBe(true)
    }
    const translated = nl.docs.filter(
      (d: { id: unknown; slug: string }) => (byId.get(d.id) as { slug: string }).slug !== d.slug,
    )
    expect(translated.length, 'slugs are translated, so id is doing real work').toBeGreaterThan(0)
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
    for (const key of [
      ...LISTING_KEYS,
      'content',
      'contentHtml',
      // The website renders h1 as markup and keywords into a meta tag. Both are
      // nullable, so this asserts presence, not truthiness.
      'h1',
      'keywords',
      'authors',
      'canonicalUrl',
      'relatedPosts',
    ]) {
      expect(article, `article key ${key}`).toHaveProperty(key)
    }
    expect(article.slug).toBe(slug)
    // Against `path`, not the slug: an imported article's public address is
    // /blog/<lang>/<slug>.html, so `/blog/${slug}` is not a substring of it.
    expect(article.canonicalUrl).toContain(article.path)
    expect(Array.isArray(article.relatedPosts)).toBe(true)
  })

  test('the article page carries BlogPosting JSON-LD', async ({ request }) => {
    const listing = await (await request.get('/api/articles')).json()
    test.skip(listing.docs.length === 0, 'no published articles to render')

    const { slug, path } = listing.docs[0]
    // This app serves its own preview of an article at /blog/<slug>. The
    // address it ADVERTISES is `path`, which is the public site's — the two are
    // different on purpose, and the assertions below check the right one.
    const html = await (await request.get(`/blog/${slug}`)).text()

    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )
    expect(match, 'a JSON-LD block is present').toBeTruthy()

    const schema = JSON.parse(match![1].replace(/\\u003c/g, '<'))
    expect(schema['@type']).toBe('BlogPosting')
    expect(schema.headline).toBeTruthy()
    expect(schema.headline.length).toBeLessThanOrEqual(110)
    expect(schema.url).toContain(path)
    expect(schema.publisher?.name).toBeTruthy()
  })
})
