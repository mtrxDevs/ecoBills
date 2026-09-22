// Money + tax helpers. All money Int paise, tax Int bps. No floats for storage.
// Line total: round-half-up on (qty * unitPrice * (10000+bps) / 10000) using integer math
// with qty scaled to 3 decimals.
import { createHash } from 'node:crypto'

export function lineTotals(qty: number, unitPricePaise: number, taxBps: number) {
  const qtyMilli = Math.round(qty * 1000) // Decimal(12,3)
  const subtotal = Math.round((qtyMilli * unitPricePaise) / 1000)
  const tax = Math.round((subtotal * taxBps) / 10000)
  return { subtotal, tax, total: subtotal + tax }
}

export function sumLines(lines: Array<{ qty: number; unitPrice: number; taxBps: number }>) {
  let subtotal = 0
  let tax = 0
  for (const l of lines) {
    const t = lineTotals(l.qty, l.unitPrice, l.taxBps)
    subtotal += t.subtotal
    tax += t.tax
  }
  return { subtotal, taxTotal: tax, grandTotal: subtotal + tax }
}

/** GST split for display: same-state → CGST+SGST halves; inter-state → IGST full. */
export function gstSplit(taxTotal: number, sameState: boolean) {
  if (sameState) {
    const cgst = Math.round(taxTotal / 2)
    return { cgst, sgst: taxTotal - cgst, igst: 0 }
  }
  return { cgst: 0, sgst: 0, igst: taxTotal }
}

/** India financial year label: Apr–Mar. FY2026 = Apr 2026–Mar 2027. */
export function financialYear(d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return m >= 4 ? `FY${y}` : `FY${y - 1}`
}

export function invoiceNumber(prefix: string, fy: string, n: number) {
  return `${prefix}/${fy.replace('FY', '')}-${String(n).padStart(4, '0')}`
}

export function sha256Hex(s: string) {
  return createHash('sha256').update(s).digest('hex')
}
