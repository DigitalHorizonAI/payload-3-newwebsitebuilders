import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Payload } from 'payload'

import type { Post } from '../../../payload-types'

/**
 * Tell Netlify to rebuild the marketing site, at most once per wait.
 *
 * The site generates its /blog pages from this CMS at build time, so a
 * published change is invisible until Netlify builds. Every build is a
 * whole-site deploy that costs credits, and the publishing app saves an
 * article and then edits older ones to link to it — calling the hook per save
 * cost one deploy per edit. So the first save of a published post (or a
 * delete) starts a wait, saves during it ride along, and one call goes out
 * when it ends. The wait runs from the first save and is not extended, so a
 * change is never held longer than one wait.
 *
 * Never awaited by a save: a Netlify outage must not make Publish fail, so a
 * failure is logged, loudly, instead of thrown.
 *
 * The hook URL is a secret — anyone holding it can start builds — so it lives
 * in NETLIFY_BUILD_HOOK_URL on the Railway service and is never logged.
 *
 * Known limit: the wait lives in this process. With more than one replica,
 * each replica batches its own saves and calls the hook separately.
 * Known limit: a failed call is not retried on its own; the next save starts
 * a new wait.
 */

const DEFAULT_WAIT_MINUTES = 15

type Deps = {
  env?: Record<string, string | undefined>
  fetchFn?: (url: string, init: { method: string }) => Promise<{ ok: boolean; status: number }>
  setTimer?: (fn: () => Promise<void>, ms: number) => { unref?: () => unknown } | undefined
  now?: () => number
}

type Batch = { request: (reason: string) => void }

// Shared through globalThis, keyed by Payload instance: Next.js can load this
// module once per route bundle, but onInit and every hook get the same Payload.
const batches: WeakMap<object, Batch> = ((globalThis as { __netlifyBuildBatches?: WeakMap<object, Batch> })
  .__netlifyBuildBatches ??= new WeakMap())

const waitMinutes = (raw: string | undefined) => {
  const minutes = Number(raw)
  return raw && Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_WAIT_MINUTES
}

/** Production only (see payload.config.ts onInit). Hooks do nothing until this has run. */
export async function startNetlifyBuildBatch(
  payload: Pick<Payload, 'logger' | 'count'>,
  { env = process.env, fetchFn = fetch, setTimer = setTimeout, now = Date.now }: Deps = {},
): Promise<void> {
  if (batches.has(payload)) return

  const log = payload.logger
  const hookUrl = env.NETLIFY_BUILD_HOOK_URL
  const minutes = waitMinutes(env.NETLIFY_BUILD_BATCH_MINUTES)
  let waiting = false

  const callHook = async () => {
    waiting = false
    log.info('Triggering a Netlify build')
    try {
      const res = await fetchFn(hookUrl!, { method: 'POST' })
      if (!res.ok) log.error(`Netlify build hook answered ${res.status}; the next save starts a new wait`)
    } catch (err) {
      log.error(`Netlify build hook unreachable (${String(err)}); the next save starts a new wait`)
    }
  }

  const batch: Batch = {
    request: (reason) => {
      if (!hookUrl) {
        log.info(`Netlify build skipped (${reason}): NETLIFY_BUILD_HOOK_URL is not set`)
        return
      }
      if (waiting) return
      waiting = true
      log.info(`Netlify build in ${minutes} min (${reason})`)
      setTimer(callHook, minutes * 60_000)?.unref?.()
    },
  }
  batches.set(payload, batch)

  if (!hookUrl) return

  // A restart drops a wait in progress. A published post saved within the
  // last wait may be one that never got its build, so start one.
  try {
    const since = new Date(now() - minutes * 60_000).toISOString()
    const { totalDocs } = await payload.count({
      collection: 'posts',
      where: { and: [{ _status: { equals: 'published' } }, { updatedAt: { greater_than: since } }] },
    })
    if (totalDocs > 0) batch.request('a post changed shortly before this restart')
  } catch (err) {
    log.error(`Netlify build restart check failed: ${String(err)}`)
  }
}

export const triggerNetlifyBuild: CollectionAfterChangeHook<Post> = ({ context, doc, req: { payload } }) => {
  // Same opt-out as revalidatePost: a script or migration writing posts must
  // not start builds.
  if (context?.disableRevalidate) return doc

  // Only a real publish. With autosave on, every keystroke in a published
  // post's editor arrives here as a draft save (_status 'draft'). The
  // trade-off: an UNPUBLISH also arrives as a draft and does not count — the
  // article leaves the live site with the next build, not its own.
  if (doc._status === 'published') batches.get(payload)?.request(`post "${doc.slug}" published`)

  return doc
}

export const triggerNetlifyBuildOnDelete: CollectionAfterDeleteHook<Post> = ({ context, doc, req: { payload } }) => {
  if (context?.disableRevalidate) return doc

  batches.get(payload)?.request(`post "${doc?.slug}" deleted`)

  return doc
}
