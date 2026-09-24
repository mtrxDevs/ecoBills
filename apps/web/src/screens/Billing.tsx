import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  CountUp,
  EmptyState,
  ErrorState,
  IconCheck,
  IconClose,
  IconDownload,
  PageHint,
  PageTitle,
  Select,
  SkeletonList,
  StaggerItem,
  StaggerList,
  focusRing,
  motionLimits,
  useToast,
} from '@ecobills/ui'
import { api, apiUrl, money } from '../lib/api'
import { useMe } from '../lib/store'
import { RecordPaymentDialog, ageLabel } from '../components/RecordPayment'
import { useNet } from '../lib/offline/net'
import { readAll } from '../lib/offline/db'
import { enqueueDraft, listDrafts, pushAndRefresh, type DraftOp } from '../lib/offline/sync'

/**
 * Billing. Every endpoint, payload and permission rule is unchanged:
 *   GET  /items  /customers  /invoices
 *   POST /invoices            { customerId, lines: [{ itemId, qty }] }
 *   POST /invoices/:id/payments  { amount, method, note, paidAt? }  (owner+staff)
 *   POST /invoices/:id/void   (owner only, and only when nothing was paid)
 *
 * The recent-bills list now finishes the cashier flow: outstanding balances
 * with age, and a record-payment dialog (amount prefilled to the balance,
 * method/date/note) so "Create bill → Paid by UPI" happens in one place.
 *
 * Presentation changes only: emoji glyphs (✕ / ✓) are replaced by the shared
 * line-icon set, the "Created bill" checkmark is now a morph on the button
 * that caused it, and the recent-bills list gained its missing loading and
 * error states.
 */
export function Billing() {
  const qc = useQueryClient()
  const toast = useToast()
  const { me } = useMe()
  const isOwner = me?.user?.role === 'owner'
  const online = useNet((s) => s.online)
  const [params] = useSearchParams()
  const [customerId, setCustomerId] = useState(() => params.get('customer') || '')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<Array<{ itemId: string; name: string; qty: number; unitPrice: number }>>([])
  const [done, setDone] = useState<any>(null)
  // Drives the Button's success/checkmark-morph state, then releases it.
  const [celebrate, setCelebrate] = useState(false)

  const { data: items } = useQuery({ queryKey: ['items-all'], queryFn: () => api.get('/items'), retry: online ? 3 : false })
  const { data: customers } = useQuery({ queryKey: ['customers', 'dropdown'], queryFn: () => api.get('/customers?pageSize=100'), retry: online ? 3 : false })
  const {
    data: invoices,
    isLoading: invoicesLoading,
    isError: invoicesError,
    error: invoicesErrorObj,
    refetch: refetchInvoices,
  } = useQuery({ queryKey: ['invoices'], queryFn: () => api.get('/invoices'), retry: online ? 3 : false })
  // Offline reads come through queries like everything else.
  const offlineBillsQ = useQuery({
    queryKey: ['invoices-offline'],
    queryFn: () => readAll('invoices'),
    enabled: !online && (invoicesError || !invoices),
    retry: false,
    staleTime: 30000,
  })
  const offlineBills = !online && (invoicesError || !invoices)
  const offlineItemsQ = useQuery({
    queryKey: ['billing-items-offline'],
    queryFn: () => readAll('items'),
    enabled: !online,
    retry: false,
    staleTime: 30000,
  })
  const offlineCustomersQ = useQuery({
    queryKey: ['billing-customers-offline'],
    queryFn: () => readAll('customers'),
    enabled: !online,
    retry: false,
    staleTime: 30000,
  })
  const draftsQ = useQuery({ queryKey: ['outbox'], queryFn: listDrafts })
  useEffect(() => {
    const onOutbox = () => {
      qc.invalidateQueries({ queryKey: ['outbox'] })
    }
    window.addEventListener('ecobills-outbox', onOutbox)
    return () => window.removeEventListener('ecobills-outbox', onOutbox)
  }, [qc])
  const drafts: DraftOp[] = draftsQ.data || []

  const create = useMutation({
    mutationFn: (b: any) => api.post('/invoices', b),
    onSuccess: (inv) => {
      setDone(inv)
      setLines([])
      setCelebrate(true)
      window.setTimeout(() => setCelebrate(false), motionLimits.successHoldMs)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['items'] })
    },
    onError: (e: any) => toast.error('Could not create the bill', e instanceof Error ? e.message : undefined),
  })

  // Offline: search and pick from the 30-day snapshot. Prices shown are the
  // last-synced sale prices; the server reprices nothing — snapshots are
  // taken again at sync time, so the books always reflect live item data.
  const offlineView = !online
  const itemPool: any[] = offlineView ? offlineItemsQ.data ?? [] : items || []
  const customerPool: any[] = offlineView ? offlineCustomersQ.data ?? [] : (customers as any)?.data || []
  const found = itemPool
    .filter(
      (i: any) =>
        !search ||
        (i.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.sku || '').toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 6)
  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const billList: any[] = offlineBills ? offlineBillsQ.data ?? [] : invoices || []
  const [paying, setPaying] = useState<any>(null)

  // Money still owed: unpaid + partial invoices, oldest pressure first.
  const outstanding = billList
    .filter((inv: any) => inv.status === 'unpaid' || inv.status === 'partial')
    .map((inv: any) => ({ ...inv, balance: inv.grandTotal - (inv.amountPaid || 0) }))
    .sort(
      (a: any, b: any) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime(),
    )
  const outstandingTotal = outstanding.reduce((s: number, inv: any) => s + inv.balance, 0)

  // Coming back online pushes queued drafts in creation order, then refreshes
  // every list from what actually landed (numbers assigned server-side).
  const syncingRef = useRef(false)
  useEffect(() => {
    if (!online) return
    if (syncingRef.current) return
    void listDrafts().then((ops) => {
      if (!ops.length) return
      syncingRef.current = true
      pushAndRefresh()
        .then((r) => {
          if (r.failed.length) {
            toast.error(
              `${r.sent} sent, ${r.failed.length} need attention`,
              'Some drafts were rejected (e.g. stock sold meanwhile). Review them below.',
            )
          } else if (r.sent > 0) {
            toast.success(r.sent === 1 ? 'Offline bill sent' : `${r.sent} offline bills sent`)
          }
          qc.invalidateQueries({ queryKey: ['invoices'] })
          qc.invalidateQueries({ queryKey: ['items'] })
          qc.invalidateQueries({ queryKey: ['outbox'] })
        })
        .catch(() => {})
        .finally(() => {
          syncingRef.current = false
        })
    })
  }, [online, qc, toast])

  async function saveDraft() {
    if (!lines.length || create.isPending) return
    try {
      const customer = customerPool.find((c: any) => c.id === customerId)
      await enqueueDraft({
        customerId: customerId || null,
        customerName: customer?.name || 'Walk-in',
        lines: lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, unitPrice: l.unitPrice })),
      })
      setLines([])
      setSearch('')
      toast.success('Bill saved offline', 'It will send itself with the next connection.')
    } catch {
      toast.error('Could not save the draft', 'This device refused the write — try again.')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <PageTitle>New bill</PageTitle>
        <PageHint className="mb-3">Bills are numbered per financial year and cannot be edited after saving.</PageHint>

        <label htmlFor="bill-customer" className="sr-only">
          Customer
        </label>
        <Select id="bill-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Walk-in (no customer)</option>
          {customerPool.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        {/* barcode/HID-ready search field */}
        <div className="mt-3">
          <label htmlFor="bill-search" className="sr-only">
            Add items
          </label>
          <input
            id="bill-search"
            autoFocus
            aria-label="Add items"
            placeholder="Type or scan item name / SKU…"
            className={`w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] ${focusRing}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {search ? (
          <ul className="mt-1 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {found.map((i: any) => (
              <li key={i.id}>
                <button
                  type="button"
                  className={`flex w-full justify-between px-3 py-2 text-left text-sm text-[var(--color-ink)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-surface-2)] ${focusRing}`}
                  onClick={() => {
                    setLines([...lines, { itemId: i.id, name: i.name, qty: 1, unitPrice: i.salePrice }])
                    setSearch('')
                  }}
                >
                  <span>
                    {i.name} <span className="text-[var(--color-ink-subtle)]">{i.sku}</span>
                  </span>
                  <span className="tnum">{money(i.salePrice)}</span>
                </button>
              </li>
            ))}
            {!found.length ? (
              <li className="px-3 py-3 text-center text-sm text-[var(--color-ink-muted)]">No item matches “{search}”.</li>
            ) : null}
          </ul>
        ) : null}

        <Card padded={false} className="mt-3 overflow-hidden">
          {lines.length ? (
            <ul className="divide-y divide-[var(--color-border)]">
              {lines.map((l, i) => (
                <StaggerItem key={`${l.itemId}-${i}`} index={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{l.name}</span>
                  <label htmlFor={`qty-${i}`} className="sr-only">
                    Quantity for {l.name}
                  </label>
                  <input
                    id={`qty-${i}`}
                    type="number"
                    min={0.001}
                    step="any"
                    className={`tnum w-20 rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-2 py-1 text-[var(--color-ink)] ${focusRing}`}
                    value={l.qty}
                    onChange={(e) =>
                      setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))
                    }
                  />
                  <span className="tnum w-24 text-right text-[var(--color-ink)]">{money(Math.round(l.qty * l.unitPrice))}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${l.name}`}
                    className={`rounded-[var(--radius-sm)] p-1 text-[var(--color-ink-muted)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-neutral-tint)] hover:text-[var(--color-danger-text)] ${focusRing}`}
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    <IconClose className="text-sm" />
                  </button>
                </StaggerItem>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon="receipt"
              title="No items on this bill"
              description="Search or scan above to add the first item."
              className="border-0 bg-transparent shadow-none"
            />
          )}
        </Card>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-display text-xl font-bold text-[var(--color-ink)]">
            Total <CountUp value={Math.round(total)} format={(n) => money(n)} />
          </span>
          {online ? (
            <Button
              disabled={!lines.length}
              loading={create.isPending}
              success={celebrate}
              loadingLabel="Creating bill"
              successLabel="Bill created"
              onClick={() =>
                create.mutate({ customerId: customerId || null, lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty })) })
              }
            >
              Create bill
            </Button>
          ) : (
            <Button
              disabled={!lines.length || create.isPending}
              loading={create.isPending}
              loadingLabel="Saving draft"
              onClick={saveDraft}
            >
              Save bill offline
            </Button>
          )}
        </div>
        {offlineView ? (
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Offline — this bill is stored on this device without a number and sends itself when you reconnect. Stock and prices revalidate then.
          </p>
        ) : null}

        {done ? (
          <Card className="mt-3 border-[var(--color-accent)]/40 bg-[var(--color-accent-tint)]">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-accent)]/20 text-[var(--color-success-text)]">
                <IconCheck className="text-base" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  Bill <span className="tnum">{done.invoiceNumber}</span> created.
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <a
                    className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-accent-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
                    href={apiUrl(`/invoices/${done.id}/pdf`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconDownload className="text-base" />
                    Download PDF
                  </a>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-accent-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
                    onClick={() =>
                      window.open(`https://wa.me/?text=${encodeURIComponent(`Bill ${done.invoiceNumber} from your store`)}`)
                    }
                  >
                    Share on WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {drafts.length ? (
          <Card className="mt-3 border-[var(--color-warn)]/40 bg-[var(--color-warn-tint)]">
            <p className="mb-2 text-sm font-medium text-[var(--color-warn-text)]">
              {drafts.length} unsynced {drafts.length === 1 ? 'bill' : 'bills'} — no numbers yet, nothing left the device
            </p>
            <ul className="flex flex-col gap-2">
              {drafts.map((d) => (
                <li key={d.opId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0 flex-1 text-[var(--color-ink)]">
                    {d.customerName} · {d.lines.map((l) => `${l.name} × ${l.qty}`).join(', ')}
                  </span>
                  <span className="tnum text-[var(--color-ink-muted)]">
                    ≈ {money(d.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))}
                  </span>
                  {d.error ? (
                    <span className="text-xs text-[var(--color-danger-text)]">{d.error}</span>
                  ) : (
                    <Badge tone="warn">Unsynced</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div>
        <h2 className="mb-2 font-display text-lg font-semibold text-[var(--color-ink)]">Recent bills</h2>

        {!invoicesLoading && !invoicesError && outstanding.length ? (
          <Card className="mb-3 border-[var(--color-warn)]/40 bg-[var(--color-warn-tint)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-[var(--color-warn-text)]">
                Outstanding · {outstanding.length} {outstanding.length === 1 ? 'bill' : 'bills'}
              </p>
              <p className="tnum font-display text-xl font-bold text-[var(--color-warn-text)]">{money(outstandingTotal)}</p>
            </div>
          </Card>
        ) : null}

        {invoicesLoading && online ? (
          <SkeletonList rows={4} />
        ) : invoicesError && !offlineBills ? (
          <ErrorState
            title="Could not load recent bills"
            description="The bill list could not be fetched. Your saved bills are unaffected. Try again."
            detail={invoicesErrorObj instanceof Error ? invoicesErrorObj.message : undefined}
            onRetry={() => void refetchInvoices()}
          />
        ) : !billList.length ? (
          <EmptyState
            icon="receipt"
            title="No bills yet"
            description="Create your first bill on the left and it will appear here."
          />
        ) : (
          <Card padded={false} className="overflow-hidden">
            <StaggerList className="divide-y divide-[var(--color-border)]">
              {billList.slice(0, 20).map((inv: any, i: number) => (
                <StaggerItem key={inv.id} index={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <span className="tnum font-medium text-[var(--color-ink)]">{inv.invoiceNumber}</span>
                  <span className="text-[var(--color-ink-muted)]">{inv.customer?.name || 'Walk-in'}</span>
                  <span className="tnum ml-auto text-[var(--color-ink)]">{money(inv.grandTotal)}</span>
                  <Badge tone={inv.status === 'void' ? 'bad' : inv.amountPaid > 0 ? 'ok' : 'muted'}>
                    <span className="capitalize">{inv.status}</span>
                    <span className="tnum"> · paid {money(inv.amountPaid || 0)}</span>
                  </Badge>
                  {inv.status === 'unpaid' || inv.status === 'partial' ? (
                    <span className="tnum text-xs text-[var(--color-warn-text)]">
                      {money(inv.grandTotal - (inv.amountPaid || 0))} due · {ageLabel(inv.issueDate)}
                    </span>
                  ) : null}
                  {online && (inv.status === 'unpaid' || inv.status === 'partial') ? (
                    <button
                      type="button"
                      className={`rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-accent-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
                      onClick={() => setPaying(inv)}
                    >
                      Record payment
                    </button>
                  ) : null}
                  {online && isOwner && inv.status !== 'void' && !(inv.amountPaid > 0) ? (
                    <button
                      type="button"
                      className={`rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-danger-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
                      onClick={async () => {
                        await api.post(`/invoices/${inv.id}/void`)
                        qc.invalidateQueries({ queryKey: ['invoices'] })
                      }}
                    >
                      Void
                    </button>
                  ) : null}
                </StaggerItem>
              ))}
            </StaggerList>
          </Card>
        )}
      </div>
      {paying ? (
        <RecordPaymentDialog
          inv={paying}
          onClose={() => setPaying(null)}
          onRecorded={() => {
            setPaying(null)
            qc.invalidateQueries({ queryKey: ['invoices'] })
          }}
        />
      ) : null}
    </div>
  )
}

