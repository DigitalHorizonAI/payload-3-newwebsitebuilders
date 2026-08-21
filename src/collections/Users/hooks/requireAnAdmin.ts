import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { APIError } from 'payload'

/**
 * The set of administrators is never empty.
 *
 * One rule, three places it can be broken: creating the very first account,
 * demoting the last admin, and deleting the last admin. All three end in the
 * same state — a CMS nobody can add a user to, revoke a key from, or promote
 * anybody in, recoverable only with direct database access.
 *
 * The first-account case is the one that bites on day one, because `role`
 * defaults to `editor` and `first-register` bypasses collection access: without
 * this, whoever claims a fresh CMS lands as an editor and the deploy is bricked
 * on arrival. It is not a separate problem from the other two, so it is not a
 * separate rule.
 *
 * These live as collection hooks rather than access rules because they are not
 * about *who* is asking — an admin doing this deliberately is exactly the
 * dangerous case. Hooks also run under `overrideAccess`, so the Local API and
 * scripts/admin-rescue.ts are covered too, which access control would not be.
 */

const countAdmins = async (req: PayloadRequest, excludeId?: number | string) => {
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    req,
    where: excludeId
      ? { and: [{ role: { equals: 'admin' } }, { id: { not_equals: excludeId } }] }
      : { role: { equals: 'admin' } },
  })

  return totalDocs
}

export const requireAnAdminOnChange: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation === 'create') {
    const { totalDocs } = await req.payload.count({ collection: 'users', req })
    return totalDocs === 0 ? { ...data, role: 'admin' } : data
  }

  const isDemotion = originalDoc?.role === 'admin' && data.role && data.role !== 'admin'
  if (!isDemotion) return data

  if ((await countAdmins(req, originalDoc.id)) === 0) {
    throw new APIError(
      'This is the only administrator. Promote someone else to admin before changing this account.',
      400,
    )
  }

  return data
}

export const requireAnAdminOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const doc = await req.payload.findByID({ collection: 'users', id, req, overrideAccess: true })
  if (doc?.role !== 'admin') return

  if ((await countAdmins(req, id)) === 0) {
    throw new APIError(
      'This is the only administrator. Promote someone else to admin before deleting this account.',
      400,
    )
  }
}
