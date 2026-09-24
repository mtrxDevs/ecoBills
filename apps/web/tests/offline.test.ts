import { describe, it, expect } from 'vitest'
import { newClientKey, newOpId } from '../src/lib/offline/sync'

describe('offline op identity', () => {
  it('client keys satisfy the server schema (8–64 chars) and never repeat', () => {
    const keys = Array.from({ length: 50 }, newClientKey)
    for (const k of keys) {
      expect(k.length).toBeGreaterThanOrEqual(8)
      expect(k.length).toBeLessThanOrEqual(64)
    }
    expect(new Set(keys).size).toBe(50)
  })
  it('op ids are unique per draft for stable list keys', () => {
    expect(newOpId()).not.toBe(newOpId())
  })
})
