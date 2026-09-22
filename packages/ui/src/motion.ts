import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MotionProps, Transition, Variants } from 'framer-motion'
import {
  cardLiftOffset,
  dur,
  ease,
  pageRiseOffset,
  spring,
  stagger,
  stripTransformMotion,
} from './motion-tokens'

export * from './motion-tokens'

/* ==========================================================================
   Reduced motion
   --------------------------------------------------------------------------
   Framer Motion 11's own `useReducedMotion()` reads the media query once into
   `useState` and never updates (see the TODO in its source). The spec requires
   every transform to be gated on the preference, so we own the hook and make
   it reactive — flipping the OS setting takes effect without a reload.
   ========================================================================== */

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCE_QUERY).matches
}

/** Non-hook read, for event handlers and one-off checks. */
export function prefersReducedMotion(): boolean {
  return readPrefersReducedMotion()
}

/** Reactive `prefers-reduced-motion: reduce`. Changes apply live. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(readPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(REDUCE_QUERY)
    const onChange = () => setReduce(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduce
}

/**
 * `useMotionSafe()` — the gate every animated element goes through.
 *
 * Returns a function that passes Framer Motion props through unchanged, or
 * strips every transform-bearing key when the user asked for reduced motion.
 * Opacity and colour crossfades survive, so the interface still feels alive
 * without moving.
 *
 *   const safe = useMotionSafe()
 *   <motion.div {...safe({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } })} />
 */
export function useMotionSafe(): <P extends MotionProps>(props: P) => P {
  const reduce = useReducedMotion()
  return useCallback(
    <P extends MotionProps>(props: P): P => (reduce ? stripTransformMotion(props as Record<string, unknown>) as P : props),
    [reduce],
  )
}

/* ==========================================================================
   Shared variants — every one is derived from the token scale above.
   ========================================================================== */

/** A pure opacity cross-fade. Safe under reduced motion by definition. */
export function fadeIn(speed: keyof typeof dur = 'fast'): MotionProps & { transition: Transition } {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: dur[speed], ease: ease.entrance },
  }
}

/**
 * The page cross-fade: 240ms, opacity first with a 4px rise on top.
 *
 * Deliberately not `AnimatePresence mode="wait"` — waiting for an exit
 * animation before the next page paints adds dead time, and spec §7 says the
 * interface must never make the user wait.
 */
export function pageTransition(reduce: boolean): MotionProps {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: dur.base, ease: ease.standard },
    }
  }
  return {
    initial: { opacity: 0, y: pageRiseOffset },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: dur.page, ease: ease.entrance },
  }
}

/**
 * Card hover: a spring-based lift of a few pixels (spec §7 — not
 * slide-and-rotate). Collapses to nothing under reduced motion.
 */
export function cardLift(reduce: boolean): MotionProps {
  if (reduce) return {}
  return {
    whileHover: { y: cardLiftOffset },
    transition: spring.default,
  }
}

/** Press feedback: the physical push. `scale 0.98`, snappy spring. */
export function pressFeedback(reduce: boolean): MotionProps {
  if (reduce) return {}
  return {
    whileTap: { scale: 0.98 },
    transition: spring.snappy,
  }
}

/**
 * List entrance as ONE gesture. The delay is capped by `stagger()`, so a
 * 40-row table takes exactly as long to settle as a 7-row one.
 */
export function useStagger(index: number, speed: keyof typeof dur = 'base'): Transition {
  const reduce = useReducedMotion()
  return useMemo(
    () => (reduce ? { duration: dur.fast } : { duration: dur[speed], ease: ease.entrance, delay: stagger(index) }),
    [reduce, index, speed],
  )
}

/** Variant map for a staggered container. Children opt in with `useStagger`. */
export function listVariants(): Variants {
  return {
    hidden: { opacity: 0 },
    show: { opacity: 1 },
  }
}

/** Spring presets re-exported under a friendlier name for app code. */
export const springPresets = spring
