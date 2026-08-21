import type { Block } from 'payload'

import { logoCloudFields } from '@/blocks/shared/logoCloudFields'

export const LogoCloudGrid: Block = {
  slug: 'logoCloudGrid',
  interfaceName: 'LogoCloudGridBlock',
  fields: [...logoCloudFields],
  labels: {
    plural: 'Logo Cloud Grid Blocks',
    singular: 'Logo Cloud Grid',
  },
}
