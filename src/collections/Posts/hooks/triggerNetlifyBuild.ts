import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Post } from '../../../payload-types'

/**
 * Tell Netlify to rebuild the marketing site.
 *
 * The site generates its /blog pages from this CMS at build time, and Netlify
 * only builds on a git push or a build-hook call — so without this, a
 * published article sits in the CMS until someone happens to deploy.
 *
 * Fire-and-forget on purpose: the build is a side effect of publishing, not a
 * condition of it. A Netlify outage must never make an editor's Publish fail,
 * so the POST is not awaited and a failure is logged, loudly, instead of
 * thrown.
 *
 * The hook URL is a secret — anyone holding it can burn build minutes — so it
 * lives in NETLIFY_BUILD_HOOK_URL on the Railway service, never in code.
 * Local dev has no such variable and skips quietly.
 */
const triggerBuild = (payload: { logger: { info: (msg: string) => void; error: (msg: string) => void } }, reason: string) => {
  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL

  if (!hookUrl) {
    payload.logger.info(`Netlify build skipped (${reason}): NETLIFY_BUILD_HOOK_URL is not set`)
    return
  }

  payload.logger.info(`Triggering a Netlify build: ${reason}`)

  void fetch(hookUrl, { method: 'POST' }).then(
    (res) => {
      if (!res.ok) payload.logger.error(`Netlify build hook answered ${res.status} (${reason})`)
    },
    (err) => payload.logger.error(`Netlify build hook unreachable (${reason}): ${String(err)}`),
  )
}

export const triggerNetlifyBuild: CollectionAfterChangeHook<Post> = ({
  context,
  doc,
  req: { payload },
}) => {
  // Same opt-out as revalidatePost: a script or migration writing posts must
  // not fire one build per row.
  if (context?.disableRevalidate) return doc

  // Only a real publish. With autosave on, every keystroke in a published
  // post's editor arrives here as a draft save (_status 'draft'), and firing
  // on those would start a build per editing session. The trade-off: an
  // UNPUBLISH also arrives as a draft and does not trigger — the article
  // leaves the live site on the next publish or deploy, not instantly.
  if (doc._status === 'published') {
    triggerBuild(payload, `post "${doc.slug}" published`)
  }

  return doc
}

export const triggerNetlifyBuildOnDelete: CollectionAfterDeleteHook<Post> = ({
  context,
  doc,
  req: { payload },
}) => {
  if (context?.disableRevalidate) return doc

  triggerBuild(payload, `post "${doc?.slug}" deleted`)

  return doc
}
