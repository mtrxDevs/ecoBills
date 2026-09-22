import { describe, it, expect } from 'vitest'
import { escHtml, renderInvoicePdfHtml } from '../src/pdf.js'

describe('invoice html escaping', () => {
  it('escapes the five significant characters', () => {
    expect(escHtml(`<a href="x">&'y'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;y&#39;&lt;/a&gt;')
  })
  it('leaves plain text untouched', () => {
    expect(escHtml('Basmati Rice 5kg')).toBe('Basmati Rice 5kg')
    expect(escHtml('Rs 1,250.00')).toBe('Rs 1,250.00')
  })
  it('renders no raw user input into the invoice html', async () => {
    const evil = `"><script>alert(1)</script>`
    const html = await renderInvoicePdfHtml({
      businessName: evil,
      businessAddress: evil,
      gstin: evil,
      invoiceNumber: 'INV/25-0001',
      issueDate: '2026-09-22',
      customerName: evil,
      lines: [{ name: evil, qty: '1', price: 'Rs 10.00', tax: 'Rs 1.80', total: 'Rs 11.80' }],
      subtotal: 'Rs 10.00',
      taxTotal: 'Rs 1.80',
      grandTotal: 'Rs 11.80',
      gstNote: 'note',
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain(evil)
    expect(html).toContain('&lt;script&gt;')
  })
})
