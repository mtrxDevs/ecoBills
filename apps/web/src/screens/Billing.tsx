import { useState } from 'react'
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
  Panel,
  Select,
  SkeletonList,
  StaggerItem,
  StaggerList,
  TextField,
  focusRing,
  motionLimits,
  useToast,
} from '@ecobills/ui'
import { api, apiUrl, money } from '../lib/api'
import { useMe } from '../lib/store'

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
  const [customerId, setCustomerId] = useState('')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<Array<{ itemId: string; name: string; qty: number; unitPrice: number }>>([])
  const [done, setDone] = useState<any>(null)
  // Drives the Button's success/checkmark-morph state, then releases it.
  const [celebrate, setCelebrate] = useState(false)

  const { data: items } = useQuery({ queryKey: ['items-all'], queryFn: () => api.get('/items') })
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers') })
  const {
    data: invoices,
    isLoading: invoicesLoading,
    isError: invoicesError,
    error: invoicesErrorObj,
    refetch: refetchInvoices,
  } = useQuery({ queryKey: ['invoices'], queryFn: () => api.get('/invoices') })

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

  const found = (items || [])
    .filter(
      (i: any) =>
        !search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.sku.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 6)
  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const billList: any[] = invoices || []
  const [paying, setPaying] = useState<any>(null)

  // Money still owed: unpaid + partial invoices, oldest pressure first.
  const outstanding = billList
    .filter((inv: any) => inv.status === 'unpaid' || inv.status === 'partial')
    .map((inv: any) => ({ ...inv, balance: inv.grandTotal - (inv.amountPaid || 0) }))
    .sort(
      (a: any, b: any) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime(),
    )
  const outstandingTotal = outstanding.reduce((s: number, inv: any) => s + inv.balance, 0)

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
          {(customers || []).map((c: any) => (
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
        </div>

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

        {invoicesLoading ? (
          <SkeletonList rows={4} />
        ) : invoicesError ? (
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
                  {inv.status === 'unpaid' || inv.status === 'partial' ? (
                    <button
                      type="button"
                      className={`rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-accent-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
                      onClick={() => setPaying(inv)}
                    >
                      Record payment
                    </button>
                  ) : null}
                  {isOwner && inv.status !== 'void' && !(inv.amountPaid > 0) ? (
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

/** Whole days between the issue date and now, for pressure display. */
function ageLabel(issueDate: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(issueDate).getTime()) / 86400e3))
  if (days <= 0) return 'today'
  if (days === 1) return '1 day old'
  return `${days} days old`
}

/**
 * "Create bill → Paid by UPI" in one place. Amount defaults to the full
 * balance (partial payments just type less), method/date/note recorded with
 * the payment. Both Owner and Staff can collect — the server enforces that.
 */
function RecordPaymentDialog({ inv, onClose, onRecorded }: { inv: any; onClose: () => void; onRecorded: () => void }) {
  const toast = useToast()
  const balance = inv.grandTotal - (inv.amountPaid || 0)
  const [amount, setAmount] = useState((balance / 100).toFixed(2))
  const [method, setMethod] = useState('upi')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)

  const paise = Math.round(Number(amount || 0) * 100)
  const valid = paise > 0 && paise <= balance

  async function submit() {
    if (!valid || pending) return
    setPending(true)
    try {
      await api.post(`/invoices/${inv.id}/payments`, {
        amount: paise,
        method,
        note,
        paidAt: new Date(date).toISOString(),
      })
      toast.success(paise >= balance ? 'Paid in full' : 'Payment recorded', `${money(paise)} by ${methodLabel(method)} on ${inv.invoiceNumber}.`)
      onRecorded()
    } catch (e) {
      toast.error('Could not record the payment', e instanceof Error ? e.message : undefined)
    } finally {
      setPending(false)
    }
  }

  return (
    <Panel
      open
      onClose={onClose}
      side="center"
      size="sm"
      title={`Record payment · ${inv.invoiceNumber}`}
      description={`${money(inv.amountPaid || 0)} paid of ${money(inv.grandTotal)} — ${money(balance)} still due.`}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" loading={pending} loadingLabel="Recording" disabled={!valid} onClick={submit}>
            Record {money(Number.isFinite(paise) ? Math.max(0, paise) : 0)}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Amount (₹)"
          inputProps={{ inputMode: 'decimal', autoFocus: true, placeholder: (balance / 100).toFixed(2) }}
          value={amount}
          onValueChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
          validate={(v) => {
            const p = Math.round(Number(v || 0) * 100)
            if (!(p > 0)) return 'Enter an amount greater than zero.'
            if (p > balance) return `At most ${money(balance)} is due on this bill.`
            return undefined
          }}
        />
        <div>
          <label htmlFor="pay-method" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Method
          </label>
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <TextField
          label="Date"
          inputProps={{ type: 'date' }}
          value={date}
          onValueChange={setDate}
        />
        <TextField
          label="Note"
          hint="Optional — reference number, split details, anything."
          value={note}
          onValueChange={setNote}
        />
      </div>
    </Panel>
  )
}

function methodLabel(method: string) {
  switch (method) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'upi':
      return 'UPI'
    case 'bank_transfer':
      return 'Bank transfer'
    default:
      return 'Other'
  }
}
