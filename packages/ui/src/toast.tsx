import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from './primitives'
import { dur, ease } from './motion-tokens'
import { useReducedMotion } from './motion'
import { IconAlert, IconCheck, IconClose, IconInfo } from './icons'

/* ==========================================================================
   LiveRegion + Toast
   --------------------------------------------------------------------------
   The announcement contract: the live regions are mounted by ToastProvider as
   soon as the app renders, EMPTY, and only their text content is ever changed.
   Injecting a whole new aria-live element is unreliable in every screen reader,
   so we never do it.

   Two regions, because the two cases need different urgency:
     role="status" / aria-live="polite"     success + info
     role="alert"  / aria-live="assertive"  errors

   The visible toast stack carries no live-region semantics of its own — it is
   plain content with a dismiss button, so the message is never announced twice.
   ========================================================================== */

export type ToastTone = 'success' | 'error' | 'info'

export type Toast = {
  id: string
  tone: ToastTone
  title: string
  description?: string
  /** ms before auto-dismiss; `0` keeps it until dismissed. */
  duration: number
}

export type ToastApi = {
  success: (title: string, description?: string) => string
  error: (title: string, description?: string) => string
  info: (title: string, description?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

/** Errors stay longer — the shop owner needs to read what went wrong. */
const DURATIONS: Record<ToastTone, number> = { success: 5000, info: 5000, error: 9000 }

/**
 * A persistently-mounted live region. Use it directly only if you are building
 * a different notification surface; prefer `useToast()`.
 */
export function LiveRegion({
  tone = 'polite',
  children,
  className,
}: {
  tone?: 'polite' | 'assertive'
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'assertive' ? 'alert' : 'status'}
      aria-live={tone}
      aria-atomic="true"
      className={cn('sr-only', className)}
    >
      {children}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const [announce, setAnnounce] = React.useState<{ polite: string; assertive: string }>({
    polite: '',
    assertive: '',
  })

  // A repeat of an identical message would not change the DOM text, so a screen
  // reader would stay silent. Alternating a trailing hair space guarantees the
  // node's content differs on every announcement.
  const pulse = React.useRef(false)

  const timers = React.useRef(new Map<string, number>())

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = React.useCallback(
    (tone: ToastTone, title: string, description?: string): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const duration = DURATIONS[tone]
      setToasts((prev) => [...prev, { id, tone, title, description, duration }])

      pulse.current = !pulse.current
      const text = description ? `${title}. ${description}` : title
      const decorated = pulse.current ? `${text}\u00A0` : text
      setAnnounce((prev) => (tone === 'error' ? { ...prev, assertive: decorated } : { ...prev, polite: decorated }))

      if (duration > 0) {
        timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
      }
      return id
    },
    [dismiss],
  )

  React.useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current.clear()
    },
    [],
  )

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (title, description) => push('success', title, description),
      error: (title, description) => push('error', title, description),
      info: (title, description) => push('info', title, description),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Both regions exist from the first render, before any content. */}
      <LiveRegion tone="polite">{announce.polite}</LiveRegion>
      <LiveRegion tone="assertive">{announce.assertive}</LiveRegion>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>')
  return ctx
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: dur.base, ease: ease.entrance }}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-card)] border p-4 shadow-[var(--elev-3)]',
              'bg-[var(--color-surface)] border-[var(--color-border)]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                t.tone === 'success' && 'bg-[var(--color-accent-tint)] text-[var(--color-success-text)]',
                t.tone === 'error' && 'bg-[var(--color-danger-tint)] text-[var(--color-danger-text)]',
                t.tone === 'info' && 'bg-[var(--color-neutral-tint)] text-[var(--color-ink-muted)]',
              )}
            >
              {t.tone === 'success' ? (
                <IconCheck className="text-sm" />
              ) : t.tone === 'error' ? (
                <IconAlert className="text-sm" />
              ) : (
                <IconInfo className="text-sm" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-ink)]">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{t.description}</p> : null}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className={cn(
                'rounded-[var(--radius-control)] p-1 text-[var(--color-ink-muted)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-neutral-tint)] hover:text-[var(--color-ink)]',
                'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]',
              )}
            >
              <IconClose className="text-sm" />
              <span className="sr-only">Dismiss</span>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
