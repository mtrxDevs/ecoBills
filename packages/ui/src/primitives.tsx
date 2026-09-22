import * as React from 'react'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { cardLift, useReducedMotion } from './motion'
import type { IconProps } from './icons'

export function cn(...xs: Array<string | false | null | undefined>) {
  return clsx(...xs)
}

/** Money display: integer paise -> ₹ string. Convert only at render time (§1). */
export function formatMoney(paise: number, currency = 'INR') {
  const v = (paise ?? 0) / 100
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(v)
  } catch {
    return `₹${v.toFixed(2)}`
  }
}

/**
 * The shared focus ring. Always offset so the ring is measured against the page
 * background (>=3:1 via --color-focus-ring) rather than the control's own fill.
 */
export const focusRing =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]'

const CONTROL_BASE =
  'w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-ink-subtle)]'

/* ==========================================================================
   Card — spring-based hover lift, a few pixels, reduced-motion aware.
   ========================================================================== */

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Set false for static containers (page sections) that should not react. */
  interactive?: boolean
  /** Render as a padded block. Default true. */
  padded?: boolean
}

export function Card({ className, children, interactive = false, padded = true, ...rest }: CardProps) {
  const reduce = useReducedMotion()
  const lift = interactive ? cardLift(reduce) : {}
  return (
    <motion.div
      {...lift}
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--elev-1)]',
        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]',
        padded && 'p-5',
        className,
      )}
      {...(rest as React.ComponentProps<typeof motion.div>)}
    >
      {children}
    </motion.div>
  )
}

/** A labelled region inside a page. Softer than Card — no elevation. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('mt-6', className)}>
      {(title || actions) && (
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            {title ? <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{title}</h2> : null}
            {description ? <p className="text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Floating glass surface — used for the persistent sidebar and overlays
 * (aesthetic direction: preset 06 floating panels, restrained to one or two
 * surfaces so the backdrop blur never becomes a per-frame cost across the app).
 *
 * Note for whoever nests this: `backdrop-filter` establishes a containing block
 * for `position: fixed` descendants, so never place an AmbientField inside one.
 */
export function GlassSurface({
  as,
  className,
  children,
  ...rest
}: { as?: 'div' | 'aside' | 'section' | 'header' | 'nav' } & React.HTMLAttributes<HTMLElement>) {
  const Tag = (as ?? 'div') as React.ElementType
  return (
    <Tag
      className={cn(
        'border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--blur-glass)] backdrop-saturate-[var(--glass-saturate)]',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/* ==========================================================================
   Text
   ========================================================================== */

export function PageTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={cn('font-display text-2xl font-bold text-[var(--color-ink)]', className)}>{children}</h1>
}

export function PageHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-sm text-[var(--color-ink-muted)]', className)}>{children}</p>
}

/** Financial figures and stock counts MUST be tabular (spec §7). */
export function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('tnum', className)}>{children}</span>
}

/* ==========================================================================
   Badge
   ========================================================================== */

export type BadgeTone = 'ok' | 'warn' | 'bad' | 'muted' | 'accent'

export function Badge({
  tone = 'ok',
  icon: Icon,
  children,
  className,
}: {
  tone?: BadgeTone
  icon?: (p: IconProps) => React.JSX.Element
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-chip)] px-2.5 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap',
        tone === 'ok' && 'bg-[var(--color-accent-tint)] text-[var(--color-success-text)]',
        tone === 'accent' && 'bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]',
        tone === 'warn' && 'bg-[var(--color-warn-tint)] text-[var(--color-warn-text)]',
        tone === 'bad' && 'bg-[var(--color-danger-tint)] text-[var(--color-danger-text)]',
        tone === 'muted' && 'bg-[var(--color-neutral-tint)] text-[var(--color-ink-muted)]',
        className,
      )}
    >
      {Icon ? <Icon className="text-[1em]" /> : null}
      {children}
    </span>
  )
}

/* ==========================================================================
   Inputs (bare controls — labels/errors/hints live in <Field>)
   ========================================================================== */

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cn(CONTROL_BASE, focusRing, 'tnum', className)} />
  },
)

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} {...rest} className={cn(CONTROL_BASE, focusRing, 'leading-relaxed', className)} />
  },
)

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} {...rest} className={cn(CONTROL_BASE, focusRing, 'pr-8', className)}>
        {children}
      </select>
    )
  },
)

/** A KPI tile: label, animated figure, optional footnote. */
export function Stat({
  label,
  children,
  footnote,
  tone = 'default',
  className,
}: {
  label: string
  children: React.ReactNode
  footnote?: React.ReactNode
  tone?: 'default' | 'warn'
  className?: string
}) {
  return (
    <Card interactive className={cn('flex flex-col justify-between', className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</div>
      <div
        className={cn(
          'font-display text-3xl font-bold tabular-nums',
          tone === 'warn' ? 'text-[var(--color-warn-text)]' : 'text-[var(--color-ink)]',
        )}
      >
        {children}
      </div>
      {footnote ? <div className="mt-1 text-sm text-[var(--color-ink-muted)]">{footnote}</div> : null}
    </Card>
  )
}
