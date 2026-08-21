import type { Metadata } from 'next'
import { getPublicSiteURL } from './getURL'
import { SITE } from './site'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: SITE.description,
  images: [
    {
      url: `${getPublicSiteURL()}${SITE.defaultOGImage}`,
    },
  ],
  siteName: SITE.name,
  title: SITE.name,
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
