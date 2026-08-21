import type { Access } from 'payload'

/**
 * An administrator, or a machine identity allowed to publish articles.
 *
 * Wired to the full lifecycle — create, update *and delete* — on posts, media
 * and categories, because the tool replaces editing the blog by hand rather than
 * only pushing finished articles into it. An earlier version of this comment
 * claimed delete stayed on `authenticated`; it does not, and has not since the
 * key was given the whole blog. `tests/e2e/api-client-access.spec.ts` asserts
 * the delete explicitly, so the behaviour is intended, not drift.
 *
 * What still bounds a leaked key is which collections name this function. It is
 * the blog and nothing else: not pages, not users, not apiClients, not the
 * header and footer globals. Adding a collection here widens what every API key
 * can do, so it is the one decision to make deliberately rather than by
 * convenience.
 */
export const contentWriter: Access = ({ req: { user } }) => {
  return user?.collection === 'users' || user?.collection === 'apiClients'
}
