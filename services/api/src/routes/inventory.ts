import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { customerSchema, supplierSchema, itemSchema, stockAdjustSchema } from '@ecobills/types'

function scope(req: any) {
  return { businessId: req.user!.businessId }
}

export async function inventoryRoutes(app: FastifyInstance) {
  // ---- suppliers ----
  app.get('/suppliers', { preHandler: requireAuth }, async (req) => {
    return prisma.supplier.findMany({ where: scope(req), orderBy: { name: 'asc' } })
  })
  app.post('/suppliers', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const b = supplierSchema.parse(req.body)
    return prisma.supplier.create({ data: { ...b, contactEmail: b.contactEmail || '', businessId: req.user!.businessId } })
  })
  app.patch('/suppliers/:id', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const b = supplierSchema.partial().parse(req.body)
    return prisma.supplier.updateMany({ where: { id: (req.params as any).id, businessId: req.user!.businessId }, data: b })
  })

  // ---- items ----
  app.get('/items', { preHandler: requireAuth }, async (req) => {
    const q = (req.query as any)?.q as string | undefined
    const items = await prisma.item.findMany({
      where: { businessId: req.user!.businessId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) },
      include: { primarySupplier: true },
      orderBy: { name: 'asc' },
      take: 200,
    })
    // attach derived stock
    const sums = await prisma.stockLedger.groupBy({
      by: ['itemId'],
      where: { businessId: req.user!.businessId },
      _sum: { deltaQty: true },
    })
    const map = new Map(sums.map((s) => [s.itemId, Number(s._sum.deltaQty || 0)]))
    return items.map((it) => ({ ...it, currentStock: map.get(it.id) || 0, lowStock: (map.get(it.id) || 0) <= Number(it.reorderThreshold) }))
  })

  app.post('/items', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const b = itemSchema.parse(req.body)
    const before = null
    const item = await prisma.item.create({
      data: {
        businessId: req.user!.businessId,
        name: b.name, sku: b.sku, category: b.category, unit: b.unit,
        hsnCode: b.hsnCode || null, costPrice: b.costPrice, salePrice: b.salePrice,
        taxRateBps: b.taxRateBps, reorderThreshold: b.reorderThreshold,
        primarySupplierId: b.primarySupplierId || null,
      },
    })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'item.create', entity: 'Item', entityId: item.id, before, after: item })
    return item
  })

  app.patch('/items/:id', { preHandler: requirePerm('inventory.manage') }, async (req, reply) => {
    const id = (req.params as any).id
    const b = itemSchema.partial().parse(req.body)
    const prev = await prisma.item.findFirst({ where: { id, businessId: req.user!.businessId } })
    if (!prev) return reply.code(404).send({ error: 'not_found' })
    const next = await prisma.item.update({ where: { id }, data: { ...b, hsnCode: b.hsnCode === undefined ? undefined : b.hsnCode || null } })
    if (prev.salePrice !== next.salePrice || prev.costPrice !== next.costPrice || prev.taxRateBps !== next.taxRateBps) {
      await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'item.price_change', entity: 'Item', entityId: id, before: { salePrice: prev.salePrice, costPrice: prev.costPrice, taxRateBps: prev.taxRateBps }, after: { salePrice: next.salePrice, costPrice: next.costPrice, taxRateBps: next.taxRateBps } })
    }
    return next
  })

  // ---- stock ledger ----
  app.get('/stock/ledger', { preHandler: requireAuth }, async (req) => {
    const itemId = (req.query as any)?.itemId as string | undefined
    return prisma.stockLedger.findMany({
      where: { businessId: req.user!.businessId, ...(itemId ? { itemId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  })

  app.get('/stock/low', { preHandler: requireAuth }, async (req) => {
    const items = await prisma.item.findMany({ where: { businessId: req.user!.businessId } })
    const sums = await prisma.stockLedger.groupBy({ by: ['itemId'], where: { businessId: req.user!.businessId }, _sum: { deltaQty: true } })
    const map = new Map(sums.map((s) => [s.itemId, Number(s._sum.deltaQty || 0)]))
    return items
      .map((it) => ({ ...it, currentStock: map.get(it.id) || 0 }))
      .filter((it) => it.currentStock <= Number(it.reorderThreshold))
  })

  // Manual adjustment — Owner only (§6.1 matrix)
  app.post('/stock/adjust', { preHandler: requirePerm('stock.adjust') }, async (req) => {
    const b = stockAdjustSchema.parse(req.body)
    const item = await prisma.item.findFirst({ where: { id: b.itemId, businessId: req.user!.businessId } })
    if (!item) throw Object.assign(new Error('item_not_found'), { statusCode: 404 })
    const row = await prisma.stockLedger.create({
      data: {
        businessId: req.user!.businessId, itemId: b.itemId, deltaQty: b.deltaQty,
        reason: 'adjustment', refType: 'manual', refId: b.note || '', createdBy: req.user!.id,
      },
    })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'stock.adjust', entity: 'Item', entityId: b.itemId, before: { item: item.name }, after: { deltaQty: b.deltaQty, note: b.note } })
    return row
  })
}
