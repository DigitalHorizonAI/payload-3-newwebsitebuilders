import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicSiteURL } from '@/utilities/getURL'
import { getDocPath } from '@/utilities/collectionPrefixMap'

/**
 * Lists published articles so search engines can discover them without waiting
 * to stumble across a link. Served at newwebsite.builders/blog-sitemap.xml, via
 * the proxy rule in the marketing site's netlify.toml.
 *
 * URLs use the public origin, never this app's host — see getPublicSiteURL().
 *
 * Scope: articles only. This app serves /blog and /blog/<slug> on the public
 * domain and nothing else — Netlify proxies exactly those prefixes. The
 * marketing build owns the homepage and its own 40 URLs, and lists them in
 * newwebsite.builders/sitemap.xml. robots.txt points at both.
 */
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteURL = getPublicSiteURL()
  const payload = await getPayload({ config })

  const posts = await payload.find({
    collection: 'posts',
    depth: 0,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: { slug: true, updatedAt: true },
    where: { _status: { equals: 'published' } },
  })

  const entries: MetadataRoute.Sitemap = [
    { url: `${siteURL}/blog`, changeFrequency: 'daily', priority: 0.8 },
  ]

  for (const doc of posts.docs) {
    if (!doc.slug) continue
    entries.push({
      url: `${siteURL}${getDocPath('posts', doc.slug)}`,
      lastModified: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  }

  // The `pages` collection is deliberately absent. collectionPrefixMap maps it
  // to '', so it emitted newwebsite.builders/<slug> — URLs Netlify does not
  // proxy to this app. They resolved to the marketing SPA at HTTP 200, i.e.
  // soft 404s submitted to Google in our own sitemap. Since the marketing
  // build started returning a real 404 for unknown paths, they would now be
  // hard 404s in a sitemap, which is worse. Nothing is lost: no `pages` doc
  // has ever been published. Give the collection a proxied path prefix before
  // listing it again.

  return entries
}
