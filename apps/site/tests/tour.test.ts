import { describe, it, expect } from 'vitest'
import { TOUR_TABS, easeInOutCubic, lerp, lerpPose } from '../src/lib/tour'

describe('tour easing', () => {
  it('rests at both ends and splits the middle', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6)
  })
  it('clamps outside input instead of overshooting the camera', () => {
    expect(easeInOutCubic(-2)).toBe(0)
    expect(easeInOutCubic(9)).toBe(1)
  })
  it('lerpPose hits the midpoint exactly halfway', () => {
    const p = lerpPose(
      { pos: [0, 0, 0], look: [0, 0, 0] },
      { pos: [10, 10, 10], look: [2, 2, 2] },
      0.5,
    )
    expect(p.pos).toEqual([5, 5, 5])
    expect(p.look).toEqual([1, 1, 1])
  })
  it('lerp is linear', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5)
  })
})

describe('tour content', () => {
  it('covers every app destination exactly once', () => {
    const ids = TOUR_TABS.map((t) => t.id)
    expect(ids).toEqual(['dashboard', 'billing', 'customers', 'inventory', 'orders', 'reports', 'settings'])
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('every stop has a callout, a pose and an in-bounds anchor', () => {
    for (const t of TOUR_TABS) {
      expect(t.title.length).toBeGreaterThan(0)
      expect(t.body.length).toBeGreaterThan(20)
      expect(t.highlight.length).toBeGreaterThan(0)
      for (const v of [...t.anchor, ...t.camPos]) {
        expect(Math.abs(v)).toBeLessThan(30)
      }
    }
  })
})
