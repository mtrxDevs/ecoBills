import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { enqueueDraft, listDrafts, syncOutbox } from '../src/lib/offline/sync'
import { odb } from '../src/lib/offline/db'

async function clearOutbox() {
  const db = await odb()
  await db.clear('outbox')
}

beforeEach(clearOutbox)

const draft = (name: string) => ({
  customerId: null as string | null,
  customerName: 'Walk-in',
  lines: [{ itemId: 'item-1', name, qty: 2, unitPrice: 10000 }],
})

describe('offline outbox', () => {
  it('queues drafts in creation order with unique idempotency keys', async () => {
    const a = await enqueueDraft(draft('A'))
    const b = await enqueueDraft(draft('B'))
    expect(a.opId).not.toBe(b.opId)
    expect(a.clientKey).not.toBe(b.clientKey)
    const rows = await listDrafts()
    expect(rows.map((r) => r.opId)).toEqual([a.opId, b.opId])
  })

  it('syncOutbox posts in order with the clientKey and removes successes', async () => {
    await enqueueDraft(draft('A'))
    await enqueueDraft(draft('B'))
    const posted: Array<{ path: string; body: any }> = []
    const r = await syncOutbox(async (path, body) => {
      posted.push({ path, body })
      return { ok: true }
    })
    expect(r).toEqual({ sent: 2, failed: [] })
    expect(posted.map((p) => p.path)).toEqual(['/invoices', '/invoices'])
    for (const p of posted) {
      expect(typeof p.body.clientKey).toBe('string')
      expect(p.body.lines).toEqual([{ itemId: 'item-1', qty: 2 }])
    }
    expect(await listDrafts()).toEqual([])
  })

  it('keeps failures queued with the error attached, after successes', async () => {
    await enqueueDraft(draft('A'))
    await enqueueDraft(draft('B'))
    let n = 0
    const r = await syncOutbox(async () => {
      n++
      if (n === 2) throw new Error('INSUFFICIENT_STOCK')
      return { ok: true }
    })
    expect(r.sent).toBe(1)
    expect(r.failed.length).toBe(1)
    const rows = await listDrafts()
    expect(rows.length).toBe(1)
    expect(rows[0].error).toContain('INSUFFICIENT_STOCK')
  })
})
