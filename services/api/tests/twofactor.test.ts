import { describe, it, expect } from 'vitest'
import {
  generateNumericCode, hashChallengeSecret, verifyChallengeCode,
  isChallengeUsable, render2faEmail,
  TWO_FA_CODE_TTL_MINUTES, TWO_FA_MAX_ATTEMPTS,
} from '../src/twofactor.js'

describe('2fa codes', () => {
  it('generates 6-digit numeric codes', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateNumericCode()
      expect(c).toMatch(/^\d{6}$/)
    }
  })
  it('codes are unpredictable across calls', () => {
    const seen = new Set(Array.from({ length: 20 }, generateNumericCode))
    expect(seen.size).toBeGreaterThan(1)
  })
  it('verifies with constant-time compare, rejects wrong codes', () => {
    const h = hashChallengeSecret('123456')
    expect(verifyChallengeCode('123456', h)).toBe(true)
    expect(verifyChallengeCode('654321', h)).toBe(false)
    expect(verifyChallengeCode('', h)).toBe(false)
  })
  it('policy constants are sane', () => {
    expect(TWO_FA_CODE_TTL_MINUTES).toBeLessThanOrEqual(15)
    expect(TWO_FA_MAX_ATTEMPTS).toBeLessThanOrEqual(10)
  })
})

describe('challenge usability', () => {
  const base = { expiresAt: new Date(Date.now() + 600e3), attempts: 0, consumedAt: null }
  it('fresh challenge is usable', () => {
    expect(isChallengeUsable(base)).toBe(true)
  })
  it('consumed challenge is dead', () => {
    expect(isChallengeUsable({ ...base, consumedAt: new Date() })).toBe(false)
  })
  it('expired challenge is dead', () => {
    expect(isChallengeUsable({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(false)
  })
  it('challenge at the attempt cap is dead', () => {
    expect(isChallengeUsable({ ...base, attempts: TWO_FA_MAX_ATTEMPTS })).toBe(false)
    expect(isChallengeUsable({ ...base, attempts: TWO_FA_MAX_ATTEMPTS - 1 })).toBe(true)
  })
})

describe('2fa email', () => {
  it('contains the code and no link an attacker could swap in', () => {
    const { subject, text } = render2faEmail('482910')
    expect(text).toContain('482910')
    expect(text).not.toMatch(/https?:\/\//)
    expect(subject.length).toBeGreaterThan(0)
  })
  it('renders branded html with the code, and the logo only when given a url', () => {
    const plain = render2faEmail('482910')
    expect(plain.html).toContain('482910')
    expect(plain.html).not.toContain('<img')
    const branded = render2faEmail('482910', 'ecoBills', 'signin', 'https://app.example.com/logo.png')
    expect(branded.html).toContain('https://app.example.com/logo.png')
    expect(branded.html).toContain('482910')
    const verify = render2faEmail('482910', 'ecoBills', 'verify')
    expect(verify.subject).toMatch(/verify/i)
    expect(verify.html).toContain('482910')
  })
})
