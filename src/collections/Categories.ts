import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { contentWriter } from '../access/contentWriter'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    // An article's category is part of writing the article. Left admin-only,
    // an external tool would fail every time it covered a topic that did not
    // have a category yet, and someone would have to add one by hand — which
    // defeats the point of the tool managing the blog at all.
    create: contentWriter,
    delete: contentWriter,
    read: anyone,
    update: contentWriter,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
  ],
}
