import { CollectionSlug } from 'payload'

/**
 * Maps a collection to the URL path its documents are served under.
 *
 * Kept separate from the collection slug on purpose: posts live at /blog, not
 * /posts, so that the same URLs work when the blog is served through
 * newwebsite.builders/blog. Anything building a link to a document must read
 * this map rather than interpolating the collection name.
 */
export const collectionPrefixMap: Partial<Record<CollectionSlug, string>> = {
  posts: '/blog',
  pages: '',
}

/**
 * URL path for a document INSIDE this app, e.g. ('posts', 'my-article') ->
 * '/blog/my-article'. Correct for links and previews rendered by this Next
 * app. It is NOT the address the article has on the public website - see
 * getPublicDocPath.
 */
export const getDocPath = (
  relationTo: string | null | undefined,
  slug: string | null | undefined,
): string => `${collectionPrefixMap[relationTo as CollectionSlug] ?? `/${relationTo}`}/${slug}`

/**
 * The address a document has on the PUBLIC website.
 *
 * Articles that predate the CMS keep the nested, `.html` path they were already
 * indexed under; that is the entire point of `legacyPath`, and the reason the
 * port could preserve every indexed URL without a single redirect. The public
 * site serves /blog/nl/wat-een-cms-je-echt-geeft.html - /blog/<slug> is a 404
 * there.
 *
 * ⛔ Every outward-facing URL must come from here: canonical, og:url, the
 * sitemap, JSON-LD and the articles API. Building one from getDocPath instead
 * makes the CMS advertise addresses that do not exist.
 */
export const getPublicDocPath = (
  relationTo: string | null | undefined,
  slug: string | null | undefined,
  legacyPath?: string | null,
): string =>
  legacyPath ? `/blog/${String(legacyPath).replace(/^\/+/, '')}` : getDocPath(relationTo, slug)
