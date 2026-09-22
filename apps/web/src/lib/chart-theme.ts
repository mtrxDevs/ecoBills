import { useEffect, useState } from 'react'

/* ==========================================================================
   Chart colours
   --------------------------------------------------------------------------
   Recharts hands `stroke`/`fill` to SVG as *attributes*, and `var(--x)` does
   not resolve in an attribute — only in a CSS declaration. So the chart layer
   reads the same custom properties the rest of the app uses, at runtime, rather
   than hardcoding a second copy of the palette that could drift from
   tokens.css.

   The fallbacks below are the light-mode token values, so a first paint before
   the stylesheet is applied (or a non-DOM environment) looks identical.
   ========================================================================== */

export type ChartColors = {
  accent: string
  accentText: string
  ink: string
  muted: string
  subtle: string
  grid: string
  surface: string
  border: string
  warn: string
  danger: string
}

const FALLBACK: ChartColors = {
  accent: '#17a673',
  accentText: '#0f6e4b',
  ink: '#14171c',
  muted: '#5a6270',
  subtle: '#5f6774',
  grid: 'rgba(20,23,28,0.12)',
  surface: '#ffffff',
  border: 'rgba(20,23,28,0.1)',
  warn: '#92400e',
  danger: '#b91c1c',
}

function readChartColors(): ChartColors {
  if (typeof window === 'undefined' || typeof document === 'undefined') return FALLBACK
  const cs = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    accent: get('--color-accent', FALLBACK.accent),
    accentText: get('--color-accent-text', FALLBACK.accentText),
    ink: get('--color-ink', FALLBACK.ink),
    muted: get('--color-ink-muted', FALLBACK.muted),
    subtle: get('--color-ink-subtle', FALLBACK.subtle),
    grid: get('--color-border-strong', FALLBACK.grid),
    surface: get('--color-surface', FALLBACK.surface),
    border: get('--color-border', FALLBACK.border),
    warn: get('--color-warn-text', FALLBACK.warn),
    danger: get('--color-danger-text', FALLBACK.danger),
  }
}

/** Re-reads the palette when the OS colour scheme flips. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readChartColors)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const refresh = () => setColors(readChartColors())
    refresh()
    mql.addEventListener('change', refresh)
    return () => mql.removeEventListener('change', refresh)
  }, [])

  return colors
}
