import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconPlus,
  PageHint,
  PageTitle,
  Panel,
  SelectField,
  SkeletonTable,
  TextField,
  TextInput,
  focusRing,
  useToast,
} from '@ecobills/ui'
import { api, money } from '../lib/api'
import { useMe } from '../lib/store'
import { useNet } from '../lib/offline/net'
import { readAll } from '../lib/offline/db'

/**
 * Inventory. Data flow, RBAC and payload shapes are unchanged from v0.1.1:
 *   GET  /items?q=      GET /suppliers
 *   POST /items         POST /stock/adjust   (owner only, per §6.1)
 * The barcode/HID fast-type-Enter search field keeps its autofocus and its
 * ordinary focused-input behaviour (§6.2) — no scanner SDK.
 *
 * Presentation changes: the `window.prompt()` stock adjustment is now a Panel
 * (prompt() is blocked in the Tauri and Capacitor WebViews this ships in, and
 * it is unusable with an on-screen keyboard), and the bare pulsing divs are
 * replaced by a skeleton that mirrors the real table.
 */
export function Inventory() {
  const [q, setQ] = useState('')
  const [show, setShow] = useState(false)
  const [adjustFor, setAdjustFor] = useState<any | null>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const { me } = useMe()
  const isOwner = me?.user?.role === 'owner'

  const online = useNet((s) => s.online)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['items', q],
    queryFn: () => api.get(`/items${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    retry: online ? 3 : false,
  })
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers') })
  // Offline reads come through a query like everything else.
  const offlineQ = useQuery({
    queryKey: ['items-offline'],
    queryFn: () => readAll('items'),
    enabled: !online && (isError || !data),
    retry: false,
    staleTime: 30000,
  })
  const offlineView = !online && (isError || !data)
  const cachedItems = offlineView ? offlineQ.data ?? null : null

  const create = useMutation({
    mutationFn: (b: any) => api.post('/items', b),
    onSuccess: (_res, vars: any) => {
      qc.invalidateQueries({ queryKey: ['items'] })
      setShow(false)
      toast.success('Item added', `${vars?.name ?? 'Item'} is now in your inventory.`)
    },
    onError: (e: any) => toast.error('Could not add item', e instanceof Error ? e.message : undefined),
  })
  const adjust = useMutation({
    mutationFn: (b: any) => api.post('/stock/adjust', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      setAdjustFor(null)
      toast.success('Stock adjusted')
    },
    onError: (e: any) => toast.error('Could not adjust stock', e instanceof Error ? e.message : undefined),
  })

  const serverItems: any[] = data || []
  const items = cachedItems !== null ? filterCached(cachedItems, q) : serverItems
  const hasQuery = q.trim().length > 0

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageTitle>Inventory</PageTitle>
          <PageHint>
            Stock levels are derived from the ledger; nothing is edited directly.
            {offlineView ? ' Offline view — adding items and adjustments need a connection.' : null}
          </PageHint>
        </div>
        {online ? (
          <Button onClick={() => setShow(true)}>
            <IconPlus className="text-base" />
            Add item
          </Button>
        ) : null}
      </div>

      {/* HID barcode scanners type fast + Enter — this ordinary focused field
          already scans (§6.2). It is not a live region; results announce below. */}
      <div className="mb-4 max-w-md">
        <label htmlFor="inventory-search" className="sr-only">
          Search or scan barcode
        </label>
        <TextInput
          id="inventory-search"
          autoFocus
          placeholder="Search items or scan barcode…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Announces result counts without stealing focus from the scan field. */}
      <p role="status" aria-live="polite" className="sr-only">
        {isLoading ? 'Loading items' : `${items.length} item${items.length === 1 ? '' : 's'} shown`}
      </p>

      {isLoading && online ? (
        <SkeletonTable rows={5} columns={isOwner ? 5 : 4} />
      ) : offlineView && offlineQ.isLoading ? (
        <SkeletonTable rows={5} columns={isOwner ? 5 : 4} />
      ) : isError && !offlineView ? (
        <ErrorState
          title="Could not load your inventory"
          description="The item list could not be fetched. Nothing has been changed. Try again."
          detail={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : !items.length ? (
        hasQuery ? (
          <EmptyState
            icon="search"
            title="No items match that search"
            description={`Nothing in your inventory matches “${q.trim()}”. Try a shorter word, or clear the search to see everything.`}
            action={
              <Button variant="secondary" onClick={() => setQ('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="box"
            title="No items yet"
            description="Add your first product to start billing."
            action={
              <Button onClick={() => setShow(true)}>
                <IconPlus className="text-base" />
                Add item
              </Button>
            }
          />
        )
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Inventory items with price, stock and status</caption>
              <thead className="bg-[var(--color-surface-2)] text-left">
                <tr className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  <th scope="col" className="px-4 py-2.5 font-medium">Item</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Price</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Stock</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    {isOwner && online && <th scope="col" className="px-4 py-2.5 font-medium">Adjust</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => (
                  <tr
                    key={it.id}
                    className="border-t border-[var(--color-border)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-surface-2)]"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-[var(--color-ink)]">{it.name}</span>{' '}
                      <span className="text-xs text-[var(--color-ink-subtle)]">
                        {it.sku} · {it.unit}
                      </span>
                    </td>
                    <td className="tnum px-4 py-2.5 text-[var(--color-ink)]">{money(it.salePrice)}</td>
                    <td className="tnum px-4 py-2.5 text-[var(--color-ink)]">
                      {it.currentStock} {it.unit}
                    </td>
                    <td className="px-4 py-2.5">
                      {(it.lowStock ?? Number(it.currentStock || 0) <= Number(it.reorderThreshold || 0)) ? (
                        <Badge tone="warn">Low</Badge>
                      ) : (
                        <Badge tone="ok">OK</Badge>
                      )}
                    </td>
                    {isOwner && online && (
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          className={`rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-accent-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
                          onClick={() => setAdjustFor(it)}
                        >
                          Adjust
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ItemForm open={show} suppliers={suppliers || []} onClose={() => setShow(false)} onSave={(b: any) => create.mutate(b)} saving={create.isPending} />

      <AdjustStockPanel
        item={adjustFor}
        onClose={() => setAdjustFor(null)}
        submitting={adjust.isPending}
        onSubmit={(deltaQty) => adjust.mutate({ itemId: adjustFor.id, deltaQty, note: 'manual' })}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------
   Add item — a centred Panel instead of a hand-rolled fixed overlay.
   Payload construction is byte-for-byte the same as v0.1.1.
   ------------------------------------------------------------------------- */

function ItemForm({
  open,
  suppliers,
  onClose,
  onSave,
  saving,
}: {
  open: boolean
  suppliers: any[]
  onClose: () => void
  onSave: (b: any) => void
  saving: boolean
}) {
  const [f, setF] = useState({
    name: '',
    sku: '',
    salePrice: '',
    costPrice: '',
    taxRateBps: '0',
    reorderThreshold: '5',
    unit: 'pcs',
    primarySupplierId: '',
  })

  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name: f.name,
      sku: f.sku,
      unit: f.unit || 'pcs',
      salePrice: Math.round(Number(f.salePrice || 0) * 100),
      costPrice: Math.round(Number(f.costPrice || 0) * 100),
      taxRateBps: Math.round(Number(f.taxRateBps || 0) * 100),
      reorderThreshold: Number(f.reorderThreshold || 0),
      primarySupplierId: f.primarySupplierId || null,
    })
  }

  return (
    <Panel
      open={open}
      onClose={onClose}
      side="center"
      title="Add item"
      description="Stock is tracked in the unit you choose here."
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="item-form" loading={saving} loadingLabel="Saving item" className="flex-1">
            Save item
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      }
    >
      <form id="item-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          required
          className="sm:col-span-2"
          value={f.name}
          onValueChange={set('name')}
          validate={(v) => (v.trim() ? undefined : 'Enter the item name customers and staff will recognise.')}
        />
        <TextField
          label="SKU"
          required
          value={f.sku}
          onValueChange={set('sku')}
          validate={(v) => (v.trim() ? undefined : 'A SKU is required so barcode scanning works.')}
        />
        <TextField label="Unit" hint="pcs / kg / L" value={f.unit} onValueChange={set('unit')} />
        <TextField
          label="Sale price (₹)"
          inputProps={{ inputMode: 'decimal' }}
          value={f.salePrice}
          onValueChange={set('salePrice')}
          validate={(v) => (v && Number(v) < 0 ? 'Price cannot be negative.' : undefined)}
        />
        <TextField
          label="Cost price (₹)"
          inputProps={{ inputMode: 'decimal' }}
          value={f.costPrice}
          onValueChange={set('costPrice')}
          validate={(v) => (v && Number(v) < 0 ? 'Cost cannot be negative.' : undefined)}
        />
        <TextField label="GST %" hint="0 / 5 / 12 / 18" inputProps={{ inputMode: 'decimal' }} value={f.taxRateBps} onValueChange={set('taxRateBps')} />
        <TextField
          label="Reorder level"
          inputProps={{ inputMode: 'decimal' }}
          value={f.reorderThreshold}
          onValueChange={set('reorderThreshold')}
          validate={(v) => (v && Number(v) < 0 ? 'Reorder level cannot be negative.' : undefined)}
        />
        <SelectField label="Supplier" className="sm:col-span-2" value={f.primarySupplierId} onValueChange={set('primarySupplierId')}>
          <option value="">No supplier</option>
          {suppliers.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      </form>
    </Panel>
  )
}

/* -------------------------------------------------------------------------
   Adjust stock — replaces `window.prompt()`. Same payload as v0.1.1:
   POST /stock/adjust { itemId, deltaQty, note: 'manual' }
   ------------------------------------------------------------------------- */

function AdjustStockPanel({
  item,
  onClose,
  onSubmit,
  submitting,
}: {
  item: any | null
  onClose: () => void
  onSubmit: (deltaQty: number) => void
  submitting: boolean
}) {
  const [raw, setRaw] = useState('')
  const delta = Number(raw)
  const valid = raw.trim() !== '' && Number.isFinite(delta) && delta !== 0

  return (
    <Panel
      open={Boolean(item)}
      onClose={onClose}
      side="right"
      size="sm"
      title={item ? `Adjust stock: ${item.name}` : 'Adjust stock'}
      description={
        item
          ? `Currently ${item.currentStock} ${item.unit} on hand. Enter a positive number to add, or a negative number to remove.`
          : undefined
      }
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" loading={submitting} loadingLabel="Adjusting stock" disabled={!valid} onClick={() => valid && onSubmit(delta)}>
            Apply adjustment
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      }
    >
      <TextField
        label="Change in quantity"
        hint="For example 5 to add five, or -2 to remove two."
        inputProps={{ inputMode: 'decimal', autoFocus: true, placeholder: 'e.g. 5' }}
        value={raw}
        onValueChange={setRaw}
        validate={(v) => {
          if (v.trim() === '') return undefined
          const n = Number(v)
          if (!Number.isFinite(n)) return 'Enter a number, for example 5 or -2.'
          if (n === 0) return 'Enter a change other than zero, otherwise nothing would move.'
          return undefined
        }}
      />
    </Panel>
  )
}

/** Local search over the offline snapshot (same matching as the server). */
function filterCached(rows: any[], q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((i: any) => (i.name || '').toLowerCase().includes(needle) || (i.sku || '').toLowerCase().includes(needle))
}
