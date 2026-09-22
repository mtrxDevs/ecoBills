// Resend integration with idempotent send + dev stub. Never throws in dev.

export async function sendSupplierEmail(opts: {
  to: string
  subject: string
  body: string
  idempotencyKey: string
}): Promise<{ providerId: string; stub: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log(`[email:stub] to=${opts.to} subject=${opts.subject} idem=${opts.idempotencyKey}`)
    return { providerId: `stub-${opts.idempotencyKey}`, stub: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': opts.idempotencyKey,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'orders@example.com',
      to: [opts.to],
      subject: opts.subject,
      text: opts.body,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`resend_failed: ${res.status} ${t}`)
  }
  const j = (await res.json()) as { id?: string }
  return { providerId: j.id || 'unknown', stub: false }
}

/** Deterministic PO email template — always works, zero external deps (§6.5.3). */
export function renderPOTemplate(opts: {
  businessName: string
  supplierName: string
  lines: Array<{ sku: string; name: string; qty: number; unit: string; lastPricePaise: number }>
  currency?: string
  deliveryNote?: string
}) {
  const rows = opts.lines
    .map(
      (l) =>
        `- ${l.name} (${l.sku}) — ${l.qty} ${l.unit} @ ${(l.lastPricePaise / 100).toFixed(2)} ${opts.currency || 'INR'}`,
    )
    .join('\n')
  const subject = `Purchase order from ${opts.businessName}`
  const body = [
    `Dear ${opts.supplierName} team,`,
    '',
    `Please supply the following items for ${opts.businessName}:`,
    '',
    rows,
    '',
    opts.deliveryNote || 'Please confirm availability and expected delivery date.',
    '',
    `Thanks,`,
    opts.businessName,
  ].join('\n')
  return { subject, body }
}
