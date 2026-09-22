import * as React from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { cn } from './primitives'
import { spring } from './motion-tokens'
import { useReducedMotion } from './motion'

/* ==========================================================================
   AmbientField — the Active Theory / preset-06 signature, adapted
   --------------------------------------------------------------------------
   A pointer-reactive ambient surface: three soft glows and a dot field at
   different depths, all moving a few pixels apart so the shell reads as having
   volume. Restrained on purpose — it is atmosphere, not a feature, and it never
   becomes the second thing competing for the eye.

   How it stays cheap (all four are hard requirements from the brief):

     1. NO React state. Pointer position is written into MotionValues, which
        Framer Motion applies straight to the compositor. Moving the pointer
        re-renders nothing — there is no `useState` in this file at all.

     2. NO scroll listener. The field is `position: fixed` and never mounted
        inside a scrolling container, so background attachment is not a problem
        we have to solve with scroll handlers.

     3. Transform and opacity only. The glows are pre-softened radial gradients
        rather than `filter: blur()` elements, so a move costs a composite, not
        a repaint. Nothing animates on a timer, so an idle screen does zero
        work — this is the deliberate deviation from preset-06's "always
        drifting" surface, which would repaint forever.

     4. Collapses to a static gradient under `prefers-reduced-motion: reduce`:
        the listener is never attached and every transform is left at rest.

   It is decoration, so it is `aria-hidden` and `pointer-events-none`.
   ========================================================================== */

export type AmbientFieldProps = {
  className?: string
  /** 0 = off, 1 = the shipped subtlety. Values above ~1.5 stop being ambient. */
  intensity?: number
}

/** How far each layer travels, in px, across the full width of the viewport. */
const GLOW_TRAVEL = 26
const FIELD_TRAVEL = 12
const FIELD_COUNTER_TRAVEL = -8

export function AmbientField({ className, intensity = 1 }: AmbientFieldProps) {
  const reduce = useReducedMotion()

  // Normalised pointer position, -1..1, centred on the viewport.
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)

  // Ambient spring: slow enough that the surface feels like it has weight.
  const sx = useSpring(pointerX, spring.ambient)
  const sy = useSpring(pointerY, spring.ambient)

  const glow1X = useTransform(sx, (v) => v * GLOW_TRAVEL * intensity)
  const glow1Y = useTransform(sy, (v) => v * GLOW_TRAVEL * intensity)
  const glow2X = useTransform(sx, (v) => v * -GLOW_TRAVEL * 0.7 * intensity)
  const glow2Y = useTransform(sy, (v) => v * -GLOW_TRAVEL * 0.7 * intensity)
  const glow3X = useTransform(sx, (v) => v * GLOW_TRAVEL * 0.45 * intensity)
  const glow3Y = useTransform(sy, (v) => v * -GLOW_TRAVEL * 0.45 * intensity)
  const fieldX = useTransform(sx, (v) => v * FIELD_TRAVEL * intensity)
  const fieldY = useTransform(sy, (v) => v * FIELD_TRAVEL * intensity)
  const counterX = useTransform(sx, (v) => v * FIELD_COUNTER_TRAVEL * intensity)
  const counterY = useTransform(sy, (v) => v * FIELD_COUNTER_TRAVEL * intensity)

  React.useEffect(() => {
    if (reduce) return
    if (typeof window === 'undefined') return

    // Pointer-driven surfaces on a touch device are noise, and the listener
    // costs something on every touch move — skip it entirely.
    const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)')
    if (finePointer && !finePointer.matches) return

    let frame = 0
    let pendingX = 0
    let pendingY = 0

    const apply = () => {
      frame = 0
      pointerX.set(pendingX)
      pointerY.set(pendingY)
    }

    const onPointerMove = (e: PointerEvent) => {
      pendingX = (e.clientX / window.innerWidth) * 2 - 1
      pendingY = (e.clientY / window.innerHeight) * 2 - 1
      // Coalesce to one write per frame; the MotionValues do the rest.
      if (!frame) frame = window.requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [reduce, pointerX, pointerY])

  // The static fallback is the same composition with every layer at rest, so
  // the reduced-motion and normal paths look like the same design.
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 overflow-hidden', className)}
      style={{ contain: 'strict' }}
    >
      {/* Base wash — always visible, keeps the surface from reading as flat. */}
      <div className="absolute inset-0 bg-[var(--color-canvas)]" />

      {/* Glow 1 — leads the pointer (largest travel). */}
      <motion.div
        className="absolute -top-[18%] -left-[12%] h-[62vmax] w-[62vmax] rounded-full opacity-90 will-change-transform"
        style={{
          x: glow1X,
          y: glow1Y,
          background: 'radial-gradient(circle at 50% 50%, var(--ambient-glow-1) 0%, transparent 62%)',
        }}
      />

      {/* Glow 2 — trails against the pointer, creating depth. */}
      <motion.div
        className="absolute -right-[16%] top-[8%] h-[54vmax] w-[54vmax] rounded-full opacity-90 will-change-transform"
        style={{
          x: glow2X,
          y: glow2Y,
          background: 'radial-gradient(circle at 50% 50%, var(--ambient-glow-2) 0%, transparent 60%)',
        }}
      />

      {/* Glow 3 — the bright accent, smallest and slowest. */}
      <motion.div
        className="absolute bottom-[-22%] left-[24%] h-[48vmax] w-[48vmax] rounded-full opacity-80 will-change-transform"
        style={{
          x: glow3X,
          y: glow3Y,
          background: 'radial-gradient(circle at 50% 50%, var(--ambient-glow-3) 0%, transparent 58%)',
        }}
      />

      {/* The "field" — a static dot lattice that only ever translates. */}
      <motion.div
        className="absolute -inset-[6%] opacity-70 will-change-transform"
        style={{
          x: fieldX,
          y: fieldY,
          backgroundImage: 'radial-gradient(var(--ambient-field) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      {/* Counter-moving lattice for a second plane of depth. */}
      <motion.div
        className="absolute -inset-[6%] opacity-40 will-change-transform"
        style={{
          x: counterX,
          y: counterY,
          backgroundImage: 'radial-gradient(var(--ambient-field) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
        }}
      />

      {/* Vignette — keeps the edges quiet so content stays the highest contrast. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 55%, var(--ambient-vignette) 100%)' }}
      />
    </div>
  )
}
