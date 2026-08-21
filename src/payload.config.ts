// storage-adapter-import-placeholder
import { postgresAdapter } from '@payloadcms/db-postgres'

import sharp from 'sharp' // sharp-import
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { ApiClients } from './collections/ApiClients'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { articleBySlugEndpoint, articlesListEndpoint } from './endpoints/articles'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL, getPublicSiteURL } from './utilities/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below and the import `BeforeLogin` statement on line 15.
      beforeLogin: ['@/components/BeforeLogin'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      // `next build` prerenders with one worker per CPU, each holding its own
      // pool. With hundreds of article pages, workers × the default pool size
      // exhausts Postgres's connection cap (53300 "too many clients") and the
      // build fails. 4 per pool keeps even a 17-worker build under the cap.
      max: 4,
    },
  }),
  collections: [Pages, Posts, Media, Categories, Users, ApiClients],
  /**
   * Four languages, because the blog is written for four audiences.
   *
   * `en` is the default because the marketing site's root is English and its
   * hreflang names `en` as x-default. `de` and `es` have no content yet, so
   * `fallback: true` serves the English article rather than an empty page —
   * a request for a locale that has not been translated returns something
   * readable instead of a hole.
   *
   * The blog's live URLs already translate the slug, not just the body
   * (`/blog/en/what-a-cms-actually-gives-you` vs
   * `/blog/nl/wat-een-cms-je-echt-geeft`), so `slug` is localized alongside
   * the content. Adding a locale later is cheap; making an existing field
   * localized after content exists is not.
   */
  localization: {
    locales: ['en', 'nl', 'de', 'es'],
    defaultLocale: 'en',
    fallback: true,
  },
  // Both the app's own host and the public site: the blog pages are built and
  // served from newwebsite.builders on Netlify while this runs on its own host.
  cors: [...new Set([getServerSideURL(), getPublicSiteURL()])].filter(Boolean),
  globals: [Header, Footer],
  plugins: [
    ...plugins,
    // storage-adapter-placeholder
  ],
  endpoints: [
    {
      path: '/health',
      method: 'get',
      handler: async (req) => {
        return new Response('OK', { status: 200 });
      }
    },
    articlesListEndpoint,
    articleBySlugEndpoint,
  ],
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
