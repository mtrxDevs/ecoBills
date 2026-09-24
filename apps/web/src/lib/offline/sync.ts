import { api } from '../api'
import { putAll, readAll, putMeta, readMeta, outboxPut, outboxRemove } from './db'

// Sync protocol (v1, documented in DECISIONS.md):
// - READS: on login and on demand, GET /sync/snapshot (30d, bounded) replaces
//   the local cache wholesale. Offline screens read the cache, always labeled
//   with its age. Cache is a copy, never a source of truth.
// - WRITES: only invoice drafts go offline, into the outbox with a clientKey.
//   On reconnect they POST in creation order; the server's idempotency key
//   makes retries safe. Anything the server rejects (e.g. insufficient stock
//   after someone else sold) stays queued with its error for a human decision.
//   Payments, receives, adjustments and settings stay online-only — they need
//   live balances and are one explicit tap away from connectivity anyway.

export type DraftLine = { itemId: string; name: string; qty: number; unitPrice: number }
export type DraftOp = {
  opId: string
  kind: 'invoice'
  createdAt: string
  customerId: string | null
  customerName: string
  lines: DraftLine[]
  clientKey: string
  error?: string
}

export function newOpId() {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function newClientKey() {
  return `ck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

export async function refreshSnapshot(): Promise<string> {
  const snap = await api.get('/sync/snapshot')
  await putAll('items', snap.items || [])
  await putAll('customers', snap.customers || [])
  await putAll('suppliers', snap.suppliers || [])
  await putAll('invoices', snap.invoices || [])
  await putAll('expenses', snap.expenses || [])
  await putAll('orders', snap.purchaseOrders || [])
  await putMeta('business', snap.business || null)
  await putMeta('syncedAt', snap.meta?.syncedAt || new Date().toISOString())
  return (snap.meta?.syncedAt || new Date().toISOString()) as string
}

export async function syncedAt(): Promise<string | null> {
  return readMeta<string>('syncedAt')
}

export async function enqueueDraft(op: Omit<DraftOp, 'opId' | 'createdAt' | 'clientKey' | 'kind'>): Promise<DraftOp> {
  const full: DraftOp = {
    ...op,
    kind: 'invoice',
    opId: newOpId(),
    createdAt: new Date().toISOString(),
    clientKey: newClientKey(),
  }
  await outboxPut(full)
  return full
}

export async function listDrafts(): Promise<DraftOp[]> {
  const rows = await readAll<DraftOp>('outbox')
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
}

export type SyncResult = { sent: number; failed: Array<{ opId: string; error: string }> }

/** Push queued drafts in order. Returns per-draft outcomes; failures stay queued. */
export async function syncOutbox(
  post: (path: string, body: unknown) => Promise<any>,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  const ops = await listDrafts()
  const failed: Array<{ opId: string; error: string }> = []
  let sent = 0
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    try {
      await post('/invoices', {
        customerId: op.customerId,
        lines: op.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
        clientKey: op.clientKey,
      })
      await outboxRemove(op.opId)
      sent++
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send this draft.'
      failed.push({ opId: op.opId, error: msg })
      await outboxPut({ ...op, error: msg })
    }
    onProgress?.(i + 1, ops.length)
  }
  return { sent, failed }
}

/** One shared sync path for the banner, Billing auto-sync, and Retry buttons:
 * push drafts, then refresh the snapshot so the cache reflects what landed. */
export async function pushAndRefresh(): Promise<SyncResult> {
  const r = await syncOutbox((p, b) => api.post(p, b))
  await refreshSnapshot().catch(() => {})
  return r
}

/** Dashboard summary derived from cache — same shape as /dashboard/summary. */
export async function summaryFromCache() {
  const [items, invoices, orders] = await Promise.all([
    readAll<any>('items'),
    readAll<any>('invoices'),
    readAll<any>('orders'),
  ])
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = invoices.filter((i) => new Date(i.issueDate) >= start && i.status !== 'void')
  const low = items.filter((it) => Number(it.currentStock || 0) <= Number(it.reorderThreshold || 0))
  return {
    todaySales: today.reduce((s, i) => s + (i.grandTotal || 0), 0),
    todayInvoices: today.length,
    lowStockCount: low.length,
    lowStock: low.slice(0, 8).map((it) => ({ id: it.id, name: it.name, sku: it.sku, currentStock: it.currentStock || 0 })),
    pendingOrders: orders.filter((o: any) => o.status === 'sent' || o.status === 'partial').length,
    isOwner: true,
    cached: true,
  }
}

/** Per-customer outstanding from cached invoices — list display only. */
export async function outstandingByCustomer(): Promise<Map<string, { total: number; paid: number; due: number }>> {
  const invoices = await readAll<any>('invoices')
  const map = new Map<string, { total: number; paid: number; due: number }>()
  for (const inv of invoices) {
    if (!inv.customerId || inv.status === 'void') continue
    const e = map.get(inv.customerId) || { total: 0, paid: 0, due: 0 }
    e.total += inv.grandTotal || 0
    e.paid += inv.amountPaid || 0
    map.set(inv.customerId, e)
  }
  for (const e of map.values()) e.due = e.total - e.paid
  return map
}

export type CachedCustomerView = {
  customer: any
  stats: { invoiceCount: number; totalSales: number; totalPaid: number; creditTotal: number; outstanding: number; overdue: number; lastTransactionAt: string | null }
  invoices: any[]
  statement: { entries: Array<{ date: string; kind: string; doc: string; debit: number; credit: number; balance: number }>; balance: number }
}

/** Customer detail assembled from cache. Mirrors the server shapes. */
export async function customerDetailFromCache(customerId: string): Promise<CachedCustomerView | null> {
  const [customers, invoices] = await Promise.all([readAll<any>('customers'), readAll<any>('invoices')])
  const customer = customers.find((c: any) => c.id === customerId)
  if (!customer) return null
  const mine = invoices
    .filter((i: any) => i.customerId === customerId && i.status !== 'void')
    .sort((a: any, b: any) => (a.issueDate < b.issueDate ? -1 : 1))
  let totalSales = 0
  let totalPaid = 0
  let creditTotal = 0
  let last: string | null = null
  const raw: Array<{ date: string; kind: string; doc: string; debit: number; credit: number }> = []
  for (const inv of mine) {
    totalSales += inv.grandTotal || 0
    totalPaid += inv.amountPaid || 0
    if (!last || inv.issueDate > last) last = inv.issueDate
    raw.push({ date: inv.issueDate, kind: 'invoice', doc: inv.invoiceNumber, debit: inv.grandTotal || 0, credit: 0 })
    for (const p of inv.payments || []) {
      raw.push({ date: p.paidAt, kind: 'payment', doc: `${inv.invoiceNumber} · ${p.method}`, debit: 0, credit: p.amount || 0 })
    }
    for (const c of inv.creditNotes || []) {
      creditTotal += c.grandTotal || 0
      raw.push({ date: c.issueDate, kind: 'credit_note', doc: `CN-${String(c.id).slice(-6).toUpperCase()}`, debit: 0, credit: c.grandTotal || 0 })
    }
  }
  const rank: Record<string, number> = { invoice: 0, payment: 1, credit_note: 2 }
  raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (rank[a.kind] || 0) - (rank[b.kind] || 0)))
  let running = 0
  const entries = raw.map((r) => {
    running += r.debit - r.credit
    return { ...r, balance: running }
  })
  const now = new Date()
  const overdue = mine.reduce((s: number, inv: any) => {
    const bal = (inv.grandTotal || 0) - (inv.amountPaid || 0)
    return s + (bal > 0 && inv.dueDate && new Date(inv.dueDate) < now && inv.status !== 'paid' ? bal : 0)
  }, 0)
  return {
    customer,
    stats: {
      invoiceCount: mine.length, totalSales, totalPaid, creditTotal,
      outstanding: totalSales - totalPaid - creditTotal, overdue, lastTransactionAt: last,
    },
    invoices: [...mine].reverse(),
    statement: { entries, balance: running },
  }
}
