'use client'
import { useHeaderTheme } from '@/providers/HeaderTheme'
import React, { useEffect } from 'react'

const PageClient: React.FC = () => {
  /* The hero used to be a full-bleed image sitting behind the header, so the
     header was forced dark. It is a light editorial header now — nothing to
     compensate for. */
  const { setHeaderTheme } = useHeaderTheme()

  useEffect(() => {
    setHeaderTheme(null)
  }, [setHeaderTheme])
  return <React.Fragment />
}

export default PageClient
