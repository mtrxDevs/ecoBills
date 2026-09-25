import { authClient } from './auth'

// API origin. Empty = same-origin (/api/*), which covers local dev (Vite
// proxy) and single-service deploys (API serves the web UI itself).
const ORIGIN = ((import.meta as any).env?.VITE_API_URL || '') as string
const BASE = `${ORIGIN}/api`

/** Absolute API URL for non-fetch uses (PDF download links, etc.). */
export function apiUrl(path: string) {
  return `${BASE}${path}`
}

export async function downloadFile(path: string, filename: string) {
  const token = (await authClient.token()).data?.token
  const res = await fetch(apiUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError(res.status, 'download_failed')
  const objectUrl = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
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

/** Server error key for branching and friendly error messages. */
export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : ''
}

const FRIENDLY: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  email_taken: 'That email is already registered.',
  overpayment: 'That payment is more than the balance due.',
  paid_invoice_cannot_void: 'That invoice already has payments — issue a credit note instead.',
  supplier_email_missing: 'Add an email address for this supplier first.',
  email_failed: 'The email could not be sent. Try again.',
  not_found: 'That record no longer exists.',
  forbidden: 'Your role cannot do that.',
  unauthorized: 'Your session expired. Log in again.',
  profile_setup_required: 'Finish setting up your business before opening the dashboard.',
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
  const tokenResult = await authClient.token()
  const token = tokenResult.data?.token
  const res = await fetch(BASE + path, {
    ...opts,
    // Never send Content-Type without a body: Fastify rejects a bodiless
    // POST as "Body cannot be empty".
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
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
