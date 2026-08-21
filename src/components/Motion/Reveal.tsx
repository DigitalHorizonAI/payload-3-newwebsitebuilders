'use client'
import { cn } from '@/utilities/cn'
import React, { useEffect, useRef, useState } from 'react'

type Props = {
  /** Element to render. Defaults to a div. */
  as?: 'div' | 'p' | 'h1' | 'h2' | 'section' | 'article' | 'figure'
  /** Stagger position among its neighbours; capped at 3 so a long row doesn't crawl. */
  delay?: number
  className?: string
  children: React.ReactNode
}

/**
 * Fade-and-rise on entry, matching the main site's FadeIn: 16px, 0.7s, once,
 * triggered 80px before the element reaches the bottom of the viewport.
 *
 * Each instance observes itself and keeps `shown` in React state, rather than
 * a single document-wide observer adding a class imperatively. That mattered
 * for two reasons: a re-render that touched className would wipe an
 * imperatively-added class and make the content vanish, and a document-level
 * observer never sees nodes added after it ran — both of which Bas would hit
 * in live preview while writing.
 *
 * `.fade-in` is hidden by the stylesheet, so the server's HTML is already in
 * the pre-animation state and nothing flashes. A <noscript> in the layout
 * un-hides it when JavaScript is off.
 */
export const Reveal: React.FC<Props> = ({ as: Tag = 'div', delay = 0, className, children }) => {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || shown) return

    // No observer, or the visitor asked for no motion: show it and stop.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown(true)
      },
      { rootMargin: '0px 0px -80px 0px' },
    )

    io.observe(el)

    return () => io.disconnect()
  }, [shown])

  return (
    <Tag
      className={cn('fade-in', shown && 'is-visible', className)}
      ref={ref as React.Ref<never>}
      style={delay ? { transitionDelay: `${Math.min(delay, 3) * 0.1}s` } : undefined}
    >
      {children}
    </Tag>
  )
}
