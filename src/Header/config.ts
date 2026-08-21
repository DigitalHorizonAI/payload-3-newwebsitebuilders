import type { GlobalConfig } from 'payload'

import { isAdmin } from '@/access/isAdmin'
import { link } from '@/fields/link'
import { revalidateHeader } from './hooks/revalidateHeader'

export const Header: GlobalConfig = {
  slug: 'header',
  access: {
    read: () => true,
    // `authenticated` kept API keys out, which was the point when it was
    // written, but it still let any editor rewrite the site's navigation: which
    // URLs every page links to, across the whole site. That is site structure,
    // not copy — the same argument that already makes Pages create and delete
    // admin-only (src/collections/Pages/index.ts). Nobody's access changes
    // today: every account on this CMS is an admin.
    update: isAdmin,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
  },
}
