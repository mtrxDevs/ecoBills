import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Button,
  GlassSurface,
  IconBox,
  IconCart,
  IconChart,
  IconGear,
  IconGrid,
  IconLogout,
  IconReceipt,
  IconUsers,
  cn,
  focusRing,
  pageTransition,
  spring,
  useReducedMotion,
  type IconProps,
} from '@ecobills/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/store'

const DASHBOARD_ONLY = (import.meta as any).env?.VITE_DASHBOARD_ONLY === 'true'

/**
 * The sidebar IA is unchanged from v0.1.1: the same six destinations in the
 * same order, and the same DASHBOARD_ONLY filter. Only the presentation moved.
 * Icons are from the shared 1.5px line set — never emoji (spec §7).
 */
const ITEMS: Array<{ to: string; label: string; end?: boolean; icon: (p: IconProps) => React.JSX.Element }> = [
  { to: '/', label: 'Dashboard', end: true, icon: IconGrid },
  { to: '/inventory', label: 'Inventory', icon: IconBox },
  { to: '/billing', label: 'Billing', icon: IconReceipt },
  { to: '/customers', label: 'Customers', icon: IconUsers },
  { to: '/orders', label: 'Orders', icon: IconCart },
  { to: '/reports', label: 'Reports', icon: IconChart },
  { to: '/settings', label: 'Settings', icon: IconGear },
]

/** Shared id for the sliding active indicator, so it animates between items. */
const ACTIVE_INDICATOR_ID = 'sidebar-active-indicator'

export function Layout({ children }: { children: React.ReactNode }) {
  const { me, setMe } = useMe()
  const nav = useNavigate()
  const location = useLocation()
  const reduce = useReducedMotion()
  const visible = DASHBOARD_ONLY ? ITEMS.filter((i) => ['/', '/orders'].includes(i.to)) : ITEMS

  // Page cross-fade, straight from the motion tokens: 240ms, opacity-first,
  // and a pure cross-fade under reduced motion.
  const page = pageTransition(reduce)

  return (
    <div className="flex min-h-screen">
      {/* Floating glass rail — the preset-06 "floating panels" note, restrained
          to the one surface that is always on screen. */}
      <GlassSurface
        as="aside"
        className="sticky top-0 z-20 flex h-screen w-14 shrink-0 flex-col border-r p-2 md:w-56 md:p-4"
        aria-label="Primary"
      >
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="ecoBills"
            className="h-9 w-9 shrink-0 rounded-[var(--radius-control)] object-cover"
          />
          <span className="hidden font-display text-xl font-bold text-[var(--color-ink)] md:inline">
            <span className="text-[var(--color-accent-text)]">eco</span>Bills
          </span>
        </div>
        <div className="mb-4 mt-0.5 hidden text-xs text-[var(--color-ink-subtle)] md:block">mtrxWorks</div>

        <nav className="mt-4 flex flex-col gap-1 md:mt-0">
          {visible.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-sm font-medium',
                    'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]',
                    focusRing,
                    isActive
                      ? 'text-[var(--color-accent-text)]'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/*
                      The active indicator is ONE element shared across the nav
                      via layoutId, so switching tabs slides it instead of
                      cross-fading two highlights.

                      Under reduced motion it is rendered as a plain div with no
                      shared layout, so there is no transform at all.
                    */}
                    {isActive ? (
                      reduce ? (
                        <span className="absolute inset-0 rounded-[var(--radius-control)] bg-[var(--color-accent-tint)]" aria-hidden="true" />
                      ) : (
                        <motion.span
                          layoutId={ACTIVE_INDICATOR_ID}
                          className="absolute inset-0 rounded-[var(--radius-control)] bg-[var(--color-accent-tint)]"
                          transition={spring.default}
                          aria-hidden="true"
                        />
                      )
                    ) : (
                      <span
                        className="absolute inset-0 rounded-[var(--radius-control)] bg-transparent transition-colors duration-[var(--dur-fast)] group-hover:bg-[var(--color-neutral-tint)]"
                        aria-hidden="true"
                      />
                    )}

                    <Icon className="relative shrink-0 text-base" />
                    <span className="relative hidden md:inline">{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
          <div className="hidden min-w-0 md:block">
            <div className="truncate text-sm font-medium text-[var(--color-ink)]">{me?.user?.name}</div>
            <div className="text-xs capitalize text-[var(--color-ink-subtle)]">{me?.user?.role}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start md:w-full"
            onClick={async () => {
              await api.post('/auth/logout')
              setMe(null)
              nav('/login')
            }}
          >
            <IconLogout className="text-base" />
            <span className="hidden md:inline">Log out</span>
            <span className="sr-only md:hidden">Log out</span>
          </Button>
        </div>
      </GlassSurface>

      {/*
        Was `key={location.pathname}` against the global `location`, animated
        with a hardcoded `duration: 0.18`. It now reads the router's location
        (so the cross-fade actually keys on navigation) and takes its numbers
        from the motion tokens, including the reduced-motion fallback.
      */}
      <motion.main
        key={location.pathname}
        initial={page.initial as never}
        animate={page.animate as never}
        transition={page.transition as never}
        className="min-w-0 flex-1 p-4 md:p-6"
      >
        {children}
      </motion.main>
    </div>
  )
}
