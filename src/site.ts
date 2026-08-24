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
 * The footer, mirroring the main site's footer verbatim (its blog pages'
 * <footer class="foot">): the ask block, two link columns under the brand
 * column, and the legal row.
 */
export const FOOT_ASK = {
  heading: 'Ready when you are',
  body: 'Thirty minutes settles the pages, the words and the look. You leave with a written scope and a fixed price, before a single component is written.',
  cta: { label: 'Schedule a call', href: LINKS.contact.href },
}

export const FOOTER_SITE_HEADING = 'The site'
export const FOOTER_SITE: NavLink[] = [
  LINKS.howWeWork,
  { label: 'The CMS', href: LINKS.headlessCms.href },
  LINKS.seoAndGeo,
  LINKS.theStack,
  LINKS.work,
  LINKS.about,
  LINKS.faq,
  LINKS.contact,
  LINKS.blog,
]

export const FOOTER_OFFER_HEADING = 'The offer'
export const FOOTER_OFFER: NavLink[] = [
  LINKS.pricing,
  { label: 'Landing page', href: `${SITE}/services/landing-page/` },
  { label: 'Multi-page site', href: `${SITE}/services/multi-page-website/` },
  { label: 'Custom build', href: `${SITE}/services/custom-build/` },
]

export const FOOTER_BRANDLINE = 'A product of Digital Horizon Marketing Management FZCO.'
export const FOOTER_EMAIL = 'hello@newwebsite.builders'
export const FOOTER_NOTE = 'Thirty minutes settles the pages, the words and the look.'
export const FOOTER_LEGAL = 'Digital Horizon Marketing Management FZCO'
export const FOOTER_LEGAL_LINKS: NavLink[] = [
  { label: 'Privacy', href: `${SITE}/privacy/` },
  { label: 'Terms', href: `${SITE}/terms/` },
]
