/* ==========================================================================
   ecoBills — canonical motion scale  (spec §7)
   --------------------------------------------------------------------------
   THIS FILE IS THE SINGLE DEFINITION. Do not write a duration, an easing or a
   spring number anywhere else in the app.

     packages/config/tokens.css        mirrors these as CSS custom properties
     apps/web/src/lib/motion.ts        re-exports them for app code
     packages/config/tailwind.preset.js mirrors the durations/easings for
                                       Tailwind's `duration-*` / `ease-*` classes

   Framer Motion consumes seconds; the CSS tokens are milliseconds. `dur` and
   `durMs` are the same scale in the two units — never retype a number here.
   ========================================================================== */

/** Framer Motion durations, in seconds. Mirrors `--dur-*` in tokens.css. */
export const dur = {
  /** state echo: press feedback, checkmark tick */
  instant: 0.09,
  /** hover in/out, colour crossfades, focus ring */
  fast: 0.15,
  /** default: panels, badges, toast enter */
  base: 0.2,
  /** largest reveal: sheet/overlay, checkmark morph */
  slow: 0.3,
  /** page cross-fade (spec §7: 150–250ms) */
  page: 0.24,
} as const

/** The same durations in milliseconds, for CSS/`transitionDuration` handoff. */
export const durMs = {
  instant: 90,
  fast: 150,
  base: 200,
  slow: 300,
  page: 240,
} as const

export type DurationName = keyof typeof dur

/** A cubic-bezier control-point tuple, which is what Framer Motion accepts. */
export type Bezier = [number, number, number, number]

/** Framer Motion easings. Mirrors `--ease-*` in tokens.css. */
export const ease: Record<'standard' | 'entrance' | 'exit', Bezier> = {
  /** default for UI state changes */
  standard: [0.2, 0, 0, 1],
  /** things arriving */
  entrance: [0.16, 1, 0.3, 1],
  /** things leaving */
  exit: [0.4, 0, 1, 1],
}

/** The same curves as CSS `cubic-bezier()` strings, when a string is needed. */
export const easeCss = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const

export type EaseName = keyof typeof easeCss

/**
 * Spring parameters. Mirrors `--spring-*-stiffness` / `--spring-*-damping`.
 *
 * `type: 'spring'` is inlined rather than declared as a literal so these
 * objects can be spread straight into a Framer Motion `transition` prop.
 */
export const spring = {
  /** cards, hover lift, the sidebar's layoutId indicator */
  default: { type: 'spring', stiffness: 180, damping: 26 },
  /** press and press-release — deliberately settles faster than it leaves */
  snappy: { type: 'spring', stiffness: 320, damping: 30 },
  /** pointer-follow / ambient field — slow enough to read as atmosphere */
  ambient: { type: 'spring', stiffness: 120, damping: 20 },
} as const

export type SpringName = keyof typeof spring

/**
 * The stagger rule (see MOTION.md).
 *
 * A list animates as ONE gesture, never as N independent ones, and the delay
 * must never grow with list length: index 7 and index 70 both start at 180ms
 * so a long list cannot make the user wait.
 */
export const STAGGER_STEP = 0.03 // seconds added per index
export const STAGGER_MAX_INDEX = 6 // index cap

/** Delay in seconds for the item at `i`. Capped at STAGGER_MAX_INDEX * STAGGER_STEP. */
export function stagger(i: number): number {
  if (!Number.isFinite(i) || i <= 0) return 0
  return Math.min(i, STAGGER_MAX_INDEX) * STAGGER_STEP
}

/**
 * Continuous (indeterminate) motion.
 *
 * These are deliberately NOT part of the design duration scale above: a spinner
 * rotation and a shimmer sweep have no beginning or end, so they cannot be
 * described by an entrance duration. They are grouped and named here anyway so
 * that no file in the repo carries a bare `duration: 0.9` or `ease: 'linear'`.
 *
 * Both are bounded: the Button swaps the spinner out after
 * `motionLimits.loadingEscalateMs`, and the shimmer stops after
 * `shimmerCycles` iterations.
 */
export const indeterminate = {
  /** One full rotation of a busy indicator, in seconds. */
  rotationDuration: 0.9,
  /** One shimmer sweep across a skeleton, in seconds. */
  shimmerCycleDuration: 1.2,
  /** Calm gap between shimmer sweeps, in seconds. */
  shimmerRepeatDelay: 0.35,
  /** Shimmer iterations before the surface goes calm. */
  shimmerCycles: 6,
  /**
   * Continuous motion is always linear — an easing curve would make the loop
   * appear to stall at the same point on every revolution.
   */
  ease: 'linear',
} as const

/** Token values that have no CSS counterpart but are part of the contract. */
export const motionLimits = {
  /** §7: no more than one eye-drawing animated element per view. */
  maxEyeDrawingElements: 1,
  /** Button loading: the spinner stops being a spinner after this long. */
  loadingEscalateMs: 60_000,
  /**
   * How long a completed action's success state holds before its panel closes.
   * One value for every "sent"/"created" confirmation so the app has a single
   * rhythm: long enough to register the checkmark, short enough to not stall.
   */
  successHoldMs: 1400,
} as const

/** Transform-producing keys that must be dropped under reduced motion. */
const TRANSFORM_KEYS = [
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'skew',
  'skewX',
  'skewY',
  'originX',
  'originY',
  'originZ',
  'perspective',
] as const

type AnyRecord = Record<string, unknown>

function isPlainObject(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Returns a copy of a variant object with every transform key removed. */
function stripTransforms<T>(target: T): T {
  if (Array.isArray(target)) return target.map((t) => stripTransforms(t)) as unknown as T
  if (!isPlainObject(target)) return target
  const out: AnyRecord = {}
  for (const [key, value] of Object.entries(target)) {
    if ((TRANSFORM_KEYS as readonly string[]).includes(key)) continue
    out[key] = isPlainObject(value) ? stripTransforms(value) : value
  }
  return out as T
}

/** Transform-bearing props on a Framer Motion element/variant map. */
const VARIANT_KEYS = ['initial', 'animate', 'exit', 'whileHover', 'whileTap', 'whileFocus', 'whileInView', 'whileDrag'] as const

/**
 * Drops transform-based motion from a Framer Motion props object while keeping
 * opacity/colour crossfades and every non-animated prop.
 *
 * This is the manual half of the reduced-motion contract; the app also wraps
 * its tree in `<MotionConfig reducedMotion="user">` as a global safety net.
 */
export function stripTransformMotion<P extends AnyRecord>(props: P): P {
  const out: AnyRecord = {}
  for (const [key, value] of Object.entries(props)) {
    if ((VARIANT_KEYS as readonly string[]).includes(key)) {
      out[key] = stripTransforms(value)
      continue
    }
    // `layout`/`layoutId` produce transform-only animation; drop them too.
    if (key === 'layout' || key === 'layoutId' || key === 'layoutScroll') continue
    out[key] = value
  }
  return out as P
}

/** The offsets a card travels on hover. Kept here so it is a token, not a literal. */
export const cardLiftOffset = -3 // px, spec §7: "a few pixels, not slide-and-rotate"
/** The page cross-fade's vertical offset. */
export const pageRiseOffset = 4 // px
