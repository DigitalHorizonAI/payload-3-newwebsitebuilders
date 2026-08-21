import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'

/**
 * Machine identities that may publish articles over the REST API.
 *
 * This exists so an external tool never holds a `users` credential. Every
 * access rule in this project was `Boolean(user)`, so enabling `useAPIKey` on
 * Users would have minted a key that could delete every post, read every
 * admin's email address, and open /admin. A separate collection makes least
 * privilege structural rather than a rule someone has to remember: what an api
 * client may do is decided by which access functions name it, and today that is
 * the whole blog — posts, media and categories — and nothing outside it. See
 * `src/access/contentWriter.ts` for where that boundary is drawn.
 *
 * Authenticate with the collection slug verbatim:
 *   Authorization: apiClients API-Key <key>
 *
 * `disableLocalStrategy` is load-bearing, not tidiness:
 *
 *  - It keeps the table to the three api-key columns. Without it Payload also
 *    adds email, salt/hash, login-attempt lockout columns and a sessions
 *    table, none of which anything here would ever use.
 *
 *  - It removes the login route, and with it a real hole. next/preview's
 *    route handler verifies the preview JWT's signature and never checks which
 *    collection the token belongs to, and the pages it unlocks run their
 *    queries with access overridden. A login token minted here would therefore
 *    have read every unpublished page and post. No local strategy, no token.
 *
 * Admin-panel access needs no rule: Payload rejects any principal whose
 * collection is not `admin.user` (that is `users`, set in payload.config.ts).
 */
export const ApiClients: CollectionConfig = {
  slug: 'apiClients',
  access: {
    // Managing keys is an admin job, and `isAdmin` is scoped to the users
    // collection, so neither a key nor an editor can read, mint or revoke keys.
    // A key issuing itself a successor would outlive any revocation.
    create: isAdmin,
    delete: isAdmin,
    read: isAdmin,
    // `disableLocalStrategy` removes the login route, so there is no lockout to
    // clear and nothing can reach this today. Declared anyway: the protection
    // above should not quietly depend on a setting three fields further down.
    unlock: isAdmin,
    update: isAdmin,
  },
  admin: {
    defaultColumns: ['name', 'owner', 'enableAPIKey'],
    description:
      'API keys for external tools. Each key may create and publish articles and upload media, and can do nothing else.',
    group: 'Settings',
    useAsTitle: 'name',
  },
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'The tool this key belongs to, e.g. "SEO content tool".' },
    },
    {
      name: 'owner',
      type: 'text',
      admin: { description: 'Who to contact if this key needs revoking.' },
    },
  ],
  timestamps: true,
}
