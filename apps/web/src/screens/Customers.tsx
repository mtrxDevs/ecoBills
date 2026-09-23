import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  ComboboxField,
  EmptyState,
  ErrorState,
  INDIAN_STATES,
  PageHint,
  PageTitle,
  Panel,
  Select,
  SkeletonList,
  StaggerItem,
  StaggerList,
  TextField,
  focusRing,
  useToast,
} from '@ecobills/ui'
import { api, money } from '../lib/api'

const PAGE_SIZE = 20

/**
 * Customers. Reads the paginated endpoints; every figure (sales, paid,
 * outstanding, last transaction) is server-derived per customer — the UI
 * never keeps its own balance.
 */
export function Customers() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [active, setActive] = useState('all')
  const [dialog, setDialog] = useState<null | { customer?: any }>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [q])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['customers', debouncedQ, page, active],
    queryFn: () =>
      api.get(`/customers?q=${encodeURIComponent(debouncedQ)}&page=${page}&pageSize=${PAGE_SIZE}&active=${active}`),
  })

  const rows: any[] = data?.data || []
  const totalPages: number = data?.totalPages || 1

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageTitle>Customers</PageTitle>
          <PageHint>Who buys from you, what they owe, and every bill behind it.</PageHint>
        </div>
        <Button onClick={() => setDialog({})}>+ New customer</Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          aria-label="Search customers"
          placeholder="Search name, phone, email, GSTIN…"
          autoComplete="off"
          className={`w-full max-w-md rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] ${focusRing}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          aria-label="Status filter"
          value={active}
          onChange={(e) => {
            setActive(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : isError ? (
        <ErrorState
          title="Could not load customers"
          description="Check the connection and try again."
          detail={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : !rows.length ? (
        <EmptyState
          icon="users"
          title={debouncedQ ? 'No customers match' : 'No customers yet'}
          description={
            debouncedQ
              ? `Nothing matches “${debouncedQ}”. Try a different search.`
              : 'Add your first customer and every bill, payment and return will attach to them.'
          }
          action={!debouncedQ ? <Button onClick={() => setDialog({})}>Add a customer</Button> : undefined}
        />
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <StaggerList className="divide-y divide-[var(--color-border)]">
              {rows.map((c: any, i: number) => (
                <StaggerItem key={c.id} index={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate font-medium text-[var(--color-ink)]">
                      <Link className={`rounded-[var(--radius-sm)] underline-offset-2 hover:underline ${focusRing}`} to={`/customers/${c.id}`}>
                        {c.name}
                      </Link>
                    </span>
                    <span className="tnum block truncate text-xs text-[var(--color-ink-subtle)]">
                      {[c.phone, c.gstin].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                  <span className="tnum text-right">
                    <span className="block text-[var(--color-ink)]">{money(c.stats?.totalSales || 0)}</span>
                    <span className="block text-xs text-[var(--color-ink-subtle)]">lifetime</span>
                  </span>
                  <span className="tnum text-right">
                    <span className={`block font-medium ${c.stats?.outstanding > 0 ? 'text-[var(--color-warn-text)]' : 'text-[var(--color-ink)]'}`}>
                      {money(c.stats?.outstanding || 0)}
                    </span>
                    <span className="block text-xs text-[var(--color-ink-subtle)]">due</span>
                  </span>
                  {!c.isActive ? <Badge tone="muted">Inactive</Badge> : null}
                  <span className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDialog({ customer: c })}>
                      Edit
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/billing?customer=${c.id}`)}>
                      New bill
                    </Button>
                  </span>
                </StaggerItem>
              ))}
            </StaggerList>
          </Card>
          <div className="mt-3 flex items-center justify-between text-sm text-[var(--color-ink-muted)]">
            <span className="tnum">
              Page {data.page} of {totalPages} · {data.total} customers
            </span>
            <span className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Prev
              </Button>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </Button>
            </span>
          </div>
        </>
      )}

      {dialog ? (
        <CustomerDialog
          key={dialog.customer?.id || 'new'}
          customer={dialog.customer}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            qc.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      ) : null}
    </div>
  )
}

/** Create + edit in one dialog. Deactivation lives here; hard delete stays API-only. */
export function CustomerDialog({ customer, onClose, onSaved }: { customer?: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    gstin: customer?.gstin || '',
    state: customer?.state || '',
    address: customer?.address || '',
    paymentTermsDays: String(customer?.paymentTermsDays ?? 0),
    notes: customer?.notes || '',
    isActive: customer ? customer.isActive !== false : true,
  })
  const [pending, setPending] = useState(false)
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v })
  const valid = f.name.trim() !== '' && Number(f.paymentTermsDays) >= 0

  async function save() {
    if (!valid || pending) return
    setPending(true)
    try {
      const body = {
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim() || null,
        gstin: f.gstin.trim() || null,
        state: f.state,
        address: f.address.trim(),
        paymentTermsDays: Math.max(0, Math.floor(Number(f.paymentTermsDays) || 0)),
        notes: f.notes.trim(),
        isActive: f.isActive,
      }
      if (customer) await api.patch(`/customers/${customer.id}`, body)
      else await api.post('/customers', body)
      toast.success(customer ? 'Customer updated' : 'Customer added')
      onSaved()
    } catch (e) {
      toast.error(customer ? 'Could not update the customer' : 'Could not add the customer', e instanceof Error ? e.message : undefined)
    } finally {
      setPending(false)
    }
  }

  return (
    <Panel
      open
      onClose={onClose}
      side="center"
      size="lg"
      title={customer ? `Edit ${customer.name}` : 'New customer'}
      description="Bills, payments and returns attach here. Old bills keep whatever these fields said when they were made."
      footer={
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" loading={pending} loadingLabel="Saving" disabled={!valid} onClick={save}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Name" required value={f.name} onValueChange={set('name')} validate={(v) => (v.trim() ? undefined : 'Enter the customer name.')} />
        <TextField label="Phone" inputProps={{ inputMode: 'tel' }} value={f.phone} onValueChange={set('phone')} />
        <TextField
          label="Email"
          inputProps={{ type: 'email' }}
          value={f.email}
          onValueChange={set('email')}
          validate={(v) => (v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.')}
        />
        <TextField label="GSTIN" value={f.gstin} onValueChange={set('gstin')} validate={(v) => (v.trim() === '' || v.trim().length <= 15 ? undefined : 'GSTIN is at most 15 characters.')} />
        <ComboboxField
          label="State"
          hint="Decides CGST+SGST vs IGST on their bills."
          options={INDIAN_STATES}
          value={f.state}
          onValueChange={set('state')}
        />
        <TextField
          label="Payment terms (days)"
          hint="Bills become due this many days after issue. 0 = due immediately."
          inputProps={{ inputMode: 'numeric' }}
          value={f.paymentTermsDays}
          onValueChange={(v) => setF({ ...f, paymentTermsDays: v.replace(/\D/g, '').slice(0, 3) })}
        />
        <TextField label="Address" className="sm:col-span-2" value={f.address} onValueChange={set('address')} />
        <TextField label="Notes" hint="Only your team sees this." className="sm:col-span-2" value={f.notes} onValueChange={set('notes')} />
        {customer ? (
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink)] sm:col-span-2">
            <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
            Active — inactive customers stay in history but leave pickers and lists by default
          </label>
        ) : null}
      </div>
    </Panel>
  )
}
