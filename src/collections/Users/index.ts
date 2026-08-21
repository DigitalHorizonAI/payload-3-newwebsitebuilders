import type { Access, CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { isAdmin } from '../../access/isAdmin'
import { requireAnAdminOnChange, requireAnAdminOnDelete } from './hooks/requireAnAdmin'

/**
 * People who sign in to the admin panel.
 *
 * Two roles, because this CMS is edited by the marketing team as well as by the
 * people who run it. An `editor` may change every word of the site — that is the
 * whole point of the CMS — and may do nothing to accounts or API keys. An
 * `admin` may do both.
 *
 * `role` carries field-level access of its own. Without it the collection rules
 * below are decoration: an editor may update their own record, and their own
 * record contains their role, so one PATCH would make them an administrator.
 */

/** Admins see everyone; an editor sees only their own account. */
const adminsAllUsersSelf: Access = ({ req: { user } }) => {
  if (user?.collection !== 'users') return false
  if (user.role === 'admin') return true
  return { id: { equals: user.id } }
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    // Editors still need the panel — it is where they do their job.
    admin: authenticated,
    create: isAdmin,
    delete: isAdmin,
    read: adminsAllUsersSelf,
    // Clearing an account's failed-login lockout. Undeclared it falls back to
    // `Boolean(user)`, which would let a key or an editor lift the lockout that
    // is protecting an administrator's account from a password guesser.
    unlock: isAdmin,
    update: adminsAllUsersSelf,
  },
  admin: {
    defaultColumns: ['name', 'email', 'role'],
    useAsTitle: 'name',
  },
  auth: true,
  hooks: {
    beforeChange: [requireAnAdminOnChange],
    beforeDelete: [requireAnAdminOnDelete],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      // New accounts land in the safe state. Promotion is a deliberate act.
      defaultValue: 'editor',
      access: {
        /**
         * `update` is the whole rule, and `create` deliberately has none.
         *
         * Self-promotion is an update: an editor may edit their own record, and
         * their own record holds their role. Guarding create as well looks
         * tidier and breaks the bootstrap — first-register runs with no user at
         * all, so `isAdmin` is false, the incoming role is stripped before it
         * reaches the database, and the person claiming a fresh CMS lands as an
         * editor. Nothing is lost by leaving create open: creating a user at all
         * is already admin-only at the collection level, and first-register is
         * the single path that bypasses it.
         */
        update: isAdmin,
      },
      admin: {
        description:
          'Editors may change all website text and media. Admins may also manage accounts and API keys.',
      },
      options: [
        { label: 'Editor — website content only', value: 'editor' },
        { label: 'Admin — content, accounts and API keys', value: 'admin' },
      ],
    },
  ],
  timestamps: true,
}
