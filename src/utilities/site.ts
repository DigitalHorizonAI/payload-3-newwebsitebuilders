/**
 * Site identity, in one place.
 *
 * The template hardcoded its name across page titles, Open Graph defaults and
 * the SEO plugin, so renaming meant editing every one of them. Anything that
 * needs the site's name or description reads it from here instead.
 */
export const SITE = {
  name: 'NewWebsite.builders',
  description:
    'NewWebsite.builders — custom-coded business websites with a headless CMS, live in three days.',
  /**
   * Path to the default social sharing image, relative to the public origin.
   * Resolves to the marketing site's own og:image, so a shared blog link
   * carries the same art as every other page on newwebsite.builders.
   */
  defaultOGImage: '/assets/logo/mark-tile-512.png',
} as const
