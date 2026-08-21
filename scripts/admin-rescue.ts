/**
 * Recover admin access when nobody can log in.
 *
 * There is no email adapter in this project, so Payload falls back to
 * `consoleEmailAdapter`, which logs only `To` and `Subject` — never the body,
 * never the reset link. A "forgot password" therefore cannot be completed by
 * anyone, and the reset token lives only in `users.reset_password_token`. So
 * the sole route back in is to set the password directly through the local API,
 * which hashes and re-salts properly. Writing a hash into Postgres by hand does
 * not work: the scheme is Payload's.
 *
 * Read-only by default — run it with no NEW_PASSWORD to just list the accounts:
 *
 *   DATABASE_URI='<railway public url>' NODE_ENV=production \
 *     pnpm payload run ./scripts/admin-rescue.ts
 *
 * Then again with the password to actually reset one:
 *
 *   DATABASE_URI='<railway public url>' NODE_ENV=production \
 *     ADMIN_EMAIL='...' NEW_PASSWORD='...' \
 *     pnpm payload run ./scripts/admin-rescue.ts
 *
 * Pass the credentials on the command line, never in a file — nothing here is
 * committed with a secret in it.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const uri = process.env.DATABASE_URI ?? ''
const email = process.env.ADMIN_EMAIL
const newPassword = process.env.NEW_PASSWORD

/**
 * `postgresAdapter` is configured without `push`, and connect.js only skips
 * `pushDevSchema` when NODE_ENV === 'production'. Against the Railway database
 * that would diff the local config over the live schema and ALTER it. This is
 * the one mistake in this script that could not be undone, so it is a hard stop
 * rather than a note in the docstring.
 */
if (process.env.NODE_ENV !== 'production') {
  throw new Error(
    'Refusing to run: NODE_ENV must be "production" or Payload will push the local ' +
      'schema over the live database. Re-run with NODE_ENV=production.',
  )
}

if (!uri) throw new Error('Refusing to run: DATABASE_URI is empty.')

// The pool takes its connection string from process.env at config import time,
// so report the host actually in play rather than trusting the shell.
const host = (() => {
  try {
    return new URL(uri).host
  } catch {
    return '<unparseable>'
  }
})()

if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
  console.warn(`\n⚠  Connected to ${host} — this is a LOCAL database, not production.\n`)
}

const payload = await getPayload({ config })

console.log(`\nDatabase: ${host}\n`)

const users = await payload.find({
  collection: 'users',
  limit: 100,
  pagination: false,
  overrideAccess: true,
})

console.log(`users (${users.totalDocs}):`)
for (const u of users.docs) {
  // lockUntil in the future is the difference between "wrong password" and
  // "locked out", which the login screen reports identically.
  const locked = u.lockUntil && new Date(u.lockUntil) > new Date()
  console.log(
    `  ${u.id}  [${u.role}]  ${u.email}${u.name ? `  (${u.name})` : ''}` +
      `${locked ? `  🔒 LOCKED until ${u.lockUntil}` : ''}`,
  )
}

const apiClients = await payload.find({
  collection: 'apiClients',
  limit: 100,
  pagination: false,
  overrideAccess: true,
})
console.log(`\napiClients (${apiClients.totalDocs}):`)
for (const c of apiClients.docs) console.log(`  ${c.id}  ${c.name ?? '<unnamed>'}`)

if (!newPassword) {
  console.log('\nNEW_PASSWORD not set — nothing written. Re-run with ADMIN_EMAIL + NEW_PASSWORD.')
  process.exit(0)
}

if (!email) throw new Error('NEW_PASSWORD given without ADMIN_EMAIL — refusing to guess.')

const target = users.docs.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!target) {
  throw new Error(`No user with email ${email}. Accounts listed above; pick one of those.`)
}

await payload.update({
  collection: 'users',
  id: target.id,
  data: {
    password: newPassword,
    // A live lock would otherwise keep rejecting the new password until it expires.
    lockUntil: null,
    loginAttempts: 0,
  },
  overrideAccess: true,
})

console.log(`\n✅ Password reset for ${target.email}. Log in at /admin and change it there.`)
process.exit(0)
