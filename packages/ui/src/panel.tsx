import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn, focusRing } from './primitives'
import { dur, ease } from './motion-tokens'
import { useReducedMotion } from './motion'
import { IconClose } from './icons'

/* ==========================================================================
   Panel
   --------------------------------------------------------------------------
   The one container for side panels and overlays. Enter is 300ms, exit is
   200ms — both inside the spec's 200–300ms window and never longer.

   Accessibility wiring is built in: `role="dialog"` + `aria-modal`, labelled by
   its own heading, Escape to dismiss, focus moved in on open and restored on
   close, and background scroll locked while it is open.

   Under `prefers-reduced-motion` the slide is dropped entirely and the panel
   cross-fades in place.
   ========================================================================== */

export type PanelSide = 'right' | 'left' | 'bottom' | 'center'

export type PanelProps = {
  open: boolean
  onClose?: () => void
  side?: PanelSide
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Width for side panels / max-width for centred dialogs. */
  size?: 'sm' | 'md' | 'lg'
  /** Clicking the scrim dismisses. Default true. */
  dismissOnBackdrop?: boolean
  className?: string
}

const SIZES = {
  sm: { side: 'w-full max-w-sm', center: 'w-full max-w-sm' },
  md: { side: 'w-full max-w-md', center: 'w-full max-w-md' },
  lg: { side: 'w-full max-w-xl', center: 'w-full max-w-lg' },
} as const

function hiddenOffset(side: PanelSide): Record<string, string | number> {
  switch (side) {
    case 'right':
      return { x: '100%' }
    case 'left':
      return { x: '-100%' }
    case 'bottom':
      return { y: '100%' }
    default:
      return { y: 12 }
  }
}

function anchorClass(side: PanelSide) {
  switch (side) {
    case 'right':
      return 'inset-y-0 right-0 h-full'
    case 'left':
      return 'inset-y-0 left-0 h-full'
    case 'bottom':
      return 'inset-x-0 bottom-0 max-h-[85vh]'
    default:
      return 'inset-0 m-auto max-h-[85vh]'
  }
}

export function Panel({
  open,
  onClose,
  side = 'right',
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
  className,
}: PanelProps) {
  const reduce = useReducedMotion()
  const titleId = React.useId()
  const descId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)
  const restoreFocusTo = React.useRef<HTMLElement | null>(null)

  // Escape to dismiss + focus management.
  React.useEffect(() => {
    if (!open) return

    restoreFocusTo.current = document.activeElement as HTMLElement | null
    // Focus the panel itself rather than the first control, so a screen reader
    // reads the dialog's label before its contents.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      restoreFocusTo.current?.focus?.()
    }
  }, [open, onClose])

  // Lock background scroll while open.
  React.useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Under reduced motion both states are pure opacity, so the panel cross-fades.
  const closedState = reduce ? { opacity: 0 } : { ...hiddenOffset(side), opacity: 0 }
  const openState = reduce
    ? { opacity: 1 }
    : side === 'right' || side === 'left'
      ? { x: 0, opacity: 1 }
      : { y: 0, opacity: 1 }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <motion.div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.base, ease: ease.entrance }}
            onClick={dismissOnBackdrop ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            initial={closedState as never}
            animate={openState as never}
            exit={closedState as never}
            transition={{ duration: dur.slow, ease: ease.entrance }}
            className={cn(
              'absolute flex flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--elev-3)]',
              // A bottom sheet only rounds its top edge; side/centre panels round fully.
              side === 'bottom'
                ? 'rounded-t-[var(--radius-sheet)] rounded-b-none'
                : 'rounded-[var(--radius-sheet)]',
              anchorClass(side),
              SIZES[size][side === 'center' ? 'center' : 'side'],
              focusRing,
              className,
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-5">
              <div>
                <h2 id={titleId} className="font-display text-lg font-semibold text-[var(--color-ink)]">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                    {description}
                  </p>
                ) : null}
              </div>
              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    'rounded-[var(--radius-control)] p-1.5 text-[var(--color-ink-muted)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-neutral-tint)] hover:text-[var(--color-ink)]',
                    focusRing,
                  )}
                >
                  <IconClose className="text-base" />
                  <span className="sr-only">Close</span>
                </button>
              ) : null}
            </header>

            <div className="flex-1 overflow-y-auto p-5">{children}</div>

            {footer ? <footer className="border-t border-[var(--color-border)] p-5">{footer}</footer> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
