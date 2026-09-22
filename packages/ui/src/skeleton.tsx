import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from './primitives'
import { indeterminate } from './motion-tokens'
import { useReducedMotion } from './motion'

/* ==========================================================================
   Skeleton
   --------------------------------------------------------------------------
   Spec §7: "Skeleton loaders that mirror the final layout, never a generic
   spinner." So this module ships the *shapes* of the real screens rather than
   a grid of grey bars — a table skeleton has a header row and one row per
   record, a stat skeleton is the same three tiles at the same height.

   Shimmer rules:
     - finite iterations (`motionLimits.shimmerCycles`), then it goes calm.
       A skeleton left on screen for a slow request must not pulse forever.
     - the loop ends on unmount, i.e. the moment real content lands.
     - under reduced motion there is no shimmer at all, just a static tint.
   ========================================================================== */

export function Skeleton({ className, strong = false }: { className?: string; strong?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block overflow-hidden rounded-[var(--radius-control)]',
        strong ? 'bg-[var(--color-skeleton-strong)]' : 'bg-[var(--color-skeleton)]',
        className,
      )}
    >
      <Shimmer />
    </span>
  )
}

function Shimmer() {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <motion.span
      className="pointer-events-none absolute inset-y-0 w-1/2 bg-[linear-gradient(90deg,transparent,var(--color-skeleton-sheen),transparent)]"
      initial={{ x: '-150%' }}
      animate={{ x: '250%' }}
      transition={{
        duration: indeterminate.shimmerCycleDuration,
        ease: indeterminate.ease,
        repeat: indeterminate.shimmerCycles - 1,
        repeatDelay: indeterminate.shimmerRepeatDelay,
      }}
    />
  )
}

/** A short line of text. Width is an inline style so any value survives purge. */
function TextLine({ width = '100%', className }: { width?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative block overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-skeleton)]', className)}
      style={{ width, height: 12 }}
    >
      <Shimmer />
    </span>
  )
}

/* --------------------------------------------------------------------------
   Composed shapes — each mirrors a real screen's final layout.
   ------------------------------------------------------------------------- */

/** Mirrors the Dashboard KPI row: same count, same tile height, same grid. */
export function SkeletonStats({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Shell key={i} className="p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-32" strong />
          <Skeleton className="mt-3 h-3 w-20" />
        </Shell>
      ))}
    </div>
  )
}

/** Mirrors a data table: header row, then one row per expected record. */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <Shell className={cn('overflow-hidden', className)} aria-hidden="true">
      <div className="flex gap-4 bg-[var(--color-surface-2)] px-4 py-3">
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton key={c} className={cn('h-3', c === 0 ? 'flex-[3]' : 'flex-1')} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-t border-[var(--color-border)] px-4 py-3.5">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'flex-[3]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </Shell>
  )
}

/** Mirrors the "Recent bills" / purchase-order card list. */
export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Shell key={i} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-3.5 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-24" />
            </div>
          </div>
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </Shell>
      ))}
    </div>
  )
}

/** Mirrors a stacked form: label + control per row. */
export function SkeletonForm({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

/** Mirrors a chart card: title, plot area, axis ticks. */
export function SkeletonChart({ height = 220, className }: { height?: number; className?: string }) {
  return (
    <Shell className={cn('p-4', className)} aria-hidden="true">
      <Skeleton className="h-3 w-28" />
      <div className="mt-4 flex gap-3" style={{ height }}>
        <div className="flex flex-col justify-between py-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-8" />
          ))}
        </div>
        <Skeleton className="h-full flex-1" />
      </div>
    </Shell>
  )
}

/** Mirrors the two-column New bill / Recent bills layout. */
export function SkeletonSplit({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-2', className)} aria-hidden="true">
      <div>
        <Skeleton className="h-7 w-40" strong />
        <Skeleton className="mt-4 h-10 w-full" />
        <Skeleton className="mt-3 h-10 w-full" />
        <Shell className="mt-3 p-4">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="mt-3 h-3.5 w-1/2" />
        </Shell>
      </div>
      <div>
        <Skeleton className="h-5 w-32" strong />
        <SkeletonList rows={4} className="mt-3" />
      </div>
    </div>
  )
}

/** The card chrome every skeleton tile sits in — identical to <Card>. */
function Shell({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--elev-1)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export const SkeletonShapes = {
  Stats: SkeletonStats,
  Table: SkeletonTable,
  List: SkeletonList,
  Form: SkeletonForm,
  Chart: SkeletonChart,
  Split: SkeletonSplit,
  Text: TextLine,
}

export { TextLine, Shell as SkeletonShell }
