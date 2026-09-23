import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { AmbientField, Skeleton, ToastProvider } from '@ecobills/ui'
import { Layout } from './components/Layout'
import { Login, Start } from './screens/Auth'
import { Dashboard } from './screens/Dashboard'
import { Inventory } from './screens/Inventory'
import { Billing } from './screens/Billing'
import { Customers } from './screens/Customers'
import { CustomerDetail } from './screens/CustomerDetail'
import { Orders } from './screens/Orders'
import { Reports } from './screens/Reports'
import { Settings } from './screens/Settings'
import { api } from './lib/api'
import { useMe } from './lib/store'

const DASHBOARD_ONLY = (import.meta as any).env?.VITE_DASHBOARD_ONLY === 'true'
const qc = new QueryClient()

/**
 * Boot state while `/auth/me` resolves. It mirrors the shell it is about to
 * become — sidebar rail plus header — rather than showing a centred spinner,
 * per spec §7 ("skeletons that mirror the final layout, never a generic
 * spinner"). Behaviour is unchanged: it still redirects to /login on failure.
 */
function BootSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-live="polite">
      <div className="w-56 shrink-0 border-r border-[var(--color-border)] p-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-3 w-20" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading your shop…</span>
    </div>
  )
}

function Guard({ children }: { children: JSX.Element }) {
  const { me, setMe } = useMe()
  const nav = useNavigate()
  useEffect(() => {
    if (!me) api.get('/auth/me').then(setMe).catch(() => nav('/login'))
  }, [me, nav, setMe])
  if (!me) return <BootSkeleton />
  return <Layout>{children}</Layout>
}

export function App() {
  return (
    // `reducedMotion="user"` is the global safety net: Framer Motion itself
    // strips transform and layout animations when the OS asks for reduced
    // motion, on top of the per-component gating in @ecobills/ui.
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={qc}>
        {/* ToastProvider mounts the polite + assertive live regions up front.
            They exist, empty, before any message is ever announced. */}
        <ToastProvider>
          {/*
            The ambient field is a sibling of the router, not a child of any
            screen: it must be `position: fixed` outside every scrolling
            container, and it must never sit inside a transformed ancestor.
          */}
          <div className="relative min-h-screen">
            <AmbientField className="z-0" />
            <div className="relative z-10">
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/start" element={<Start />} />
                  {DASHBOARD_ONLY ? (
                    <>
                      {/* Mobile dashboard build: invoice creation routes NOT shipped (§8 DoD) */}
                      <Route path="/" element={<Guard><Dashboard /></Guard>} />
                      <Route path="/orders" element={<Guard><Orders /></Guard>} />
                      <Route path="*" element={<Navigate to="/" />} />
                    </>
                  ) : (
                    <>
                      <Route path="/" element={<Guard><Dashboard /></Guard>} />
                      <Route path="/inventory" element={<Guard><Inventory /></Guard>} />
                      <Route path="/billing" element={<Guard><Billing /></Guard>} />
                      <Route path="/customers" element={<Guard><Customers /></Guard>} />
                      <Route path="/customers/:id" element={<Guard><CustomerDetail /></Guard>} />
                      <Route path="/orders" element={<Guard><Orders /></Guard>} />
                      <Route path="/reports" element={<Guard><Reports /></Guard>} />
                      <Route path="/settings" element={<Guard><Settings /></Guard>} />
                      <Route path="*" element={<Navigate to="/" />} />
                    </>
                  )}
                </Routes>
              </BrowserRouter>
            </div>
          </div>
        </ToastProvider>
      </QueryClientProvider>
    </MotionConfig>
  )
}
