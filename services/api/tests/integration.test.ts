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
    method: 'GET' | 'POST' | 'PATCH',
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
})
