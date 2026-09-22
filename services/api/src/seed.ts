// Demo/seed data — reviewer can seed and verify RBAC + P&L by hand (Phase 9 DoD).
import './env.js'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from './auth.js'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_OWNER_EMAIL || 'owner@demo.shop'
  await prisma.user.deleteMany({ where: { email: { in: [email, 'staff@demo.shop'] } } }).catch(() => {})
  const biz = await prisma.business.create({
    data: { name: 'Demo Kirana Store', state: 'Maharashtra', gstin: '27ABCDE1234F1Z5', address: 'MG Road, Pune', invoicePrefix: 'INV' },
  })
  const owner = await prisma.user.create({
    data: { businessId: biz.id, name: 'Demo Owner', email, passwordHash: await hashPassword('password123'), role: 'owner', emailVerified: true },
  })
  await prisma.user.create({
    data: { businessId: biz.id, name: 'Demo Staff', email: 'staff@demo.shop', passwordHash: await hashPassword('password123'), role: 'staff', emailVerified: true },
  })
  const sup = await prisma.supplier.create({ data: { businessId: biz.id, name: 'Sharma Distributors', contactEmail: 'orders@sharma.example', phone: '98200 12345' } })
  const cust = await prisma.customer.create({ data: { businessId: biz.id, name: 'Walk-in Regular', phone: '98200 00000', state: 'Maharashtra' } })
  const rice = await prisma.item.create({
    data: { businessId: biz.id, name: 'Basmati Rice 5kg', sku: 'RICE-5KG', category: 'Grocery', unit: 'pcs', costPrice: 32000, salePrice: 39900, taxRateBps: 500, reorderThreshold: 10, primarySupplierId: sup.id },
  })
  const oil = await prisma.item.create({
    data: { businessId: biz.id, name: 'Sunflower Oil 1L', sku: 'OIL-1L', category: 'Grocery', unit: 'pcs', costPrice: 11500, salePrice: 14500, taxRateBps: 500, reorderThreshold: 20, primarySupplierId: sup.id },
  })
  // opening stock
  for (const [item, qty] of [[rice, 50], [oil, 40]] as const) {
    await prisma.stockLedger.create({ data: { businessId: biz.id, itemId: item.id, deltaQty: qty, reason: 'purchase_receipt', refType: 'seed', refId: 'opening', createdBy: owner.id } })
  }
  // one expense
  await prisma.expense.create({ data: { businessId: biz.id, category: 'Rent', amount: 1500000, note: 'September rent' } })
  console.log(`seeded business=${biz.id} owner=${email}/password123 staff=staff@demo.shop/password123 customer=${cust.id}`)
}

main().finally(() => prisma.$disconnect())
