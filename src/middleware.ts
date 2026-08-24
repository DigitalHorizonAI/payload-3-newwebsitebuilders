import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * This app is the editor preview, not the public blog — newwebsite.builders
 * builds its /blog from this CMS's API. robots.txt already serves
 * `Disallow: /` on any non-public host, but Disallow only blocks CRAWLING: a
 * URL someone links (the Railway host) can still be indexed. This header is
 * the index-blocking half, keyed on the same host comparison the robots
 * route uses.
 */
const publicHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '').host
  } catch {
    return null
  }
})()

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next()
  const host = request.headers.get('host')
  if (!publicHost || !host || host !== publicHost) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return response
}

export const config = {
  // Frontend routes only; the admin and the API are already robots-disallowed
  // everywhere and gain nothing from the header.
  matcher: ['/((?!api|admin|_next|media).*)'],
}
