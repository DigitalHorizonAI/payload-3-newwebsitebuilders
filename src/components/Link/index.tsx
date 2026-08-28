import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from 'src/utilities/cn'
import { getDocPath } from '@/utilities/collectionPrefixMap'
import { sanitizeUrl } from 'payload/shared'
import Link from 'next/link'
import React from 'react'

import type { Page, Post } from '@/payload-types'

type CMSLinkType = {
  appearance?: 'inline' | ButtonProps['variant']
  children?: React.ReactNode
  className?: string
  label?: string | null
  newTab?: boolean | null
  reference?: {
    relationTo: 'pages' | 'posts'
    value: Page | Post | string | number
  } | null
  size?: ButtonProps['size'] | null
  type?: 'custom' | 'reference' | null
  url?: string | null
}

export const CMSLink: React.FC<CMSLinkType> = (props) => {
  const {
    type,
    appearance = 'inline',
    children,
    className,
    label,
    newTab,
    reference,
    size: sizeFromProps,
    url,
  } = props

  const href =
    type === 'reference' && typeof reference?.value === 'object' && reference.value.slug
      ? getDocPath(reference?.relationTo, reference.value.slug)
      : url

  if (!href) return null

  // Payload's own allowlist: '#' for a disallowed protocol, untouched for
  // http/https/mailto/tel and relative hrefs. This is the chokepoint for the
  // blog page — RichText/serialize.tsx routes its link nodes through CMSLink,
  // as does every other link in the app — and the serializer is hand-rolled,
  // so nothing upstream has sanitized the href yet.
  const safeHref = sanitizeUrl(href)

  const size = appearance === 'link' ? 'clear' : sizeFromProps
  const newTabProps = newTab ? { rel: 'noopener noreferrer', target: '_blank' } : {}

  /* Ensure we don't break any styles set by richText */
  if (appearance === 'inline') {
    return (
      <Link className={cn(className)} href={safeHref} {...newTabProps}>
        {label && label}
        {children && children}
      </Link>
    )
  }

  return (
    <Button asChild className={className} size={size} variant={appearance}>
      <Link className={cn(className)} href={safeHref} {...newTabProps}>
        {label && label}
        {children && children}
      </Link>
    </Button>
  )
}
