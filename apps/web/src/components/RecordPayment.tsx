import { useState } from 'react'
import { Button, Panel, Select, TextField, useToast } from '@ecobills/ui'
import { api, money } from '../lib/api'

/** Whole days between the issue date and now, for pressure display. */
export function ageLabel(issueDate: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(issueDate).getTime()) / 86400e3))
  if (days <= 0) return 'today'
  if (days === 1) return '1 day old'
  return `${days} days old`
}

/**
 * "Create bill → Paid by UPI" in one place. Amount defaults to the full
 * balance (partial payments just type less), method/date/note recorded with
 * the payment. Both Owner and Staff can collect — the server enforces that.
 * Shared by Billing and the customer detail page.
 */
export function RecordPaymentDialog({ inv, onClose, onRecorded }: { inv: any; onClose: () => void; onRecorded: () => void }) {
  const toast = useToast()
  const balance = inv.grandTotal - (inv.amountPaid || 0)
  const [amount, setAmount] = useState((balance / 100).toFixed(2))
  const [method, setMethod] = useState('upi')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)

  const paise = Math.round(Number(amount || 0) * 100)
  const valid = paise > 0 && paise <= balance

  async function submit() {
    if (!valid || pending) return
    setPending(true)
    try {
      await api.post(`/invoices/${inv.id}/payments`, {
        amount: paise,
        method,
        note,
        paidAt: new Date(date).toISOString(),
      })
      toast.success(paise >= balance ? 'Paid in full' : 'Payment recorded', `${money(paise)} by ${methodLabel(method)} on ${inv.invoiceNumber}.`)
      onRecorded()
    } catch (e) {
      toast.error('Could not record the payment', e instanceof Error ? e.message : undefined)
    } finally {
      setPending(false)
    }
  }

  return (
    <Panel
      open
      onClose={onClose}
      side="center"
      size="sm"
      title={`Record payment · ${inv.invoiceNumber}`}
      description={`${money(inv.amountPaid || 0)} paid of ${money(inv.grandTotal)} — ${money(balance)} still due.`}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" loading={pending} loadingLabel="Recording" disabled={!valid} onClick={submit}>
            Record {money(Number.isFinite(paise) ? Math.max(0, paise) : 0)}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Amount (₹)"
          inputProps={{ inputMode: 'decimal', autoFocus: true, placeholder: (balance / 100).toFixed(2) }}
          value={amount}
          onValueChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
          validate={(v) => {
            const p = Math.round(Number(v || 0) * 100)
            if (!(p > 0)) return 'Enter an amount greater than zero.'
            if (p > balance) return `At most ${money(balance)} is due on this bill.`
            return undefined
          }}
        />
        <div>
          <label htmlFor="pay-method" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Method
          </label>
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <TextField
          label="Date"
          inputProps={{ type: 'date' }}
          value={date}
          onValueChange={setDate}
        />
        <TextField
          label="Note"
          hint="Optional — reference number, split details, anything."
          value={note}
          onValueChange={setNote}
        />
      </div>
    </Panel>
  )
}

export function methodLabel(method: string) {
  switch (method) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'upi':
      return 'UPI'
    case 'bank_transfer':
      return 'Bank transfer'
    default:
      return 'Other'
  }
}
