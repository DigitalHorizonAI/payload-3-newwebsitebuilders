import Link from 'next/link'
import React from 'react'

import { Logo } from '@/components/Logo/Logo'
import {
  BUSINESS_DETAILS,
  FOOTER_BLURB,
  FOOTER_COMPANY,
  FOOTER_EMAIL,
  FOOTER_SHOP,
  type NavLink,
} from '@/site'

/**
 * The main site's footer, ported from the marketing site's layout. Like
 * the header, it is code-owned (src/site.ts) and deliberately NOT read from
 * the Payload `footer` global — editing navItems in the CMS has no effect.
 */

const FooterLink: React.FC<{ link: NavLink }> = ({ link }) => {
  const className = 'text-sm text-muted-foreground hover:text-foreground transition-colors'
  return link.href.startsWith('/') ? (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className={className}>
      {link.label}
    </a>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block mb-5" aria-label="NewWebsite.builders home">
              <Logo className="text-xl" />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{FOOTER_BLURB}</p>
          </div>

          <div>
            <h4 className="nav-link text-foreground mb-4">Shop</h4>
            <ul className="space-y-3">
              {FOOTER_SHOP.map((link) => (
                <li key={link.href}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="nav-link text-foreground mb-4">Company</h4>
            <ul className="space-y-3">
              {FOOTER_COMPANY.map((link) => (
                <li key={link.href}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="nav-link text-foreground mb-4">Get in Touch</h4>
            <ul className="space-y-3">
              <li>
                <span className="text-xs tracking-[0.1em] uppercase text-muted-foreground/70">
                  Email
                </span>
                <br />
                <a
                  href={`mailto:${FOOTER_EMAIL}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {FOOTER_EMAIL}
                </a>
              </li>
            </ul>

            <h4 className="nav-link text-foreground mt-8 mb-4">Business Details</h4>
            <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
              {BUSINESS_DETAILS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground tracking-wide">
            © {new Date().getFullYear()} NewWebsite.builders. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground tracking-wide">
            Formulated in Europe · Third-party tested
          </p>
        </div>
      </div>
    </footer>
  )
}
