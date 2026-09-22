import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from './primitives'
import { dur, ease } from './motion-tokens'
import { useReducedMotion } from './motion'
import { IconRefresh, IconWarning, icons, type IconName } from './icons'

/* ==========================================================================
   EmptyState
   --------------------------------------------------------------------------
   Spec §6.1: no illustration, an SVG line icon, a headline, ONE line of
   explanation and a single obvious call to action. If a screen needs two
   competing CTAs, the hierarchy is wrong — pass one.

   The arrival is a fast opacity cross-fade only. It replaces a skeleton, so it
   must feel like content landing, not like a page transition.
   ========================================================================== */

export type EmptyStateProps = {
  /** Named line icon from the shared set. */
  icon?: IconName
  title: string
  /** One sentence. Keep it to one line of reasoning. */
  description: string
  /** The single next action. */
  action?: React.ReactNode
  className?: string
  /** Use the warn palette (e.g. "nothing received yet") instead of neutral. */
  tone?: 'neutral' | 'warn'
  /** Tighter padding and type for empty regions inside a card, not a whole page. */
  compact?: boolean
}

export function EmptyState({ icon = 'inbox', title, description, action, className, tone = 'neutral', compact = false }: EmptyStateProps) {
  const Icon = icons[icon]
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? dur.fast : dur.base, ease: ease.entrance }}
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed text-center',
        compact ? 'gap-0 px-4 py-6' : 'px-6 py-12',
        tone === 'warn'
          ? 'border-[var(--color-warn)]/45 bg-[var(--color-warn-tint)]'
          : 'border-[var(--color-border-strong)] bg-[var(--color-surface)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid place-items-center rounded-full',
          compact ? 'h-9 w-9' : 'h-11 w-11',
          tone === 'warn'
            ? 'bg-[var(--color-warn-tint)] text-[var(--color-warn-text)]'
            : 'bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]',
        )}
      >
        <Icon className={compact ? 'text-base' : 'text-xl'} />
      </span>
      <p className={cn('mt-3 font-display font-semibold text-[var(--color-ink)]', compact ? 'text-base' : 'text-lg')}>{title}</p>
      <p className={cn('mt-1 max-w-sm text-[var(--color-ink-muted)]', compact ? 'text-xs' : 'text-sm')}>{description}</p>
      {action ? <div className={compact ? 'mt-3' : 'mt-4'}>{action}</div> : null}
    </motion.div>
  )
}

/* ==========================================================================
   ErrorState
   --------------------------------------------------------------------------
   Every screen needs a designed failure state with a way out. `onRetry` is
   wired to the query's own `refetch`, so recovery never re-implements a fetch.
   ========================================================================== */

export type ErrorStateProps = {
  /** What failed, in the shop owner's words. */
  title?: string
  /** One line explaining what to do, not what went wrong internally. */
  description?: string
  /** Technical detail — shown in a muted monospace block when available. */
  detail?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = 'Could not load this',
  description = 'Check that the API is running, then try again. Nothing has been changed.',
  detail,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? dur.fast : dur.base, ease: ease.entrance }}
      role="alert"
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-tint)] p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-danger)]/15 text-[var(--color-danger-text)]">
          <IconWarning className="text-lg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold text-[var(--color-ink)]">{title}</p>
          <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{description}</p>
          {detail ? (
            <p className="mt-2 max-h-24 overflow-auto rounded-[var(--radius-control)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs break-words text-[var(--color-ink-subtle)]">
              {detail}
            </p>
          ) : null}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                'mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink)]',
                'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--color-surface-2)]',
                'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]',
              )}
            >
              <IconRefresh className="text-base" />
              {retryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}
