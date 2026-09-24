// Milestone 0 integration suite: the whole request path (inject → routes →
// Prisma → real Postgres) for auth, RBAC, tenant isolation, and money flows.
//
// Requires a reachable DATABASE_URL (local Docker or Supabase). Without one
// the suite skips instead of failing — unit tests still run everywhere.
// Email is forced to stub mode and 6-digit codes are read back from the stub
// log line, so no real mail ever leaves during tests.
import '../src/env.js'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '../src/db.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

process.env.RESEND_STUB = '1'

const hasDb = await (async () => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error('db-timeout')), 15000)),
    ])
    return true
  } catch {
    return false
  }
})()

describe.runIf(hasDb)('api integration (live postgres)', () => {
  let app: FastifyInstance
  const seenLogs: string[] = []
  let n = 0
  const tag = 'm0int'

  const email = (who: string) => `${tag}-${Date.now()}-${n++}-${who}@example.com`

  function lastCodeFor(addr: string): string {
    const re = new RegExp(`\\[2fa:stub\\] code for ${addr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (\\d{6})`, 'g')
    let m: RegExpExecArray | null
    let last = ''
    for (const line of seenLogs) {
      re.lastIndex = 0
      while ((m = re.exec(line)) !== null) last = m[1]
    }
    if (!last) throw new Error(`no stub code captured for ${addr}`)
    return last
  }

  type Jar = { cookie: string }
  async function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    opts: { body?: unknown; jar?: Jar } = {},
  ) {
    const res = await app.inject({
      method,
      url: path,
      payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      headers: {
        ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(opts.jar ? { cookie: opts.jar.cookie } : {}),
      },
    })
    const setCookie = res.headers['set-cookie']
    const jar: Jar | undefined = setCookie
      ? { cookie: String(setCookie).split(';')[0] }
      : undefined
    let json: any = null
    try {
      json = JSON.parse(res.body)
    } catch {
      /* non-JSON */
    }
    return { status: res.statusCode, json, jar }
  }

  async function signupBusiness(ownerEmail: string, businessName = 'M0 Test Shop') {
    const s = await call('POST', '/api/auth/signup', {
      body: {
        businessName,
        state: 'Maharashtra',
        ownerName: 'M0 Owner',
        email: ownerEmail,
        password: 'password123',
      },
    })
    expect(s.status).toBe(200)
    expect(s.json.emailVerificationRequired).toBe(true)
    const code = lastCodeFor(ownerEmail)
    const v = await call('POST', '/api/auth/verify-email', {
      body: { challengeToken: s.json.challengeToken, code },
    })
    expect(v.status).toBe(200)
    expect(v.jar).toBeDefined()
    return { jar: v.jar as Jar, user: v.json.user }
  }

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation((...a: any[]) => {
      seenLogs.push(a.join(' '))
    })
    app = await buildApp({ logger: process.env.TEST_DEBUG_LOGS === '1' })
    const { connectDb } = await import('../src/db.js')
    await connectDb(3)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await prisma.business.deleteMany({ where: { name: { startsWith: 'M0 Test' } } }).catch(() => {})
    await app.close().catch(() => {})
    await prisma.$disconnect()
  })

  it('signup → verify → login → me', async () => {
    const addr = email('owner')
    const { jar, user } = await signupBusiness(addr)
    expect(user.emailVerified).toBe(true)
    const me = await call('GET', '/api/auth/me', { jar })
    expect(me.status).toBe(200)
    expect(me.json.user.email).toBe(addr)
    // wrong password still rejected
    const bad = await call('POST', '/api/auth/login', { body: { email: addr, password: 'nope' } })
    expect(bad.status).toBe(401)
  })

  it('staff is blocked server-side from every owner-only action', async () => {
    const ownerAddr = email('boss')
    const staffAddr = email('staff')
    const { jar: ownerJar } = await signupBusiness(ownerAddr)
    // owner creates staff
    const mk = await call('POST', '/api/users', {
      body: { name: 'M0 Staff', email: staffAddr, password: 'password123', role: 'staff' },
      jar: ownerJar,
    })
    expect(mk.status).toBe(200)
    const login = await call('POST', '/api/auth/login', { body: { email: staffAddr, password: 'password123' } })
    // seed-style staff are verified via signup? No — created by owner, unverified:
    // owner-created accounts must verify before use.
    expect(login.json.emailVerificationRequired).toBe(true)
    const code = lastCodeFor(staffAddr)
    const verified = await call('POST', '/api/auth/verify-email', {
      body: { challengeToken: login.json.challengeToken, code },
    })
    expect(verified.status).toBe(200)
    const staffJar = verified.jar as Jar

    const denied: Array<[string, string, unknown?]> = [
      ['PATCH', '/api/business', { name: 'Hacked' }],
      ['POST', '/api/users', { body: { name: 'X', email: email('x'), password: 'password123', role: 'staff' } }],
      ['GET', '/api/reports/pnl', undefined],
      ['GET', '/api/audit-log', undefined],
      ['POST', '/api/stock/adjust', { body: { itemId: 'x', deltaQty: 1 } }],
      ['POST', '/api/expenses', { body: { category: 'Rent', amount: 100 } }],
    ]
    for (const [method, path, extra] of denied) {
      const r = await call(method as 'GET' | 'POST' | 'PATCH', path, {
        ...(extra as { body?: unknown } | undefined),
        jar: staffJar,
      })
      expect(r.status, `${method} ${path} must be owner-only`).toBe(403)
    }
    // …but staff CAN bill (sanity that the gate is selective, not blanket)
    expect((await call('GET', '/api/items', { jar: staffJar })).status).toBe(200)
  })

  it('one business cannot touch another (tenant isolation)', async () => {
    const a = await signupBusiness(email('a'))
    const b = await signupBusiness(email('b'))
    const item = await call('POST', '/api/items', {
      body: { name: 'M0 Widget', sku: `M0W-${Date.now()}`, salePrice: 10000, costPrice: 6000, taxRateBps: 1800 },
      jar: a.jar,
    })
    expect(item.status).toBe(200)
    await call('POST', '/api/stock/adjust', { body: { itemId: item.json.id, deltaQty: 10, note: 'opening' }, jar: a.jar })
    const inv = await call('POST', '/api/invoices', {
      body: { customerId: null, lines: [{ itemId: item.json.id, qty: 1 }] },
      jar: a.jar,
    })

    expect(inv.status).toBe(200)
    // B reads A's invoice → 404, not 403 (no existence leak)
    expect((await call('GET', `/api/invoices/${inv.json.id}`, { jar: b.jar })).status).toBe(404)
    // B pays A's invoice → 404
    expect(
      (await call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: 100, method: 'cash' }, jar: b.jar })).status,
    ).toBe(404)
    // B voids A's invoice → 404 (void is owner-only AND tenant-scoped)
    expect((await call('POST', `/api/invoices/${inv.json.id}/void`, { jar: b.jar })).status).toBe(404)
  })

  it('invoice → partial → overpay-reject → paid → paid-cannot-void', async () => {
    const { jar } = await signupBusiness(email('pay'))
    await call('POST', '/api/stock/adjust', {
      body: { itemId: (await mkItem(jar)).id, deltaQty: 10, note: 'opening' },
      jar,
    }).then((r) => expect(r.status).toBe(200))

    async function mkItem(j: Jar) {
      const r = await call('POST', '/api/items', {
        body: { name: 'M0 Gizmo', sku: `M0G-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, salePrice: 15000, costPrice: 10000, taxRateBps: 1800 },
        jar: j,
      })
      expect(r.status).toBe(200)
      return r.json
    }

    const gizmo = await mkItem(jar)
    await call('POST', '/api/stock/adjust', { body: { itemId: gizmo.id, deltaQty: 10, note: 'opening' }, jar })
    const inv = await call('POST', '/api/invoices', {
      body: { customerId: null, lines: [{ itemId: gizmo.id, qty: 2 }] },
      jar,
    })
    expect(inv.status).toBe(200)
    const total: number = inv.json.grandTotal
    expect(total).toBeGreaterThan(0)

    // stock fell by exactly 2 (ledger-derived)
    const items = await call('GET', '/api/items', { jar })
    const row = (items.json as any[]).find((i) => i.id === gizmo.id)
    expect(Number(row.currentStock)).toBe(8)

    const half = Math.floor(total / 2)
    expect((await call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: half, method: 'upi' }, jar })).status).toBe(200)
    const mid = await call('GET', `/api/invoices/${inv.json.id}`, { jar })
    expect(mid.json.status).toBe('partial')
    expect(mid.json.amountPaid).toBe(half)

    // overpayment rejected, balance untouched
    const over = await call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: total, method: 'cash' }, jar })
    expect(over.status).toBe(400)
    expect(over.json.error).toBe('overpayment')

    const rest = await call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: total - half, method: 'cash' }, jar })
    expect(rest.status).toBe(200)
    const done = await call('GET', `/api/invoices/${inv.json.id}`, { jar })
    expect(done.json.status).toBe('paid')

    // a paid invoice cannot be voided — only credited (audit trail preserved)
    const v = await call('POST', `/api/invoices/${inv.json.id}/void`, { jar })
    expect(v.status).toBe(400)

    // …but a credit note against it restores stock and is honored in P&L
    const cn = await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, {
      body: { reason: 'm0 return', lines: [{ itemId: gizmo.id, qty: 1 }] },
      jar,
    })
    expect(cn.status).toBe(200)
    const items2 = await call('GET', '/api/items', { jar })
    const row2 = (items2.json as any[]).find((i) => i.id === gizmo.id)
    expect(Number(row2.currentStock)).toBe(9)
  })

  it('concurrent invoices get unique gapless numbers', async () => {
    const { jar } = await signupBusiness(email('conc'))
    const item = await call('POST', '/api/items', {
      body: { name: 'M0 Conc', sku: `M0C-${Date.now()}`, salePrice: 1000, costPrice: 500, taxRateBps: 0 },
      jar,
    })
    await call('POST', '/api/stock/adjust', { body: { itemId: item.json.id, deltaQty: 100, note: 'opening' }, jar })
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map(() =>
        call('POST', '/api/invoices', { body: { customerId: null, lines: [{ itemId: item.json.id, qty: 1 }] }, jar }),
      ),
    )
    expect(
      results.every((r) => r.status === 200),
      `concurrent creates: ${JSON.stringify(results.map((r) => ({ status: r.status, body: r.json })))}`,
    ).toBe(true)
    const numbers = results.map((r) => r.json.invoiceNumber)
    expect(new Set(numbers).size).toBe(5)
    const seqs = numbers.map((n: string) => Number(n.split('-').pop())).sort((a, b) => a - b)
    for (let i = 1; i < seqs.length; i++) expect(seqs[i] - seqs[i - 1]).toBe(1)
  })

  it('payment concurrency: two simultaneous payments never overpay', async () => {
    const { jar } = await signupBusiness(email('payrace'))
    const item = await call('POST', '/api/items', {
      body: { name: 'M0 PayRace Item', sku: `M0PR-${Date.now()}`, salePrice: 10000, costPrice: 5000, taxRateBps: 0 },
      jar,
    })
    await call('POST', '/api/stock/adjust', { body: { itemId: item.json.id, deltaQty: 50, note: 'opening' }, jar })
    const inv = await call('POST', '/api/invoices', {
      body: { customerId: null, lines: [{ itemId: item.json.id, qty: 1 }] },
      jar,
    })
    expect(inv.status).toBe(200)
    expect(inv.json.grandTotal).toBe(10000)

    // Simultaneously submit two payments of ₹70.00 (7000 paise) on a ₹100.00 (10000 paise) bill
    const [p1, p2] = await Promise.all([
      call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: 7000, method: 'upi' }, jar }),
      call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: 7000, method: 'upi' }, jar }),
    ])

    const statuses = [p1.status, p2.status].sort((a, b) => a - b)
    expect(statuses, 'one payment must succeed and one must be rejected for overpayment').toEqual([200, 400])

    const failed = p1.status === 400 ? p1 : p2
    expect(failed.json.error).toBe('overpayment')

    // Verify invoice amountPaid never exceeds grandTotal
    const fresh = await call('GET', `/api/invoices/${inv.json.id}`, { jar })
    expect(fresh.json.amountPaid).toBe(7000)
    expect(fresh.json.status).toBe('partial')

    // Subsequent payment for remaining balance (3000 paise) succeeds
    const p3 = await call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: 3000, method: 'cash' }, jar })
    expect(p3.status).toBe(200)

    const completed = await call('GET', `/api/invoices/${inv.json.id}`, { jar })
    expect(completed.json.amountPaid).toBe(10000)
    expect(completed.json.status).toBe('paid')
  })

  it('credit note over-return protection: enforces returnable = original - credited', async () => {
    const { jar } = await signupBusiness(email('cnreturn'))
    const item = await call('POST', '/api/items', {
      body: { name: 'M0 CN Item', sku: `M0CN-${Date.now()}`, salePrice: 2000, costPrice: 1000, taxRateBps: 0 },
      jar,
    })
    await call('POST', '/api/stock/adjust', { body: { itemId: item.json.id, deltaQty: 50, note: 'opening' }, jar })
    const inv = await call('POST', '/api/invoices', {
      body: { customerId: null, lines: [{ itemId: item.json.id, qty: 5 }] },
      jar,
    })
    expect(inv.status).toBe(200)

    // 1. Returning 6 units on a 5-unit invoice must be rejected
    const overReturn = await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, {
      body: { reason: 'too many', lines: [{ itemId: item.json.id, qty: 6 }] },
      jar,
    })
    expect(overReturn.status).toBe(400)
    expect(overReturn.json.error).toBe('CREDIT_NOTE_EXCEEDS_REMAINING_QTY')

    // 2. Partial return of 2 units succeeds
    const cn1 = await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, {
      body: { reason: 'part 1', lines: [{ itemId: item.json.id, qty: 2 }] },
      jar,
    })
    expect(cn1.status).toBe(200)

    // 3. Attempting another return of 4 units (2 + 4 = 6 > 5) must be rejected
    const overReturn2 = await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, {
      body: { reason: 'excess second return', lines: [{ itemId: item.json.id, qty: 4 }] },
      jar,
    })
    expect(overReturn2.status).toBe(400)
    expect(overReturn2.json.error).toBe('CREDIT_NOTE_EXCEEDS_REMAINING_QTY')

    // 4. Exact remaining return of 3 units succeeds
    const cn2 = await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, {
      body: { reason: 'part 2 exact remainder', lines: [{ itemId: item.json.id, qty: 3 }] },
      jar,
    })
    expect(cn2.status).toBe(200)

    // 5. Subsequent return of even 1 unit is now rejected
    const overReturn3 = await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, {
      body: { reason: 'exhausted', lines: [{ itemId: item.json.id, qty: 1 }] },
      jar,
    })
    expect(overReturn3.status).toBe(400)
    expect(overReturn3.json.error).toBe('CREDIT_NOTE_EXCEEDS_REMAINING_QTY')
  })

  it('purchase receiving protection: prevents over-receive and quantity reduction', async () => {
    const { jar } = await signupBusiness(email('poreceive'))
    const sup = await call('POST', '/api/suppliers', {
      body: { name: 'M0 Test Distributor', contactEmail: 'dist@example.com' },
      jar,
    })
    expect(sup.status).toBe(200)
    const item = await call('POST', '/api/items', {
      body: { name: 'M0 PO Item', sku: `M0PO-${Date.now()}`, salePrice: 3000, costPrice: 1500, taxRateBps: 0, primarySupplierId: sup.json.id },
      jar,
    })
    expect(item.status).toBe(200)

    const po = await call('POST', '/api/purchase-orders', {
      body: { supplierId: sup.json.id, lines: [{ itemId: item.json.id, qtyRequested: 10 }] },
      jar,
    })
    expect(po.status).toBe(200)
    const poLineId = po.json.lines[0].id

    // Must be sent before receiving
    const sent = await call('POST', `/api/purchase-orders/${po.json.id}/send`, { jar })
    expect(sent.status).toBe(200)

    // 1. Attempting to receive 15 units (> 10 requested) must be rejected
    const overReceive = await call('POST', `/api/purchase-orders/${po.json.id}/receive`, {
      body: { lines: [{ lineId: poLineId, qtyReceived: 15 }] },
      jar,
    })
    expect(overReceive.status).toBe(400)
    expect(overReceive.json.error).toBe('PURCHASE_RECEIPT_EXCEEDS_ORDER')

    // 2. Partial receive of 4 units succeeds
    const recv1 = await call('POST', `/api/purchase-orders/${po.json.id}/receive`, {
      body: { lines: [{ lineId: poLineId, qtyReceived: 4 }] },
      jar,
    })
    expect(recv1.status).toBe(200)
    expect(recv1.json.status).toBe('partial')

    // Verify stock increased by exactly 4
    const items1 = await call('GET', '/api/items', { jar })
    const it1 = (items1.json as any[]).find((i) => i.id === item.json.id)
    expect(Number(it1.currentStock)).toBe(4)

    // 3. Decreasing received quantity (e.g. from 4 to 2) must be rejected
    const reduceReceive = await call('POST', `/api/purchase-orders/${po.json.id}/receive`, {
      body: { lines: [{ lineId: poLineId, qtyReceived: 2 }] },
      jar,
    })
    expect(reduceReceive.status).toBe(400)
    expect(reduceReceive.json.error).toBe('CANNOT_DECREASE_RECEIVED_QTY')

    // 4. Exact remaining receive to 10 units succeeds and marks status 'fulfilled'
    const recv2 = await call('POST', `/api/purchase-orders/${po.json.id}/receive`, {
      body: { lines: [{ lineId: poLineId, qtyReceived: 10 }] },
      jar,
    })
    expect(recv2.status).toBe(200)
    expect(recv2.json.status).toBe('fulfilled')

    const items2 = await call('GET', '/api/items', { jar })
    const it2 = (items2.json as any[]).find((i) => i.id === item.json.id)
    expect(Number(it2.currentStock)).toBe(10)
  })

  it('negative stock prevention: rejects sales exceeding available stock', async () => {
    const { jar } = await signupBusiness(email('negstock'))
    const item = await call('POST', '/api/items', {
      body: { name: 'M0 Finite Item', sku: `M0FIN-${Date.now()}`, salePrice: 5000, costPrice: 2500, taxRateBps: 0 },
      jar,
    })
    expect(item.status).toBe(200)
    // Add exactly 5 units to stock
    await call('POST', '/api/stock/adjust', { body: { itemId: item.json.id, deltaQty: 5, note: 'opening' }, jar })

    // 1. Attempting to sell 6 units when only 5 exist must be rejected
    const overSale = await call('POST', '/api/invoices', {
      body: { customerId: null, lines: [{ itemId: item.json.id, qty: 6 }] },
      jar,
    })
    expect(overSale.status).toBe(400)
    expect(overSale.json.error).toBe('INSUFFICIENT_STOCK')

    // 2. Concurrent sales: two requests for 3 units each (total 6 > 5)
    // One must succeed, one must fail with INSUFFICIENT_STOCK. Final stock must be 2 (never negative).
    const [s1, s2] = await Promise.all([
      call('POST', '/api/invoices', { body: { customerId: null, lines: [{ itemId: item.json.id, qty: 3 }] }, jar }),
      call('POST', '/api/invoices', { body: { customerId: null, lines: [{ itemId: item.json.id, qty: 3 }] }, jar }),
    ])
    const statuses = [s1.status, s2.status].sort((a, b) => a - b)
    expect(statuses).toEqual([200, 400])

    const rejected = s1.status === 400 ? s1 : s2
    expect(rejected.json.error).toBe('INSUFFICIENT_STOCK')

    const items = await call('GET', '/api/items', { jar })
    const it = (items.json as any[]).find((i) => i.id === item.json.id)
    expect(Number(it.currentStock)).toBe(2)
  })

  it('P&L / GST accounting: revenue is taxable sales net of credit notes, Output GST is separate', async () => {
    const { jar } = await signupBusiness(email('pnlacc'))
    const item = await call('POST', '/api/items', {
      body: { name: 'M0 GST Widget', sku: `M0GST-${Date.now()}`, salePrice: 1000000, costPrice: 600000, taxRateBps: 1800 }, // ₹10,000 sale, ₹6,000 cost, 18% GST
      jar,
    })
    await call('POST', '/api/stock/adjust', { body: { itemId: item.json.id, deltaQty: 10, note: 'opening' }, jar })

    // Bill 1 unit: ₹10,000 taxable + ₹1,800 GST = ₹11,800 grandTotal
    const inv = await call('POST', '/api/invoices', {
      body: { customerId: null, lines: [{ itemId: item.json.id, qty: 1 }] },
      jar,
    })
    expect(inv.status).toBe(200)
    expect(inv.json.subtotal).toBe(1000000)
    expect(inv.json.taxTotal).toBe(180000)
    expect(inv.json.grandTotal).toBe(1180000)

    const pnl1 = await call('GET', '/api/reports/pnl', { jar })
    expect(pnl1.status).toBe(200)
    // Revenue MUST be taxable value (₹10,000), NOT gross total (₹11,800)
    expect(pnl1.json.revenue).toBe(1000000)
    expect(pnl1.json.cogs).toBe(600000)
    expect(pnl1.json.grossProfit).toBe(400000)
    expect(pnl1.json.outputGst).toBe(180000)
    expect(pnl1.json.grossInvoiced).toBe(1180000)

    // Issue credit note for return: 1 unit returned
    const cn = await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, {
      body: { reason: 'full return', lines: [{ itemId: item.json.id, qty: 1 }] },
      jar,
    })
    expect(cn.status).toBe(200)

    const pnl2 = await call('GET', '/api/reports/pnl', { jar })
    expect(pnl2.status).toBe(200)
    // Net revenue, COGS, gross profit, and output GST are now 0 after full return
    expect(pnl2.json.revenue).toBe(0)
    expect(pnl2.json.cogs).toBe(0)
    expect(pnl2.json.grossProfit).toBe(0)
    expect(pnl2.json.outputGst).toBe(0)
  })

  // ---------- Milestone 1: Customers ----------

  async function mkCustomer(jar: Jar, overrides: Record<string, unknown> = {}) {
    const r = await call('POST', '/api/customers', {
      body: { name: `M1 Cust ${Date.now()}-${Math.floor(Math.random() * 1e6)}`, phone: '98200 00000', state: 'Maharashtra', ...overrides },
      jar,
    })
    expect(r.status).toBe(200)
    return r.json
  }

  async function mkStockedItem(jar: Jar, qty = 50) {
    const r = await call('POST', '/api/items', {
      body: { name: 'M1 Item', sku: `M1I-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, salePrice: 10000, costPrice: 6000, taxRateBps: 1800 },
      jar,
    })
    expect(r.status).toBe(200)
    const a = await call('POST', '/api/stock/adjust', { body: { itemId: r.json.id, deltaQty: qty, note: 'opening' }, jar })
    expect(a.status).toBe(200)
    return r.json
  }

  it('customers: business B sees nothing of business A', async () => {
    const a = await signupBusiness(email('custa'))
    const b = await signupBusiness(email('custb'))
    const c = await mkCustomer(a.jar)
    for (const path of [
      `/api/customers/${c.id}`,
      `/api/customers/${c.id}/invoices`,
      `/api/customers/${c.id}/payments`,
      `/api/customers/${c.id}/statement`,
      `/api/customers/${c.id}/balance`,
    ]) {
      expect((await call('GET', path, { jar: b.jar })).status, path).toBe(404)
    }
    expect((await call('PATCH', `/api/customers/${c.id}`, { body: { name: 'Hijacked' }, jar: b.jar })).status).toBe(404)
    expect((await call('DELETE', `/api/customers/${c.id}`, { jar: b.jar })).status).toBe(404)
  })

  it('customers: paginated list, search, and delete guards', async () => {
    const { jar } = await signupBusiness(email('custpage'))
    for (let i = 0; i < 25; i++) await mkCustomer(jar, { name: `M1 Page ${i}` })
    const p1 = await call('GET', '/api/customers?q=M1%20Page&page=1&pageSize=20', { jar })
    expect(p1.status).toBe(200)
    expect(p1.json.total).toBe(25)
    expect(p1.json.data.length).toBe(20)
    expect(p1.json.totalPages).toBe(2)
    const p2 = await call('GET', '/api/customers?q=M1%20Page&page=2&pageSize=20', { jar })
    expect(p2.json.data.length).toBe(5)
    const one = await call('GET', '/api/customers?q=M1%20Page%201&pageSize=20', { jar })
    expect(one.json.total).toBeGreaterThanOrEqual(1)
    expect(one.json.total).toBeLessThan(25)

    // staff can create + edit (matrix), but only owners delete
    const staffAddr = email('custstaff')
    await call('POST', '/api/users', { body: { name: 'S', email: staffAddr, password: 'password123', role: 'staff' }, jar })
    const login = await call('POST', '/api/auth/login', { body: { email: staffAddr, password: 'password123' } })
    const v = await call('POST', '/api/auth/verify-email', { body: { challengeToken: login.json.challengeToken, code: lastCodeFor(staffAddr) } })
    const staffJar = v.jar as Jar
    const created = await call('POST', '/api/customers', { body: { name: 'M1 Staff Made', state: 'Karnataka' }, jar: staffJar })
    expect(created.status).toBe(200)
    expect((await call('PATCH', `/api/customers/${created.json.id}`, { body: { phone: '911' }, jar: staffJar })).status).toBe(200)
    expect((await call('DELETE', `/api/customers/${created.json.id}`, { jar: staffJar })).status).toBe(403)

    // owner cannot delete a customer with invoices — deactivate instead
    const busy = await mkCustomer(jar)
    const item = await mkStockedItem(jar)
    const inv = await call('POST', '/api/invoices', { body: { customerId: busy.id, lines: [{ itemId: item.id, qty: 1 }] }, jar })
    expect(inv.status).toBe(200)
    expect((await call('DELETE', `/api/customers/${busy.id}`, { jar })).status).toBe(409)
    expect((await call('PATCH', `/api/customers/${busy.id}`, { body: { isActive: false }, jar })).status).toBe(200)
    // clean customer deletes fine
    expect((await call('DELETE', `/api/customers/${created.json.id}`, { jar })).status).toBe(200)
    expect((await call('GET', `/api/customers/${created.json.id}`, { jar })).status).toBe(404)
  })

  it('customers: statement invoice → payment → payment → credit = correct running balance', async () => {
    const { jar } = await signupBusiness(email('custstmt'))
    const c = await mkCustomer(jar, { paymentTermsDays: 7 })
    const item = await mkStockedItem(jar, 50)
    const inv = await call('POST', '/api/invoices', { body: { customerId: c.id, lines: [{ itemId: item.id, qty: 1 }] }, jar })
    expect(inv.status).toBe(200)
    // 1 × ₹100 @ 18% = 10000 + 1800 = 11800
    expect(inv.json.grandTotal).toBe(11800)
    // due date honors payment terms
    const due = new Date(inv.json.dueDate).getTime()
    const issue = new Date(inv.json.issueDate).getTime()
    expect(Math.round((due - issue) / 86400e3)).toBe(7)
    // bill-to snapshot frozen at creation
    expect(inv.json.billToName).toBe(c.name)

    await call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: 4000, method: 'cash' }, jar })
    await call('POST', `/api/invoices/${inv.json.id}/payments`, { body: { amount: 2000, method: 'upi' }, jar })
    await call('POST', `/api/invoices/${inv.json.id}/credit-notes`, { body: { reason: 'm1', lines: [{ itemId: item.id, qty: 1 }] }, jar })

    const bal = await call('GET', `/api/customers/${c.id}/balance`, { jar })
    expect(bal.status).toBe(200)
    expect(bal.json.totalSales).toBe(11800)
    expect(bal.json.totalPaid).toBe(6000)
    expect(bal.json.creditTotal).toBe(11800)
    expect(bal.json.outstanding).toBe(11800 - 6000 - 11800)

    const stmt = await call('GET', `/api/customers/${c.id}/statement?pageSize=100`, { jar })
    expect(stmt.status).toBe(200)
    expect(stmt.json.balance).toBe(11800 - 6000 - 11800)
    const kinds = stmt.json.data.map((e: any) => e.kind)
    expect(kinds).toContain('invoice')
    expect(kinds.filter((k: string) => k === 'payment').length).toBe(2)
    expect(kinds).toContain('credit_note')
    // running balance reconciles entry by entry
    let running = 0
    for (const e of stmt.json.data) {
      running += e.debit - e.credit
      expect(e.balance).toBe(running)
    }
  })

  it('customers: empty customer renders zeroed aggregates', async () => {
    const { jar } = await signupBusiness(email('custempty'))
    const c = await mkCustomer(jar)
    const bal = await call('GET', `/api/customers/${c.id}/balance`, { jar })
    expect(bal.json).toMatchObject({ totalSales: 0, totalPaid: 0, creditTotal: 0, outstanding: 0, invoiceCount: 0 })
    const stmt = await call('GET', `/api/customers/${c.id}/statement`, { jar })
    expect(stmt.json.data).toEqual([])
    expect(stmt.json.balance).toBe(0)
    const detail = await call('GET', `/api/customers/${c.id}`, { jar })
    expect(detail.json.stats.outstanding).toBe(0)
  })

  it('customers: editing the record never rewrites old invoices', async () => {
    const { jar } = await signupBusiness(email('custhist'))
    const c = await mkCustomer(jar, { name: 'Original Name', gstin: '27AAAAA0000A1Z5' })
    const item = await mkStockedItem(jar)
    const inv = await call('POST', '/api/invoices', { body: { customerId: c.id, lines: [{ itemId: item.id, qty: 1 }] }, jar })
    expect(inv.json.billToName).toBe('Original Name')
    await call('PATCH', `/api/customers/${c.id}`, { body: { name: 'Renamed Ltd', gstin: '27BBBBB0000B1Z5', address: 'New Address' }, jar })
    const reopened = await call('GET', `/api/invoices/${inv.json.id}`, { jar })
    expect(reopened.json.billToName).toBe('Original Name')
    expect(reopened.json.billToGstin).toBe('27AAAAA0000A1Z5')
    expect(reopened.json.grandTotal).toBe(inv.json.grandTotal)
    // Snapshots are stable; the detail endpoint joins the live item row for
    // display, so compare the financial snapshot fields, not the join shape.
    const snap = (ls: any[]) => ls.map((l) => ({ itemId: l.itemId, qty: String(l.qty), unitPriceSnapshot: l.unitPriceSnapshot, unitCostSnapshot: l.unitCostSnapshot, taxRateSnapshotBps: l.taxRateSnapshotBps }))
    expect(snap(reopened.json.lines)).toEqual(snap(inv.json.lines))
  })

  // ---------- Password reset ----------

  it('password reset: request → code → new password works, old dies, sessions die', async () => {
    const addr = email('reset')
    const { jar } = await signupBusiness(addr)
    expect((await call('GET', '/api/auth/me', { jar })).status).toBe(200)

    const f = await call('POST', '/api/auth/forgot-password', { body: { email: addr } })
    expect(f.status).toBe(200)
    expect(typeof f.json.challengeToken).toBe('string')
    const r = await call('POST', '/api/auth/reset-password', {
      body: { challengeToken: f.json.challengeToken, code: lastCodeFor(addr), newPassword: 'brandnew99' },
    })
    expect(r.status).toBe(200)

    // old password dead, new password opens a session directly (no 2FA on)
    expect((await call('POST', '/api/auth/login', { body: { email: addr, password: 'password123' } })).status).toBe(401)
    const login = await call('POST', '/api/auth/login', { body: { email: addr, password: 'brandnew99' } })
    expect(login.status).toBe(200)
    expect(login.json.user.emailVerified).toBe(true)

    // pre-reset session was killed by the password change
    expect((await call('GET', '/api/auth/me', { jar })).status).toBe(401)
  })

  it('password reset: unknown email answers ok with no challenge', async () => {
    const r = await call('POST', '/api/auth/forgot-password', { body: { email: `nobody-${Date.now()}@example.com` } })
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ ok: true })
  })

  it('password reset: token is purpose-bound (cannot verify email or log in with it)', async () => {
    const addr = email('resetbind')
    await signupBusiness(addr)
    const f = await call('POST', '/api/auth/forgot-password', { body: { email: addr } })
    const code = lastCodeFor(addr)
    // right code, wrong purpose → rejected, nothing consumed visibly
    const v = await call('POST', '/api/auth/verify-email', { body: { challengeToken: f.json.challengeToken, code } })
    expect(v.status).toBe(401)
    // and the reset token still works for its own purpose afterwards
    const r = await call('POST', '/api/auth/reset-password', {
      body: { challengeToken: f.json.challengeToken, code, newPassword: 'another99' },
    })
    expect(r.status).toBe(200)
  })
})

