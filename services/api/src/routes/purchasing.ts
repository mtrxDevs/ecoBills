import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { prisma } from '../db.js'
import { requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { renderPOTemplate, sendSupplierEmail } from '../email.js'
import { sha256Hex } from '../money.js'
import { createPOSchema, sendPOSchema, receivePOSchema } from '@ecobills/types'

export async function purchasingRoutes(app: FastifyInstance) {
  app.get('/purchase-orders', { preHandler: requireAuth }, async (req) => {
    const pos = await prisma.purchaseOrder.findMany({
      where: { businessId: req.user!.businessId },
      include: { lines: { include: { item: true } }, supplier: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const days = Number(process.env.PO_FOLLOWUP_DAYS || 7)
    const now = Date.now()
    return pos.map((p) => ({
      ...p,
      followUpNudge: p.status === 'sent' && p.sentAt ? (now - new Date(p.sentAt).getTime()) / 86400e3 > days : false,
    }))
  })

  // Group low-stock by supplier → one draft PO per supplier (owner or staff can draft; only owner sends)
  app.post('/purchase-orders/from-low-stock', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const items = await prisma.item.findMany({ where: { businessId: req.user!.businessId }, include: { primarySupplier: true } })
    const sums = await prisma.stockLedger.groupBy({ by: ['itemId'], where: { businessId: req.user!.businessId }, _sum: { deltaQty: true } })
    const map = new Map(sums.map((s) => [s.itemId, Number(s._sum.deltaQty || 0)]))
    const low = items.filter((it) => (map.get(it.id) || 0) <= Number(it.reorderThreshold) && it.primarySupplierId)
    const bySup = new Map<string, typeof low>()
    for (const it of low) {
      const k = it.primarySupplierId!
      if (!bySup.has(k)) bySup.set(k, [])
      bySup.get(k)!.push(it)
    }
    const business = await prisma.business.findUniqueOrThrow({ where: { id: req.user!.businessId } })
    const created = []
    for (const [supId, group] of bySup) {
      const sup = await prisma.supplier.findUniqueOrThrow({ where: { id: supId } })
      const tpl = renderPOTemplate({
        businessName: business.name, supplierName: sup.name,
        lines: group.map((g) => ({ sku: g.sku, name: g.name, qty: Math.max(1, Math.ceil(Number(g.reorderThreshold) * 2 - (map.get(g.id) || 0))), unit: g.unit, lastPricePaise: g.costPrice })),
        currency: business.currency,
      })
      const po = await prisma.purchaseOrder.create({
        data: {
          businessId: req.user!.businessId, supplierId: supId, status: 'draft',
          emailSubject: tpl.subject, emailBody: tpl.body, idempotencyKey: randomUUID(),
          lines: { create: group.map((g) => ({ businessId: req.user!.businessId, itemId: g.id, qtyRequested: Math.max(1, Math.ceil(Number(g.reorderThreshold) * 2 - (map.get(g.id) || 0))), lastKnownPrice: g.costPrice })) },
        },
        include: { lines: true },
      })
      created.push(po)
    }
    return { created: created.length, orders: created }
  })

  app.post('/purchase-orders', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const b = createPOSchema.parse(req.body)
    const business = await prisma.business.findUniqueOrThrow({ where: { id: req.user!.businessId } })
    const sup = await prisma.supplier.findFirst({ where: { id: b.supplierId, businessId: req.user!.businessId } })
    if (!sup) throw Object.assign(new Error('supplier_not_found'), { statusCode: 404 })
    const items = await prisma.item.findMany({ where: { id: { in: b.lines.map((l) => l.itemId) }, businessId: req.user!.businessId } })
    const byId = new Map(items.map((i) => [i.id, i]))
    const tpl = renderPOTemplate({
      businessName: business.name, supplierName: sup.name,
      lines: b.lines.map((l) => { const it = byId.get(l.itemId)!; return { sku: it.sku, name: it.name, qty: l.qtyRequested, unit: it.unit, lastPricePaise: it.costPrice } }),
      currency: business.currency,
    })
    return prisma.purchaseOrder.create({
      data: {
        businessId: req.user!.businessId, supplierId: sup.id, status: 'draft',
        emailSubject: b.emailSubject || tpl.subject, emailBody: b.emailBody || tpl.body,
        idempotencyKey: randomUUID(),
        lines: { create: b.lines.map((l) => ({ businessId: req.user!.businessId, itemId: l.itemId, qtyRequested: l.qtyRequested, lastKnownPrice: byId.get(l.itemId)?.costPrice || 0 })) },
      },
      include: { lines: true },
    })
  })

  app.patch('/purchase-orders/:id', { preHandler: requirePerm('inventory.manage') }, async (req, reply) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId } })
    if (!po) return reply.code(404).send({ error: 'not_found' })
    if (po.status !== 'draft') return reply.code(400).send({ error: 'only_drafts_editable' })
    const b = sendPOSchema.parse(req.body)
    return prisma.purchaseOrder.update({ where: { id: po.id }, data: { emailSubject: b.subject ?? po.emailSubject, emailBody: b.body ?? po.emailBody } })
  })

  // Idempotent send — Owner only. Double-click/retry cannot send twice.
  app.post('/purchase-orders/:id/send', { preHandler: requirePerm('po.send') }, async (req, reply) => {
    const b = sendPOSchema.parse(req.body || {})
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: (req.params as any).id, businessId: req.user!.businessId },
      include: { supplier: true },
    })
    if (!po) return reply.code(404).send({ error: 'not_found' })
    if (po.status !== 'draft') {
      // idempotent replay: already sent → return current state, do NOT resend
      return { ...po, alreadySent: true }
    }
    const subject = b.subject || po.emailSubject
    const body = b.body || po.emailBody
    if (!po.supplier.contactEmail) return reply.code(400).send({ error: 'supplier_email_missing' })
    try {
      const r = await sendSupplierEmail({ to: po.supplier.contactEmail, subject, body, idempotencyKey: po.idempotencyKey })
      const updated = await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'sent', sentAt: new Date(), emailSubject: subject, emailBody: body } })
      await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'po.send', entity: 'PurchaseOrder', entityId: po.id, after: { to: po.supplier.contactEmail, providerId: r.providerId, stub: r.stub, contentHash: sha256Hex(subject + '\n' + body) } })
      return updated
    } catch (e: any) {
      return reply.code(502).send({ error: 'email_failed', message: e.message })
    }
  })

  // Optional AI polish — rewrites prose, lands back in editable preview, never sends.
  app.post('/purchase-orders/:id/polish', { preHandler: requirePerm('inventory.manage') }, async (req, reply) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId }, include: { supplier: true, lines: { include: { item: true } } } })
    if (!po) return reply.code(404).send({ error: 'not_found' })
    const url = process.env.LLM_POLISH_API_URL
    if (!url) return reply.code(501).send({ error: 'ai_not_configured', message: 'Set LLM_POLISH_API_URL to enable Polish with AI.' })
    // Proxy structured order; provider-agnostic.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.LLM_POLISH_API_KEY ? { Authorization: `Bearer ${process.env.LLM_POLISH_API_KEY}` } : {}) },
      body: JSON.stringify({ subject: po.emailSubject, body: po.emailBody, supplier: po.supplier.name, lines: po.lines.map((l) => ({ name: l.item.name, sku: l.item.sku, qty: String(l.qtyRequested) })) }),
    })
    if (!res.ok) return reply.code(502).send({ error: 'ai_failed' })
    const j = (await res.json()) as { subject?: string; body?: string }
    const updated = await prisma.purchaseOrder.update({ where: { id: po.id }, data: { emailSubject: j.subject || po.emailSubject, emailBody: j.body || po.emailBody } })
    return updated
  })

  // Receiving — owner or staff. Partial + decimal OK. Writes ledger, updates cost going forward.
  app.post('/purchase-orders/:id/receive', { preHandler: requirePerm('po.receive') }, async (req) => {
    const b = receivePOSchema.parse(req.body)
    const id = (req.params as any).id
    const bid = req.user!.businessId

    const updatedPO = await prisma.$transaction(async (tx) => {
      // 1. Lock PO row for update to serialize concurrent receive operations
      const poRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM "PurchaseOrder"
        WHERE id = ${id} AND "businessId" = ${bid}
        FOR UPDATE
      `
      const po = poRows[0]
      if (!po) throw Object.assign(new Error('not_found'), { statusCode: 404 })
      if (po.status !== 'sent' && po.status !== 'partial') {
        throw Object.assign(new Error('not_receivable'), { statusCode: 400 })
      }

      // 2. Lock and get all lines for this PO
      const lines = await tx.pOLine.findMany({
        where: { purchaseOrderId: po.id, businessId: bid },
      })
      const byLine = new Map(lines.map((l) => [l.id, l]))

      // 3. Validate lines before applying changes
      for (const r of b.lines) {
        const line = byLine.get(r.lineId)
        if (!line) {
          throw Object.assign(new Error('unknown_line'), { statusCode: 400 })
        }
        const currentReceived = Number(line.qtyReceived)
        const requested = Number(line.qtyRequested)
        const newReceived = Number(r.qtyReceived)

        if (newReceived < currentReceived) {
          throw Object.assign(new Error('CANNOT_DECREASE_RECEIVED_QTY'), {
            statusCode: 400,
            messageText: `Received quantity cannot be decreased (current: ${currentReceived}, received: ${newReceived})`,
          })
        }
        if (newReceived > requested) {
          throw Object.assign(new Error('PURCHASE_RECEIPT_EXCEEDS_ORDER'), {
            statusCode: 400,
            messageText: `Received quantity (${newReceived}) exceeds requested quantity (${requested})`,
          })
        }
      }

      // 4. Update lines and stock ledger atomically
      for (const r of b.lines) {
        const line = byLine.get(r.lineId)!
        const currentReceived = Number(line.qtyReceived)
        const newReceived = Number(r.qtyReceived)
        const add = newReceived - currentReceived

        if (add > 0) {
          await tx.pOLine.update({ where: { id: line.id }, data: { qtyReceived: newReceived } })
          await tx.stockLedger.create({
            data: {
              businessId: bid,
              itemId: line.itemId,
              deltaQty: add,
              reason: 'purchase_receipt',
              refType: 'purchase_order',
              refId: po.id,
              createdBy: req.user!.id,
            },
          })
          if (line.lastKnownPrice > 0) {
            await tx.item.update({ where: { id: line.itemId }, data: { costPrice: line.lastKnownPrice } })
          }
        }
      }

      const fresh = await tx.pOLine.findMany({ where: { purchaseOrderId: po.id } })
      const allDone = fresh.every((l) => Number(l.qtyReceived) >= Number(l.qtyRequested))
      const anyDone = fresh.some((l) => Number(l.qtyReceived) > 0)
      const nextStatus = allDone ? 'fulfilled' : anyDone ? 'partial' : 'sent'
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: nextStatus } })

      await audit(
        {
          businessId: bid,
          userId: req.user!.id,
          action: 'po.receive',
          entity: 'PurchaseOrder',
          entityId: po.id,
          after: { lines: b.lines, status: nextStatus },
        },
        tx,
      )

      return tx.purchaseOrder.findUnique({ where: { id: po.id }, include: { lines: true } })
    })

    return updatedPO
  })
}

