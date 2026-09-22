/* ==========================================================================
   ecoBills web — motion entry point
   --------------------------------------------------------------------------
   Import ALL motion from here. There are no ad-hoc durations, easings or
   springs anywhere in apps/web/src; a grep for `duration:`, `ease:` or
   `cubic-bezier` outside this file and packages/ui should return nothing but
   token definitions (see MOTION.md for the verification command).

   The numbers themselves are defined once, in `@ecobills/ui`'s motion-tokens
   module, because `packages/ui` needs them too and the dependency may only
   point one way (web -> ui). This file is the app-facing surface: same values,
   plus the variants screens actually spread into JSX.

   Scale (mirrored as CSS custom properties in packages/config/tokens.css):
     durations  instant 90ms | fast 150ms | base 200ms | slow 300ms | page 240ms
     easings    standard  cubic-bezier(.2,0,0,1)      — default UI state
                entrance  cubic-bezier(.16,1,.3,1)    — things arriving
                exit      cubic-bezier(.4,0,1,1)      — things leaving
     springs    default 180/26  | snappy 320/30 | ambient 120/20
   ========================================================================== */

export {
  /** Framer Motion durations in seconds. */
  dur,
  /** The same durations in milliseconds. */
  durMs,
  /** Framer Motion cubic-bezier tuples. */
  ease,
  /** The same curves as CSS strings. */
  easeCss,
  /** Spring parameters: default (180/26), snappy (320/30), ambient (120/20). */
  spring,
  /** Stagger delay in seconds for list index `i` — capped, never grows. */
  stagger,
  /** Drops transform-based motion from Framer Motion props. */
  stripTransformMotion,
  /** Non-CSS limits: shimmer cycles, 60s loading cap, one-eye-drawing rule. */
  motionLimits,
  /** Shared offsets so `-3px` and `4px` are not retyped in screens. */
  cardLiftOffset,
  pageRiseOffset,
  STAGGER_STEP,
  STAGGER_MAX_INDEX,

  /* Hooks and variant builders */
  useReducedMotion,
  prefersReducedMotion,
  /** `const safe = useMotionSafe()` then `{...safe({ whileHover: { y: -3 } })}`. */
  useMotionSafe,
  /** Pure opacity cross-fade. */
  fadeIn,
  /** The page cross-fade, reduced-motion aware. */
  pageTransition,
  /** Card hover lift, reduced-motion aware. */
  cardLift,
  /** Press feedback (`scale: 0.98`), reduced-motion aware. */
  pressFeedback,
  /** Staggered transition for the item at `index`. */
  useStagger,
  listVariants,
  springPresets,
} from '@ecobills/ui'

export type { Bezier, DurationName, EaseName, SpringName } from '@ecobills/ui'
