import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { financialYear, invoiceNumber, lineTotals, gstSplit } from '../money.js'
import { createInvoiceSchema, recordPaymentSchema, createCreditNoteSchema } from '@ecobills/types'

export async function salesRoutes(app: FastifyInstance) {
  // ---- invoices ----
  app.get('/invoices', { preHandler: requireAuth }, async (req) => {
    const list = await prisma.invoice.findMany({
      where: { businessId: req.user!.businessId },
      include: { lines: true, customer: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return list.map(withPaid)
  })

  app.get('/invoices/:id', { preHandler: requireAuth }, async (req, reply) => {
    const inv = await prisma.invoice.findFirst({
      where: { id: (req.params as any).id, businessId: req.user!.businessId },
      include: { lines: { include: { item: true } }, customer: true, payments: true, business: true },
    })
    if (!inv) return reply.code(404).send({ error: 'not_found' })
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    const sameState = (inv.placeOfSupplyState || inv.business.state) === inv.business.state
    return { ...inv, amountPaid: paid, gstSplit: gstSplit(inv.taxTotal, sameState) }
  })

  app.post('/invoices', { preHandler: requirePerm('invoice.write') }, async (req, reply) => {
    const b = createInvoiceSchema.parse(req.body)
    const bid = req.user!.businessId
    const business = await prisma.business.findUniqueOrThrow({ where: { id: bid } })

    let customer = null
    if (b.customerId) {
      customer = await prisma.customer.findFirst({ where: { id: b.customerId, businessId: bid } })
      if (!customer) return reply.code(404).send({ error: 'customer_not_found' })
    }
    const place = b.placeOfSupplyState || customer?.state || business.state // walk-in defaults same-state

    // resolve items + snapshots
    const ids = [...new Set(b.lines.map((l) => l.itemId))].sort()
    const items = await prisma.item.findMany({ where: { id: { in: ids }, businessId: bid } })
    if (items.length !== ids.length) return reply.code(400).send({ error: 'unknown_item' })
    const byId = new Map(items.map((i) => [i.id, i]))

    const resolved = b.lines.map((l) => {
      const it = byId.get(l.itemId)!
      const unitPrice = l.unitPrice ?? it.salePrice
      const taxBps = l.taxRateBps ?? it.taxRateBps
      const t = lineTotals(l.qty, unitPrice, taxBps)
      return { itemId: l.itemId, qty: l.qty, unitPriceSnapshot: unitPrice, unitCostSnapshot: it.costPrice, taxRateSnapshotBps: taxBps, ...t }
    })
    const subtotal = resolved.reduce((s, r) => s + r.subtotal, 0)
    const taxTotal = resolved.reduce((s, r) => s + r.tax, 0)

    const fy = financialYear(b.issueDate ? new Date(b.issueDate) : new Date())
    const invoice = await prisma.$transaction(
      async (tx) => {
        // 1. Lock item rows in deterministic order to serialize stock checks & prevent overselling
        await tx.$queryRaw`
          SELECT id FROM "Item"
          WHERE id = ANY(${ids}::text[]) AND "businessId" = ${bid}
          ORDER BY id
          FOR UPDATE
        `

        // 2. Sum current stock from StockLedger for these items
        const sums = await tx.stockLedger.groupBy({
          by: ['itemId'],
          where: { businessId: bid, itemId: { in: ids } },
          _sum: { deltaQty: true },
        })

      const stockMap = new Map(sums.map((s) => [s.itemId, Number(s._sum.deltaQty || 0)]))

      // 3. Enforce negative-stock prevention policy: available stock >= requested quantity
      const requestedByItem = new Map<string, number>()
      for (const r of resolved) {
        requestedByItem.set(r.itemId, (requestedByItem.get(r.itemId) || 0) + Number(r.qty))
      }
      for (const [itemId, reqQty] of requestedByItem.entries()) {
        const available = stockMap.get(itemId) || 0
        if (available < reqQty) {
          throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
            statusCode: 400,
            messageText: `Insufficient stock for item "${byId.get(itemId)?.name || itemId}" (available: ${available}, requested: ${reqQty})`,
          })
        }
      }

      // 4. Atomic counter + create invoice (gapless)
      await tx.$executeRaw`INSERT INTO "InvoiceCounter" ("businessId", "financialYear", "lastNumber") VALUES (${bid}, ${fy}, 0) ON CONFLICT DO NOTHING`
      const taken = await tx.$queryRaw<Array<{ n: number }>>`UPDATE "InvoiceCounter" SET "lastNumber" = "lastNumber" + 1 WHERE "businessId" = ${bid} AND "financialYear" = ${fy} RETURNING "lastNumber" AS "n"`
      const next = taken[0]?.n
      if (!next) throw Object.assign(new Error('counter_failed'), { statusCode: 500 })
      const num = invoiceNumber(business.invoicePrefix || 'INV', fy, next)
      const issuedAt = b.issueDate ? new Date(b.issueDate) : new Date()
      // Due date from the customer's terms (walk-ins: none). Bill-to identity
      // is snapshotted so later edits to the customer never rewrite history.
      const dueAt = customer ? new Date(issuedAt.getTime() + (customer.paymentTermsDays || 0) * 86400e3) : null
      const inv = await tx.invoice.create({
        data: {
          businessId: bid,
          customerId: b.customerId || null,
          invoiceNumber: num,
          placeOfSupplyState: place,
          status: 'unpaid',
          issueDate: issuedAt,
          dueDate: dueAt,
          billToName: customer?.name ?? null,
          billToGstin: customer?.gstin ?? null,
          billToAddress: customer?.address ?? null,
          billToState: customer?.state ?? null,
          subtotal, taxTotal, grandTotal: subtotal + taxTotal,
          lines: {
            create: resolved.map((r) => ({
              businessId: bid, itemId: r.itemId, qty: r.qty,
              unitPriceSnapshot: r.unitPriceSnapshot, unitCostSnapshot: r.unitCostSnapshot, taxRateSnapshotBps: r.taxRateSnapshotBps,
            })),
          },
        },
        include: { lines: true },
      })
      // 5. Stock out (sale)
      for (const r of resolved) {
        await tx.stockLedger.create({
          data: { businessId: bid, itemId: r.itemId, deltaQty: -r.qty, reason: 'sale', refType: 'invoice', refId: inv.id, createdBy: req.user!.id },
        })
      }
      // 6. Audit in transaction
      await audit(
        {
          businessId: bid,
          userId: req.user!.id,
          action: 'invoice.create',
          entity: 'Invoice',
          entityId: inv.id,
          after: { number: inv.invoiceNumber, grandTotal: inv.grandTotal },
        },
        tx,
      )
      return inv
    }, { maxWait: 15000, timeout: 20000 })

    return invoice

  })

  // payments — amount_paid is derived, never stored; protected by row-level locking
  app.post('/invoices/:id/payments', { preHandler: requirePerm('invoice.write') }, async (req, reply) => {
    const b = recordPaymentSchema.parse(req.body)
    const id = (req.params as any).id
    const bid = req.user!.businessId

    let paidAt: Date | undefined
    if (b.paidAt !== undefined) {
      paidAt = new Date(b.paidAt)
      if (Number.isNaN(paidAt.getTime())) return reply.code(400).send({ error: 'validation', message: 'paidAt must be a valid date' })
    }

    const pay = await prisma.$transaction(async (tx) => {
      // 1. Lock invoice row for update in PostgreSQL
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; grandTotal: number }>>`
        SELECT id, status, "grandTotal"
        FROM "Invoice"
        WHERE id = ${id} AND "businessId" = ${bid}
        FOR UPDATE
      `
      const inv = rows[0]
      if (!inv) throw Object.assign(new Error('not_found'), { statusCode: 404 })
      if (inv.status === 'void') throw Object.assign(new Error('invoice_void'), { statusCode: 400 })

      // 2. Sum existing payments inside the lock
      const sumResult = await tx.payment.aggregate({
        where: { invoiceId: inv.id, businessId: bid },
        _sum: { amount: true },
      })
      const paid = sumResult._sum.amount || 0
      if (paid + b.amount > inv.grandTotal) {
        throw Object.assign(new Error('overpayment'), { statusCode: 400 })
      }

      const p = await tx.payment.create({
        data: {
          businessId: bid,
          invoiceId: inv.id,
          amount: b.amount,
          method: b.method as any,
          note: b.note,
          ...(paidAt ? { paidAt } : {}),
        },
      })

      const now = paid + b.amount
      const nextStatus = now >= inv.grandTotal ? 'paid' : now > 0 ? 'partial' : 'unpaid'
      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: nextStatus },
      })

      await audit(
        {
          businessId: bid,
          userId: req.user!.id,
          action: 'payment.record',
          entity: 'Invoice',
          entityId: inv.id,
          after: { amount: b.amount, method: b.method, status: nextStatus },
        },
        tx,
      )

      return p
    })

    return pay
  })

  // void — only when amount_paid = 0
  app.post('/invoices/:id/void', { preHandler: requirePerm('invoice.void') }, async (req) => {
    const id = (req.params as any).id
    const bid = req.user!.businessId

    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM "Invoice"
        WHERE id = ${id} AND "businessId" = ${bid}
        FOR UPDATE
      `
      const inv = rows[0]
      if (!inv) throw Object.assign(new Error('not_found'), { statusCode: 404 })
      if (inv.status === 'void') return

      const sumResult = await tx.payment.aggregate({
        where: { invoiceId: inv.id, businessId: bid },
        _sum: { amount: true },
      })
      const paid = sumResult._sum.amount || 0
      if (paid > 0) {
        throw Object.assign(new Error('paid_invoice_cannot_void'), {
          statusCode: 400,
          messageText: 'Issue a credit note instead.',
        })
      }

      await tx.invoice.update({ where: { id: inv.id }, data: { status: 'void' } })
      const lines = await tx.invoiceLine.findMany({ where: { invoiceId: inv.id } })
      for (const l of lines) {
        await tx.stockLedger.create({
          data: {
            businessId: bid,
            itemId: l.itemId,
            deltaQty: l.qty,
            reason: 'return',
            refType: 'void',
            refId: inv.id,
            createdBy: req.user!.id,
          },
        })
      }
      await audit(
        {
          businessId: bid,
          userId: req.user!.id,
          action: 'invoice.void',
          entity: 'Invoice',
          entityId: inv.id,
          before: { status: inv.status },
          after: { status: 'void' },
        },
        tx,
      )
    })
    return { ok: true }
  })

  // credit notes — financial recognition of returns with remaining returnable quantity validation
  app.post('/invoices/:id/credit-notes', { preHandler: requirePerm('invoice.void') }, async (req) => {
    const b = createCreditNoteSchema.parse(req.body)
    const id = (req.params as any).id
    const bid = req.user!.businessId

    const note = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; grandTotal: number }>>`
        SELECT id, status, "grandTotal"
        FROM "Invoice"
        WHERE id = ${id} AND "businessId" = ${bid}
        FOR UPDATE
      `
      const inv = rows[0]
      if (!inv) throw Object.assign(new Error('not_found'), { statusCode: 404 })
      if (inv.status === 'void') throw Object.assign(new Error('invoice_void'), { statusCode: 400 })

      const origLines = await tx.invoiceLine.findMany({
        where: { invoiceId: inv.id, businessId: bid },
        include: { item: true },
      })
      const origByItem = new Map(origLines.map((l) => [l.itemId, l]))

      // Sum existing credit note quantities for each item on this invoice
      const creditedSums = await tx.creditNoteLine.groupBy({
        by: ['itemId'],
        where: { creditNote: { invoiceId: inv.id }, businessId: bid },
        _sum: { qty: true },
      })
      const alreadyCredited = new Map(creditedSums.map((c) => [c.itemId, Number(c._sum.qty || 0)]))

      // Verify each requested return line does not exceed remaining returnable quantity
      for (const l of b.lines) {
        const orig = origByItem.get(l.itemId)
        if (!orig) {
          throw Object.assign(new Error('item_not_on_invoice'), {
            statusCode: 400,
            messageText: `Item ${l.itemId} is not present on original invoice`,
          })
        }
        const origQty = Number(orig.qty)
        const previousQty = alreadyCredited.get(l.itemId) || 0
        const returnable = Math.max(0, origQty - previousQty)
        if (l.qty > returnable) {
          throw Object.assign(new Error('CREDIT_NOTE_EXCEEDS_REMAINING_QTY'), {
            statusCode: 400,
            messageText: `Requested return qty (${l.qty}) exceeds returnable qty (${returnable}) for item "${orig.item.name}"`,
          })
        }
        alreadyCredited.set(l.itemId, previousQty + l.qty)
      }

      const ids = [...new Set(b.lines.map((l) => l.itemId))]
      const items = await tx.item.findMany({ where: { id: { in: ids }, businessId: bid } })
      const byId = new Map(items.map((i) => [i.id, i]))

      const resolved = b.lines.map((l) => {
        const orig = origByItem.get(l.itemId)
        const unitPrice = orig?.unitPriceSnapshot ?? byId.get(l.itemId)?.salePrice ?? 0
        const unitCost = orig?.unitCostSnapshot ?? byId.get(l.itemId)?.costPrice ?? 0
        const taxBps = orig?.taxRateSnapshotBps ?? byId.get(l.itemId)?.taxRateBps ?? 0
        const t = lineTotals(l.qty, unitPrice, taxBps)
        return { itemId: l.itemId, qty: l.qty, unitPriceSnapshot: unitPrice, unitCostSnapshot: unitCost, taxRateSnapshotBps: taxBps, ...t }
      })
      const subtotal = resolved.reduce((s, r) => s + r.subtotal, 0)
      const taxTotal = resolved.reduce((s, r) => s + r.tax, 0)

      const cn = await tx.creditNote.create({
        data: {
          businessId: bid,
          invoiceId: inv.id,
          reason: b.reason,
          subtotal,
          taxTotal,
          grandTotal: subtotal + taxTotal,
          lines: {
            create: resolved.map((r) => ({
              businessId: bid,
              itemId: r.itemId,
              qty: r.qty,
              unitPriceSnapshot: r.unitPriceSnapshot,
              unitCostSnapshot: r.unitCostSnapshot,
              taxRateSnapshotBps: r.taxRateSnapshotBps,
            })),
          },
        },
        include: { lines: true },
      })

      for (const r of resolved) {
        await tx.stockLedger.create({
          data: {
            businessId: bid,
            itemId: r.itemId,
            deltaQty: r.qty,
            reason: 'return',
            refType: 'credit_note',
            refId: cn.id,
            createdBy: req.user!.id,
          },
        })
      }

      await audit(
        {
          businessId: bid,
          userId: req.user!.id,
          action: 'credit_note.create',
          entity: 'Invoice',
          entityId: inv.id,
          after: { creditNoteId: cn.id, grandTotal: cn.grandTotal, reason: b.reason },
        },
        tx,
      )

      return cn
    })

    return note
  })


  app.get('/invoices/:id/pdf', { preHandler: requireAuth }, async (req, reply) => {
    const inv = await prisma.invoice.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId }, include: { lines: { include: { item: true } }, customer: true, business: true } })
    if (!inv) return reply.code(404).send({ error: 'not_found' })
    const { renderInvoicePdfHtml } = await import('../pdf.js')
    const fmt = (p: number) => `Rs ${(p / 100).toFixed(2)}`
    const html = await renderInvoicePdfHtml({
      businessName: inv.business.name, businessAddress: inv.business.address, gstin: inv.business.gstin,
      invoiceNumber: inv.invoiceNumber, issueDate: inv.issueDate.toISOString().slice(0, 10),
      customerName: inv.billToName || inv.customer?.name || 'Walk-in',
      lines: inv.lines.map((l) => ({ name: l.item.name, qty: String(l.qty), price: fmt(l.unitPriceSnapshot), tax: fmt(Math.round((Number(l.qty) * l.unitPriceSnapshot * l.taxRateSnapshotBps) / 10000)), total: fmt(Math.round(Number(l.qty) * l.unitPriceSnapshot * (1 + l.taxRateSnapshotBps / 10000))) })),
      subtotal: fmt(inv.subtotal), taxTotal: fmt(inv.taxTotal), grandTotal: fmt(inv.grandTotal),
      gstNote: inv.business.gstin ? ((inv.placeOfSupplyState || inv.business.state) === inv.business.state ? 'CGST + SGST as applicable.' : 'IGST as applicable.') : 'Non-GST bill (business below registration threshold).',
    })
    const accept = (req.headers.accept || '')
    if (accept.includes('text/html')) {
      reply.header('Content-Type', 'text/html')
      return html
    }
    try {
      const { htmlToPdfBuffer } = await import('../pdf.js')
      const buf = await htmlToPdfBuffer(html)
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="${inv.invoiceNumber}.pdf"`)
      return reply.send(buf)
    } catch {
      reply.header('Content-Type', 'text/html')
      return html // graceful fallback when chromium absent
    }
  })
}

function withPaid(inv: any) {
  const paid = (inv.payments || []).reduce((s: number, p: any) => s + p.amount, 0)
  return { ...inv, amountPaid: paid }
}
