import { describe, it, expect } from 'vitest'
import { ApiError, errorCode, money } from '../src/lib/api'
import { useMe } from '../src/lib/store'

describe('money() display formatting', () => {
  it('converts paise to rupees without touching the integer', () => {
    expect(money(39900)).toContain('399')
    expect(money(0)).toContain('0')
  })
  it('never throws on bad input', () => {
    expect(() => money(NaN as unknown as number)).not.toThrow()
  })
})

describe('ApiError', () => {
  it('carries the server error code for branching', () => {
    const e = new ApiError(401, 'invalid_code', 'Wrong code.')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('invalid_code')
    expect(e.status).toBe(401)
    expect(errorCode(e)).toBe('invalid_code')
  })
  it('errorCode is empty for non-API errors', () => {
    expect(errorCode(new Error('boom'))).toBe('')
    expect(errorCode(null)).toBe('')
    expect(errorCode('invalid_code')).toBe('')
  })
})

describe('useMe store', () => {
  it('starts empty and round-trips the session', () => {
    expect(useMe.getState().me).toBeNull()
    const me = { user: { id: 'u', name: 'N', email: 'e', role: 'owner', businessId: 'b' }, business: { id: 'b' } }
    useMe.getState().setMe(me)
    expect(useMe.getState().me?.user?.email).toBe('e')
    useMe.getState().setMe(null)
    expect(useMe.getState().me).toBeNull()
  })
})
