import { openDB, type IDBPDatabase } from 'idb'

// Local-first cache (Milestone: offline desktop). IndexedDB holds the last
// 30-day snapshot plus the write outbox. Reads fall back here when offline;
// financial writes other than invoice drafts stay online-only (see sync.ts).
const DB_NAME = 'ecobills-offline'
const VERSION = 1

export const STORES = [
  'meta',
  'items',
  'customers',
  'suppliers',
  'invoices',
  'expenses',
  'orders',
  'outbox',
] as const

export type StoreName = (typeof STORES)[number]

let dbp: Promise<IDBPDatabase> | null = null

export function odb() {
  if (!dbp) {
    dbp = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        db.createObjectStore('meta', { keyPath: 'key' })
        for (const s of ['items', 'customers', 'suppliers', 'invoices', 'expenses', 'orders'] as const) {
          db.createObjectStore(s, { keyPath: 'id' })
        }
        db.createObjectStore('outbox', { keyPath: 'opId' })
      },
    })
  }
  return dbp
}

export async function putAll(store: StoreName, rows: any[]) {
  const db = await odb()
  const tx = db.transaction(store, 'readwrite')
  await tx.store.clear()
  for (const row of rows) await tx.store.put(row)
  await tx.done
}

export async function readAll<T = any>(store: StoreName): Promise<T[]> {
  const db = await odb()
  return db.getAll(store) as Promise<T[]>
}

export async function putMeta(key: string, value: unknown) {
  const db = await odb()
  await db.put('meta', { key, value })
}

export async function readMeta<T = unknown>(key: string): Promise<T | null> {
  const db = await odb()
  const row = (await db.get('meta', key)) as { key: string; value: T } | undefined
  return row ? row.value : null
}

function notifyOutbox() {
  // Browser-only fan-out; the db write above is the source of truth.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('ecobills-outbox'))
  }
}

export async function outboxPut(op: Record<string, any>) {
  const db = await odb()
  await db.put('outbox', op)
  notifyOutbox()
}

export async function outboxRemove(opId: string) {
  const db = await odb()
  await db.delete('outbox', opId)
  notifyOutbox()
}
