import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'
import {
  Card,
  CountUp,
  EmptyState,
  ErrorState,
  PageHint,
  PageTitle,
  SkeletonChart,
  Stat,
} from '@ecobills/ui'
import { api, money } from '../lib/api'
import { useChartColors } from '../lib/chart-theme'

/**
 * Profit & loss. Endpoint, range and derivation are unchanged:
 *   GET /reports/pnl?from=…&to=…   (owner-only, accrual basis, net of credit notes)
 *
 * Presentation changes: the KPI figures count up instead of cutting, the charts
 * take their colours from the live design tokens, and the screen gained a
 * loading skeleton that mirrors its real layout plus an error state. The
 * owner-only path is preserved and is now a designed empty state rather than a
 * bare paragraph.
 */
export function Reports() {
  const [from] = useState(() => new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10))
  const [to] = useState(() => new Date().toISOString().slice(0, 10))
  const c = useChartColors()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['pnl', from, to],
    queryFn: () => api.get(`/reports/pnl?from=${from}&to=${to}`),
  })

  if (isLoading) return <ReportsSkeleton />

  // Staff hitting an owner-only endpoint get a 403 ("forbidden") — that is a
  // permission state, not a failure, so it gets the calm explanation.
  const forbidden = isError && /forbidden/i.test(error instanceof Error ? error.message : '')

  if (forbidden) {
    return (
      <div>
        <PageTitle>Profit &amp; loss</PageTitle>
        <EmptyState
          className="mt-4"
          icon="chart"
          title="Reports are owner-only"
          description="Your account does not have permission to view the profit and loss report. Ask the owner for access."
        />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load the profit and loss report"
        description="The figures could not be fetched. Nothing has been changed. Try again."
        detail={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    )
  }

  const trend: any[] = data.trend || []
  const topItems: any[] = data.topItems || []
  const hasAnySales = Number(data.revenue || 0) !== 0 || trend.some((d: any) => Number(d.total) !== 0)

  return (
    <div>
      <PageTitle>Profit &amp; loss</PageTitle>
      <PageHint className="mb-4">
        Accrual basis · net of credit notes · <span className="tnum">{from}</span> → <span className="tnum">{to}</span>
      </PageHint>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <ReportStat label="Revenue" value={data.revenue} />
        <ReportStat label="COGS" value={data.cogs} />
        <ReportStat label="Gross profit" value={data.grossProfit} />
        <ReportStat label="Net profit" value={data.netProfit} emphasised />
      </div>

      {!hasAnySales ? (
        <EmptyState
          className="mt-4"
          icon="trend"
          title="No sales in this period"
          description="Nothing was billed in the last 30 days. Create a bill and the trend will start filling in."
        />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Revenue trend</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid stroke={c.grid} strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: c.subtle }} stroke={c.grid} />
                <YAxis tick={{ fontSize: 10, fill: c.subtle }} stroke={c.grid} width={56} />
                <Tooltip
                  formatter={(v: any) => money(v)}
                  contentStyle={{
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    borderRadius: 12,
                    fontSize: 12,
                    color: c.ink,
                  }}
                  labelStyle={{ color: c.muted }}
                />
                <Line type="monotone" dataKey="total" stroke={c.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Top items by revenue</h2>
            {topItems.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topItems.slice(0, 6)} layout="vertical">
                  <CartesianGrid stroke={c.grid} strokeDasharray="3 6" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: c.subtle }} stroke={c.grid} />
                  <Tooltip
                    formatter={(v: any) => money(v)}
                    contentStyle={{
                      background: c.surface,
                      border: `1px solid ${c.border}`,
                      borderRadius: 12,
                      fontSize: 12,
                      color: c.ink,
                    }}
                    labelStyle={{ color: c.muted }}
                  />
                  <Bar dataKey="revenue" fill={c.accent} radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState compact icon="search" title="No item sales" description="No item contributed revenue in this period." className="border-0 bg-transparent" />
            )}
          </Card>
        </div>
      )}

      <Card className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-[var(--color-ink-muted)]">Cash tied up in stock (last-cost):</span>
        <span className="font-display text-lg font-bold text-[var(--color-ink)]">
          <CountUp value={data.stockValue} format={(n) => money(n)} />
        </span>
      </Card>
    </div>
  )
}

function ReportStat({ label, value, emphasised = false }: { label: string; value: number; emphasised?: boolean }) {
  const negative = Number(value) < 0
  return (
    <Stat label={label} tone={negative ? 'warn' : 'default'} footnote={emphasised ? 'After all costs' : undefined}>
      <CountUp value={value} format={(n) => money(n)} />
    </Stat>
  )
}

/** Mirrors the real layout: four KPI tiles, then the two chart cards. */
function ReportsSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading the profit and loss report…
      </span>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="h-3 w-20 rounded-[var(--radius-sm)] bg-[var(--color-skeleton)]" />
            <div className="mt-3 h-7 w-28 rounded-[var(--radius-sm)] bg-[var(--color-skeleton-strong)]" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </div>
  )
}
