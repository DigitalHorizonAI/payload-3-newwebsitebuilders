import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidatePath } from 'next/cache'

import type { Post } from '../../../payload-types'

/**
 * Refresh the article sitemap.
 *
 * The path is `/sitemap.xml` — this app's own route, from
 * `app/(frontend)/sitemap.ts`. It is NOT `/blog-sitemap.xml`, which is only the
 * public URL the marketing site's netlify.toml proxies to it; passing that
 * would revalidate a path this app does not serve and silently do nothing.
 *
 * Without this the route's `revalidate = 3600` meant a newly published article
 * could take an hour to appear in the sitemap, and a deleted one an hour to
 * leave it.
 */
const revalidateSitemap = (payload: { logger: { info: (msg: string) => void } }) => {
  payload.logger.info('Revalidating the article sitemap')
  revalidatePath('/sitemap.xml')
}

export const revalidatePost: CollectionAfterChangeHook<Post> = ({
  context,
  doc,
  previousDoc,
  req: { payload },
}) => {
  // revalidatePath only works inside a request. A script or migration that
  // writes posts has no Next store and would crash here, so let callers opt
  // out with `context: { disableRevalidate: true }`.
  if (context?.disableRevalidate) return doc

  if (doc._status === 'published') {
    const path = `/blog/${doc.slug}`

    payload.logger.info(`Revalidating post at path: ${path}`)

    revalidatePath(path)
    revalidatePath('/blog')
    revalidateSitemap(payload)
  }

  // A path that was published and no longer answers under that slug has to be
  // purged too, or the old page stays cached and served. Two ways in: the post
  // was unpublished, or it kept publishing under a NEW slug — the second was
  // missed before, and left the article live at both URLs.
  const wasPublished = previousDoc._status === 'published'
  const slugChanged = previousDoc.slug !== doc.slug

  if (wasPublished && (doc._status !== 'published' || slugChanged)) {
    const oldPath = `/blog/${previousDoc.slug}`

    payload.logger.info(`Revalidating old post at path: ${oldPath}`)

    revalidatePath(oldPath)
    revalidatePath('/blog')
    // Unpublishing removes the article from the sitemap, and a slug change
    // moves it — both leave a stale entry pointing at a URL that is now a 404.
    revalidateSitemap(payload)
  }

  return doc
}

/**
 * Purge a deleted article's page.
 *
 * Posts registered only `afterChange`, so deleting a post never invalidated
 * anything: the page stayed prerendered and kept answering 200 from the origin
 * — not just from the CDN — indefinitely. Observed in production, where an
 * article deleted from the admin panel was still being served afterwards.
 *
 * This mattered less while deleting was an admin-only action someone did rarely
 * and could notice. It matters now that an API key may delete, because a tool
 * removing an article would otherwise leave it live on the site with no signal
 * that anything was wrong.
 */
export const revalidateDelete: CollectionAfterDeleteHook<Post> = ({
  context,
  doc,
  req: { payload },
}) => {
  if (context?.disableRevalidate) return doc

  const path = `/blog/${doc?.slug}`

  payload.logger.info(`Revalidating deleted post at path: ${path}`)

  revalidatePath(path)
  revalidatePath('/blog')
  revalidateSitemap(payload)

  return doc
}
