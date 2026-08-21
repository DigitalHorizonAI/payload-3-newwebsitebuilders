import type { Metadata } from 'next'

import type { Page, Post } from '../payload-types'

import { mergeOpenGraph } from './mergeOpenGraph'
import { getPublicSiteURL } from './getURL'
import { getPublicDocPath } from './collectionPrefixMap'
import { SITE } from './site'

export const generateMeta = async (args: {
  doc: Partial<Page> | Partial<Post>
  collection?: 'pages' | 'posts'
}): Promise<Metadata> => {
  const { doc, collection = 'pages' } = args || {}

  const siteURL = getPublicSiteURL()

  // The uploaded image's own url, not just the site origin. Relative urls are
  // made absolute because Open Graph consumers do not resolve them.
  const metaImage = doc?.meta?.image
  const imageURL =
    typeof metaImage === 'object' && metaImage !== null && 'url' in metaImage && metaImage.url
      ? metaImage.url.startsWith('http')
        ? metaImage.url
        : `${siteURL}${metaImage.url}`
      : undefined

  const title = doc?.meta?.title ? `${doc.meta.title} | ${SITE.name}` : SITE.name

  // Canonical + og:url must be the public address of this document. Without
  // this, the same article served from both the CMS host and the public
  // domain competes with itself in search results.
  const path = doc?.slug
    ? getPublicDocPath(collection, doc.slug, (doc as Partial<Post>)?.legacyPath)
    : ''
  const canonical = `${siteURL}${path}`

  return {
    alternates: {
      canonical,
    },
    description: doc?.meta?.description,
    openGraph: mergeOpenGraph({
      description: doc?.meta?.description || '',
      images: imageURL ? [{ url: imageURL }] : undefined,
      title,
      url: canonical,
    }),
    title,
  }
}
