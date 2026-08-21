import { Calendar } from 'lucide-react'
import React from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'

/**
 * The main site's article header, ported from its ArticlePage.tsx: category
 * label, serif headline and byline in a centered reading column, with the
 * cover image below — square-cornered, no border, no shadow.
 */
export const PostHero: React.FC<{
  post: Post
}> = ({ post }) => {
  const { categories, meta: { image: metaImage } = {}, populatedAuthors, publishedAt, title } = post

  return (
    <div className="pt-10 md:pt-14">
      <div className="container">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            {categories && categories.length > 0 && (
              <p className="text-xs tracking-[0.12em] uppercase text-muted-foreground mb-3">
                {categories.map((category, index) => {
                  if (typeof category === 'object' && category !== null) {
                    const titleToUse = category.title || 'Untitled category'
                    const isLast = index === categories.length - 1

                    return (
                      <React.Fragment key={index}>
                        {titleToUse}
                        {!isLast && <React.Fragment>, &nbsp;</React.Fragment>}
                      </React.Fragment>
                    )
                  }
                  return null
                })}
              </p>
            )}

            <h1 className="editorial-heading text-3xl md:text-4xl text-foreground mb-5 leading-tight">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {populatedAuthors && populatedAuthors.length > 0 && (
                <span>
                  {populatedAuthors.map((author, index) => {
                    const { name } = author

                    const isLast = index === populatedAuthors.length - 1
                    const secondToLast = index === populatedAuthors.length - 2

                    return (
                      <React.Fragment key={index}>
                        {name}
                        {secondToLast && populatedAuthors.length > 2 && (
                          <React.Fragment>, </React.Fragment>
                        )}
                        {secondToLast && populatedAuthors.length === 2 && (
                          <React.Fragment> </React.Fragment>
                        )}
                        {!isLast && populatedAuthors.length > 1 && (
                          <React.Fragment>and </React.Fragment>
                        )}
                      </React.Fragment>
                    )
                  })}
                </span>
              )}
              {publishedAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <time dateTime={publishedAt}>
                    {new Date(publishedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                </span>
              )}
            </div>
          </div>

          {metaImage && typeof metaImage !== 'string' && (
            <div className="relative overflow-hidden bg-secondary aspect-[16/9] mb-10">
              <Media fill imgClassName="object-cover" resource={metaImage} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
