import { describe, expect, it } from 'vitest'
import { can } from '../src/auth.js'

describe('Managed Neon Auth application RBAC', () => {
  it('keeps the Owner/Staff matrix in the API', () => {
    expect(can('owner', 'settings.manage')).toBe(true)
    expect(can('staff', 'settings.manage')).toBe(false)
    expect(can('staff', 'invoice.write')).toBe(true)
    expect(can('staff', 'stock.adjust')).toBe(false)
  })
})
