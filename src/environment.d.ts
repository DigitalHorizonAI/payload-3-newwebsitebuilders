declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET: string
      DATABASE_URI: string
      /** This app's own origin, e.g. https://cms.newwebsite.builders */
      NEXT_PUBLIC_SERVER_URL: string
      /**
       * The public origin visitors and search engines see, e.g.
       * https://newwebsite.builders. Required in production — getPublicSiteURL()
       * throws without it. Read at build time, so changing it needs a rebuild.
       */
      NEXT_PUBLIC_SITE_URL: string
      /** Skips the search plugin's sync hook. Set by scripts/seed-local.ts. */
      DISABLE_SEARCH_SYNC: string
      /** Vercel-only; unreachable on this Railway deployment. */
      VERCEL_PROJECT_PRODUCTION_URL: string
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
