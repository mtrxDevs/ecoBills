import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { financialYear, invoiceNumber, lineTotals, gstSplit } from '../money.js'
import { customerSchema, createInvoiceSchema, recordPaymentSchema, createCreditNoteSchema } from '@ecobills/types'

export async function salesRoutes(app: FastifyInstance) {
  app.get('/customers', { preHandler: requireAuth }, async (req) => {
    return prisma.customer.findMany({ where: { businessId: req.user!.businessId }, orderBy: { name: 'asc' } })
  })
  app.post('/customers', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const b = customerSchema.parse(req.body)
    return prisma.customer.create({ data: { ...b, email: b.email || null, gstin: b.gstin || null, businessId: req.user!.businessId } })
  })
  app.patch('/customers/:id', { preHandler: requirePerm('inventory.manage') }, async (req) => {
    const b = customerSchema.partial().parse(req.body)
    await prisma.customer.updateMany({ where: { id: (req.params as any).id, businessId: req.user!.businessId }, data: b })
    return { ok: true }
  })

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
    const business = await prisma.business.findUniqueOrThrow({ where: { id: req.user!.businessId } })

    let customer = null
    if (b.customerId) {
      customer = await prisma.customer.findFirst({ where: { id: b.customerId, businessId: req.user!.businessId } })
      if (!customer) return reply.code(404).send({ error: 'customer_not_found' })
    }
    const place = b.placeOfSupplyState || customer?.state || business.state // walk-in defaults same-state

    // resolve items + snapshots
    const ids = [...new Set(b.lines.map((l) => l.itemId))]
    const items = await prisma.item.findMany({ where: { id: { in: ids }, businessId: req.user!.businessId } })
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

    // Atomic counter + create (gapless, no MAX()+1 race)
    const fy = financialYear(b.issueDate ? new Date(b.issueDate) : new Date())
    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceCounter.upsert({
        where: { businessId_financialYear: { businessId: req.user!.businessId, financialYear: fy } },
        create: { businessId: req.user!.businessId, financialYear: fy, lastNumber: 0 },
        update: {},
      })
      // lock the counter row
      await tx.$queryRaw`SELECT "lastNumber" FROM "InvoiceCounter" WHERE "businessId" = ${req.user!.businessId} AND "financialYear" = ${fy} FOR UPDATE`
      const counter = await tx.invoiceCounter.update({
        where: { businessId_financialYear: { businessId: req.user!.businessId, financialYear: fy } },
        data: { lastNumber: { increment: 1 } },
      })
      const num = invoiceNumber(business.invoicePrefix || 'INV', fy, counter.lastNumber)
      const inv = await tx.invoice.create({
        data: {
          businessId: req.user!.businessId,
          customerId: b.customerId || null,
          invoiceNumber: num,
          placeOfSupplyState: place,
          status: 'unpaid',
          issueDate: b.issueDate ? new Date(b.issueDate) : new Date(),
          subtotal, taxTotal, grandTotal: subtotal + taxTotal,
          lines: {
            create: resolved.map((r) => ({
              businessId: req.user!.businessId, itemId: r.itemId, qty: r.qty,
              unitPriceSnapshot: r.unitPriceSnapshot, unitCostSnapshot: r.unitCostSnapshot, taxRateSnapshotBps: r.taxRateSnapshotBps,
            })),
          },
        },
        include: { lines: true },
      })
      // stock out (sale)
      for (const r of resolved) {
        await tx.stockLedger.create({
          data: { businessId: req.user!.businessId, itemId: r.itemId, deltaQty: -r.qty, reason: 'sale', refType: 'invoice', refId: inv.id, createdBy: req.user!.id },
        })
      }
      return inv
    })

    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'invoice.create', entity: 'Invoice', entityId: invoice.id, after: { number: invoice.invoiceNumber, grandTotal: invoice.grandTotal } })
    return invoice
  })

  // payments — amount_paid is derived, never stored
  app.post('/invoices/:id/payments', { preHandler: requirePerm('invoice.write') }, async (req, reply) => {
    const b = recordPaymentSchema.parse(req.body)
    const inv = await prisma.invoice.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId }, include: { payments: true } })
    if (!inv) return reply.code(404).send({ error: 'not_found' })
    if (inv.status === 'void') return reply.code(400).send({ error: 'invoice_void' })
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    if (paid + b.amount > inv.grandTotal) return reply.code(400).send({ error: 'overpayment' })
    const pay = await prisma.payment.create({
      data: { businessId: req.user!.businessId, invoiceId: inv.id, amount: b.amount, method: b.method as any, note: b.note },
    })
    const now = paid + b.amount
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: now >= inv.grandTotal ? 'paid' : now > 0 ? 'partial' : 'unpaid' } })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'payment.record', entity: 'Invoice', entityId: inv.id, after: { amount: b.amount, method: b.method } })
    return pay
  })

  // void — only when amount_paid = 0
  app.post('/invoices/:id/void', { preHandler: requirePerm('invoice.void') }, async (req, reply) => {
    const inv = await prisma.invoice.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId }, include: { payments: true, lines: true } })
    if (!inv) return reply.code(404).send({ error: 'not_found' })
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    if (paid > 0) return reply.code(400).send({ error: 'paid_invoice_cannot_void', message: 'Issue a credit note instead.' })
    if (inv.status === 'void') return { ok: true }
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: inv.id }, data: { status: 'void' } })
      for (const l of inv.lines) {
        await tx.stockLedger.create({ data: { businessId: req.user!.businessId, itemId: l.itemId, deltaQty: l.qty, reason: 'return', refType: 'void', refId: inv.id, createdBy: req.user!.id } })
      }
    })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'invoice.void', entity: 'Invoice', entityId: inv.id, before: { status: inv.status }, after: { status: 'void' } })
    return { ok: true }
  })

  // credit notes — financial recognition of returns
  app.post('/invoices/:id/credit-notes', { preHandler: requirePerm('invoice.void') }, async (req, reply) => {
    const b = createCreditNoteSchema.parse(req.body)
    const inv = await prisma.invoice.findFirst({ where: { id: (req.params as any).id, businessId: req.user!.businessId }, include: { lines: true } })
    if (!inv) return reply.code(404).send({ error: 'not_found' })
    const ids = [...new Set(b.lines.map((l) => l.itemId))]
    const items = await prisma.item.findMany({ where: { id: { in: ids }, businessId: req.user!.businessId } })
    const byId = new Map(items.map((i) => [i.id, i]))
    // snapshot from original invoice line where possible (price protection)
    const invLineByItem = new Map(inv.lines.map((l) => [l.itemId, l]))
    const resolved = b.lines.map((l) => {
      const orig = invLineByItem.get(l.itemId)
      const unitPrice = orig?.unitPriceSnapshot ?? byId.get(l.itemId)?.salePrice ?? 0
      const unitCost = orig?.unitCostSnapshot ?? byId.get(l.itemId)?.costPrice ?? 0
      const taxBps = orig?.taxRateSnapshotBps ?? byId.get(l.itemId)?.taxRateBps ?? 0
      const t = lineTotals(l.qty, unitPrice, taxBps)
      return { itemId: l.itemId, qty: l.qty, unitPriceSnapshot: unitPrice, unitCostSnapshot: unitCost, taxRateSnapshotBps: taxBps, ...t }
    })
    const subtotal = resolved.reduce((s, r) => s + r.subtotal, 0)
    const taxTotal = resolved.reduce((s, r) => s + r.tax, 0)
    const note = await prisma.$transaction(async (tx) => {
      const cn = await tx.creditNote.create({
        data: {
          businessId: req.user!.businessId, invoiceId: inv.id, reason: b.reason,
          subtotal, taxTotal, grandTotal: subtotal + taxTotal,
          lines: { create: resolved.map((r) => ({ businessId: req.user!.businessId, itemId: r.itemId, qty: r.qty, unitPriceSnapshot: r.unitPriceSnapshot, unitCostSnapshot: r.unitCostSnapshot, taxRateSnapshotBps: r.taxRateSnapshotBps })) },
        },
        include: { lines: true },
      })
      for (const r of resolved) {
        await tx.stockLedger.create({ data: { businessId: req.user!.businessId, itemId: r.itemId, deltaQty: r.qty, reason: 'return', refType: 'credit_note', refId: cn.id, createdBy: req.user!.id } })
      }
      return cn
    })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'credit_note.create', entity: 'Invoice', entityId: inv.id, after: { creditNoteId: note.id, grandTotal: note.grandTotal } })
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
      customerName: inv.customer?.name || 'Walk-in',
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
