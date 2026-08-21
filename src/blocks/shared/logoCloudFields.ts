import type { Field } from 'payload'

/**
 * Shared editor fields for logo-cloud block variants.
 *
 * Future layouts can reuse the same Payload content model while presenting the
 * logos differently on the frontend.
 */
export const logoCloudFields: Field[] = [
  {
    name: 'heading',
    type: 'text',
    required: true,
  },
  {
    name: 'logos',
    type: 'array',
    required: true,
    minRows: 2,
    maxRows: 12,
    admin: {
      initCollapsed: true,
    },
    fields: [
      {
        name: 'logo',
        type: 'upload',
        relationTo: 'media',
        required: true,
      },
      {
        name: 'name',
        type: 'text',
        required: true,
      },
      {
        name: 'href',
        type: 'text',
      },
    ],
  },
]
