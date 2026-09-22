import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { expenseSchema, businessPatchSchema } from '@ecobills/types'

export async function opsRoutes(app: FastifyInstance) {
  // ---- expenses ----
  app.get('/expenses', { preHandler: requirePerm('reports.view') }, async (req) => {
    return prisma.expense.findMany({ where: { businessId: req.user!.businessId }, orderBy: { date: 'desc' }, take: 300 })
  })
  app.post('/expenses', { preHandler: requirePerm('reports.view') }, async (req) => {
    const b = expenseSchema.parse(req.body)
    return prisma.expense.create({ data: { businessId: req.user!.businessId, category: b.category, amount: b.amount, note: b.note, date: b.date ? new Date(b.date) : new Date() } })
  })

  // ---- P&L: revenue/COGS net of credit notes, accrual by issue date ----
  app.get('/reports/pnl', { preHandler: requirePerm('reports.view') }, async (req) => {
    const q = req.query as any
    const from = q?.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400e3)
    const to = q?.to ? new Date(q.to) : new Date()
    const bid = req.user!.businessId

    const invLines = await prisma.invoiceLine.findMany({
      where: { businessId: bid, invoice: { issueDate: { gte: from, lte: to }, status: { not: 'void' } } },
      include: { invoice: true, item: true },
    })
    const cnLines = await prisma.creditNoteLine.findMany({
      where: { businessId: bid, creditNote: { issueDate: { gte: from, lte: to } } },
      include: { creditNote: true, item: true },
    })
    const expenses = await prisma.expense.findMany({ where: { businessId: bid, date: { gte: from, lte: to } } })

    const rev = (l: any) => Number(l.qty) * l.unitPriceSnapshot * (1 + l.taxRateSnapshotBps / 10000)
    const cost = (l: any) => Number(l.qty) * l.unitCostSnapshot
    const grossRev = invLines.reduce((s, l) => s + rev(l), 0)
    const cnRev = cnLines.reduce((s, l) => s + rev(l), 0)
    const grossCost = invLines.reduce((s, l) => s + cost(l), 0)
    const cnCost = cnLines.reduce((s, l) => s + cost(l), 0)
    const revenue = Math.round(grossRev - cnRev)
    const cogs = Math.round(grossCost - cnCost)
    const gross = revenue - cogs
    const expTotal = expenses.reduce((s, e) => s + e.amount, 0)
    const net = gross - expTotal

    // trend by day
    const byDay = new Map<string, number>()
    for (const l of invLines) {
      const d = l.invoice.issueDate.toISOString().slice(0, 10)
      byDay.set(d, (byDay.get(d) || 0) + Math.round(rev(l)))
    }
    for (const l of cnLines) {
      const d = l.creditNote.issueDate.toISOString().slice(0, 10)
      byDay.set(d, (byDay.get(d) || 0) - Math.round(rev(l)))
    }
    const trend = [...byDay.entries()].sort().map(([date, total]) => ({ date, total }))

    // top items by revenue and margin
    const agg = new Map<string, { name: string; revenue: number; margin: number }>()
    for (const l of invLines) {
      const a = agg.get(l.itemId) || { name: l.item.name, revenue: 0, margin: 0 }
      a.revenue += Math.round(rev(l))
      a.margin += Math.round(rev(l)) - Math.round(cost(l))
      agg.set(l.itemId, a)
    }
    const top = [...agg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

    // cash tied up in stock (last-cost)
    const items = await prisma.item.findMany({ where: { businessId: bid } })
    const sums = await prisma.stockLedger.groupBy({ by: ['itemId'], where: { businessId: bid }, _sum: { deltaQty: true } })
    const map = new Map(sums.map((s) => [s.itemId, Number(s._sum.deltaQty || 0)]))
    const stockValue = items.reduce((s, it) => s + Math.max(0, map.get(it.id) || 0) * it.costPrice, 0)

    return { from, to, revenue, cogs, grossProfit: gross, expenses: expTotal, netProfit: net, trend, topItems: top, stockValue }
  })

  // ---- dashboard summary ----
  app.get('/dashboard/summary', { preHandler: requireAuth }, async (req) => {
    const bid = req.user!.businessId
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const today = await prisma.invoice.aggregate({
      where: { businessId: bid, issueDate: { gte: start }, status: { not: 'void' } },
      _sum: { grandTotal: true }, _count: true,
    })
    const items = await prisma.item.findMany({ where: { businessId: bid } })
    const sums = await prisma.stockLedger.groupBy({ by: ['itemId'], where: { businessId: bid }, _sum: { deltaQty: true } })
    const map = new Map(sums.map((s) => [s.itemId, Number(s._sum.deltaQty || 0)]))
    const low = items.filter((it) => (map.get(it.id) || 0) <= Number(it.reorderThreshold))
    const pendingPOs = await prisma.purchaseOrder.count({ where: { businessId: bid, status: { in: ['sent', 'partial'] } } })
    return {
      todaySales: today._sum.grandTotal || 0,
      todayInvoices: today._count,
      lowStockCount: low.length,
      lowStock: low.slice(0, 8).map((it) => ({ id: it.id, name: it.name, sku: it.sku, currentStock: map.get(it.id) || 0 })),
      pendingOrders: pendingPOs,
      isOwner: req.user!.role === 'owner',
    }
  })

  // ---- business settings ----
  app.get('/business', { preHandler: requireAuth }, async (req) => {
    return prisma.business.findUniqueOrThrow({ where: { id: req.user!.businessId } })
  })
  app.patch('/business', { preHandler: requirePerm('settings.manage') }, async (req) => {
    const b = businessPatchSchema.parse(req.body)
    const before = await prisma.business.findUniqueOrThrow({ where: { id: req.user!.businessId } })
    const after = await prisma.business.update({ where: { id: req.user!.businessId }, data: b })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'business.update', entity: 'Business', entityId: before.id, before: { gstin: before.gstin, state: before.state }, after: { gstin: after.gstin, state: after.state } })
    return after
  })

  app.get('/audit-log', { preHandler: requirePerm('settings.manage') }, async (req) => {
    return prisma.auditLog.findMany({ where: { businessId: req.user!.businessId }, orderBy: { createdAt: 'desc' }, take: 200 })
  })
}
