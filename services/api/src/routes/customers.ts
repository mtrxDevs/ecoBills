import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { pageEnvelope } from '../paging.js'
import { customerSchema, customerQuerySchema, pageQuerySchema } from '@ecobills/types'

type Stats = {
  invoiceCount: number
  totalSales: number
  totalPaid: number
  creditTotal: number
  outstanding: number
  overdue: number
  lastTransactionAt: string | null
}

/** Derived per-customer aggregates for a set of customer ids. No stored balances anywhere. */
async function customerStats(businessId: string, ids: string[]): Promise<Map<string, Stats>> {
  const out = new Map<string, Stats>()
  const blank = (): Stats => ({
    invoiceCount: 0, totalSales: 0, totalPaid: 0, creditTotal: 0,
    outstanding: 0, overdue: 0, lastTransactionAt: null,
  })
  for (const id of ids) out.set(id, blank())
  if (!ids.length) return out

  const invRows = await prisma.invoice.findMany({
    where: { businessId, customerId: { in: ids }, status: { not: 'void' } },
    select: { id: true, customerId: true, grandTotal: true, issueDate: true, dueDate: true, status: true },
  })
  const invIds = invRows.map((r) => r.id)
  const payAgg = invIds.length
    ? await prisma.payment.groupBy({ by: ['invoiceId'], where: { businessId, invoiceId: { in: invIds } }, _sum: { amount: true } })
    : []
  const cnAgg = invIds.length
    ? await prisma.creditNote.groupBy({ by: ['invoiceId'], where: { businessId, invoiceId: { in: invIds } }, _sum: { grandTotal: true } })
    : []
  const paidByInv = new Map(payAgg.map((p) => [p.invoiceId, p._sum.amount || 0]))
  const cnByInv = new Map(cnAgg.map((c) => [c.invoiceId, c._sum.grandTotal || 0]))
  const invCustomer = new Map(invRows.map((r) => [r.id, r.customerId as string]))
  const now = new Date()

  for (const r of invRows) {
    const s = out.get(r.customerId as string)!
    const paid = paidByInv.get(r.id) || 0
    const bal = r.grandTotal - paid
    s.invoiceCount += 1
    s.totalSales += r.grandTotal
    s.totalPaid += paid
    if (bal > 0 && r.dueDate && r.dueDate < now && r.status !== 'paid') s.overdue += bal
    const d = r.issueDate.toISOString()
    if (!s.lastTransactionAt || d > s.lastTransactionAt) s.lastTransactionAt = d
  }
  for (const [invId, total] of cnByInv) {
    const cid = invCustomer.get(invId)
    if (cid) out.get(cid)!.creditTotal += total
  }
  for (const s of out.values()) s.outstanding = s.totalSales - s.totalPaid - s.creditTotal
  return out
}

export type StatementEntry = {
  date: string
  kind: 'invoice' | 'payment' | 'credit_note'
  doc: string
  debit: number
  credit: number
  balance: number
}

/** Full chronological ledger for one customer, derived from real records. */
export async function buildStatement(businessId: string, customerId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { businessId, customerId, status: { not: 'void' } },
    select: { id: true, invoiceNumber: true, issueDate: true, grandTotal: true },
    orderBy: { issueDate: 'asc' },
  })
  const invIds = invoices.map((i) => i.id)
  const invById = new Map(invoices.map((i) => [i.id, i]))
  const payments = invIds.length
    ? await prisma.payment.findMany({
        where: { businessId, invoiceId: { in: invIds } },
        include: { invoice: { select: { invoiceNumber: true } } },
        orderBy: { paidAt: 'asc' },
      })
    : []
  const notes = invIds.length
    ? await prisma.creditNote.findMany({
        where: { businessId, invoiceId: { in: invIds } },
        orderBy: { issueDate: 'asc' },
      })
    : []

  const rank = { invoice: 0, payment: 1, credit_note: 2 } as const
  type Raw = { date: string; kind: keyof typeof rank; doc: string; debit: number; credit: number }
  const raw: Raw[] = [
    ...invoices.map((i): Raw => ({ date: i.issueDate.toISOString(), kind: 'invoice', doc: i.invoiceNumber, debit: i.grandTotal, credit: 0 })),
    ...payments.map((p): Raw => ({
      date: p.paidAt.toISOString(), kind: 'payment',
      doc: `${p.invoice.invoiceNumber} · ${p.method}`, debit: 0, credit: p.amount,
    })),
    ...notes.map((c): Raw => ({
      date: c.issueDate.toISOString(), kind: 'credit_note',
      doc: `CN-${c.id.slice(-6).toUpperCase()}`, debit: 0, credit: c.grandTotal,
    })),
  ]
  raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank[a.kind] - rank[b.kind]))

  let running = 0
  const entries: StatementEntry[] = raw.map((r) => {
    running += r.debit - r.credit
    return { ...r, balance: running }
  })
  void invById
  return { entries, balance: running }
}

export async function customerRoutes(app: FastifyInstance) {
  // ---- list (paginated + searchable, aggregates attached) ----
  app.get('/customers', { preHandler: requireAuth }, async (req) => {
    const q = customerQuerySchema.parse(req.query)
    const bid = req.user!.businessId
    const where: any = {
      businessId: bid,
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { email: { contains: q.q, mode: 'insensitive' } }, { gstin: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
      ...(q.active === 'all' ? {} : { isActive: q.active === 'active' }),
    }
    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ])
    const stats = await customerStats(bid, rows.map((r) => r.id))
    return pageEnvelope(
      rows.map((r) => ({ ...r, stats: stats.get(r.id) })),
      total,
      q.page,
      q.pageSize,
    )
  })

  // ---- detail ----
  app.get('/customers/:id', { preHandler: requireAuth }, async (req, reply) => {
    const c = await prisma.customer.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId } })
    if (!c) return reply.code(404).send({ error: 'not_found' })
    const stats = await customerStats(req.user!.businessId, [c.id])
    return { ...c, stats: stats.get(c.id) }
  })

  app.post('/customers', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const b = customerSchema.parse(req.body)
    const c = await prisma.customer.create({
      data: { ...b, email: b.email || null, gstin: b.gstin || null, businessId: req.user!.businessId },
    })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'customer.create', entity: 'Customer', entityId: c.id, after: { name: c.name } })
    return c
  })

  app.patch('/customers/:id', { preHandler: requirePerm('inventory.manage') }, async (req, reply) => {
    const id = (req.params as any).id
    const prev = await prisma.customer.findFirst({ where: { id, businessId: req.user!.businessId } })
    if (!prev) return reply.code(404).send({ error: 'not_found' })
    const b = customerSchema.partial().parse(req.body)
    const next = await prisma.customer.update({ where: { id }, data: b })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'customer.update', entity: 'Customer', entityId: id, before: { name: prev.name }, after: { name: next.name } })
    return next
  })

  // Destructive + history-breaking (invoices would lose their customer), so
  // owner-only, and refused outright while any invoice references the record.
  // Everyday removal is deactivation via PATCH { isActive: false }.
  app.delete('/customers/:id', { preHandler: requirePerm('settings.manage') }, async (req, reply) => {
    const id = (req.params as any).id
    const c = await prisma.customer.findFirst({ where: { id, businessId: req.user!.businessId } })
    if (!c) return reply.code(404).send({ error: 'not_found' })
    const refs = await prisma.invoice.count({ where: { customerId: id, businessId: req.user!.businessId } })
    if (refs > 0) return reply.code(409).send({ error: 'customer_has_invoices', message: 'Deactivate instead — invoices must keep their customer.' })
    await prisma.customer.delete({ where: { id } })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'customer.delete', entity: 'Customer', entityId: id, before: { name: c.name } })
    return { ok: true }
  })

  // ---- transactions ----
  app.get('/customers/:id/invoices', { preHandler: requireAuth }, async (req, reply) => {
    const q = pageQuerySchema.parse(req.query)
    const c = await prisma.customer.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId } })
    if (!c) return reply.code(404).send({ error: 'not_found' })
    const where = { businessId: req.user!.businessId, customerId: c.id }
    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: { payments: true },
        orderBy: { issueDate: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ])
    return pageEnvelope(
      rows.map((inv: any) => ({ ...inv, amountPaid: (inv.payments || []).reduce((s: number, p: any) => s + p.amount, 0) })),
      total, q.page, q.pageSize,
    )
  })

  app.get('/customers/:id/payments', { preHandler: requireAuth }, async (req, reply) => {
    const q = pageQuerySchema.parse(req.query)
    const c = await prisma.customer.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId } })
    if (!c) return reply.code(404).send({ error: 'not_found' })
    const invIds = (
      await prisma.invoice.findMany({ where: { businessId: req.user!.businessId, customerId: c.id }, select: { id: true } })
    ).map((i) => i.id)
    if (!invIds.length) return pageEnvelope([], 0, q.page, q.pageSize)
    const where = { businessId: req.user!.businessId, invoiceId: { in: invIds } }
    const [total, rows] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: { invoice: { select: { invoiceNumber: true } } },
        orderBy: { paidAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ])
    return pageEnvelope(rows, total, q.page, q.pageSize)
  })

  app.get('/customers/:id/statement', { preHandler: requireAuth }, async (req, reply) => {
    const q = pageQuerySchema.parse(req.query)
    const c = await prisma.customer.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId } })
    if (!c) return reply.code(404).send({ error: 'not_found' })
    const { entries, balance } = await buildStatement(req.user!.businessId, c.id)
    // Running balances depend on everything before the page, so paginate the
    // slice but always report the opening and final balances.
    const start = (q.page - 1) * q.pageSize
    const slice = entries.slice(start, start + q.pageSize)
    return {
      ...pageEnvelope(slice, entries.length, q.page, q.pageSize),
      openingBalance: slice.length ? slice[0].balance - (slice[0].debit - slice[0].credit) : balance,
      balance,
    }
  })

  app.get('/customers/:id/balance', { preHandler: requireAuth }, async (req, reply) => {
    const c = await prisma.customer.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId } })
    if (!c) return reply.code(404).send({ error: 'not_found' })
    const stats = await customerStats(req.user!.businessId, [c.id])
    return stats.get(c.id)
  })
}
