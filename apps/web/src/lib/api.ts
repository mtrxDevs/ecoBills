// API origin. Empty = same-origin (/api/*), which covers local dev (Vite
// proxy) and single-service deploys (API serves the web UI itself). Set
// VITE_API_URL at web build time for split hosting or the desktop app, e.g.
// VITE_API_URL=https://your-api.onrender.com (needs SESSION_COOKIE_SAMESITE=none
// on the API for the login cookie to stick cross-origin).
const ORIGIN = ((import.meta as any).env?.VITE_API_URL || '') as string
const BASE = `${ORIGIN}/api`

/** Absolute API URL for non-fetch uses (PDF download links, etc.). */
export function apiUrl(path: string) {
  return `${BASE}${path}`
}

/** Thrown for every non-2xx response. `code` is the server's error key. */
export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message?: string) {
    super(message || code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** Server error key for branching (login challenge states, etc.). */
export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : ''
}

const FRIENDLY: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  email_taken: 'That email is already registered.',
  invalid_code: 'Wrong code. Check the email and try again.',
  challenge_expired: 'That code expired. Request a new one.',
  challenge_locked: 'Too many wrong tries. Request a new code to try again.',
  invalid_challenge: 'That attempt expired. Start again.',
  overpayment: 'That payment is more than the balance due.',
  paid_invoice_cannot_void: 'That invoice already has payments — issue a credit note instead.',
  supplier_email_missing: 'Add an email address for this supplier first.',
  email_failed: 'The email could not be sent. Try again.',
  not_found: 'That record no longer exists.',
  forbidden: 'Your role cannot do that.',
  unauthorized: 'Your session expired. Log in again.',
  database_unavailable: 'Cannot reach the database. Is the API running?',
  validation: 'Some fields need attention.',
  insufficient_stock: 'Not enough stock for that sale.',
  credit_exceeds_remaining: 'That return is more than what is left to return.',
  receipt_exceeds_ordered: 'Received quantity is more than ordered.',
  receipt_decrease_rejected: 'Received quantity cannot be lowered once recorded.',
  item_not_on_invoice: 'That item is not on the original invoice.',
  not_receivable: 'That order cannot be received in its current state.',
  unknown_line: 'An order line was not recognized.',
  // Server codes arrive in mixed case (legacy lowercase, newer UPPER_SNAKE);
  // the lookup below lowercases, so both read friendly. Full code
  // standardization is tracked as Phase-A API consistency work.
}

async function req(path: string, opts: RequestInit = {}) {
  const hasBody = opts.body !== undefined
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...opts,
    // Never send Content-Type without a body: Fastify rejects a bodiless
    // POST as "Body cannot be empty" (this broke logout and order drafts).
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  })
  if (res.status === 401 && path === '/auth/me') {
    // The session probe: an expired session returns to the login screen.
    // Every other 401 carries a real error code (wrong 2FA code, …) and must
    // NOT redirect — callers handle those inline.
    if (!location.pathname.startsWith('/login')) location.href = '/login'
    throw new ApiError(401, 'unauthorized', FRIENDLY.unauthorized)
  }
  if (!res.ok) {
    const t = await res.text()
    let code = `http_${res.status}`
    let serverMessage: string | undefined
    try {
      const j = JSON.parse(t)
      if (j && typeof j.error === 'string') code = j.error
      if (j && typeof j.message === 'string') serverMessage = j.message
    } catch {
      /* non-JSON error page — keep the http_ fallback */
    }
    const key = code.toLowerCase()
    throw new ApiError(res.status, code, FRIENDLY[key] || serverMessage || `Something went wrong (${code}).`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  get: (p: string) => req(p),
  post: (p: string, body?: unknown) => req(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: (p: string, body?: unknown) => req(p, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
}

export function money(paise: number, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format((paise || 0) / 100)
  } catch {
    return `Rs ${((paise || 0) / 100).toFixed(2)}`
  }
}
