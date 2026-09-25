import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  ComboboxField,
  GlassSurface,
  IconAlert,
  INDIAN_STATES,
  TextField,
  cn,
  focusRing,
} from '@ecobills/ui'
import { api } from '../lib/api'
import { authClient } from '../lib/auth'
import { useMe } from '../lib/store'

function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('mx-auto w-full px-4', wide ? 'max-w-md' : 'max-w-sm')} style={{ paddingTop: '12vh' }}>
      <GlassSurface className="rounded-[var(--radius-sheet)] border p-6 shadow-[var(--elev-3)]">{children}</GlassSurface>
    </div>
  )
}

function BrandMark({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6">
      <p className="font-display text-2xl font-bold text-[var(--color-ink)]">
        <span className="text-[var(--color-accent-text)]">eco</span>Bills
      </p>
      <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{subtitle}</p>
    </div>
  )
}

function FormError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-danger-tint)] p-3 text-sm font-medium text-[var(--color-danger-text)]">
      <IconAlert className="mt-0.5 shrink-0 text-base" />
      <span>{message}</span>
    </p>
  )
}

async function finishAuth(setMe: (me: any) => void, nav: (path: string) => void) {
  const pending = sessionStorage.getItem('ecobills_pending_bootstrap')
  if (pending) {
    await api.post('/auth/bootstrap', JSON.parse(pending))
    sessionStorage.removeItem('ecobills_pending_bootstrap')
  }
  setMe(await api.get('/auth/me'))
  nav('/')
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)
  const nav = useNavigate()
  const { setMe } = useMe()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setPending(true)
    try {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) throw new Error(result.error.message || 'Invalid email or password.')
      await finishAuth(setMe, nav)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Invalid email or password.')
    } finally {
      setPending(false)
    }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setPending(true)
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` })
      if (result.error) throw new Error(result.error.message || 'Could not send the recovery email.')
      setSent(true)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not send the recovery email.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell>
      <BrandMark subtitle="Stock, billing & P&L for your shop." />
      {forgot ? (
        sent ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-ink-muted)]">If that account exists, Neon Auth sent a password recovery link. Check your inbox and spam folder.</p>
            <Button onClick={() => { setForgot(false); setSent(false); setErr('') }}>Back to log in</Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={requestReset}>
            <p className="text-sm text-[var(--color-ink-muted)]">Enter your account email and Neon Auth will send a recovery link.</p>
            <TextField label="Email" inputProps={{ type: 'email', autoComplete: 'username' }} value={email} onValueChange={setEmail} />
            <FormError message={err} />
            <Button type="submit" loading={pending} loadingLabel="Sending link" disabled={!email}>Send recovery link</Button>
            <button type="button" className={`text-sm text-[var(--color-ink-muted)] underline ${focusRing}`} onClick={() => { setForgot(false); setErr('') }}>Back to log in</button>
          </form>
        )
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <TextField label="Email" inputProps={{ type: 'email', autoComplete: 'username', placeholder: 'you@shop.com' }} value={email} onValueChange={setEmail} />
          <TextField label="Password" inputProps={{ type: 'password', autoComplete: 'current-password' }} value={password} onValueChange={setPassword} />
          <FormError message={err} />
          <Button type="submit" loading={pending} loadingLabel="Signing in" disabled={!email || !password}>Log in</Button>
          <button type="button" className={`text-sm font-medium text-[var(--color-accent-text)] underline ${focusRing}`} onClick={() => { setForgot(true); setErr('') }}>Forgot password?</button>
        </form>
      )}
      <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
        New here? <Link className={`font-medium text-[var(--color-accent-text)] underline ${focusRing}`} to="/start">Create your business</Link>
      </p>
    </AuthShell>
  )
}

const STEPS = ['Business', 'Owner', 'Items']

export function Start() {
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ businessName: '', state: '', gstin: '', ownerName: '', email: '', password: '' })
  const [items, setItems] = useState([{ name: '', sku: '', salePrice: '' }])
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)
  const [verificationNeeded, setVerificationNeeded] = useState(false)
  const nav = useNavigate()
  const { setMe } = useMe()

  async function signup() {
    setErr('')
    setPending(true)
    try {
      const result = await authClient.signUp.email({ email: f.email, password: f.password, name: f.ownerName })
      if (result.error) throw new Error(result.error.message || 'Could not create account.')
      sessionStorage.setItem('ecobills_pending_bootstrap', JSON.stringify({
        businessName: f.businessName,
        state: f.state,
        gstin: f.gstin || null,
        ownerName: f.ownerName,
      }))
      const token = await authClient.token()
      if (!token.data?.token) {
        setVerificationNeeded(true)
        return
      }
      const bootstrap = await api.post('/auth/bootstrap', JSON.parse(sessionStorage.getItem('ecobills_pending_bootstrap') || '{}'))
      sessionStorage.removeItem('ecobills_pending_bootstrap')
      setMe(bootstrap)
      if (bootstrap.user?.role === 'owner') setStep(2)
      else nav('/')
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not create account.')
    } finally {
      setPending(false)
    }
  }

  async function finish(skipItems = false) {
    setErr('')
    setPending(true)
    try {
      if (!skipItems) {
        for (const it of items.filter((i) => i.name && i.sku)) {
          await api.post('/items', { name: it.name, sku: it.sku, salePrice: Math.round(Number(it.salePrice || 0) * 100) }).catch(() => {})
        }
      }
      nav('/')
    } catch {
      setErr('Could not save your items. You can add them later from Inventory.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell wide>
      <BrandMark subtitle={`Set up your shop · step ${step + 1} of ${STEPS.length}`} />
      {verificationNeeded ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-ink-muted)]">Check your email to verify the Neon Auth account, then return here and log in. Your business setup is saved for the next authenticated request.</p>
          <Button onClick={() => nav('/login')}>Continue to log in</Button>
        </div>
      ) : (
        <>
          <ol className="mb-5 flex gap-2" aria-label="Setup progress">
            {STEPS.map((label, i) => <li key={label} className="flex-1"><span className={cn('block h-1 rounded-[var(--radius-chip)]', i <= step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-neutral-tint)]')} /><span className="mt-1.5 block text-xs text-[var(--color-ink-subtle)]">{label}</span></li>)}
          </ol>
          {step === 0 ? (
            <div className="flex flex-col gap-4">
              <TextField label="Business name" required value={f.businessName} onValueChange={(v) => setF({ ...f, businessName: v })} />
              <ComboboxField label="State" required options={INDIAN_STATES} value={f.state} onValueChange={(v) => setF({ ...f, state: v })} />
              <TextField label="GSTIN" hint="Optional." value={f.gstin} onValueChange={(v) => setF({ ...f, gstin: v })} />
              <Button disabled={!f.businessName || !f.state} onClick={() => setStep(1)}>Continue</Button>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <TextField label="Owner name" required value={f.ownerName} onValueChange={(v) => setF({ ...f, ownerName: v })} />
              <TextField label="Email" required inputProps={{ type: 'email', autoComplete: 'username' }} value={f.email} onValueChange={(v) => setF({ ...f, email: v })} />
              <TextField label="Password" required hint="8 characters or more." inputProps={{ type: 'password', autoComplete: 'new-password' }} value={f.password} onValueChange={(v) => setF({ ...f, password: v })} />
              <FormError message={err} />
              <Button loading={pending} loadingLabel="Creating account" disabled={!f.ownerName || !f.email || f.password.length < 8} onClick={() => void signup()}>Create account</Button>
              <button type="button" className={`text-sm text-[var(--color-ink-muted)] underline ${focusRing}`} onClick={() => setStep(0)}>Back</button>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[var(--color-ink-muted)]">Add a few inventory items now, or skip and do it later.</p>
              {items.map((it, i) => <div className="grid grid-cols-3 gap-2" key={i}><TextField label="Item" value={it.name} onValueChange={(v) => setItems(items.map((x, n) => n === i ? { ...x, name: v } : x))} /><TextField label="SKU" value={it.sku} onValueChange={(v) => setItems(items.map((x, n) => n === i ? { ...x, sku: v } : x))} /><TextField label="Price" inputProps={{ type: 'number' }} value={it.salePrice} onValueChange={(v) => setItems(items.map((x, n) => n === i ? { ...x, salePrice: v } : x))} /></div>)}
              <button type="button" className={`text-left text-sm text-[var(--color-accent-text)] underline ${focusRing}`} onClick={() => setItems([...items, { name: '', sku: '', salePrice: '' }])}>Add another item</button>
              <FormError message={err} />
              <div className="flex gap-2"><Button loading={pending} loadingLabel="Saving" onClick={() => void finish(false)}>Finish setup</Button><Button variant="ghost" onClick={() => void finish(true)}>Skip</Button></div>
            </div>
          ) : null}
        </>
      )}
    </AuthShell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const token = params.get('token') || ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setErr('')
    try {
      const result = await authClient.resetPassword({ newPassword: password, token })
      if (result.error) throw new Error(result.error.message || 'Could not reset the password.')
      setDone(true)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not reset the password.')
    } finally {
      setPending(false)
    }
  }

  return <AuthShell><BrandMark subtitle="Choose a new password." />{done ? <><p className="text-sm text-[var(--color-ink-muted)]">Password changed. You can now sign in.</p><Link className={`mt-4 inline-block text-sm text-[var(--color-accent-text)] underline ${focusRing}`} to="/login">Back to log in</Link></> : <form className="flex flex-col gap-4" onSubmit={submit}><TextField label="New password" inputProps={{ type: 'password', autoComplete: 'new-password' }} value={password} onValueChange={setPassword} /><FormError message={err} /><Button type="submit" loading={pending} disabled={password.length < 8 || !token}>Set password</Button></form>}</AuthShell>
}
