/**
 * The main site's navigation, mirrored so the two bars match.
 *
 * One file of plain data, mirroring newwebsite.builders' own nav. Re-syncing
 * when the marketing site changes is a diff of this file.
 *
 * Links to the main site are ABSOLUTE. This app is not the public blog —
 * newwebsite.builders is a static site on Netlify and builds its /blog pages
 * from this CMS's /api/articles. What renders here is an editor preview on the
 * CMS's own host, where a root-relative "/about" would 404.
 */

export type NavLink = {
  label: string
  href: string
  note?: string
}

/**
 * The public site origin. Not the CMS's own URL: only the public site has the
 * marketing pages these links point at.
 */
export const SITE = 'https://newwebsite.builders'

export const LINKS = {
  howWeWork: { label: 'How we work', href: `${SITE}/how-we-work/` },
  work: { label: 'Work', href: `${SITE}/work/` },
  pricing: { label: 'Pricing', href: `${SITE}/pricing/` },
  theStack: { label: 'The stack', href: `${SITE}/the-stack/` },
  seoAndGeo: { label: 'SEO and GEO', href: `${SITE}/seo-and-geo/` },
  headlessCms: { label: 'Headless CMS', href: `${SITE}/headless-cms/` },
  about: { label: 'About', href: `${SITE}/about/` },
  faq: { label: 'FAQ', href: `${SITE}/faq/` },
  contact: { label: 'Contact', href: `${SITE}/contact/` },

  blog: { label: 'Blog', href: '/blog' },

  /**
   * Blog-only. The main site's bar has no search, so this is the one
   * intentional difference between the two navs.
   */
  search: { label: 'Search articles', href: '/search' },
} satisfies Record<string, NavLink>

/**
 * The pill nav, in the exact order the site's own blog pages render it
 * (blog/index.html .nav-links), plus the CTA on the right.
 */
export const NAV: NavLink[] = [LINKS.howWeWork, LINKS.work, LINKS.pricing, LINKS.blog, LINKS.faq]

export const NAV_CTA: NavLink = { label: 'Schedule a call', href: LINKS.contact.href }

export const MOBILE_LINKS: NavLink[] = [
  LINKS.howWeWork,
  LINKS.work,
  LINKS.pricing,
  LINKS.blog,
  LINKS.faq,
  LINKS.search,
]

/**
 * Footer columns, mirroring the main site's footer.
 */
export const FOOTER_BLURB =
  'Custom-coded business websites with a headless CMS, edge hosting and structured data from the first commit. The code is yours.'

/** What the site sells, in place of the ported site's product catalogue. */
export const FOOTER_SHOP: NavLink[] = [
  { label: 'Landing page', href: `${SITE}/services/landing-page/` },
  { label: 'Multi-page website', href: `${SITE}/services/multi-page-website/` },
  { label: 'Custom build', href: `${SITE}/services/custom-build/` },
]

export const FOOTER_COMPANY: NavLink[] = [
  { label: 'Blog', href: '/blog' },
  LINKS.about,
  LINKS.faq,
  LINKS.contact,
  LINKS.theStack,
  LINKS.seoAndGeo,
  LINKS.headlessCms,
  { label: 'Privacy', href: `${SITE}/privacy/` },
  { label: 'Terms', href: `${SITE}/terms/` },
]

export const FOOTER_EMAIL = 'hello@newwebsite.builders'

/**
 * Only the legal line the site itself publishes. The ported original carried
 * the previous client's registered address and tax number; a postal address for
 * this company has not been published anywhere we can read, so none is invented
 * here.
 */
export const BUSINESS_DETAILS = [
  'NewWebsite.builders is a product of Digital Horizon Marketing Management FZCO',
]
