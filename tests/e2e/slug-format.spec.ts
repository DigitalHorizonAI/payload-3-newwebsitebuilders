import { expect, test } from '@playwright/test'

import { adminAuthHeader } from './admin'

/**
 * The slug a delivered article ends up with.
 *
 * GetRanked stores `topical_map.slug` as a three-level path —
 * segment/subcategory/keyword — and n8n copies it into `slug` verbatim. The
 * original formatSlug ran `.replace(/[^\w-]+/g, '')`, which DELETED the
 * separators instead of substituting them, so
 *   core-website-design-services/core-website-design-services/website-design
 * was stored as
 *   core-website-design-servicescore-website-design-serviceswebsite-design
 * and shipped as the public URL of a page whose whole purpose is ranking.
 * Measured on newwebsite.builders post id=7, 28 Aug 2026.
 *
 * The hook is a field-level beforeValidate on both Posts and Pages
 * (src/fields/slug/index.ts), so this asserts it through the API the pipeline
 * actually uses rather than through the admin panel's client-side copy.
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

test.describe('slug formatting', () => {
  let adminAuth: string

  test.beforeAll(async ({ request }) => {
    adminAuth = await adminAuthHeader(request)
  })

  test('a path slug is reduced to its last segment, not glued together', async ({ request }) => {
    const res = await request.post('/api/posts', {
      headers: { Authorization: adminAuth },
      data: {
        title: 'SLUG SPEC — path slug',
        _status: 'draft',
        content: lexical('body'),
        slug: 'core-website-design-services/core-website-design-services/website-design-portfolio',
      },
    })
    expect(res.status()).toBe(201)

    const { doc } = await res.json()
    expect(doc.slug).toBe('website-design-portfolio')
    // The exact string the bug produced, asserted so a revert cannot pass.
    expect(doc.slug).not.toContain('servicescore')

    await request.delete(`/api/posts/${doc.id}`, { headers: { Authorization: adminAuth } })
  })

  test('separators and punctuation become single hyphens', async ({ request }) => {
    const res = await request.post('/api/posts', {
      headers: { Authorization: adminAuth },
      data: {
        title: 'SLUG SPEC — punctuation',
        _status: 'draft',
        content: lexical('body'),
        slug: "  What's a 'hand coded' website? (2026)  ",
      },
    })
    expect(res.status()).toBe(201)

    const { doc } = await res.json()
    expect(doc.slug).toBe('what-s-a-hand-coded-website-2026')

    await request.delete(`/api/posts/${doc.id}`, { headers: { Authorization: adminAuth } })
  })
})
