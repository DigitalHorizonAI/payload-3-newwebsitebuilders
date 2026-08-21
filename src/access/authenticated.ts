import type { PayloadRequest } from 'payload'

/**
 * A signed-in person, not a machine.
 *
 * This deliberately checks the collection rather than `Boolean(user)`. Once a
 * second auth-enabled collection exists (apiClients), "is there a user" stops
 * meaning "is this an administrator" — and every rule in this project was
 * written when those were the same thing. Left as `Boolean(user)`, an API key
 * inherits admin rights everywhere this is used: reverting it was measured to
 * let a key read every admin's email address, delete published articles, create
 * itself an admin account, and issue further API keys.
 *
 * The return type is pinned to `boolean` rather than payload's `Access`, which
 * also permits a `Where` filter. Users.access.admin accepts only a boolean, so
 * typing this as `Access` breaks that call site.
 *
 * TypeScript cannot catch a rule that should have been changed and was not:
 * `AccessArgs<T>` parametrises `data`, not `req.user`, so `user` stays the union
 * of every auth collection regardless of annotation. The guarantee here is
 * behavioural, and lives in tests/e2e/api-client-access.spec.ts.
 */
export const authenticated = ({ req: { user } }: { req: PayloadRequest }): boolean => {
  return user?.collection === 'users'
}
