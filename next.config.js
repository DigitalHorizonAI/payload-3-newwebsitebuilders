import { withPayload } from '@payloadcms/next/withPayload'
import path from 'path'

import redirects from './redirects.js'

const NEXT_PUBLIC_SERVER_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      ...[NEXT_PUBLIC_SERVER_URL /* 'https://example.com' */].map((item) => {
        const url = new URL(item)

        return {
          hostname: url.hostname,
          protocol: url.protocol.replace(':', ''),
        }
      }),
    ],
  },
  sassOptions: {
    includePaths: [path.join(process.cwd(), 'node_modules')],
  },
  reactStrictMode: true,
  redirects,
  /**
   * Static generation runs one worker per CPU, and every worker opens its own
   * Postgres pool. On a build machine reporting 17 CPUs that is 17 pools
   * competing with the running site for connections, and the build dies with
   * "sorry, too many clients already" partway through the article pages.
   * Capping the workers bounds the connection count; with hundreds of pages
   * the build is bound by the database anyway, not by CPU.
   */
  experimental: {
    cpus: 2,
  },
}

export default withPayload(nextConfig)
