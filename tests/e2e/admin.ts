import type { APIRequestContext } from '@playwright/test'

import { expect } from '@playwright/test'

/**
 * The one administrator the e2e suite bootstraps itself with.
 *
 * `first-register` is open only while the users table is empty, and creating a
 * user any other way now requires an admin — so the first spec to run claims it
 * and every later spec logs in. Each spec owning its own bootstrap worked only
 * while exactly one of them created users; the second one would have fallen
 * back to an unauthenticated POST /api/users and got a 403 it did not expect.
 *
 * Specs run serially (`fullyParallel: false`) against a database the web-server
 * harness drops and recreates per run, so whichever spec runs first genuinely
 * finds an empty table.
 */
export const ADMIN = {
  email: 'api-access-admin@example.com',
  password: 'Test1234!',
  name: 'Access Admin',
}

/** Returns an Authorization header value for {@link ADMIN}, creating it if needed. */
export async function adminAuthHeader(request: APIRequestContext): Promise<string> {
  await request.post('/api/users/first-register', { data: ADMIN })

  const login = await request.post('/api/users/login', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(login.ok(), 'admin login').toBe(true)

  return `JWT ${(await login.json()).token}`
}
