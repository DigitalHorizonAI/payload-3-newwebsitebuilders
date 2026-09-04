/**
 * generateStaticParams must never hand Next a param without a slug.
 *
 *   node scripts/check-static-params.mjs                  # against production
 *   CMS_URL=http://localhost:3000 node scripts/...        # against a local CMS
 *
 * On 4 Sep the production build died with:
 *
 *   Error: A required parameter (slug) was not provided as a string received
 *   undefined in generateStaticParams for /blog/[slug]
 *
 * The cause was one article: post 25, published, with a German slug and no
 * English one. src/app/(frontend)/blog/[slug]/page.tsx mapped every post
 * straight to { slug } with no filter, so a locale-only article put
 * { slug: undefined } in the list and Next refused to build. The CMS had been
 * unbuildable for eleven hours before anyone deployed and found out.
 *
 * The pipeline publishes per-locale articles by design - a locale answers with
 * its own content or with nothing - so this recurs on its own. Two assertions:
 * that the guard is still in the source, and that the live data it guards
 * against is handled rather than merely absent.
 */
import assert from 'assert'
import fs from 'fs'
import path from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ROUTE = path.join(ROOT, 'src', 'app', '(frontend)', 'blog', '[slug]', 'page.tsx')
const CMS = (process.env.CMS_URL || 'https://payload-cms-production-27d8.up.railway.app').replace(
  /\/$/,
  '',
)

let failures = 0
const check = (name, fn) => {
  try {
    fn()
    console.log(`  ok    ${name}`)
  } catch (e) {
    failures++
    console.log(`  FAIL  ${name}\n        ${e.message}`)
  }
}

console.log('static params:')

// 1. The guard is in the source. A data check alone would pass the day the
//    data happens to be clean, and say nothing about the code.
const source = fs.readFileSync(ROUTE, 'utf8')
const body = source.slice(source.indexOf('generateStaticParams'), source.indexOf('type Args'))

check('the route filters posts without a slug', () =>
  assert.ok(
    /\.filter\(/.test(body) && /slug/.test(body),
    'generateStaticParams maps posts straight to { slug } - one locale-only article reds the build',
  ),
)

// 2. The live data. Mirrors the route's own query: published only, no
//    elevated access, the same limit. The public REST API with no credentials
//    is the draft:false + overrideAccess:false pair.
const response = await fetch(`${CMS}/api/posts?limit=1000&depth=0&locale=en`)
assert.ok(response.ok, `the CMS answered ${response.status}`)
const { docs, totalDocs } = await response.json()

// Built the way the route builds it, not the way it ought to - otherwise this
// applies its own fix to the data and passes against code that would still
// red the deploy. If the guard is missing from the source, the bad params are
// reproduced here exactly as Next would receive them.
const routeFilters = /\.filter\(/.test(body)
const kept = routeFilters ? docs.filter(({ slug }) => typeof slug === 'string' && slug) : docs
const params = kept.map(({ slug }) => ({ slug }))
const skipped = docs.length - kept.length

console.log(
  `  ${totalDocs} published, ${params.length} params, ${skipped} skipped` +
    (routeFilters ? '' : ' (route has no filter - params built unfiltered)'),
)
for (const doc of docs.filter(({ slug }) => typeof slug !== 'string' || !slug)) {
  console.log(`        id=${doc.id} has no English slug`)
}

check('every param Next receives carries a non-empty string slug', () =>
  assert.ok(
    params.every(({ slug }) => typeof slug === 'string' && slug.length > 0),
    `${params.filter(({ slug }) => !slug).length} param(s) have no slug - this is the exact ` +
      'input Next refuses: "A required parameter (slug) was not provided as a string"',
  ),
)

// The route asks for 1000. Past that it truncates in silence and the missing
// articles look like they were never published.
check(`fewer than 1000 published posts (${totalDocs})`, () =>
  assert.ok(totalDocs < 1000, `${totalDocs} posts - the route's limit of 1000 now truncates`),
)

if (failures) {
  console.log(`\n${failures} failed.`)
  process.exit(1)
}
console.log('\nOK.')
