import type { Access } from 'payload'

/**
 * Who may read every article, including unpublished ones.
 *
 * Posts needs this rather than `authenticatedOrPublished` because an api client
 * manages the blog rather than only pushing finished articles into it. A tool
 * that cannot list its own drafts cannot show them, edit them or publish them
 * later — it would only be able to reach a draft by an id it had stored itself.
 *
 * Deliberately NOT applied to Pages. That collection shares
 * `authenticatedOrPublished` with this one, and widening that would have handed
 * the same key every unpublished marketing page. A key is scoped to the blog,
 * so the two collections need separate rules.
 *
 * Anonymous readers still see published articles only — the returned `Where`
 * is what the public site and the articles API run on.
 */
export const contentReader: Access = ({ req: { user } }) => {
  if (user?.collection === 'users' || user?.collection === 'apiClients') {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
