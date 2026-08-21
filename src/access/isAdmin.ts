import type { PayloadRequest } from 'payload'

/**
 * An administrator: a signed-in person who may also manage accounts and keys.
 *
 * `authenticated` answers "is this a person rather than a machine", which is the
 * right question for content. It is the wrong question for the users and
 * apiClients collections, where every account holding it meant every account
 * could delete published content, delete *other accounts*, and mint an API key
 * that publishes articles. This narrows those two collections and nothing else —
 * an editor still edits every word of the site.
 *
 * The collection check is load-bearing for the same reason it is in
 * `authenticated`: apiClients is a second auth-enabled collection, so
 * `Boolean(user)` does not mean "administrator". A key has no `role` at all, so
 * the role comparison alone would already reject it — but that is an accident of
 * the current schema, not a guarantee, and the check costs nothing.
 *
 * The return type is pinned to `boolean` rather than payload's `Access` for the
 * same reason as `authenticated`: Users.access.admin accepts only a boolean.
 *
 * TypeScript cannot catch a rule that should have used this and did not —
 * `AccessArgs<T>` parametrises `data`, not `req.user`. The guarantee is
 * behavioural and lives in tests/e2e/user-roles.spec.ts.
 */
export const isAdmin = ({ req: { user } }: { req: PayloadRequest }): boolean => {
  return user?.collection === 'users' && user.role === 'admin'
}
