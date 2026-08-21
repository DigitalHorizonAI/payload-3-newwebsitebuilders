import type { Access } from 'payload'

/**
 * Everything for an administrator, published documents only for everyone else.
 *
 * "Everyone else" now includes API keys, which is why this checks the
 * collection rather than `if (user)`. An api client that satisfied the truthy
 * check would have been able to read every unpublished draft — its own and
 * other people's — via ?draft=true. It can write articles; it has no business
 * reading work in progress.
 */
export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (user?.collection === 'users') {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
