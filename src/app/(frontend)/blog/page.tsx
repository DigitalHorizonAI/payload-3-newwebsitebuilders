import type { Metadata } from 'next/types'
import { SITE } from '@/utilities/site'
import { getPublicSiteURL } from '@/utilities/getURL'

import { CollectionArchive } from '@/components/CollectionArchive'
import { PageRange } from '@/components/PageRange'
import { Pagination } from '@/components/Pagination'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'
import PageClient from './page.client'

export const dynamic = 'force-static'
export const revalidate = 600

export default async function Page() {
  const payload = await getPayload({ config: configPromise })

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 12,
    overrideAccess: false,
    select: {
      title: true,
      slug: true,
      categories: true,
      meta: true,
      publishedAt: true,
    },
  })

  return (
    <div className="pb-28 pt-10 md:pt-14">
      <PageClient />
      {/* Mirrors the public site's blog hero (its /blog index). */}
      <div className="container mb-12">
        <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
          The blog
        </p>
        <h1 className="editorial-heading text-3xl sm:text-4xl text-foreground mb-3">
          How a website gets built, edited and found
        </h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          Guides written for the person paying for the website, not the person writing the
          code.
        </p>
      </div>

      <div className="container mb-8">
        <PageRange
          collection="posts"
          currentPage={posts.page}
          limit={12}
          totalDocs={posts.totalDocs}
        />
      </div>

      <CollectionArchive posts={posts.docs} />

      <div className="container">
        {posts.totalPages > 1 && posts.page && (
          <Pagination page={posts.page} totalPages={posts.totalPages} />
        )}
      </div>
    </div>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: `${SITE.name} Blog`,
    // The listing had no description at all — search results fell back to
    // whatever Google scraped off the page.
    description: SITE.description,
    // Articles already emit a canonical; the listing did not, so the CMS host
    // and the public host looked like two copies of the same page to Google.
    alternates: {
      canonical: `${getPublicSiteURL()}/blog`,
    },
  }
}
