import Link from 'next/link'
import React from 'react'

import {
  FOOT_ASK,
  FOOTER_BRANDLINE,
  FOOTER_EMAIL,
  FOOTER_LEGAL,
  FOOTER_LEGAL_LINKS,
  FOOTER_NOTE,
  FOOTER_OFFER,
  FOOTER_OFFER_HEADING,
  FOOTER_SITE,
  FOOTER_SITE_HEADING,
  SITE,
  type NavLink,
} from '@/site'

/**
 * The main site's footer, ported from its blog pages' <footer class="foot">:
 * one tinted band with rounded top corners, the ask block, brand + two link
 * columns, and the legal row. Like the header, it is code-owned (src/site.ts)
 * and deliberately NOT read from the Payload `footer` global.
 */

const FooterLink: React.FC<{ link: NavLink }> = ({ link }) =>
  link.href.startsWith('/') ? (
    <Link href={link.href} className="grow-link">
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className="grow-link">
      {link.label}
    </a>
  )

const FooterCol: React.FC<{ heading: string; links: NavLink[] }> = ({ heading, links }) => (
  <nav aria-label={heading}>
    <h2 className="label foot-muted">{heading}</h2>
    <ul className="foot-list">
      {links.map((link) => (
        <li key={link.href}>
          <FooterLink link={link} />
        </li>
      ))}
    </ul>
  </nav>
)

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-wash" aria-hidden="true" />
      <div className="container foot-inner">
        <div className="foot-ask">
          <div>
            <h2>{FOOT_ASK.heading}</h2>
            <p className="foot-muted">{FOOT_ASK.body}</p>
          </div>
          <div className="foot-ask-cta">
            <a href={FOOT_ASK.cta.href} className="foot-ask-link">
              <span className="foot-arrow" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 7h10v10" />
                  <path d="M7 17 17 7" />
                </svg>
              </span>
              <span className="grow-link label">{FOOT_ASK.cta.label}</span>
            </a>
          </div>
        </div>

        <div className="foot-rule" aria-hidden="true" />

        <div className="foot-cols">
          <div>
            <a
              href={SITE}
              className="foot-brand-link"
              aria-label="NewWebsite.builders, back to the home page"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static 22px mark, no optimization needed */}
              <img
                src="/nwb-mark-tight.png"
                alt=""
                aria-hidden="true"
                width={184}
                height={100}
                style={{ height: 22, width: 'auto' }}
              />
              <span className="brand-text">
                <span className="font-medium">NewWebsite</span>
                <span className="font-light opacity-70">.builders</span>
              </span>
            </a>
            <p className="foot-brandline">{FOOTER_BRANDLINE}</p>
            <p className="foot-email">
              <a href={`mailto:${FOOTER_EMAIL}`} className="grow-link">
                {FOOTER_EMAIL}
              </a>
            </p>
            <p className="foot-brandline foot-muted">{FOOTER_NOTE}</p>
          </div>
          <FooterCol heading={FOOTER_SITE_HEADING} links={FOOTER_SITE} />
          <FooterCol heading={FOOTER_OFFER_HEADING} links={FOOTER_OFFER} />
        </div>

        <div className="foot-rule" aria-hidden="true" />

        <div className="foot-bottom">
          <p className="foot-muted">
            &copy; {new Date().getFullYear()} {FOOTER_LEGAL}
          </p>
          <ul className="foot-legal">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="grow-link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
