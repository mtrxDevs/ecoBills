// Puppeteer invoice PDF. Lazy-loads puppeteer so API boots without Chromium in dev.
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
  const rows = opts.lines.map((l) => `<tr><td>${l.name}</td><td>${l.qty}</td><td>${l.price}</td><td>${l.tax}</td><td>${l.total}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Inter,Arial,sans-serif;color:#14171C;padding:32px}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{text-align:left;padding:8px;border-bottom:1px solid #eee;font-size:13px}h1{font-size:22px;margin:0}
    .muted{color:#666;font-size:12px}.totals{margin-top:16px;text-align:right;font-size:14px}</style></head><body>
    <h1>${opts.businessName}</h1><div class="muted">${opts.businessAddress}${opts.gstin ? ` · GSTIN ${opts.gstin}` : ''}</div>
    <p><b>Invoice ${opts.invoiceNumber}</b> · ${opts.issueDate}<br>Bill to: ${opts.customerName}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><div>Subtotal: ${opts.subtotal}</div><div>Tax: ${opts.taxTotal}</div><div><b>Grand total: ${opts.grandTotal}</b></div></div>
    <p class="muted">${opts.gstNote}</p></body></html>`
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
