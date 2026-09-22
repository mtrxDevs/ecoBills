import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Button,
  Card,
  GlassSurface,
  IconAlert,
  IconClose,
  IconPlus,
  TextField,
  cn,
  focusRing,
  pageTransition,
  useReducedMotion,
} from '@ecobills/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/store'

/**
 * Auth. Endpoints, payloads and redirects are unchanged:
 *   POST /auth/login → GET /auth/me → navigate('/')
 *   POST /auth/signup → GET /auth/me → POST /items (best effort) → navigate('/')
 *
 * Presentation changes: fields are wired through <Field> (blur validation,
 * aria-describedby, role="alert"), the submit buttons carry the shared
 * loading/success states, and the 3-step wizard cross-fades between steps using
 * the page-transition tokens instead of swapping instantly.
 */

/** The shared single-column shell for both auth screens. */
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

/** Inline, designed form-level error. Was already role="alert"; now it is styled. */
function FormError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-danger-tint)] p-3 text-sm font-medium text-[var(--color-danger-text)]"
    >
      <IconAlert className="mt-0.5 shrink-0 text-base" />
      <span>{message}</span>
    </p>
  )
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)
  const nav = useNavigate()
  const { setMe } = useMe()

  return (
    <AuthShell>
      <BrandMark subtitle="Stock, billing & P&L for your shop." />
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          setErr('')
          setPending(true)
          try {
            await api.post('/auth/login', { email, password })
            const me = await api.get('/auth/me')
            setMe(me)
            nav('/')
          } catch {
            setErr('Invalid email or password.')
          } finally {
            setPending(false)
          }
        }}
      >
        <TextField
          label="Email"
          inputProps={{ type: 'email', autoComplete: 'username', placeholder: 'you@shop.com' }}
          value={email}
          onValueChange={setEmail}
          validate={(v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter the email you signed up with.')}
        />
        <TextField
          label="Password"
          inputProps={{ type: 'password', autoComplete: 'current-password', placeholder: 'Password' }}
          value={password}
          onValueChange={setPassword}
          validate={(v) => (v ? undefined : 'Enter your password.')}
        />
        <FormError message={err} />
        <Button type="submit" loading={pending} loadingLabel="Signing in" disabled={!email || !password}>
          Log in
        </Button>
      </form>
      <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
        New here?{' '}
        <Link
          className={`rounded-[var(--radius-sm)] font-medium text-[var(--color-accent-text)] underline underline-offset-2 hover:no-underline ${focusRing}`}
          to="/start"
        >
          Create your business
        </Link>
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
  const nav = useNavigate()
  const { setMe } = useMe()
  const reduce = useReducedMotion()
  const stepTransition = pageTransition(reduce)

  async function finish(skipItems = false) {
    setErr('')
    setPending(true)
    try {
      await api.post('/auth/signup', {
        businessName: f.businessName,
        state: f.state,
        gstin: f.gstin || null,
        ownerName: f.ownerName,
        email: f.email,
        password: f.password,
      })
      const me = await api.get('/auth/me')
      setMe(me)
      if (!skipItems) {
        for (const it of items.filter((i) => i.name && i.sku)) {
          await api.post('/items', {
            name: it.name,
            sku: it.sku,
            salePrice: Math.round(Number(it.salePrice || 0) * 100),
          }).catch(() => {})
        }
      }
      nav('/')
    } catch {
      setErr('Could not create account. Is the email already used?')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell wide>
      <BrandMark subtitle={`Set up your shop · step ${step + 1} of ${STEPS.length}`} />

      {/* A three-step progress rail. One shared motion element slides between
          steps, and it is purely opacity/colour under reduced motion. */}
      <ol className="mb-5 flex gap-2" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <span
              className={cn(
                'block h-1 rounded-[var(--radius-chip)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]',
                i <= step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-neutral-tint)]',
              )}
            />
            <span className={cn('mt-1.5 block text-xs', i === step ? 'font-medium text-[var(--color-ink)]' : 'text-[var(--color-ink-subtle)]')}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {/* Enter-only cross-fade, same tokens as a page transition — never
          mode="wait", which would add dead time between steps. */}
      <motion.div
        key={step}
        initial={stepTransition.initial as never}
        animate={stepTransition.animate as never}
        transition={stepTransition.transition as never}
      >
        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <TextField
              label="Business name"
              required
              value={f.businessName}
              onValueChange={(v) => setF({ ...f, businessName: v })}
              validate={(v) => (v.trim() ? undefined : 'This appears at the top of every invoice.')}
            />
            <TextField
              label="State"
              required
              hint="Decides CGST+SGST vs IGST on every bill."
              value={f.state}
              onValueChange={(v) => setF({ ...f, state: v })}
              validate={(v) => (v.trim() ? undefined : 'Enter your state, for example Maharashtra.')}
            />
            <TextField label="GSTIN" hint="Optional. Leave blank if you do not bill GST." value={f.gstin} onValueChange={(v) => setF({ ...f, gstin: v })} />
            <Button disabled={!f.businessName || !f.state} onClick={() => setStep(1)}>
              Continue
            </Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <TextField label="Your name" required value={f.ownerName} onValueChange={(v) => setF({ ...f, ownerName: v })} validate={(v) => (v.trim() ? undefined : 'Enter your name.')} />
            <TextField
              label="Email"
              required
              inputProps={{ type: 'email', autoComplete: 'username' }}
              value={f.email}
              onValueChange={(v) => setF({ ...f, email: v })}
              validate={(v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.')}
            />
            <TextField
              label="Password"
              required
              hint="8 characters or more."
              inputProps={{ type: 'password', autoComplete: 'new-password' }}
              value={f.password}
              onValueChange={(v) => setF({ ...f, password: v })}
              validate={(v) => (v.length >= 8 ? undefined : 'Use at least 8 characters.')}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button className="flex-1" disabled={!f.ownerName || !f.email || f.password.length < 8} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-ink-muted)]">Add your first items, or skip and do it later.</p>

            <ul className="flex flex-col gap-3">
              {items.map((it, i) => (
                <li key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2">
                  <div>
                    <label htmlFor={`item-name-${i}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                      Item name
                    </label>
                    <input
                      id={`item-name-${i}`}
                      placeholder="Item name"
                      className={`w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] ${focusRing}`}
                      value={it.name}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <label htmlFor={`item-sku-${i}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                      SKU
                    </label>
                    <input
                      id={`item-sku-${i}`}
                      placeholder="SKU"
                      className={`w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] ${focusRing}`}
                      value={it.sku}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <label htmlFor={`item-price-${i}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                      Price ₹
                    </label>
                    <input
                      id={`item-price-${i}`}
                      inputMode="decimal"
                      placeholder="0"
                      className={`tnum w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] ${focusRing}`}
                      value={it.salePrice}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, salePrice: e.target.value } : x)))}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove item row ${i + 1}`}
                    className={`mb-0.5 rounded-[var(--radius-control)] p-2 text-[var(--color-ink-muted)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-neutral-tint)] hover:text-[var(--color-danger-text)] ${focusRing}`}
                    onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : items)}
                    disabled={items.length === 1}
                  >
                    <IconClose className="text-sm" />
                  </button>
                </li>
              ))}
            </ul>

            <Button variant="ghost" size="sm" className="self-start" onClick={() => setItems([...items, { name: '', sku: '', salePrice: '' }])}>
              <IconPlus className="text-base" />
              Add another
            </Button>

            <FormError message={err} />

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={pending}>
                Back
              </Button>
              <Button className="flex-1" loading={pending} loadingLabel="Creating your shop" onClick={() => finish(false)}>
                Finish
              </Button>
              <Button variant="secondary" onClick={() => finish(true)} disabled={pending}>
                Skip
              </Button>
            </div>
          </div>
        ) : null}
      </motion.div>
    </AuthShell>
  )
}
