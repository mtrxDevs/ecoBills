import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  CountUp,
  EmptyState,
  ErrorState,
  PageHint,
  PageTitle,
  SkeletonList,
  SkeletonStats,
  StaggerItem,
  StaggerList,
  Stat,
} from '@ecobills/ui'
import { api, money } from '../lib/api'
import { useMe } from '../lib/store'
import { useNet } from '../lib/offline/net'
import { summaryFromCache, syncedAt } from '../lib/offline/sync'

/**
 * Time-aware greeting. The v0.1.1 heading hardcoded "Good morning" with a sun
 * emoji; spec §7 rules out emoji, and a fixed greeting is wrong half the day
 * for a shop that opens early and closes late.
 */
function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const { me } = useMe()
  const online = useNet((s) => s.online)
  // Unchanged data source and shape: GET /dashboard/summary.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dash'],
    queryFn: () => api.get('/dashboard/summary'),
    retry: online ? 3 : false,
  })
  // Offline reads come through a query like everything else — no
  // setState-in-effect, no parallel state to drift out of sync.
  const offlineQ = useQuery({
    queryKey: ['dash-offline'],
    queryFn: async () => ({ summary: await summaryFromCache(), age: await syncedAt() }),
    enabled: !online && (isError || !data),
    retry: false,
    staleTime: 30000,
  })
  const offlineView = !online && (isError || !data)
  const view = offlineView ? offlineQ.data?.summary : data
  const cacheAge = offlineQ.data?.age ?? null

  if (isLoading && online) return <DashboardSkeleton />
  if ((isError || !data) && !view) {
    if (!online) {
      return (
        <EmptyState
          icon="trend"
          title="No offline data yet"
          description="Connect once so the last 30 days download to this device — then the dashboard works without internet."
        />
      )
    }
    return (
      <ErrorState
        title="Could not load your dashboard"
        description="The shop figures could not be fetched. Nothing has been changed. Check that the API is running, then try again."
        detail={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    )
  }

  const lowStock: any[] = view?.lowStock || []

  return (
    <div>
      <PageTitle>
        {greeting(new Date().getHours())}
        {me?.user?.name ? `, ${me.user.name.split(' ')[0]}` : ''}
      </PageTitle>
      <PageHint className="mb-4">
        Here's your shop at a glance.
        {offlineView && view ? (
          <> Data through {cacheAge ? new Date(cacheAge).toLocaleString('en-IN') : 'the last sync'} — offline.</>
        ) : null}
      </PageHint>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat
          label="Today's sales"
          footnote={
            <>
              <CountUp value={view.todayInvoices} /> {view.todayInvoices === 1 ? 'bill' : 'bills'} today
            </>
          }
        >
          <CountUp value={view.todaySales} format={(n) => money(n)} />
        </Stat>

        <Stat label="Low stock" tone="warn" footnote="Items at or below reorder level">
          <CountUp value={view.lowStockCount} />
        </Stat>

        <Stat
          label="Pending orders"
          footnote={
            <Link
              to="/orders"
              className="rounded-[var(--radius-sm)] font-medium text-[var(--color-accent-text)] underline underline-offset-2 outline-none hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
            >
              View orders
            </Link>
          }
        >
          <CountUp value={view.pendingOrders} />
        </Stat>
      </div>

      <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-[var(--color-ink)]">Needs attention</h2>

      {!lowStock.length ? (
        <EmptyState
          icon="box"
          title="Stock looks healthy"
          description="Nothing is below its reorder level right now. Add items in Inventory to start billing."
          action={
            <Link to="/inventory">
              <Button variant="primary">Go to Inventory</Button>
            </Link>
          }
        />
      ) : (
        <Card padded={false} className="overflow-hidden">
          {/* One gesture for the whole list; the delay is capped by the stagger
              token so a long list cannot make the user wait. */}
          <StaggerList className="divide-y divide-[var(--color-border)]">
            {lowStock.map((l: any, i: number) => (
              <StaggerItem key={l.id} index={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-sm text-[var(--color-ink)]">
                  {l.name} <span className="tnum text-xs text-[var(--color-ink-subtle)]">({l.sku})</span>
                </span>
                <Badge tone="warn">
                  <CountUp value={l.currentStock} /> left
                </Badge>
              </StaggerItem>
            ))}
          </StaggerList>
        </Card>
      )}

      {lowStock.length ? (
        <div className="mt-3">
          <Link to="/orders">
            <Button variant="secondary" size="sm">
              Review low-stock order
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  )
}

/** Mirrors the final layout: three KPI tiles, then the attention list. */
function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading your dashboard…
      </span>
      <SkeletonStats />
      <div className="mt-6 h-5 w-40 rounded-[var(--radius-sm)] bg-[var(--color-skeleton)]" />
      <SkeletonList rows={3} className="mt-2" />
    </div>
  )
}
