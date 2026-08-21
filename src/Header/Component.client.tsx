'use client'

import { Menu, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { Logo } from '@/components/Logo/Logo'
import { ANNOUNCEMENT, MOBILE_LINKS, NAV_LEFT, NAV_RIGHT, type NavLink } from '@/site'

/**
 * The main site's header, ported from the seo-2ahealthylife repo's Layout.tsx: an
 * announcement bar, then a sticky bar with links flanking a centered
 * wordmark. One deliberate difference: where the main site has its cart
 * icon, the blog has a search icon — this site has articles, not a cart.
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
    `nav-link transition-colors hover:text-foreground ${
      pathname === link.href ? 'text-foreground' : 'text-muted-foreground'
    }`

  return (
    <>
      <div className="bg-foreground text-background py-2.5 text-center">
        <p className="text-xs tracking-[0.15em] uppercase font-medium">
          {ANNOUNCEMENT.text}{' '}
          <a href={ANNOUNCEMENT.href} className="underline underline-offset-2">
            {ANNOUNCEMENT.linkLabel}
          </a>
        </p>
      </div>

      <header className="sticky top-0 z-50 border-b border-border bg-background/98 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="container">
          {/* Desktop nav */}
          <div className="hidden lg:grid grid-cols-3 items-center h-20">
            <nav className="flex items-center gap-8">
              {NAV_LEFT.map((link) => (
                <NavAnchor key={link.href} link={link} className={navLinkClass(link)} />
              ))}
            </nav>

            <Link href="/" className="flex items-center justify-center" aria-label="NewWebsite.builders home">
              <Logo />
            </Link>

            <div className="flex items-center justify-end gap-8">
              {NAV_RIGHT.map((link) => (
                <NavAnchor key={link.href} link={link} className={navLinkClass(link)} />
              ))}
              <Link href="/search" aria-label="Search articles">
                <Search className="w-[18px] h-[18px] text-foreground" strokeWidth={1.5} />
              </Link>
            </div>
          </div>

          {/* Mobile nav */}
          <div className="lg:hidden flex items-center justify-between h-14">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-1.5"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/" className="absolute left-1/2 -translate-x-1/2" aria-label="NewWebsite.builders home">
              <Logo className="text-lg" />
            </Link>
            <Link href="/search" className="p-1.5" aria-label="Search articles">
              <Search className="w-[18px] h-[18px] text-foreground" strokeWidth={1.5} />
            </Link>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-border bg-background">
            <nav className="container py-6 flex flex-col gap-4">
              {MOBILE_LINKS.map((link) => (
                <NavAnchor
                  key={link.href}
                  link={link}
                  className="nav-link text-muted-foreground hover:text-foreground py-1"
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </div>
        )}
      </header>
    </>
  )
}
