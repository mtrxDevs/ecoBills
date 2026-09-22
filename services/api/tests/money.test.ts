import { describe, it, expect } from 'vitest'
import { lineTotals, sumLines, gstSplit, financialYear } from '../src/money.js'
import { renderPOTemplate } from '../src/email.js'

describe('money: integer math, no float drift', () => {
  it('line totals round correctly', () => {
    // 3 × ₹399.00 @ 5% → subtotal 119700, tax 5985
    expect(lineTotals(3, 39900, 500)).toEqual({ subtotal: 119700, tax: 5985, total: 125685 })
  })
  it('decimal qty (kg) does not silently round', () => {
    const t = lineTotals(2.5, 10000, 0)
    expect(t.subtotal).toBe(25000)
  })
  it('gst split halves same-state tax', () => {
    expect(gstSplit(101, true)).toEqual({ cgst: 51, sgst: 50, igst: 0 })
    expect(gstSplit(101, false)).toEqual({ cgst: 0, sgst: 0, igst: 101 })
  })
  it('financial year follows April–March', () => {
    expect(financialYear(new Date('2026-03-31'))).toBe('FY2025')
    expect(financialYear(new Date('2026-04-01'))).toBe('FY2026')
  })
  it('sumLines aggregates', () => {
    expect(sumLines([{ qty: 1, unitPrice: 10000, taxBps: 1800 }])).toEqual({ subtotal: 10000, taxTotal: 1800, grandTotal: 11800 })
  })
})

describe('po template: deterministic, zero deps', () => {
  it('renders without AI', () => {
    const t = renderPOTemplate({
      businessName: 'Demo Store',
      supplierName: 'Sharma',
      lines: [{ sku: 'RICE-5KG', name: 'Basmati', qty: 20, unit: 'pcs', lastPricePaise: 32000 }],
    })
    expect(t.subject).toContain('Demo Store')
    expect(t.body).toContain('RICE-5KG')
  })
})
