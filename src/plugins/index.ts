import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { Plugin } from 'payload'
import { authenticated } from '@/access/authenticated'
import { isAdmin } from '@/access/isAdmin'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

import { Page, Post } from '@/payload-types'
import { getPublicSiteURL } from '@/utilities/getURL'
import { getDocPath } from '@/utilities/collectionPrefixMap'
import { SITE } from '@/utilities/site'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | ${SITE.name}` : SITE.name
}

// Uses the public site URL and the collection's path prefix: an article lives
// at newwebsite.builders/blog/<slug>, not at <cms host>/<slug>.
const generateURL: GenerateURL<Post | Page> = ({ doc, collectionConfig }) => {
  const url = getPublicSiteURL()

  return doc?.slug ? `${url}${getDocPath(collectionConfig?.slug, doc.slug)}` : url
}

/**
 * Why every plugin below spells out its access rules.
 *
 * A plugin brings its own collection, and whatever it does not declare, Payload
 * fills with `defaultAccess` — `Boolean(user)`
 * (payload/dist/collections/config/defaults.js:57). That was a fair default when
 * the only way to be a user was to be an administrator. It stopped being one the
 * day `apiClients` was added: a second auth-enabled collection means "there is a
 * user" no longer means "this is a person who runs the site". Four collections
 * arrived through plugins and inherited that default, so a leaked API key could
 * repoint any URL on the site, rewrite the contact form, and read and delete
 * what visitors had submitted through it.
 *
 * The rules are written out per operation rather than as a blanket, because the
 * plugins ship deliberate exceptions that have to survive: anonymous visitors
 * must be able to POST a form submission, and the site must be able to read
 * forms, redirects and the search index. `scripts/check-access.ts` measures what
 * these actually permit; it is the thing to run after touching this file.
 */
export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      access: {
        // A redirect is site-wide routing, not copy. Whoever can write one can
        // take any address on the site somewhere else, so this is narrower than
        // the rest of the CMS: admins only, and never an API key. `read` is left
        // as the plugin's public default — the front-end resolves redirects
        // through the Local API, which bypasses access anyway, and the list of
        // where public URLs point is not a secret.
        create: isAdmin,
        update: isAdmin,
        delete: isAdmin,
      },
      // @ts-expect-error
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formSubmissionOverrides: {
      access: {
        // `create` is deliberately NOT listed. The plugin defaults it to
        // `() => true` and it has to stay that way: the browser POSTs here
        // unauthenticated from src/blocks/Form/Component.tsx. Narrowing it
        // breaks every form on the public site, silently, for visitors only.
        //
        // `read` is the one being changed. The plugin's default is `!!user`,
        // which includes an API key — so a key scoped to publishing articles
        // could read every name, email address and message a visitor had ever
        // sent. `authenticated` is the same rule minus machines.
        read: authenticated,
        // Deleting a submission destroys the only copy of an enquiry; there is
        // no mailbox behind it. `update` is left as the plugin's `() => false`.
        delete: isAdmin,
      },
    },
    formOverrides: {
      access: {
        // A form is content — editors build and change them, which is the job.
        // An API key is not content staff, and a form holds the addresses its
        // submissions are mailed to, so a key that could edit one could quietly
        // redirect every enquiry. `authenticated` means a person, not a machine.
        create: authenticated,
        update: authenticated,
        delete: authenticated,
      },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  searchPlugin({
    collections: ['posts'],
    beforeSync: beforeSyncWithSearch,
    skipSync: ({ req }) =>
      process.env.DISABLE_SEARCH_SYNC === 'true' || Boolean(req.context.disableSearchSync),
    searchOverrides: {
      access: {
        // The index is derived, never authored. The plugin already refuses
        // `create` and allows public `read`; what it leaves open is update and
        // delete, so anyone signed in — including a key — could blank the site
        // search or point a result at something else. The plugin's own sync
        // runs through the Local API and is unaffected.
        //
        // Consequence, deliberate: the Reindex button in the admin panel checks
        // update and delete (plugin-search/dist/utilities/generateReindexHandler.js),
        // so only an admin can press it.
        update: isAdmin,
        delete: isAdmin,
      },
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
]
