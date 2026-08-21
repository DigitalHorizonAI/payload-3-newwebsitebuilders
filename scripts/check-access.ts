/**
 * Fails if any collection or global lets an API key, an editor or a passing
 * visitor do something it should not.
 *
 *   pnpm check:access
 *
 * Needs no database, no browser and no server — it loads the config and calls
 * the access functions directly, so it runs in about a second and can be run
 * before every push.
 *
 * ## Why this is behavioural rather than a check for "undeclared" rules
 *
 * The obvious version of this script looks for operations we never declared,
 * because Payload fills those with `defaultAccess`, which is `Boolean(user)` —
 * true for an API key. That version cannot work. `addDefaultsToCollectionConfig`
 * (payload/dist/collections/config/defaults.js:57) writes create, delete, read,
 * unlock and update onto every collection before anything can inspect it, so by
 * the time the config is importable, a rule we wrote and a rule Payload invented
 * are indistinguishable by name. Measured: on the unpatched config every one of
 * the fourteen collections reports all five keys present.
 *
 * So the question this asks is not "did someone declare a rule" but "what does
 * the rule actually do when a key calls it", which is the question that matters
 * and the one that keeps being answered wrongly.
 *
 * ## Why a table of expectations does not rot
 *
 * Anything absent from EXPECTED must deny. A new collection — the next plugin
 * someone adds — starts out failing this check and stays failing until a person
 * writes down what it is allowed to do. That is the property worth having: the
 * hole this script exists to catch arrived exactly that way, as four collections
 * that appeared with a plugin and were never given rules.
 *
 * ## Why globals are checked too
 *
 * They were not, until now. This script iterated `resolved.collections` only,
 * while the site's entire copy — and its navigation — lives in globals. A check
 * that cannot fail on the thing being changed is not evidence, and this one had
 * been reporting green while never looking at a single global.
 */
import config from '@payload-config'

/** `true` = unrestricted, `filtered` = a Where narrows it, `false` = refused. */
type Verdict = 'full' | 'filtered' | 'denied'

type Persona = {
  /** How it reads in failure output. */
  label: string
  /** `null` is the anonymous visitor — no session, no key. */
  user: Record<string, unknown> | null
  /** collection -> operation -> what it may do. Absent means it must be denied. */
  expected: Record<string, Partial<Record<string, Verdict>>>
  /** global -> operation -> what it may do. Absent means it must be denied. */
  expectedGlobals?: Record<string, Partial<Record<string, Verdict>>>
}

/**
 * Payload's own bookkeeping collections. Skipped because their rules ship with
 * Payload and we cannot change them, so failing on one would be noise nobody can
 * act on.
 */
const INTERNAL = /^payload-/

const PERSONAS: Persona[] = [
  {
    label: 'API key (apiClients)',
    user: { collection: 'apiClients', id: 'probe-key' },
    expected: {
      // The blog is the whole point of the key — see src/access/contentWriter.ts.
      posts: { create: 'full', read: 'full', update: 'full', delete: 'full' },
      media: { create: 'full', read: 'full', update: 'full', delete: 'full' },
      categories: { create: 'full', read: 'full', update: 'full', delete: 'full' },
      // Published-only, via a Where. A key has no business reading drafts.
      pages: { read: 'filtered' },
      // Public reads: these render on the site for anonymous visitors too.
      redirects: { read: 'full' },
      forms: { read: 'full' },
      search: { read: 'full' },
      // The public form posts here from the browser, unauthenticated.
      'form-submissions': { create: 'full' },
    },
    // A key exists to publish articles. It has no business rewriting the site's
    // navigation.
    expectedGlobals: {
      header: { read: 'full' },
      footer: { read: 'full' },
    },
  },
  {
    label: 'Editor (users, role=editor)',
    user: { collection: 'users', id: 'probe-editor', role: 'editor' },
    expected: {
      // create and delete are admin-only on purpose: a page is site structure,
      // and adding or removing one changes which URLs exist. Editors change the
      // words on a page that already exists. See src/collections/Pages/index.ts.
      pages: { read: 'full', update: 'full' },
      posts: { create: 'full', read: 'full', update: 'full', delete: 'full' },
      media: { create: 'full', read: 'full', update: 'full', delete: 'full' },
      categories: { create: 'full', read: 'full', update: 'full', delete: 'full' },
      search: { read: 'full' },
      redirects: { read: 'full' },
      // Editors run the site's forms; they are content. Submissions are not —
      // reading them is fine, deleting the record of a lead is not.
      forms: { create: 'full', read: 'full', update: 'full', delete: 'full' },
      'form-submissions': { create: 'full', read: 'full' },
      // Their own account only, hence a Where rather than true. `admin` is the
      // admin panel itself, deliberately open — it is where an editor works.
      users: { read: 'filtered', update: 'filtered', admin: 'full' },
      apiClients: {},
    },
    // The navigation is not copy: it decides which URLs a visitor can reach,
    // which is the same site-structure argument that already makes Pages create
    // and delete admin-only. An editor reads it and leaves it alone.
    expectedGlobals: {
      header: { read: 'full' },
      footer: { read: 'full' },
    },
  },
  {
    /**
     * The visitor, and the site's own server-side fetch, which carries no
     * credentials. Never checked before this, on any of the CMSs — the personas
     * were an API key and an editor, both of which are logged in.
     *
     * It is the persona that decides whether the site's content is on the
     * internet or behind a login, and whether a stranger can rewrite it.
     */
    label: 'Anonymous (no session)',
    user: null,
    expected: {
      // Published-only, hence a Where rather than true.
      pages: { read: 'filtered' },
      posts: { read: 'filtered' },
      media: { read: 'full' },
      categories: { read: 'full' },
      search: { read: 'full' },
      redirects: { read: 'full' },
      forms: { read: 'full' },
      // A visitor submitting the contact form is the form working. Reading
      // other people's submissions is not.
      'form-submissions': { create: 'full' },
    },
    // The front-end fetches these over HTTP with no credentials, so read must
    // reach them. Header and Footer ship with `read: () => true` — no drafts to
    // protect, and the nav has to render on the first paint of every page.
    expectedGlobals: {
      header: { read: 'full' },
      footer: { read: 'full' },
    },
  },
]

/** Every operation a collection can be asked to authorise. */
const operationsFor = (auth: boolean): string[] =>
  auth ? ['create', 'read', 'update', 'delete', 'unlock', 'admin'] : ['create', 'read', 'update', 'delete']

const classify = (result: unknown): Verdict => {
  if (result === true) return 'full'
  if (result === false || result === undefined || result === null) return 'denied'
  return 'filtered'
}

const resolved = await config
const failures: string[] = []
let checked = 0

for (const persona of PERSONAS) {
  for (const collection of resolved.collections ?? []) {
    if (INTERNAL.test(collection.slug)) continue

    const access = (collection.access ?? {}) as Record<string, unknown>

    for (const operation of operationsFor(Boolean(collection.auth))) {
      const rule = access[operation]
      if (typeof rule !== 'function') continue

      const req = { user: persona.user, payload: resolved, context: {} }
      const want = persona.expected[collection.slug]?.[operation] ?? 'denied'
      checked++

      let actual: Verdict
      try {
        actual = classify(await (rule as (a: unknown) => unknown)({ req }))
      } catch (error) {
        /**
         * Deliberately NOT treated as a denial.
         *
         * A throw most likely means this script called the rule with a `req`
         * shape it did not expect, so the answer is unknown — and "unknown"
         * recorded as "denied" is the one failure mode that would make this
         * whole script worthless: every rule it could not evaluate would read
         * as secure. Report it and fail instead, so an unevaluatable rule is
         * loud rather than reassuring.
         */
        failures.push(
          `${persona.label.padEnd(28)} ${collection.slug}.${operation.padEnd(8)} ` +
            `could not be evaluated: ${error instanceof Error ? error.message : String(error)}`,
        )
        continue
      }

      if (actual !== want) {
        failures.push(
          `${persona.label.padEnd(28)} ${collection.slug}.${operation.padEnd(8)} ` +
            `expected ${want}, got ${actual}`,
        )
      }
    }
  }

  /**
   * Globals, which this script did not look at at all until now — though the
   * site's whole copy and its navigation live in them.
   */
  for (const global of resolved.globals ?? []) {
    const access = (global.access ?? {}) as Record<string, unknown>

    for (const operation of ['read', 'readVersions', 'readDrafts', 'update']) {
      const rule = access[operation]
      if (typeof rule !== 'function') continue

      const req = { user: persona.user, payload: resolved, context: {} }
      const want = persona.expectedGlobals?.[global.slug]?.[operation] ?? 'denied'
      checked++

      let actual: Verdict
      try {
        actual = classify(await (rule as (a: unknown) => unknown)({ req }))
      } catch (error) {
        failures.push(
          `${persona.label.padEnd(28)} global ${global.slug}.${operation.padEnd(12)} ` +
            `could not be evaluated: ${error instanceof Error ? error.message : String(error)}`,
        )
        continue
      }

      if (actual !== want) {
        failures.push(
          `${persona.label.padEnd(28)} global ${global.slug}.${operation.padEnd(12)} ` +
            `expected ${want}, got ${actual}`,
        )
      }
    }
  }
}

console.log(
  `Checked ${checked} access rules across ${PERSONAS.length} personas ` +
    `(${resolved.collections?.length ?? 0} collections, ${resolved.globals?.length ?? 0} globals).\n`,
)

if (failures.length) {
  console.error(`${failures.length} rule(s) grant more than intended, or could not be checked:\n`)
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('')
  process.exit(1)
}

console.log('No collection or global grants an API key, an editor or a visitor more than intended.')
