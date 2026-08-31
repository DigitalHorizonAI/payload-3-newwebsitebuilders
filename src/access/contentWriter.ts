import type { Access } from 'payload'

/**
 * An administrator, or a machine identity allowed to publish articles.
 *
 * Wired to create and update on posts, media and categories, because the tool
 * replaces editing the blog by hand rather than only pushing finished articles
 * into it.
 *
 * Delete is NOT uniform, so read the collection rather than assuming. Posts use
 * `authenticated` for delete — removing a published article is an admin job, and
 * the integration never does it. Media and categories still use this function for
 * delete: replacing a cover image or tidying an unused category is part of the
 * same write the tool already performs, and neither is content a visitor lands on.
 * `tests/e2e/api-client-access.spec.ts` asserts both halves.
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
