import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHint,
  PageTitle,
  SkeletonList,
  Stat,
  focusRing,
  useToast,
} from '@ecobills/ui'
import { api, money } from '../lib/api'
import { useNet } from '../lib/offline/net'
import { customerDetailFromCache, type CachedCustomerView } from '../lib/offline/sync'
import { RecordPaymentDialog, ageLabel } from '../components/RecordPayment'
import { CustomerDialog } from './Customers'

/**
 * One customer: derived overview, their invoices/payments, and the
 * chronological statement ledger. Nothing here is stored — every figure is
 * computed from invoices, payments and credit notes on the server.
 */
export function CustomerDetail() {
  const { id } = useParams()
  const online = useNet((s) => s.online)
  if (!online) return <OfflineCustomerDetail id={id || ''} />
  return <OnlineCustomerDetail id={id || ''} />
}

function OnlineCustomerDetail({ id }: { id: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const [paying, setPaying] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [invPage, setInvPage] = useState(1)
  const [stmtPage, setStmtPage] = useState(1)

  const detailQ = useQuery({ queryKey: ['customer', id], queryFn: () => api.get(`/customers/${id}`) })
  const invQ = useQuery({
    queryKey: ['customer', id, 'invoices', invPage],
    queryFn: () => api.get(`/customers/${id}/invoices?page=${invPage}&pageSize=10`),
    enabled: detailQ.isSuccess,
  })
  const payQ = useQuery({
    queryKey: ['customer', id, 'payments'],
    queryFn: () => api.get(`/customers/${id}/payments?page=1&pageSize=10`),
    enabled: detailQ.isSuccess,
  })
  const stmtQ = useQuery({
    queryKey: ['customer', id, 'statement', stmtPage],
    queryFn: () => api.get(`/customers/${id}/statement?page=${stmtPage}&pageSize=20`),
    enabled: detailQ.isSuccess,
  })

  function refreshAll() {
    setPaying(null)
    qc.invalidateQueries({ queryKey: ['customer', id] })
  }

  if (detailQ.isLoading) {
    return (
      <div aria-busy="true">
        <PageTitle>Customer</PageTitle>
        <div className="mt-4">
          <SkeletonList rows={5} />
        </div>
      </div>
    )
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <div>
        <PageTitle>Customer</PageTitle>
        <div className="mt-4">
          <ErrorState
            title="Could not load this customer"
            description="They may have been removed, or the link is wrong."
            detail={detailQ.error instanceof Error ? detailQ.error.message : undefined}
            onRetry={() => void detailQ.refetch()}
          />
          <p className="mt-3 text-sm">
            <Link className={`underline underline-offset-2 ${focusRing}`} to="/customers">
              Back to customers
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const c = detailQ.data
  const s = c.stats || { invoiceCount: 0, totalSales: 0, totalPaid: 0, creditTotal: 0, outstanding: 0, overdue: 0, lastTransactionAt: null }
  const invoices: any[] = invQ.data?.data || []
  const payments: any[] = payQ.data?.data || []
  const stmt = stmtQ.data

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link className={`text-[var(--color-ink-muted)] underline underline-offset-2 hover:no-underline ${focusRing}`} to="/customers">
          ← Customers
        </Link>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageTitle>{c.name}</PageTitle>
          <PageHint>
            {[c.phone, c.email, c.gstin].filter(Boolean).join(' · ') || 'No contact details yet'}
            {!c.isActive ? ' · Inactive' : ''}
          </PageHint>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/billing?customer=${c.id}`)}>
            New bill
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Lifetime sales" footnote={`${s.invoiceCount} bills`}>
          <span className="tnum">{money(s.totalSales)}</span>
        </Stat>
        <Stat label="Paid" footnote="Verified payment records">
          <span className="tnum">{money(s.totalPaid)}</span>
        </Stat>
        <Stat label="Outstanding" tone={s.outstanding > 0 ? 'warn' : 'default'} footnote={s.overdue > 0 ? `${money(s.overdue)} overdue` : 'Nothing overdue'}>
          <span className="tnum">{money(s.outstanding)}</span>
        </Stat>
        <Stat label="Last transaction" footnote={s.lastTransactionAt ? new Date(s.lastTransactionAt).toLocaleDateString('en-IN') : undefined}>
          <span className="tnum">{s.creditTotal > 0 ? `−${money(s.creditTotal)} credited` : '—'}</span>
        </Stat>
      </div>

      <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-[var(--color-ink)]">Bills</h2>
      {!invQ.data ? (
        <SkeletonList rows={3} />
      ) : !invoices.length ? (
        <EmptyState compact icon="receipt" title="No bills yet" description="Their first bill will appear here." action={<Button size="sm" onClick={() => navigate(`/billing?customer=${c.id}`)}>Create bill</Button>} />
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <ul className="divide-y divide-[var(--color-border)]">
              {invoices.map((inv: any) => {
                const paid = inv.amountPaid || 0
                const open = inv.status === 'unpaid' || inv.status === 'partial'
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="tnum font-medium text-[var(--color-ink)]">{inv.invoiceNumber}</span>
                    <span className="tnum text-xs text-[var(--color-ink-subtle)]">
                      {new Date(inv.issueDate).toLocaleDateString('en-IN')}
                      {inv.dueDate ? ` · due ${new Date(inv.dueDate).toLocaleDateString('en-IN')}` : ''}
                    </span>
                    <span className="tnum ml-auto text-[var(--color-ink)]">{money(inv.grandTotal)}</span>
                    <Badge tone={inv.status === 'void' ? 'bad' : paid > 0 ? 'ok' : 'muted'}>
                      <span className="capitalize">{inv.status}</span>
                    </Badge>
                    {open ? (
                      <span className="tnum text-xs text-[var(--color-warn-text)]">
                        {money(inv.grandTotal - paid)} due · {ageLabel(inv.issueDate)}
                      </span>
                    ) : null}
                    {open ? (
                      <button
                        type="button"
                        className={`rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-accent-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
                        onClick={() => setPaying(inv)}
                      >
                        Record payment
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Card>
          {invQ.data.totalPages > 1 ? (
            <Pager page={invPage} totalPages={invQ.data.totalPages} total={invQ.data.total} unit="bills" onPage={setInvPage} />
          ) : null}
        </>
      )}

      <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-[var(--color-ink)]">Payments received</h2>
      {!payQ.data ? (
        <SkeletonList rows={2} />
      ) : !payments.length ? (
        <EmptyState compact icon="trend" title="No payments yet" description="Collections against their bills will appear here." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <ul className="divide-y divide-[var(--color-border)]">
            {payments.map((p: any) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="tnum font-medium text-[var(--color-ink)]">{money(p.amount)}</span>
                <span className="text-[var(--color-ink-muted)]">{p.method === 'bank_transfer' ? 'Bank transfer' : p.method[0].toUpperCase() + p.method.slice(1)}</span>
                <span className="tnum text-xs text-[var(--color-ink-subtle)]">
                  {new Date(p.paidAt).toLocaleDateString('en-IN')} · {p.invoice?.invoiceNumber || ''}
                  {p.note ? ` · ${p.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Statement</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            toast.info('Printing statement', 'Use your browser print dialog to save it as PDF.')
            window.setTimeout(() => window.print(), 300)
          }}
        >
          Print
        </Button>
      </div>
      {!stmt ? (
        <SkeletonList rows={4} />
      ) : !stmt.data.length && stmtPage === 1 ? (
        <EmptyState compact icon="receipt" title="Nothing to state yet" description="Bills, payments and credit notes will line up here chronologically." />
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  <th scope="col" className="px-4 py-2 font-medium">Date</th>
                  <th scope="col" className="px-4 py-2 font-medium">Document</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Debit</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Credit</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {stmt.data.map((e: any, i: number) => (
                  <tr key={`${e.date}-${e.doc}-${i}`}>
                    <td className="tnum px-4 py-2 text-[var(--color-ink-muted)]">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-2 text-[var(--color-ink)]">
                      <span className="mr-2 rounded-full bg-[var(--color-neutral-tint)] px-2 py-0.5 text-xs capitalize">{e.kind.replace('_', ' ')}</span>
                      {e.doc}
                    </td>
                    <td className="tnum px-4 py-2 text-right text-[var(--color-ink)]">{e.debit ? money(e.debit) : '—'}</td>
                    <td className="tnum px-4 py-2 text-right text-[var(--color-ink)]">{e.credit ? money(e.credit) : '—'}</td>
                    <td className="tnum px-4 py-2 text-right font-medium text-[var(--color-ink)]">{money(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="tnum mt-2 text-right text-sm text-[var(--color-ink-muted)]">
            {stmtPage > 1 ? `Opened at ${money(stmt.openingBalance)} · ` : ''}Balance due {money(stmt.balance)}
          </p>
          {stmt.totalPages > 1 ? (
            <Pager page={stmtPage} totalPages={stmt.totalPages} total={stmt.total} unit="entries" onPage={setStmtPage} />
          ) : null}
        </>
      )}

      {editing ? (
        <CustomerDialog
          customer={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            refreshAll()
          }}
        />
      ) : null}
      {paying ? (
        <RecordPaymentDialog inv={paying} onClose={() => setPaying(null)} onRecorded={refreshAll} />
      ) : null}
    </div>
  )
}

function Pager({ page, totalPages, total, unit, onPage }: { page: number; totalPages: number; total: number; unit: string; onPage: (p: number) => void }) {  return (
    <div className="mt-3 flex items-center justify-between text-sm text-[var(--color-ink-muted)]">
      <span className="tnum">
        Page {page} of {totalPages} · {total} {unit}
      </span>
      <span className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Prev
        </Button>
        <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next →
        </Button>
      </span>
    </div>
  )
}

/**
 * Offline customer view: overview + statement assembled from the 30-day
 * cache. Recording, editing and new bills need a connection � collecting
 * money against a stale balance would be guessing, so those stay online-only.
 */
function OfflineCustomerDetail({ id }: { id: string }) {
  const [view, setView] = useState<CachedCustomerView | null | undefined>(undefined)

  useEffect(() => {
    customerDetailFromCache(id).then(setView).catch(() => setView(null))
  }, [id])

  if (view === undefined) {
    return (
      <div aria-busy="true">
        <PageTitle>Customer</PageTitle>
        <div className="mt-4">
          <SkeletonList rows={5} />
        </div>
      </div>
    )
  }

  if (!view) {
    return (
      <div>
        <PageTitle>Customer</PageTitle>
        <div className="mt-4">
          <EmptyState
            icon="users"
            title="Not in the offline cache"
            description="This customer has no activity in the last 30 days, or the device never synced. Connect once to download them."
          />
          <p className="mt-3 text-sm">
            <Link className={`underline underline-offset-2 ${focusRing}`} to="/customers">
              Back to customers
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const { customer: c, stats: s, invoices, statement } = view

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link className={`text-[var(--color-ink-muted)] underline underline-offset-2 hover:no-underline ${focusRing}`} to="/customers">
          ? Customers
        </Link>
      </p>
      <PageTitle>{c.name}</PageTitle>
      <PageHint className="mb-4">Offline view � figures through the last sync. Payments and edits need a connection.</PageHint>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Lifetime sales" footnote={`${s.invoiceCount} bills (30 days)`}>
          <span className="tnum">{money(s.totalSales)}</span>
        </Stat>
        <Stat label="Paid" footnote="Verified payment records">
          <span className="tnum">{money(s.totalPaid)}</span>
        </Stat>
        <Stat label="Outstanding" tone={s.outstanding > 0 ? "warn" : "default"}>
          <span className="tnum">{money(s.outstanding)}</span>
        </Stat>
        <Stat label="Statement balance" footnote="Debits minus credits">
          <span className="tnum">{money(statement.balance)}</span>
        </Stat>
      </div>

      <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-[var(--color-ink)]">Bills (30 days)</h2>
      {!invoices.length ? (
        <EmptyState compact icon="receipt" title="No recent bills" description="Nothing billed to them in the last 30 days." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <ul className="divide-y divide-[var(--color-border)]">
            {invoices.map((inv: any) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="tnum font-medium text-[var(--color-ink)]">{inv.invoiceNumber}</span>
                <span className="tnum text-xs text-[var(--color-ink-subtle)]">{new Date(inv.issueDate).toLocaleDateString("en-IN")}</span>
                <span className="tnum ml-auto text-[var(--color-ink)]">{money(inv.grandTotal)}</span>
                <Badge tone={inv.status === "void" ? "bad" : (inv.amountPaid || 0) > 0 ? "ok" : "muted"}>
                  <span className="capitalize">{inv.status}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-[var(--color-ink)]">Statement</h2>
      {!statement.entries.length ? (
        <EmptyState compact icon="receipt" title="Nothing to state yet" description="No activity in the last 30 days." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                <th scope="col" className="px-4 py-2 font-medium">Date</th>
                <th scope="col" className="px-4 py-2 font-medium">Document</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Debit</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Credit</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {statement.entries.map((e: any, i: number) => (
                <tr key={`${e.date}-${e.doc}-${i}`}>
                  <td className="tnum px-4 py-2 text-[var(--color-ink-muted)]">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{e.doc}</td>
                  <td className="tnum px-4 py-2 text-right text-[var(--color-ink)]">{e.debit ? money(e.debit) : "�"}</td>
                  <td className="tnum px-4 py-2 text-right text-[var(--color-ink)]">{e.credit ? money(e.credit) : "�"}</td>
                  <td className="tnum px-4 py-2 text-right font-medium text-[var(--color-ink)]">{money(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
