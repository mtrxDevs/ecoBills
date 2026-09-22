import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn, focusRing } from './primitives'
import { dur, ease, indeterminate, motionLimits, spring } from './motion-tokens'
import { useReducedMotion } from './motion'
import { IconCheck } from './icons'

/* ==========================================================================
   Button
   --------------------------------------------------------------------------
   Full state coverage per spec §7: default, hover (subtle lift), active
   (scale 0.98 physical push), focus-visible (>=3:1 ring), disabled, loading,
   success.

   Two rules the implementation encodes so a caller cannot get them wrong:
     - zero layout shift: the label stays in the flow at opacity 0 while an
       indicator is showing, so the button never resizes mid-action.
     - no infinite spinner: after `motionLimits.loadingEscalateMs` (60s) the
       rotation stops and a static "still working" state takes over.
   ========================================================================== */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Indeterminate busy state. Rotation stops after 60s (see module note). */
  loading?: boolean
  /** Determinate progress in 0..1. Replaces the spinner with a progress ring. */
  progress?: number | null
  /** Morph the label into a drawn checkmark. Use after "send" actions. */
  success?: boolean
  /** Announced while `loading`. Defaults to "Working…". */
  loadingLabel?: string
  /** Announced when `success`. Defaults to "Done". */
  successLabel?: string
  children?: React.ReactNode
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
}

/* Solid fills define their own text colour token so contrast is documented in
   one place (see tokens.css). Light mode uses white on the logo green (4.53:1);
   dark mode uses near-black ink on the accent (6.04:1). */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-action)] text-[var(--color-ink-on-action)] hover:bg-[var(--color-action-hover)] active:bg-[var(--color-action-active)] shadow-[var(--elev-1)]',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border-input)] hover:bg-[var(--color-surface-2)] active:bg-[var(--color-surface-3)]',
  ghost:
    'bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-neutral-tint)] active:bg-[var(--color-surface-3)]',
  danger:
    'bg-[var(--color-danger)] text-[var(--color-danger-ink)] hover:brightness-95 active:brightness-90 shadow-[var(--elev-1)]',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    progress = null,
    success = false,
    loadingLabel = 'Working…',
    successLabel = 'Done',
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const reduce = useReducedMotion()
  const busy = loading || success
  const isDisabled = disabled || busy

  /**
   * 60s cap: the spinner is allowed to spin while the user still expects a
   * quick answer; past that it becomes a static state so the app never shows
   * an endlessly animating element.
   */
  const [slow, setSlow] = React.useState(false)
  // Render-phase reset (the endorsed "adjust state during render" pattern):
  // when a new loading cycle starts, the previous cycle's escalation dies here,
  // so the effect below only ever arms its timer.
  const [wasLoading, setWasLoading] = React.useState(loading)
  if (loading !== wasLoading) {
    setWasLoading(loading)
    setSlow(false)
  }
  React.useEffect(() => {
    if (!loading) return
    const t = window.setTimeout(() => setSlow(true), motionLimits.loadingEscalateMs)
    return () => window.clearTimeout(t)
  }, [loading])

  const determinate = typeof progress === 'number'
  const announce = success ? successLabel : loading ? (slow ? `${loadingLabel} still working` : loadingLabel) : ''

  // Transform-based feedback only when motion is allowed.
  const feedback = reduce
    ? {}
    : {
        whileHover: isDisabled ? undefined : { y: -1 },
        whileTap: isDisabled ? undefined : { scale: 0.98 },
        transition: spring.snappy as unknown as React.ComponentProps<typeof motion.button>['transition'],
      }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center rounded-[var(--radius-control)] font-medium',
        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]',
        'disabled:cursor-not-allowed disabled:opacity-55',
        focusRing,
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...feedback}
      {...(rest as React.ComponentProps<typeof motion.button>)}
    >
      {/* Sits in the flow even when hidden so the button never changes width. */}
      <span className={cn('inline-flex items-center gap-2', busy && 'opacity-0')} aria-hidden={busy || undefined}>
        {children}
      </span>

      <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
        <AnimatePresence initial={false} mode="wait">
          {success ? (
            <motion.span
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.instant, ease: ease.standard }}
              className="grid h-5 w-5 place-items-center"
            >
              {/* Checkmark morph: the stroke draws itself instead of popping in. */}
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                <motion.path
                  d="m4.5 12.5 5 5 10-11"
                  initial={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 1 }}
                  animate={reduce ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
                  transition={reduce ? { duration: dur.base, ease: ease.standard } : { duration: dur.slow, ease: ease.entrance }}
                />
              </svg>
            </motion.span>
          ) : loading ? (
            <motion.span
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.instant, ease: ease.standard }}
              className="grid place-items-center gap-1 px-2"
            >
              {determinate ? (
                <ProgressRing value={Math.max(0, Math.min(1, progress as number))} />
              ) : slow ? (
                // Escalated: no animation at all, just an honest static state.
                <span className="flex items-center gap-1.5 text-xs font-medium opacity-90">
                  <StaticDots />
                  Still working…
                </span>
              ) : (
                <Spinner reduce={reduce} />
              )}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>

      {/* Live region exists from mount; only its text is injected later. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </motion.button>
  )
})

function Spinner({ reduce }: { reduce: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      role="presentation"
    >
      <circle cx="12" cy="12" r="9" opacity={0.28} />
      {reduce ? (
        <path d="M12 3a9 9 0 0 1 9 9" />
      ) : (
        <motion.path
          d="M12 3a9 9 0 0 1 9 9"
          style={{ originX: '12px', originY: '12px' }}
          animate={{ rotate: 360 }}
          transition={{
            duration: indeterminate.rotationDuration,
            ease: indeterminate.ease,
            repeat: Infinity,
          }}
        />
      )}
    </svg>
  )
}

function ProgressRing({ value }: { value: number }) {
  const r = 8
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 -rotate-90" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r={r} opacity={0.28} />
      <circle cx="12" cy="12" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
    </svg>
  )
}

/** Three static dots — the visual full stop after the spinner gives up. */
function StaticDots() {
  return (
    <svg viewBox="0 0 24 8" className="h-2 w-6" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="1.6" />
      <circle cx="12" cy="4" r="1.6" />
      <circle cx="20" cy="4" r="1.6" />
    </svg>
  )
}

export { IconCheck }
