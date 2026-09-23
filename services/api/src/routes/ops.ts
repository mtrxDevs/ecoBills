import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { expenseSchema, businessPatchSchema } from '@ecobills/types'
import { lineTaxable, lineCost, lineTax } from '../money.js'

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
  // GST collected from customers is a tax liability (Output GST), NOT business revenue.
  // Revenue is taxable sales value net of returns.
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

    const taxable = (l: any) => lineTaxable(Number(l.qty), l.unitPriceSnapshot)
    const tax = (l: any) => lineTax(taxable(l), l.taxRateSnapshotBps)
    const cost = (l: any) => lineCost(Number(l.qty), l.unitCostSnapshot)

    const grossSalesTaxable = invLines.reduce((s, l) => s + taxable(l), 0)
    const cnTaxable = cnLines.reduce((s, l) => s + taxable(l), 0)
    const grossCost = invLines.reduce((s, l) => s + cost(l), 0)
    const cnCost = cnLines.reduce((s, l) => s + cost(l), 0)

    const salesOutputGst = invLines.reduce((s, l) => s + tax(l), 0)
    const cnOutputGst = cnLines.reduce((s, l) => s + tax(l), 0)
    const outputGst = Math.max(0, salesOutputGst - cnOutputGst)

    const revenue = Math.round(grossSalesTaxable - cnTaxable) // Net taxable sales revenue
    const cogs = Math.round(grossCost - cnCost)
    const gross = revenue - cogs
    const expTotal = expenses.reduce((s, e) => s + e.amount, 0)
    const net = gross - expTotal
    const grossInvoiced = revenue + outputGst

    // trend by day (taxable revenue net of credit notes)
    const byDay = new Map<string, number>()
    for (const l of invLines) {
      const d = l.invoice.issueDate.toISOString().slice(0, 10)
      byDay.set(d, (byDay.get(d) || 0) + taxable(l))
    }
    for (const l of cnLines) {
      const d = l.creditNote.issueDate.toISOString().slice(0, 10)
      byDay.set(d, (byDay.get(d) || 0) - taxable(l))
    }
    const trend = [...byDay.entries()].sort().map(([date, total]) => ({ date, total }))

    // top items by taxable revenue and margin
    const agg = new Map<string, { name: string; revenue: number; margin: number }>()
    for (const l of invLines) {
      const a = agg.get(l.itemId) || { name: l.item.name, revenue: 0, margin: 0 }
      const rev = taxable(l)
      const c = cost(l)
      a.revenue += rev
      a.margin += rev - c
      agg.set(l.itemId, a)
    }
    for (const l of cnLines) {
      const a = agg.get(l.itemId)
      if (a) {
        const rev = taxable(l)
        const c = cost(l)
        a.revenue -= rev
        a.margin -= rev - c
      }
    }
    const top = [...agg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

    // cash tied up in stock (last-cost)
    const items = await prisma.item.findMany({ where: { businessId: bid } })
    const sums = await prisma.stockLedger.groupBy({ by: ['itemId'], where: { businessId: bid }, _sum: { deltaQty: true } })
    const map = new Map(sums.map((s) => [s.itemId, Number(s._sum.deltaQty || 0)]))
    const stockValue = items.reduce((s, it) => s + Math.max(0, map.get(it.id) || 0) * it.costPrice, 0)

    return {
      from,
      to,
      revenue,
      cogs,
      grossProfit: gross,
      expenses: expTotal,
      netProfit: net,
      outputGst,
      grossInvoiced,
      trend,
      topItems: top,
      stockValue,
    }
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
