import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  ComboboxField,
  EmptyState,
  ErrorState,
  IconUsers,
  INDIAN_STATES,
  PageHint,
  PageTitle,
  SkeletonForm,
  TextField,
  useToast,
} from '@ecobills/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/store'

/**
 * Settings. Endpoints, payloads and the owner gate are unchanged:
 *   GET   /business        PATCH /business
 *   GET   /users           POST  /users  { name, email, password, role: 'staff' }
 *
 * Presentation changes: the labels/hints/errors are wired through <Field>
 * (label above, helper and error below, aria-describedby + role="alert"), the
 * three raw inputs became a consistent two-column grid, saving now reports
 * success or failure through the live-region toast, and the screen gained a
 * skeleton that mirrors its real fields.
 */
export function Settings() {
  const qc = useQueryClient()
  const toast = useToast()
  const { me, setMe } = useMe()
  const isOwner = me?.user?.role === 'owner'

  const { data: biz, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['biz'],
    queryFn: () => api.get('/business'),
  })
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').catch(() => null) })
  const [f, setF] = useState<any>(null)
  const [staff, setStaff] = useState({ name: '', email: '', password: '' })

  const save = useMutation({
    mutationFn: (b: any) => api.patch('/business', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz'] })
      toast.success('Settings saved')
    },
    onError: (e: any) => toast.error('Could not save settings', e instanceof Error ? e.message : undefined),
  })
  const addStaff = useMutation({
    mutationFn: (b: any) => api.post('/users', { ...b, role: 'staff' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setStaff({ name: '', email: '', password: '' })
      toast.success('Staff account added', 'They can sign in with the email and password you set.')
    },
    onError: (e: any) => toast.error('Could not add this staff member', e instanceof Error ? e.message : undefined),
  })

  if (isLoading) {
    return (
      <div className="max-w-xl" aria-busy="true">
        <span className="sr-only" role="status">
          Loading your settings…
        </span>
        <PageTitle>Settings</PageTitle>
        <Card className="mt-4">
          <SkeletonForm rows={4} />
        </Card>
      </div>
    )
  }

  if (isError || !biz) {
    return (
      <ErrorState
        title="Could not load your business settings"
        description="Nothing has been changed. Check the connection and try again."
        detail={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    )
  }

  const cur = f || biz
  const staffList: any[] = users || []
  const dirty =
    cur.name !== biz.name ||
    cur.state !== biz.state ||
    (cur.gstin || '') !== (biz.gstin || '') ||
    cur.invoicePrefix !== biz.invoicePrefix

  return (
    <div className="max-w-2xl">
      <PageTitle>Settings</PageTitle>
      <PageHint className="mb-4">Business details used on every invoice and GST bill.</PageHint>

      {!isOwner ? (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warn-tint)] p-3">
          <Badge tone="warn">Staff</Badge>
          <p className="text-sm text-[var(--color-warn-text)]">
            Business settings and user management are owner-only. You can read everything here, but not change it.
          </p>
        </div>
      ) : null}

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Business name"
            required
            className="sm:col-span-2"
            inputProps={{ disabled: !isOwner }}
            value={cur.name}
            onValueChange={(v) => setF({ ...cur, name: v })}
            validate={(v) => (v.trim() ? undefined : 'Your business name appears on every invoice.')}
          />
          <ComboboxField
            label="State"
            hint="Used to decide CGST+SGST vs IGST. Type to filter the list."
            options={INDIAN_STATES}
            disabled={!isOwner}
            value={cur.state}
            onValueChange={(v) => setF({ ...cur, state: v })}
            validate={(v) => (v.trim() ? undefined : 'State is required for the GST split.')}
          />
          <TextField
            label="Invoice prefix"
            hint="Prepended to the per-year invoice number."
            inputProps={{ disabled: !isOwner }}
            value={cur.invoicePrefix}
            onValueChange={(v) => setF({ ...cur, invoicePrefix: v })}
          />
          <TextField
            label="GSTIN"
            hint="Optional. Leave blank for non-GST bills."
            className="sm:col-span-2"
            inputProps={{ disabled: !isOwner }}
            value={cur.gstin || ''}
            onValueChange={(v) => setF({ ...cur, gstin: v })}
          />
        </div>

        {isOwner ? (
          <div className="mt-5 flex items-center gap-3">
            <Button
              loading={save.isPending}
              loadingLabel="Saving settings"
              disabled={!dirty}
              onClick={() =>
                save.mutate({
                  name: cur.name,
                  state: cur.state,
                  gstin: cur.gstin || null,
                  invoicePrefix: cur.invoicePrefix,
                })
              }
            >
              Save changes
            </Button>
            {dirty ? (
              <Button variant="ghost" onClick={() => setF(null)} disabled={save.isPending}>
                Discard
              </Button>
            ) : (
              <span className="text-sm text-[var(--color-ink-subtle)]">No changes to save.</span>
            )}
          </div>
        ) : null}
      </Card>

      <TwoFactorSection />

      {isOwner ? (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-lg font-semibold text-[var(--color-ink)]">Team</h2>

          {staffList.length ? (
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-[var(--color-border)]">
                {staffList.map((u: any) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-[var(--color-ink)]">{u.name}</span>{' '}
                      <span className="text-[var(--color-ink-subtle)]">{u.email}</span>
                    </span>
                    <Badge tone={u.role === 'owner' ? 'accent' : 'muted'}>
                      <span className="capitalize">{u.role}</span>
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState
              compact
              icon="users"
              title="No team members yet"
              description="Add a staff account below and they can start billing straight away."
            />
          )}

          <Card className="mt-3">
            <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-[var(--color-ink)]">
              <IconUsers className="text-base text-[var(--color-ink-muted)]" />
              Add a staff account
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField
                label="Name"
                value={staff.name}
                onValueChange={(v) => setStaff({ ...staff, name: v })}
                validate={(v) => (v.trim() ? undefined : 'Enter their name.')}
              />
              <TextField
                label="Email"
                inputProps={{ type: 'email', autoComplete: 'off' }}
                value={staff.email}
                onValueChange={(v) => setStaff({ ...staff, email: v })}
                validate={(v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.')}
              />
              <TextField
                label="Password"
                hint="8 characters or more."
                inputProps={{ type: 'password', autoComplete: 'new-password' }}
                value={staff.password}
                onValueChange={(v) => setStaff({ ...staff, password: v })}
                validate={(v) => (v.length >= 8 ? undefined : 'Use at least 8 characters.')}
              />
            </div>
            <div className="mt-4">
              <Button
                variant="secondary"
                loading={addStaff.isPending}
                loadingLabel="Adding staff account"
                disabled={!staff.name || !staff.email || staff.password.length < 8}
                onClick={() => addStaff.mutate(staff)}
              >
                Add staff
              </Button>
            </div>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

/**
 * Two-step verification for your own sign-in. Role-independent: owners and
 * staff alike protect their own account; nobody can toggle anyone else's.
 */
function TwoFactorSection() {
  const { me, setMe } = useMe()
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const enabled = !!me?.user?.twoFactorEnabled

  async function refresh() {
    setMe(await api.get('/auth/me'))
  }

  async function setup() {
    setPending(true)
    try {
      const res = await api.post('/auth/2fa/setup')
      setToken(res.challengeToken)
      setCode('')
    } catch {
      toast.error('Could not start setup', 'Check the connection and try again.')
    } finally {
      setPending(false)
    }
  }

  async function enable() {
    if (!token || code.length !== 6) return
    setPending(true)
    try {
      await api.post('/auth/2fa/enable', { challengeToken: token, code })
      setToken(null)
      setCode('')
      await refresh()
      toast.success('Two-step verification is on', 'Your next sign-in will ask for an emailed code.')
    } catch {
      toast.error('Wrong code', 'Check the email and try again.')
    } finally {
      setPending(false)
    }
  }

  async function disable() {
    if (!password) return
    setPending(true)
    try {
      await api.post('/auth/2fa/disable', { password })
      setPassword('')
      await refresh()
      toast.success('Two-step verification is off')
    } catch {
      toast.error('Wrong password', 'Disabling needs your current password.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 font-display text-lg font-semibold text-[var(--color-ink)]">Two-step verification</h2>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={enabled ? 'ok' : 'muted'}>{enabled ? 'On' : 'Off'}</Badge>
          <p className="min-w-0 flex-1 text-sm text-[var(--color-ink-muted)]">
            {enabled
              ? 'Every sign-in to this account asks for a 6-digit code sent to your email.'
              : 'Add a 6-digit emailed code on top of your password.'}
          </p>
        </div>

        {!enabled && !token ? (
          <div className="mt-4">
            <Button loading={pending} loadingLabel="Sending code" onClick={setup}>
              Enable — send me a code
            </Button>
          </div>
        ) : null}

        {!enabled && token ? (
          <div className="mt-4 flex max-w-sm flex-col gap-3">
            <p className="text-sm text-[var(--color-ink-muted)]">
              Enter the 6-digit code sent to <b>{me?.user?.email}</b>.
            </p>
            <TextField
              label="6-digit code"
              inputProps={{ inputMode: 'numeric', maxLength: 6, autoFocus: true, placeholder: '••••••' }}
              value={code}
              onValueChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              validate={(v) => (v.length === 6 ? undefined : 'Enter all 6 digits.')}
            />
            <div>
              <Button loading={pending} loadingLabel="Confirming" disabled={code.length !== 6} onClick={enable}>
                Confirm & turn on
              </Button>
            </div>
          </div>
        ) : null}

        {enabled ? (
          <div className="mt-4 flex max-w-sm flex-col gap-3">
            <TextField
              label="Current password"
              hint="Turning it off needs your password, so a stolen session alone can't do it."
              inputProps={{ type: 'password', autoComplete: 'current-password' }}
              value={password}
              onValueChange={setPassword}
            />
            <div>
              <Button variant="danger" loading={pending} loadingLabel="Turning off" disabled={!password} onClick={disable}>
                Turn off
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </section>
  )
}
