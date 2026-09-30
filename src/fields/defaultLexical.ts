import { Config } from 'payload'
import {
  BoldFeature,
  ItalicFeature,
  LinkFeature,
  ParagraphFeature,
  lexicalEditor,
  UnderlineFeature,
} from '@payloadcms/richtext-lexical'
import { text } from 'payload/shared'

// A link url must keep its scheme. Editing a link in the admin once turned
// `https://nplink.net/…` into `https.nplink.net/…` before saving (cause not
// found); refuse that shape instead of publishing a broken href.
const LINK_URL = /^(https?:\/\/\S|mailto:|tel:|\/|#)/
// The pre-CMS articles link to each other as bare `<slug>.html`, which the
// site serves next to the current article.
const SIBLING_ARTICLE = /^[\w-]+\.html(#\S*)?$/
// The drawer pre-fills `https://`; pasting a full address after it doubles
// the scheme.
const DOUBLED_SCHEME = /^https?:\/\/https?[:.]/i

export const defaultLexical: Config['editor'] = lexicalEditor({
  features: () => {
    return [
      ParagraphFeature(),
      UnderlineFeature(),
      BoldFeature(),
      ItalicFeature(),
      LinkFeature({
        enabledCollections: ['pages', 'posts'],
        fields: ({ defaultFields }) => {
          const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
            if ('name' in field && field.name === 'url') return false
            return true
          })

          return [
            ...defaultFieldsWithoutUrl,
            {
              name: 'url',
              type: 'text',
              admin: {
                condition: ({ linkType }) => linkType !== 'internal',
              },
              label: ({ t }) => t('fields:enterURL'),
              required: true,
              validate: (value, args) => {
                const url = value?.trim()
                if (url && DOUBLED_SCHEME.test(url)) {
                  return 'This link has https:// twice — clear the field and paste the address again.'
                }
                if (url && !LINK_URL.test(url) && !SIBLING_ARTICLE.test(url)) {
                  return 'This link is missing https:// — paste the full address again.'
                }
                return text(value, args)
              },
            },
          ]
        },
      }),
    ]
  },
})
