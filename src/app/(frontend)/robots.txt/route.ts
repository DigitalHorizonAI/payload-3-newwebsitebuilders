import { getPublicSiteURL } from '@/utilities/getURL'

/**
 * The same pages are reachable on two hostnames: the public site
 * (newwebsite.builders/blog, via the website's proxy) and this app's own host
 * (cms.newwebsite.builders). Only the public one should be indexed, or the two
 * copies compete with each other in search results.
 *
 * A route handler rather than Next's robots.ts convention, because the answer
 * depends on which host asked and so must be produced per request.
 */
export const dynamic = 'force-dynamic'

export function GET(req: Request): Response {
  const siteURL = getPublicSiteURL()
  const host = req.headers.get('host') ?? ''

  let publicHost = ''
  try {
    publicHost = new URL(siteURL).host
  } catch {
    publicHost = ''
  }

  const isPublicSite = !publicHost || !host || host === publicHost

  const body = isPublicSite
    ? `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /next

Sitemap: ${siteURL}/sitemap.xml
`
    : `User-agent: *
Disallow: /
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
