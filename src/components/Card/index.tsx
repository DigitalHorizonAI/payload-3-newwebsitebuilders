'use client'
import { cn } from '@/utilities/cn'
import { getDocPath } from '@/utilities/collectionPrefixMap'
import useClickableCard from '@/utilities/useClickableCard'
import Link from 'next/link'
import React, { Fragment } from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'

export type CardPostData = Pick<Post, 'slug' | 'categories' | 'meta' | 'title' | 'publishedAt'>

/**
 * The main site's article card, ported from its BlogPage.tsx: no container,
 * border or shadow — a bare column of 4:3 image, category label, serif title
 * and excerpt. The main site's meta row shows read time; the posts collection
 * has no such field, so the blog shows the publish date there instead.
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

  return (
    <article
      className={cn('group flex flex-col hover:cursor-pointer', className)}
      ref={card.ref}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary mb-4">
        {metaImage && typeof metaImage !== 'string' && (
          <Media
            fill
            imgClassName="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            resource={metaImage}
            size="33vw"
          />
        )}
      </div>

      {showCategories && hasCategories && (
        <p className="text-xs tracking-[0.12em] uppercase text-muted-foreground mb-2">
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
        <h3 className="font-display text-xl text-foreground leading-snug mb-2">
          <Link
            className="group-hover:underline underline-offset-4"
            href={href}
            ref={link.ref}
          >
            {titleToUse}
          </Link>
        </h3>
      )}

      {description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{sanitizedDescription}</p>
      )}

      {publishedAt && (
        <p className="mt-auto text-xs text-muted-foreground">
          <time dateTime={publishedAt}>
            {new Date(publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        </p>
      )}
    </article>
  )
}
