import { expect, test } from '@playwright/test'

import { beforeSyncWithSearch } from '../../src/search/beforeSync'

/*
 * On an array field, `id` is Payload's own per-row primary key, and
 * search_categories.id is unique across the whole table rather than per
 * parent. The template declared a field named `id` inside the search
 * collection's `categories` array and wrote the category's id into it, so the
 * second post to use a category collided with the first. The sync runs in the
 * post's afterChange hook, so the failure rolled the whole save back:
 * publishing a second article in an existing category failed outright.
 *
 * The fix is that we no longer set a row id at all. These tests hold that
 * line — if anyone reintroduces one, the first test fails.
 */
const syncFor = (postID: number, categories: { id: number; title: string }[]) =>
  beforeSyncWithSearch({
    originalDoc: {
      id: postID,
      slug: `post-${postID}`,
      title: `Post ${postID}`,
      categories,
      meta: {},
    },
    searchDoc: { doc: { relationTo: 'posts', value: postID } },
    // Not reached: this path only runs for categories that are already objects.
    payload: {} as never,
  } as never)

const voiceAgents = { id: 7, title: 'Voice agents' }
const automation = { id: 8, title: 'Automation' }

test('the search row id is left for Payload to generate', async () => {
  const doc = await syncFor(101, [voiceAgents])

  // Anything truthy here becomes the array row's primary key and will collide
  // with the next post that uses the same category.
  expect(doc.categories?.[0]).not.toHaveProperty('id')
})

test('two posts sharing a category produce no colliding row key', async () => {
  const first = await syncFor(101, [voiceAgents])
  const second = await syncFor(102, [voiceAgents])

  expect(first.categories?.[0]?.id).toBeUndefined()
  expect(second.categories?.[0]?.id).toBeUndefined()
})

test('category titles still reach the search index', async () => {
  const doc = await syncFor(104, [voiceAgents, automation])

  expect(doc.categories?.map((c) => c.title)).toEqual(['Voice agents', 'Automation'])
  expect(doc.categories?.every((c) => c.relationTo === 'categories')).toBe(true)
})
