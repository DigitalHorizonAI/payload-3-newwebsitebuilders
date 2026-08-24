'use client'

import { Menu, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { MOBILE_LINKS, NAV, NAV_CTA, type NavLink } from '@/site'

/**
 * The main site's floating pill nav, ported from its blog pages' header
 * (.nav-shell / .nav-pill): brand mark and mixed-case wordmark on the left,
 * pill links in the middle, CTA on the right. Two deliberate differences for
 * the CMS host: a search icon where the site has its language switch and
 * theme toggle (this preview is one language, one theme), and the shell is
 * sticky rather than fixed so it never overlaps the admin bar.
 *
 * Blog-internal destinations stay client-side <Link>s; the main-site ones
 * are another origin and have to be full loads.
 */

const NavAnchor: React.FC<{
  link: NavLink
  className: string
  onClick?: () => void
}> = ({ link, className, onClick }) =>
  link.href.startsWith('/') ? (
    <Link href={link.href} className={className} onClick={onClick}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className={className} onClick={onClick}>
      {link.label}
    </a>
  )

export const HeaderClient: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const navLinkClass = (link: NavLink) =>
    `nav-pill-link ${link.href.startsWith('/') && pathname.startsWith(link.href) ? 'is-on' : ''}`

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="nav-pill">
        <a
          href="https://newwebsite.builders"
          className="flex flex-none items-center gap-2.5 text-foreground no-underline"
          aria-label="NewWebsite.builders, back to the home page"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static 18px mark, no optimization needed */}
          <img
            src="/nwb-mark-tight.png"
            alt=""
            aria-hidden="true"
            width={184}
            height={100}
            style={{ height: 18, width: 'auto' }}
          />
          <span className="brand-text">
            <span className="font-medium">NewWebsite</span>
            <span className="font-light opacity-70 max-sm:hidden">.builders</span>
          </span>
        </a>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex list-none items-center gap-0.5">
            {NAV.map((link) => (
              <li key={link.href}>
                <NavAnchor link={link} className={navLinkClass(link)} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1.5">
          <Link href="/search" className="nav-icon-btn" aria-label="Search articles">
            <Search className="h-4 w-4" strokeWidth={1.7} />
          </Link>
          <a href={NAV_CTA.href} className="nav-cta max-sm:hidden">
            {NAV_CTA.label}
          </a>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="nav-icon-btn lg:hidden"
            aria-label={mobileOpen ? 'Close the menu' : 'Open the menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="nav-pill mt-2 !block !rounded-3xl py-4 lg:hidden">
          <nav className="flex flex-col gap-1" aria-label="Primary, mobile">
            {MOBILE_LINKS.map((link) => (
              <NavAnchor
                key={link.href}
                link={link}
                className="nav-pill-link !py-2.5"
                onClick={() => setMobileOpen(false)}
              />
            ))}
            <a href={NAV_CTA.href} className="nav-cta mt-2 self-start">
              {NAV_CTA.label}
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
