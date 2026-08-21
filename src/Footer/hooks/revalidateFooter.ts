import type { GlobalAfterChangeHook } from 'payload'

import { revalidateTag } from 'next/cache'

export const revalidateFooter: GlobalAfterChangeHook = ({ context, doc, req: { payload } }) => {
  // See revalidatePost: outside a request there is no Next store to revalidate.
  if (context?.disableRevalidate) return doc

  payload.logger.info(`Revalidating footer`)

  revalidateTag('global_footer', 'max')

  return doc
}
