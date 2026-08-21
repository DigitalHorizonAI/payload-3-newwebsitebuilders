import { Field } from 'payload'

export const searchFields: Field[] = [
  {
    name: 'slug',
    type: 'text',
    index: true,
    admin: {
      readOnly: true,
    },
  },
  {
    name: 'meta',
    label: 'Meta',
    type: 'group',
    index: true,
    admin: {
      readOnly: true,
    },
    fields: [
      {
        type: 'text',
        name: 'title',
        label: 'Title',
      },
      {
        type: 'text',
        name: 'description',
        label: 'Description',
      },
      {
        name: 'image',
        label: 'Image',
        type: 'upload',
        relationTo: 'media',
      },
    ],
  },
  {
    label: 'Categories',
    name: 'categories',
    type: 'array',
    admin: {
      readOnly: true,
    },
    // Deliberately no field named `id`. On an array field, `id` is Payload's
    // own per-row primary key, and search_categories.id is unique across the
    // whole table rather than per parent. Declaring it here handed that key to
    // application data: the template wrote the category's id into it, so the
    // second post to use a category collided with the first — and because the
    // search sync runs in the post's afterChange hook, the failure rolled the
    // entire save back. Publishing a second article in an existing category
    // failed outright. Leaving it out lets Payload generate the row id, which
    // is what every other array in this schema already does.
    fields: [
      {
        name: 'relationTo',
        type: 'text',
      },
      {
        name: 'title',
        type: 'text',
      },
    ],
  },
]
