/**
 * Public read-only article API.
 *
 *   GET /api/articles           listing data only
 *   GET /api/articles/:slug     full article, SEO metadata and related posts
 *
 * Payload already serves /api/posts, which works and stays available. These
 * exist so anything consuming the blog gets a small, stable shape that does
 * not change when the CMS structure does — the fields inside a Post are ours
 * to rearrange, the fields in this response are a contract.
 *
 * Published only, always: `_status` is filtered explicitly AND access control
 * is left on, so a draft cannot leak through either route.
 */
import type { Endpoint, PayloadRequest, TypedLocale } from 'payload'
import type { Category, Media, Post } from '@/payload-types'

import { articleHtml } from '@/lib/articleHtml'
import { getPublicDocPath } from '@/utilities/collectionPrefixMap'
import { getPublicSiteURL } from '@/utilities/getURL'

// High enough that every consumer fetches the whole blog in one request. The
// websites and their sitemap/llms.txt functions all need the complete list, and
// eight round trips per consumer to assemble it is worse for this database than
// one wide read — see the `select` on the listing query, which keeps that read
// from dragging along 500 article bodies.
const MAX_LIMIT = 500
const DEFAULT_LIMIT = 12

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Matches the edge functions' own 5-minute cache. Published content is
      // not personalised, and this database has already hit its connection
      // ceiling once under build load.
      'Cache-Control': 'public, max-age=300',
    },
  })

/**
 * Absolute URL of an uploaded image, or null when none is set. The relation is
 * a bare ID when it hasn't been populated, hence the object check.
 */
const imageURL = (image: unknown): string | null => {
  if (!image || typeof image !== 'object') return null
  const url = (image as Media).url
  return url ? new URL(url, getPublicSiteURL()).toString() : null
}

const titles = (docs: unknown): string[] =>
  Array.isArray(docs)
    ? docs
        .filter((d): d is Category => typeof d === 'object' && d !== null)
        .map((d) => d.title)
        .filter(Boolean)
    : []

/**
 * The listing shape. Deliberately small — a client rendering an index should
 * not have to download every article's body to draw a list of cards.
 */
/**
 * Where the article lives on the public website. Articles that predate the CMS
 * keep the nested path they were already indexed under — changing a ranking URL
 * is not something a CMS migration should do silently. New articles have no
 * legacy path and use the slug.
 */
const publicPath = (post: Post) => getPublicDocPath('posts', post.slug, post.legacyPath)

/**
 * Who the article is by. Articles that predate the CMS arrived with an author
 * name but no CMS user to link to, so they carry a plain `byline` instead; a
 * linked author always wins. Without this the website would credit every
 * migrated article to the site itself and lose its author markup.
 */
const bylines = (post: Post): string[] => {
  const names = (post.populatedAuthors ?? []).map((a) => a.name).filter(Boolean) as string[]
  if (names.length) return names
  return post.byline ? [post.byline] : []
}

const toListing = (post: Post) => ({
  // The document id, and the ONLY field on this response that is the same in
  // every locale. Title, slug and path are all localized, so two rows for the
  // same article share nothing else - a consumer fetching ?locale=en and
  // ?locale=nl cannot otherwise tell that it is holding one article twice.
  // Sorting by publishedAt happens to line the two lists up today, but that is
  // a coincidence of the data, not a guarantee.
  id: post.id,
  title: post.title,
  slug: post.slug,
  path: publicPath(post),
  // This CMS has a real `excerpt` field - the one or two sentences an editor
  // writes for the index card and the link preview. It is deliberately not the
  // SEO description, which is written for a search result, so reading the
  // description here returned the wrong copy on every article. The fallback
  // keeps an article without an excerpt showing something rather than an empty
  // card.
  excerpt: post.excerpt ?? post.meta?.description ?? null,
  publishedAt: post.publishedAt ?? null,
  coverImage: imageURL(post.meta?.image),
  categories: titles(post.categories),
  authors: bylines(post),
  url: `${getPublicSiteURL()}${publicPath(post)}`,
  meta: {
    title: post.meta?.title ?? post.title,
    description: post.meta?.description ?? null,
  },
})

/**
 * The body as HTML. The websites render article bodies as HTML today and the
 * edge functions that make them indexable read HTML too, so converting here
 * once keeps a Lexical renderer out of all four consumers. `content` stays on
 * the response for anything that wants the structured form.
 *
 * `articleHtml` is the hand-rolled serializer whose contract is byte-identity
 * with the hand-written article source — the import script proves the
 * round-trip before writing, and this endpoint must keep matching it, or the
 * static builder republishes every article with changed markup.
 */
const contentHTML = async (post: Post, payload: PayloadRequest['payload']): Promise<string> => {
  if (!post.content) return ''
  return articleHtml(post.content as Parameters<typeof articleHtml>[0], {
    resolveMedia: async (id) => {
      // Depth normally populates the media relation, but a bare ID must still
      // render an image rather than silently dropping it out of the article.
      let media: unknown = id
      if (typeof media === 'number' || typeof media === 'string') {
        media = await payload
          .findByID({ collection: 'media', id: media, depth: 0 })
          .catch(() => null)
      }
      const url = imageURL(media)
      if (!url) return null
      return { url, alt: typeof media === 'object' && media ? ((media as Media).alt ?? '') : '' }
    },
  })
}

/** The listing shape plus everything needed to render the article itself. */
const toArticle = (post: Post) => ({
  ...toListing(post),
  content: post.content,
  // The headline as the article page shows it, with the website's one-word
  // emphasis markup. Null on an article whose author did not set one; the
  // caller falls back to the plain title, which is why this is not required.
  h1: post.h1Html ?? null,
  // The website writes these into a meta keywords tag on the article page.
  keywords: post.meta?.keywords ?? null,
  canonicalUrl: `${getPublicSiteURL()}${publicPath(post)}`,
  updatedAt: post.updatedAt ?? null,
  relatedPosts: Array.isArray(post.relatedPosts)
    ? post.relatedPosts
        .filter((p): p is Post => typeof p === 'object' && p !== null)
        .map(toListing)
    : [],
})

const publishedOnly = { _status: { equals: 'published' } }

/**
 * Which language to answer in.
 *
 * A custom endpoint does NOT inherit the request's locale: `payload.find()`
 * answers in the default locale unless it is passed one. This endpoint was
 * written for a single-language CMS and never passed it, so on a localized CMS
 * `?locale=nl` returned English and a Dutch slug could not be found at all,
 * because `where slug equals` was matching the English column.
 *
 * The raw query value is read rather than `req.locale`, and that is deliberate.
 * MEASURED: for `?locale=de-DE`, `req.locale` is already `'en'` — Payload
 * quietly rewrites an unknown locale to the default — while `req.query.locale`
 * still holds `'de-DE'`. Reading the raw value is the only way to tell a typo
 * from a real request for English, and answering a typo with English is exactly
 * the failure that would leave a caller believing content was translated when
 * it was not.
 */
const resolveLocale = (
  req: PayloadRequest,
): { locale?: TypedLocale; error?: string } => {
  const requested = (req.query as Record<string, string | undefined>)?.locale

  if (!requested) return {}

  const codes: string[] = req.payload.config.localization
    ? req.payload.config.localization.localeCodes
    : []

  // A CMS with no localization configured has nothing to answer here; ignoring
  // the parameter keeps this endpoint identical on single-language sites.
  if (!codes.length) return {}

  if (!codes.includes(requested)) {
    return { error: `Unknown locale '${requested}'. Available: ${codes.join(', ')}.` }
  }

  // Safe: `requested` was just checked against the configured locale codes.
  return { locale: requested as TypedLocale }
}

export const articlesListEndpoint: Endpoint = {
  path: '/articles',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const { limit, page, category } = req.query as Record<string, string | undefined>

    const { locale, error } = resolveLocale(req)
    if (error) return json({ error }, 400)

    // A caller asking for 10,000 articles should get a sane page, not a
    // timeout. Anything unparseable falls back to the default.
    const parsedLimit = Number.parseInt(limit ?? '', 10)
    const parsedPage = Number.parseInt(page ?? '', 10)

    const result = await req.payload.find({
      collection: 'posts',
      depth: 1,
      draft: false,
      locale,
      overrideAccess: false,
      limit: Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
        : DEFAULT_LIMIT,
      page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      // Only what toListing reads. Without this a 500-article page pulls 500
      // Lexical bodies out of Postgres to render cards that never show them.
      // `authors` is deliberately absent: populateAuthors only rewrites
      // populatedAuthors when it is present, so leaving it out returns the
      // stored names and skips one user lookup per article per listing.
      select: {
        title: true,
        slug: true,
        // The card copy. A textarea, so it costs nothing next to the Lexical
        // body this projection exists to leave behind - and without it the
        // listing falls back to the SEO description on every card.
        excerpt: true,
        legacyPath: true,
        publishedAt: true,
        meta: true,
        categories: true,
        populatedAuthors: true,
        byline: true,
      },
      sort: '-publishedAt',
      // ponytail: matches on category title because Categories has no slug
      // field — `like` is ILIKE on Postgres, so ?category=automation works
      // regardless of case. Add a slug to Categories if exact matching or
      // stable URLs for category pages are ever needed.
      where: category
        ? { and: [publishedOnly, { 'categories.title': { like: category } }] }
        : publishedOnly,
    })

    return json({
      docs: result.docs.map(toListing),
      totalDocs: result.totalDocs,
      page: result.page,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    })
  },
}

export const articleBySlugEndpoint: Endpoint = {
  path: '/articles/:slug',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const slug = req.routeParams?.slug

    if (typeof slug !== 'string' || !slug) {
      return json({ error: 'A slug is required.' }, 400)
    }

    const { locale, error } = resolveLocale(req)
    if (error) return json({ error }, 400)

    const result = await req.payload.find({
      collection: 'posts',
      depth: 2, // one level deeper: related posts need their own cover images
      draft: false,
      locale,
      overrideAccess: false,
      limit: 1,
      pagination: false,
      where: { and: [publishedOnly, { slug: { equals: slug } }] },
    })

    const post = result.docs[0]

    // Unknown and draft slugs are indistinguishable on purpose — a 404 on a
    // draft would confirm the article exists before it is published.
    if (!post) return json({ error: 'Article not found.' }, 404)

    return json({ ...toArticle(post), contentHtml: await contentHTML(post, req.payload) })
  },
}
