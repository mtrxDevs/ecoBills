import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconCheck,
  IconClose,
  IconWarning,
  PageHint,
  PageTitle,
  Panel,
  Select,
  SkeletonList,
  StaggerItem,
  StaggerList,
  TextAreaField,
  TextField,
  focusRing,
  motionLimits,
  useToast,
} from '@ecobills/ui'
import { api, money } from '../lib/api'
import { useMe } from '../lib/store'
import { useNet } from '../lib/offline/net'
import { readAll } from '../lib/offline/db'

/**
 * Orders. Endpoints, payloads and the human-in-the-loop invariant are
 * unchanged from v0.1.1:
 *   GET  /purchase-orders            GET /suppliers          GET /items
 *   POST /purchase-orders            { supplierId, lines: [{ itemId, qtyRequested }] }
 *   POST /purchase-orders/from-low-stock
 *   POST /purchase-orders/:id/send      { subject, body }   (owner only)
 *   POST /purchase-orders/:id/receive   { lines: [{ lineId, qtyReceived }] }
 *   POST /suppliers  PATCH /suppliers/:id   (distributor address book)
 *
 * A draft is still only ever sent by an explicit click, the preview still says
 * so, and no auto-email is introduced. The hand-rolled fixed overlay became a
 * <Panel> (Escape to close, focus moved in and restored, scroll locked), the
 * "✓" glyph became a drawn SVG checkmark, and the list gained the loading and
 * error states it was missing.
 */
export function Orders() {
  const qc = useQueryClient()
  const toast = useToast()
  const { me } = useMe()
  const isOwner = me?.user?.role === 'owner'
  const [preview, setPreview] = useState<any>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const online = useNet((s) => s.online)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['pos'],
    queryFn: () => api.get('/purchase-orders'),
    retry: online ? 3 : false,
  })
  // Offline: cached orders, read-only. Sending needs the mail provider and
  // receiving needs live ledgers, so both stay online-only actions.
  const offlineQ = useQuery({
    queryKey: ['pos-offline'],
    queryFn: () => readAll('orders'),
    enabled: !online && (isError || !data),
    retry: false,
    staleTime: 30000,
  })
  const offlineView = !online && (isError || !data)

  const fromLow = useMutation({
    mutationFn: () => api.post('/purchase-orders/from-low-stock'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos'] })
      toast.success('Draft order created', 'Review it below, then send it yourself when you are ready.')
    },
    onError: (e: any) => toast.error('Could not draft an order', e instanceof Error ? e.message : undefined),
  })

  const send = useMutation({
    mutationFn: (po: any) => api.post(`/purchase-orders/${po.id}/send`, { subject: po.emailSubject, body: po.emailBody }),
    onSuccess: () => {
      setCelebrate(true)
      qc.invalidateQueries({ queryKey: ['pos'] })
      window.setTimeout(() => {
        setCelebrate(false)
        setPreview(null)
      }, motionLimits.successHoldMs)
    },
    onError: (e: any) => toast.error('The order was not sent', e instanceof Error ? e.message : undefined),
  })

  const receive = useMutation({
    mutationFn: (po: any) => {
      const lines = po.lines.map((l: any) => ({ lineId: l.id, qtyReceived: Number(l.qtyRequested) }))
      return api.post(`/purchase-orders/${po.id}/receive`, { lines })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos'] })
      toast.success('Stock received', 'The ledger has been updated for every line.')
    },
    onError: (e: any) => toast.error('Could not receive this order', e instanceof Error ? e.message : undefined),
  })

  // After a manual draft, open its full preview (with item names) straight away.
  async function openDraft(id: string) {
    await qc.invalidateQueries({ queryKey: ['pos'] })
    const list = (await qc.fetchQuery({ queryKey: ['pos'], queryFn: () => api.get('/purchase-orders') })) as any[]
    const po = (list || []).find((p) => p.id === id)
    setDrafting(false)
    if (po) setPreview(po)
  }

  const orders: any[] = offlineView ? offlineQ.data ?? [] : data || []

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageTitle>Orders</PageTitle>
          <PageHint>
            Draft, preview, send. Nothing leaves your shop until you click Send.
            {offlineView ? ' Offline view — sending and receiving need a connection.' : null}
          </PageHint>
        </div>
        {online ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDrafting(true)}>
              New order
            </Button>
            <Button onClick={() => fromLow.mutate()} loading={fromLow.isPending} loadingLabel="Drafting order">
              Review low-stock order
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading && online ? (
        <SkeletonList rows={3} />
      ) : offlineView && offlineQ.isLoading ? (
        <SkeletonList rows={3} />
      ) : isError && !offlineView ? (
        <ErrorState
          title="Could not load your purchase orders"
          description="No order has been changed or sent. Check the connection and try again."
          detail={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : !orders.length ? (
        <EmptyState
          icon="cart"
          title="No purchase orders"
          description="Draft one per supplier from the items that are running low."
          action={
            <Button onClick={() => fromLow.mutate()} loading={fromLow.isPending} loadingLabel="Drafting order">
              Review low-stock order
            </Button>
          }
        />
      ) : (
        <StaggerList className="flex flex-col gap-3">
          {orders.map((po: any, i: number) => (
            <StaggerItem key={po.id} index={i}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--color-ink)]">{po.supplier?.name}</p>
                    <p className="tnum text-xs text-[var(--color-ink-subtle)]">
                      {po.lines.length} {po.lines.length === 1 ? 'item' : 'items'} · {po.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setPreview(po)}>
                      Preview
                    </Button>
                    {online && po.status === 'draft' && isOwner ? (
                      <Button size="sm" onClick={() => setPreview(po)}>
                        Review &amp; send
                      </Button>
                    ) : null}
                    {online && (po.status === 'sent' || po.status === 'partial') ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={receive.isPending && receive.variables?.id === po.id}
                        loadingLabel="Receiving"
                        onClick={() => receive.mutate(po)}
                      >
                        Mark received
                      </Button>
                    ) : null}
                  </div>
                </div>

                {po.followUpNudge ? (
                  <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warn-tint)] p-3">
                    <IconWarning className="mt-0.5 shrink-0 text-base text-[var(--color-warn-text)]" />
                    <p className="text-sm text-[var(--color-warn-text)]">
                      Sent a while ago with nothing received. Follow up? No email is ever sent automatically.
                    </p>
                  </div>
                ) : null}

                <ul className="mt-3 flex flex-col gap-1 text-sm text-[var(--color-ink-muted)]">
                  {po.lines.map((l: any) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{l.item?.name}</span>
                      <span className="tnum shrink-0">
                        {String(l.qtyRequested)} requested · {String(l.qtyReceived)} received
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {/* Preview / send. `celebrate` drives the Send button's checkmark morph,
          so there is exactly one animated element when the order goes out. */}
      <Panel
        open={Boolean(preview)}
        onClose={() => (send.isPending ? undefined : setPreview(null))}
        side="center"
        size="lg"
        title={celebrate ? 'Order sent' : 'Order preview'}
        description={celebrate ? undefined : 'Nothing is sent yet. Check the wording, then send it yourself.'}
        footer={
          celebrate ? (
            <Button variant="secondary" className="w-full" onClick={() => setPreview(null)}>
              Close
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {isOwner && online ? (
                <Button
                  className="flex-1"
                  loading={send.isPending}
                  success={celebrate}
                  loadingLabel="Sending order"
                  successLabel="Order sent"
                  onClick={() => preview && send.mutate(preview)}
                >
                  Send (explicit)
                </Button>
              ) : (
                <p className="flex-1 text-sm text-[var(--color-ink-muted)]">
                  {!online
                    ? 'Sending needs a connection — review now, send when back online.'
                    : 'Only the owner can send orders. Your preview is ready for review.'}
                </p>
              )}
              <Button variant="secondary" onClick={() => setPreview(null)} disabled={send.isPending}>
                Close
              </Button>
            </div>
          )
        }
      >
        {preview ? (
          celebrate ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span
                aria-hidden="true"
                className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-accent-tint)] text-[var(--color-success-text)]"
              >
                <IconCheck className="text-2xl" />
              </span>
              <p className="font-display font-semibold text-[var(--color-ink)]">Order sent</p>
              <p className="text-sm text-[var(--color-ink-muted)]">The supplier has been emailed. Nothing else is pending.</p>
              {/* Live region already exists in the DOM; only its text changes. */}
              <span role="status" aria-live="polite" className="sr-only">
                Order sent
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[var(--color-ink-muted)]">To:</span>
                <span className="text-[var(--color-ink)]">
                  {preview.supplier?.contactEmail || 'No supplier email. Add one first.'}
                </span>
                {!preview.supplier?.contactEmail ? <Badge tone="warn">No email on file</Badge> : null}
              </div>

              <TextField
                label="Subject"
                value={preview.emailSubject || ''}
                onValueChange={(v) => setPreview({ ...preview, emailSubject: v })}
                validate={(v) => (v.trim() ? undefined : 'A subject is required before sending.')}
              />

              <TextAreaField
                label="Body"
                rows={10}
                value={preview.emailBody || ''}
                onValueChange={(v) => setPreview({ ...preview, emailBody: v })}
              />

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">Lines</p>
                <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-control)] border border-[var(--color-border)] text-sm">
                  {preview.lines.map((l: any) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-[var(--color-ink)]">{l.item?.name}</span>
                        <span className="tnum text-[var(--color-ink-muted)]">
                          {String(l.qtyRequested)} {l.item?.unit || ''} · {money(l.lastKnownPrice ?? 0)}
                        </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        ) : null}
      </Panel>

      {drafting ? <NewOrderDialog onClose={() => setDrafting(false)} onDrafted={(id) => void openDraft(id)} /> : null}
    </div>
  )
}

/**
 * Manual purchase order: pick a distributor (or add one with its email),
 * confirm where the order goes, pick what to order — then it lands in the
 * same preview → explicit Send flow as every other draft. Nothing here sends.
 */
function NewOrderDialog({ onClose, onDrafted }: { onClose: () => void; onDrafted: (id: string) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers') })
  const { data: items } = useQuery({ queryKey: ['items-all'], queryFn: () => api.get('/items') })
  const [supplierId, setSupplierId] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<Array<{ itemId: string; name: string; qty: number }>>([])
  const [pending, setPending] = useState(false)

  const supplierList: any[] = suppliers || []
  const supplier = supplierList.find((s) => s.id === supplierId)
  const isNew = supplierId === '__new'

  function pickSupplier(id: string) {
    setSupplierId(id)
    setEmailTouched(false)
    if (id === '__new') {
      setEmail(newEmail)
    } else {
      const s = supplierList.find((x) => x.id === id)
      setEmail(s?.contactEmail || '')
    }
  }

  const found = (items || [])
    .filter(
      (i: any) =>
        !search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.sku.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 6)

  const canDraft =
    (supplierId && !isNew ? true : isNew && newName.trim() ? true : false) &&
    lines.length > 0 &&
    lines.every((l) => l.qty > 0)

  async function draft() {
    if (!canDraft || pending) return
    setPending(true)
    try {
      let sid = supplierId
      if (isNew) {
        const created = await api.post('/suppliers', { name: newName.trim(), contactEmail: newEmail.trim() })
        sid = created.id
        await qc.invalidateQueries({ queryKey: ['suppliers'] })
        if (email.trim() === '') setEmail(newEmail.trim())
      } else if (email.trim() !== '' && email.trim() !== (supplier?.contactEmail || '')) {
        // The order goes to the edited address — save it back to the book.
        await api.patch(`/suppliers/${sid}`, { contactEmail: email.trim() })
        await qc.invalidateQueries({ queryKey: ['suppliers'] })
      }
      const po = await api.post('/purchase-orders', {
        supplierId: sid,
        lines: lines.map((l) => ({ itemId: l.itemId, qtyRequested: l.qty })),
      })
      onDrafted(po.id)
    } catch (e) {
      toast.error('Could not draft the order', e instanceof Error ? e.message : undefined)
    } finally {
      setPending(false)
    }
  }

  return (
    <Panel
      open
      onClose={onClose}
      side="center"
      size="lg"
      title="New order"
      description="Pick a distributor and what you want. This only drafts — you still preview and send it yourself."
      footer={
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" loading={pending} loadingLabel="Drafting order" disabled={!canDraft} onClick={draft}>
            Draft order
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="order-supplier" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Distributor
          </label>
          <Select id="order-supplier" value={supplierId} onChange={(e) => pickSupplier(e.target.value)}>
            <option value="">Choose a distributor…</option>
            {supplierList.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.contactEmail ? '' : ' (no email on file)'}
              </option>
            ))}
            <option value="__new">+ New distributor…</option>
          </Select>
        </div>

        {isNew ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Distributor name"
              value={newName}
              onValueChange={(v) => {
                setNewName(v)
                if (!emailTouched) setEmail(newEmail)
              }}
              validate={(v) => (v.trim() ? undefined : 'Enter the distributor name.')}
            />
            <TextField
              label="Distributor email"
              inputProps={{ type: 'email', placeholder: 'orders@supplier.com' }}
              value={newEmail}
              onValueChange={(v) => {
                setNewEmail(v)
                if (!emailTouched) setEmail(v)
              }}
              validate={(v) =>
                v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.'
              }
            />
          </div>
        ) : null}

        <TextField
          label="Send the order to"
          hint={email.trim() === '' ? 'No email on file — add one, or the order cannot be sent.' : 'This is where Send will deliver it.'}
          inputProps={{ type: 'email', placeholder: 'orders@supplier.com' }}
          value={email}
          onValueChange={(v) => {
            setEmail(v)
            setEmailTouched(true)
          }}
          validate={(v) =>
            v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.'
          }
        />

        <div>
          <label htmlFor="order-search" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            What do you want to order?
          </label>
          <input
            id="order-search"
            placeholder="Type or scan item name / SKU…"
            autoComplete="off"
            className={`w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] ${focusRing}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <ul className="mt-1 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              {found.map((i: any) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`flex w-full justify-between px-3 py-2 text-left text-sm text-[var(--color-ink)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-surface-2)] ${focusRing}`}
                    onClick={() => {
                      if (!lines.some((l) => l.itemId === i.id)) {
                        setLines([...lines, { itemId: i.id, name: i.name, qty: 1 }])
                      }
                      setSearch('')
                    }}
                  >
                    <span>
                      {i.name} <span className="text-[var(--color-ink-subtle)]">{i.sku}</span>
                    </span>
                    <span className="tnum">{money(i.costPrice)}</span>
                  </button>
                </li>
              ))}
              {!found.length ? (
                <li className="px-3 py-3 text-center text-sm text-[var(--color-ink-muted)]">No item matches “{search}”.</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        {lines.length ? (
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-control)] border border-[var(--color-border)]">
            {lines.map((l, i) => (
              <li key={l.itemId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{l.name}</span>
                <label htmlFor={`order-qty-${i}`} className="sr-only">
                  Quantity for {l.name}
                </label>
                <input
                  id={`order-qty-${i}`}
                  type="number"
                  min={0.001}
                  step="any"
                  className={`tnum w-20 rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-2 py-1 text-[var(--color-ink)] ${focusRing}`}
                  value={l.qty}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))}
                />
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  className={`rounded-[var(--radius-sm)] p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-danger-text)] ${focusRing}`}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <IconClose className="text-sm" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-ink-muted)]">No items yet — search above to add what you want to order.</p>
        )}
      </div>
    </Panel>
  )
}
