import * as React from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import { cn } from './primitives'
import { spring } from './motion-tokens'
import { useReducedMotion } from './motion'

/* ==========================================================================
   CountUp
   --------------------------------------------------------------------------
   Spec §7: "Numbers that update (stock counts, totals) animate with a quick
   count-up/count-down, not a hard cut."

   This replaces the v0.1.1 implementation, which had three defects:
     1. it subscribed with `rounded.on('change', ...)` and then called
        `setDisplay(value)` — the target, not the interpolated frame — so the
        interpolated value was discarded and the component re-rendered on every
        animation frame for nothing;
     2. it carried a `display` state that was never read (`void display`);
     3. it was not reduced-motion aware.

   The correct shape is simply: a spring-driven MotionValue, a transform that
   formats it, and the MotionValue handed straight to Framer Motion — no React
   state, so a 60fps count-up costs zero re-renders.

   The figure only animates on *change*. On mount it renders the final value
   immediately: a count-up from zero on every page load would be a second
   eye-drawing element competing with the page cross-fade (spec §7: one at a
   time), and it would make the user wait for a number they already own.
   ========================================================================== */

export type CountUpProps = {
  /** Raw value. For money this is integer paise — convert only via `format`. */
  value: number
  /** Turns the current frame into display text. */
  format?: (n: number) => string
  className?: string
  /** Render the value in the display face. Default true. */
  display?: boolean
}

export function CountUp({ value, format = defaultFormat, className, display = false }: CountUpProps) {
  const reduce = useReducedMotion()

  // Snappy spring: the figure settles in well under half a second, so the
  // number is never something the user has to wait for.
  const springValue = useSpring(value, spring.snappy)
  const text = useTransform(springValue, (frame) => format(Math.round(frame)))

  React.useEffect(() => {
    // `.set()` on a useSpring value starts a spring animation toward it.
    springValue.set(value)
  }, [value, springValue])

  // No animation at all when the OS asks for reduced motion: just the number.
  if (reduce) {
    return <span className={cn('tnum', display && 'font-display', className)}>{format(value)}</span>
  }

  return (
    <motion.span className={cn('tnum', display && 'font-display', className)}>{text}</motion.span>
  )
}

function defaultFormat(n: number) {
  return n.toLocaleString('en-IN')
}
