'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'

import type { Theme, ThemeContextType } from './types'

import canUseDOM from '@/utilities/canUseDOM'
import { defaultTheme, themeLocalStorageKey } from './shared'

const initialContext: ThemeContextType = {
  setTheme: () => null,
  theme: undefined,
}

const ThemeContext = createContext(initialContext)

/**
 * The site's own theme behaviour, mirrored: light unless the visitor chose
 * dark, remembered under the same key the main site uses ('nwb-theme'), and
 * never driven by the OS preference — newwebsite.builders ignores
 * prefers-color-scheme, so the preview does too. The attribute is already set
 * before paint by the inline InitTheme script in the frontend layout; this
 * provider reads it back and owns changes from then on.
 */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<Theme | undefined>(
    canUseDOM ? (document.documentElement.getAttribute('data-theme') as Theme) : undefined,
  )

  const setTheme = useCallback((themeToSet: Theme | null) => {
    const next = themeToSet ?? defaultTheme
    setThemeState(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      if (themeToSet === null) {
        window.localStorage.removeItem(themeLocalStorageKey)
      } else {
        window.localStorage.setItem(themeLocalStorageKey, themeToSet)
      }
    } catch {
      /* storage can be unavailable (private mode); the attribute still set */
    }
  }, [])

  return <ThemeContext.Provider value={{ setTheme, theme }}>{children}</ThemeContext.Provider>
}

export const useTheme = (): ThemeContextType => useContext(ThemeContext)
