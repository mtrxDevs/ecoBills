// Puppeteer invoice PDF. Lazy-loads puppeteer so API boots without Chromium in dev.
/** Escape user-controlled text for HTML. Every interpolated value below — business
 * name, customer name, item names — originates from user input, and this HTML is
 * also served directly to browsers when Chromium is absent, so unescaped values
 * would be stored XSS, not just a PDF cosmetic issue. */
export function escHtml(s: string | null | undefined) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
export async function renderInvoicePdfHtml(opts: {
  businessName: string
  businessAddress: string
  gstin?: string | null
  invoiceNumber: string
  issueDate: string
  customerName: string
  lines: Array<{ name: string; qty: string; price: string; tax: string; total: string }>
  subtotal: string
  taxTotal: string
  grandTotal: string
  gstNote: string
}) {
  const rows = opts.lines
    .map(
      (l) =>
        `<tr><td>${escHtml(l.name)}</td><td>${escHtml(l.qty)}</td><td>${escHtml(l.price)}</td><td>${escHtml(l.tax)}</td><td>${escHtml(l.total)}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Inter,Arial,sans-serif;color:#14171C;padding:32px}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{text-align:left;padding:8px;border-bottom:1px solid #eee;font-size:13px}h1{font-size:22px;margin:0}
    .muted{color:#666;font-size:12px}.totals{margin-top:16px;text-align:right;font-size:14px}</style></head><body>
    <h1>${escHtml(opts.businessName)}</h1><div class="muted">${escHtml(opts.businessAddress)}${opts.gstin ? ` · GSTIN ${escHtml(opts.gstin)}` : ''}</div>
    <p><b>Invoice ${escHtml(opts.invoiceNumber)}</b> · ${escHtml(opts.issueDate)}<br>Bill to: ${escHtml(opts.customerName)}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><div>Subtotal: ${escHtml(opts.subtotal)}</div><div>Tax: ${escHtml(opts.taxTotal)}</div><div><b>Grand total: ${escHtml(opts.grandTotal)}</b></div></div>
    <p class="muted">${escHtml(opts.gstNote)}</p></body></html>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Inter,Arial,sans-serif;color:#14171C;padding:32px}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{text-align:left;padding:8px;border-bottom:1px solid #eee;font-size:13px}h1{font-size:22px;margin:0}
    .muted{color:#666;font-size:12px}.totals{margin-top:16px;text-align:right;font-size:14px}</style></head><body>
    <h1>${escHtml(opts.businessName)}</h1><div class="muted">${escHtml(opts.businessAddress)}${opts.gstin ? ` · GSTIN ${escHtml(opts.gstin)}` : ''}</div>
    <p><b>Invoice ${escHtml(opts.invoiceNumber)}</b> · ${escHtml(opts.issueDate)}<br>Bill to: ${escHtml(opts.customerName)}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><div>Subtotal: ${escHtml(opts.subtotal)}</div><div>Tax: ${escHtml(opts.taxTotal)}</div><div><b>Grand total: ${escHtml(opts.grandTotal)}</b></div></div>
    <p class="muted">${escHtml(opts.gstNote)}</p></body></html>`
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  // @ts-ignore optional dep
  const puppeteer = await import('puppeteer').catch(() => null)
  if (!puppeteer) throw new Error('pdf_unavailable: install puppeteer + chromium on the API host')
  const browser = await (puppeteer as any).launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return await page.pdf({ format: 'A4', printBackground: true })
  } finally {
    await browser.close()
  }
}
