import canUseDOM from './canUseDOM'

/**
 * Environment variables set through a hosting dashboard pick up stray
 * whitespace easily, and it is invisible in the UI. A single leading space in
 * NEXT_PUBLIC_SITE_URL shipped `" https://..."` into every canonical URL and
 * silently broke CORS, because the origin allow-list compares exact strings.
 */
const env = (value: string | undefined) => value?.trim() || undefined

export const getServerSideURL = () => {
  let url = env(process.env.NEXT_PUBLIC_SERVER_URL)

  if (!url && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  if (!url) {
    url = 'http://localhost:3000'
  }

  return url
}

/**
 * Where the public site lives, as visitors and search engines see it.
 *
 * Distinct from getServerSideURL(): the blog is served through
 * newwebsite.builders/blog while this app runs on cms.newwebsite.builders, so
 * the same article is reachable at two hostnames. Canonical URLs, Open Graph
 * tags and the sitemap must all point at the public one, or search engines
 * index the CMS copy instead.
 *
 * In production this THROWS rather than falling back. The fallback chain used
 * to end at http://localhost:3000, and a build with the variable missing
 * shipped `<link rel="canonical" href="http://localhost:3000/blog/...">` to
 * production without a single error — every canonical, og:url and sitemap
 * entry silently wrong. Failing the build is the only way that gets noticed.
 *
 * Outside production the fallback stays, so local dev and any unproxied site
 * keep working unchanged.
 */
export const getPublicSiteURL = () => {
  const url = env(process.env.NEXT_PUBLIC_SITE_URL)

  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not set. It is the public origin (https://newwebsite.builders) ' +
        'used for canonical URLs, Open Graph tags and the sitemap. Set it on the Railway ' +
        'service — it is read at build time, so a rebuild is needed after changing it.',
    )
  }

  return url || getServerSideURL()
}

export const getClientSideURL = () => {
  if (canUseDOM) {
    const protocol = window.location.protocol
    const domain = window.location.hostname
    const port = window.location.port

    return `${protocol}//${domain}${port ? `:${port}` : ''}`
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  return env(process.env.NEXT_PUBLIC_SERVER_URL) || ''
}
