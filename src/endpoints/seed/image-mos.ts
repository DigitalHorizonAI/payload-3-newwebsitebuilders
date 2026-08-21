import type { Media } from '@/payload-types'

// Screenshots come from the My Own Suite project.
// Source: https://github.com/rpuls/my-own-suite/tree/main/site/src/assets/screenshots
const credit = (label: string, url: string) => ({
  root: {
    type: 'root' as const,
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: `${label} — screenshot from `,
            version: 1,
          },
          {
            type: 'link',
            children: [
              {
                type: 'text',
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'My Own Suite',
                version: 1,
              },
            ],
            direction: 'ltr',
            fields: {
              linkType: 'custom',
              newTab: true,
              url,
            },
            format: '',
            indent: 0,
            version: 3,
          },
          {
            type: 'text',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: '.',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        version: 1,
      },
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
  },
})

/** Hero / meta image for the My Own Suite post. */
export const mosInstallImage: Omit<Media, 'createdAt' | 'id' | 'updatedAt'> = {
  alt: 'An app detail view in My Own Suite showing what the app replaces, its privacy grade, and a single Install button',
  caption: credit(
    'Every app says what it replaces, and installs in one click',
    'https://myownsuite.org/docs/apps/',
  ),
}

export const mosCatalogImage: Omit<Media, 'createdAt' | 'id' | 'updatedAt'> = {
  alt: 'The My Own Suite app catalog, listing self-hosted apps for photos, calendars, files, PDFs and passwords',
  caption: credit('Pick apps from the browser, no terminal required', 'https://myownsuite.org/'),
}

export const mosPrivacyImage: Omit<Media, 'createdAt' | 'id' | 'updatedAt'> = {
  alt: 'A My Own Suite privacy posture card grading an app on telemetry, external services, accounts, data processing and policies',
  caption: credit(
    'Every catalog app is graded A to D, with the evidence published',
    'https://myownsuite.org/docs/privacy/how-we-assess/',
  ),
}
