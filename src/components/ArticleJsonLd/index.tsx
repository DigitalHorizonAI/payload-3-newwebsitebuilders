/**
 * schema.org BlogPosting markup for an article page.
 *
 * Google states no property is strictly required, but headline, image,
 * datePublished and author are the four that decide rich-result eligibility,
 * so all four are emitted whenever the data exists.
 *
 * URLs use the public origin, not the CMS host — the article Google should
 * index is the proxied one at newwebsite.builders/blog/<slug>.
 */
import React from 'react'

import type { Media, Post } from '@/payload-types'

import { getPublicDocPath } from '@/utilities/collectionPrefixMap'
import { getPublicSiteURL } from '@/utilities/getURL'
import { SITE } from '@/utilities/site'

/** headline is truncated by Google past 110 characters. */
const HEADLINE_MAX = 110

export const ArticleJsonLd: React.FC<{ post: Post }> = ({ post }) => {
  const site = getPublicSiteURL()
  const url = `${site}${getPublicDocPath('posts', post.slug, post.legacyPath)}`

  const image =
    post.meta?.image && typeof post.meta.image === 'object'
      ? (post.meta.image as Media).url
      : undefined

  const authors = (post.populatedAuthors ?? []).map((a) => a.name).filter(Boolean)

  const categories = Array.isArray(post.categories)
    ? post.categories
        .filter((c) => typeof c === 'object' && c !== null)
        .map((c) => (c as { title?: string }).title)
        .filter(Boolean)
    : []

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    headline: post.title?.slice(0, HEADLINE_MAX),
    ...(post.meta?.description ? { description: post.meta.description } : {}),
    ...(image ? { image: [new URL(image, site).toString()] } : {}),
    ...(post.publishedAt ? { datePublished: new Date(post.publishedAt).toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: new Date(post.updatedAt).toISOString() } : {}),
    // name only — no titles, no "By". Google rejects decorated author names.
    ...(authors.length
      ? { author: authors.map((name) => ({ '@type': 'Person', name })) }
      : {}),
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: site,
      logo: { '@type': 'ImageObject', url: `${site}/brand/logo-dark.png` },
    },
    ...(categories.length ? { articleSection: categories } : {}),
    inLanguage: 'en',
    isAccessibleForFree: true,
  }

  return (
    <script
      type="application/ld+json"
      // Serialised by us from typed CMS fields, not from user-supplied HTML.
      // `<` is escaped so a title containing markup cannot close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  )
}
