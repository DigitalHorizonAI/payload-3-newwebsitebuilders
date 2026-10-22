import type { FieldHook } from 'payload'

export const formatSlug = (val: string): string =>
  // topical_map.slug arrives as a segment/subcategory/keyword path; take the leaf.
  (val.split('/').pop() ?? val)
    .replace(/ /g, '-')
    // was '' — deleting separators is what glued the path segments together
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

export const formatSlugHook =
  (fallback: string): FieldHook =>
  ({ data, operation, originalDoc, value }) => {
    // A saved address stays while the slug is locked, whatever the form or an
    // API call sends; an editor unlocks the slug to change it.
    const locked = (data?.slugLock ?? originalDoc?.slugLock) !== false
    if (operation === 'update' && locked && typeof originalDoc?.slug === 'string' && originalDoc.slug) {
      return originalDoc.slug
    }

    if (typeof value === 'string') {
      return formatSlug(value)
    }

    if (operation === 'create' || !data?.slug) {
      const fallbackData = data?.[fallback] || data?.[fallback]

      if (fallbackData && typeof fallbackData === 'string') {
        return formatSlug(fallbackData)
      }
    }

    return value
  }
