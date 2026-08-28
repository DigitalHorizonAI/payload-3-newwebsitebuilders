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
