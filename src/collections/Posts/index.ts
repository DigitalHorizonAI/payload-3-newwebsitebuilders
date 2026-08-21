import type { CollectionConfig } from 'payload'

import {
  BlockquoteFeature,
  BlocksFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  OrderedListFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { contentReader } from '../../access/contentReader'
import { contentWriter } from '../../access/contentWriter'
import { Banner } from '../../blocks/Banner/config'
import { Code } from '../../blocks/Code/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { ingestMarkdownContent } from './hooks/ingestMarkdownContent'
import { populateAuthors } from './hooks/populateAuthors'
import { revalidateDelete, revalidatePost } from './hooks/revalidatePost'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { slugField } from '@/fields/slug'
import { getServerSideURL } from '@/utilities/getURL'

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  access: {
    // contentWriter/contentReader, not authenticated: this is the collection an
    // API key manages. The tool is a replacement for editing in the admin
    // panel, so it needs the full lifecycle — including removing an article and
    // seeing its own drafts, neither of which a publish-only key could do.
    create: contentWriter,
    delete: contentWriter,
    read: contentReader,
    update: contentWriter,
  },
  // This config controls what's populated by default when a post is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'posts'>
  defaultPopulate: {
    title: true,
    slug: true,
    categories: true,
    meta: {
      image: true,
      description: true,
    },
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    livePreview: {
      url: ({ data }) => {
        const path = generatePreviewPath({
          slug: typeof data?.slug === 'string' ? data.slug : '',
          collection: 'posts',
        })

        return `${getServerSideURL()}${path}`
      },
    },
    preview: (data) => {
      const path = generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'posts',
      })

      return `${getServerSideURL()}${path}`
    },
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'content',
              type: 'richText',
              localized: true,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                    // `rootFeatures` is the config-level editor (defaultLexical:
                    // paragraph, bold, italic, underline, link), NOT Payload's
                    // built-in defaults — so lists and quotes are absent unless
                    // added here. serialize.tsx already renders list, listitem
                    // and quote nodes; only the editor could not produce them.
                    // Without these an SEO article's bullets convert to flat
                    // paragraphs and still return 201. Guarded by
                    // `pnpm check:markdown-ingest`.
                    UnorderedListFeature(),
                    OrderedListFeature(),
                    BlockquoteFeature(),
                    // The pre-CMS articles carry inline <code> and comparison
                    // tables; without these two features the import flattens
                    // both to plain text — measured on the first import, where
                    // all 6 tables and every inline code span vanished while
                    // the 97% text check passed. Blocks in richText live in
                    // the content jsonb, so neither feature touches the
                    // database schema.
                    InlineCodeFeature(),
                    EXPERIMENTAL_TableFeature(),
                    BlocksFeature({ blocks: [Banner, Code, MediaBlock] }),
                    FixedToolbarFeature(),
                    InlineToolbarFeature(),
                    HorizontalRuleFeature(),
                  ]
                },
              }),
              // Converts a Markdown string from the SEO tool into Lexical.
              // beforeValidate, not beforeChange: `required` would reject the
              // string first — field validation runs in the beforeChange pass.
              hooks: { beforeValidate: [ingestMarkdownContent] },
              label: false,
              required: true,
            },
            {
              name: 'excerpt',
              type: 'textarea',
              localized: true,
              admin: {
                description:
                  'One or two sentences shown on the blog index card and in the link preview. The website needs this for every article; without it the card has a headline and nothing else.',
              },
            },
            {
              name: 'h1Html',
              type: 'text',
              localized: true,
              label: 'Headline with emphasis',
              admin: {
                description:
                  'Optional. The headline as it appears on the article page, where the website sets one word apart — for example: Why hand-coded sites load <span class="editorial">faster</span> than page builders. Leave empty and the plain title is used instead, so a new article never has to hand-write markup.',
              },
            },
          ],
          label: 'Content',
        },
        {
          fields: [
            {
              name: 'relatedPosts',
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              filterOptions: ({ id }) => {
                return {
                  id: {
                    not_in: [id],
                  },
                }
              },
              hasMany: true,
              relationTo: 'posts',
            },
            {
              name: 'categories',
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              hasMany: true,
              relationTo: 'categories',
            },
            {
              name: 'legacyPath',
              type: 'text',
              localized: true,
              admin: {
                position: 'sidebar',
                description:
                  'The path this article already has on the public website, without /blog — for example sleep/insomnia/melatonin-guide. Set during the migration so the website keeps serving its existing addresses and its Google rankings. Leave empty on new articles; they use the slug.',
              },
              label: 'Existing website path',
            },
            {
              name: 'byline',
              type: 'text',
              localized: true,
              admin: {
                position: 'sidebar',
                description:
                  'Author name shown on the public website. Set during the migration, where articles arrived with an author name but no matching CMS user. Linking a real author above takes priority over this.',
              },
              label: 'Author byline',
            },
          ],
          label: 'Meta',
        },
        {
          name: 'meta',
          label: 'SEO',
          localized: true,
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            {
              name: 'keywords',
              type: 'text',
              admin: {
                description:
                  'Comma-separated, carried over from the existing articles. The website writes these into a meta keywords tag.',
              },
            },
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            if (siblingData._status === 'published' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'authors',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      hasMany: true,
      relationTo: 'users',
    },
    // This field is only used to populate the user data via the `populateAuthors` hook
    // This is because the `user` collection has access control locked to protect user privacy
    // GraphQL will also not return mutated user data that differs from the underlying schema
    {
      name: 'populatedAuthors',
      type: 'array',
      access: {
        update: () => false,
      },
      admin: {
        disabled: true,
        readOnly: true,
      },
      fields: [
        {
          name: 'id',
          type: 'text',
        },
        {
          name: 'name',
          type: 'text',
        },
      ],
    },
    ...slugField('title', { slugOverrides: { localized: true } }),
  ],
  hooks: {
    afterChange: [revalidatePost],
    afterDelete: [revalidateDelete],
    afterRead: [populateAuthors],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100, // We set this interval for optimal live preview
      },
    },
    maxPerDoc: 50,
  },
}
