import clsx from 'clsx'
import React from 'react'

interface Props {
  className?: string
}

/** The main site's text wordmark: display serif, all-caps, letter-spaced. */
export const Logo = ({ className }: Props) => {
  return (
    <span
      className={clsx('font-display font-medium text-2xl tracking-[0.08em] text-foreground', className)}
    >
      NEWWEBSITE.BUILDERS
    </span>
  )
}
