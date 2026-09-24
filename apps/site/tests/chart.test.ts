import { describe, it, expect } from 'vitest'
import { scaleBars } from '../src/lib/chart'

describe('scaleBars', () => {
  it('scales proportionally to the peak', () => {
    expect(scaleBars([5, 10], 4)).toEqual([2, 4])
  })
  it('returns nothing for empty input or non-positive height', () => {
    expect(scaleBars([], 4)).toEqual([])
    expect(scaleBars([1, 2], 0)).toEqual([])
  })
  it('clamps negatives to the floor instead of drawing below it', () => {
    expect(scaleBars([-3, 6], 4)).toEqual([0, 4])
  })
  it('fills the scale when every value is equal', () => {
    expect(scaleBars([7, 7, 7], 5)).toEqual([5, 5, 5])
  })
})
