'use client'
import { cn } from '@/utilities/cn'
import { getDocPath } from '@/utilities/collectionPrefixMap'
import useClickableCard from '@/utilities/useClickableCard'
import Link from 'next/link'
import React, { Fragment } from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'
import { TopicArt } from '@/components/TopicArt'

export type CardPostData = Pick<Post, 'slug' | 'categories' | 'meta' | 'title' | 'publishedAt'>

/**
 * The main site's article card, ported from its blog index (.post-card):
 * a rounded hairline-inset panel — cover art on top, then topic tag, title,
 * excerpt, and a meta row pushed to the bottom. The art is the site's inline
 * SVG topic drawing; a post with a real meta image shows that instead. The
 * main site's meta row shows read time; the posts collection has no such
 * field, so the blog shows the publish date there instead.
 */
export const Card: React.FC<{
  alignItems?: 'center'
  className?: string
  doc?: CardPostData
  relationTo?: 'posts'
  showCategories?: boolean
  title?: string
}> = (props) => {
  const { card, link } = useClickableCard({})
  const { className, doc, relationTo, showCategories, title: titleFromProps } = props

  const { slug, categories, meta, title, publishedAt } = doc || {}
  const { description, image: metaImage } = meta || {}

  const hasCategories = categories && Array.isArray(categories) && categories.length > 0
  const titleToUse = titleFromProps || title
  const sanitizedDescription = description?.replace(/\s/g, ' ') // replace non-breaking space with white space
  const href = getDocPath(relationTo, slug)

  // Categories have no slug field; their titles are the topic keys themselves
  // ('seo', 'build', 'cms', 'process') — the articles API publishes them as-is.
  const firstCategory = hasCategories && typeof categories[0] === 'object' ? categories[0] : null
  const topic = firstCategory ? firstCategory.title : null

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-2xl bg-card',
        'shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.10)]',
        'transition-[background-color,transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:-translate-y-[3px] hover:cursor-pointer hover:bg-secondary',
        className,
      )}
      ref={card.ref}
    >
      <div className="relative h-[132px] overflow-hidden">
        {metaImage && typeof metaImage !== 'string' ? (
          <Media
            fill
            imgClassName="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            resource={metaImage}
            size="33vw"
          />
        ) : (
          <TopicArt topic={topic} />
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-6 pt-5">
        {showCategories && hasCategories && (
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-signal-ink">
            {categories?.map((category, index) => {
              if (typeof category === 'object') {
                const { title: titleFromCategory } = category
                const categoryTitle = titleFromCategory || 'Untitled category'
                const isLast = index === categories.length - 1

                return (
                  <Fragment key={index}>
                    {categoryTitle}
                    {!isLast && <Fragment>, &nbsp;</Fragment>}
                  </Fragment>
                )
              }

              return null
            })}
          </p>
        )}

        {titleToUse && (
          <h3 className="mt-3 font-display text-[1.2rem] leading-tight text-foreground">
            <Link className="group-hover:underline underline-offset-4" href={href} ref={link.ref}>
              {titleToUse}
            </Link>
          </h3>
        )}

        {description && (
          <p className="mt-2 text-[0.9375rem] font-light leading-relaxed text-muted-foreground line-clamp-2">
            {sanitizedDescription}
          </p>
        )}

        {publishedAt && (
          <p className="mt-auto flex items-center gap-2 pt-5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <time dateTime={publishedAt}>
              {new Date(publishedAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </p>
        )}
      </div>
    </article>
  )
}
