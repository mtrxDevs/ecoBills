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

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  if (res.status === 401) {
    if (!location.pathname.startsWith('/login')) location.href = '/login'
    throw new Error('unauthorized')
  }
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `request_failed_${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  get: (p: string) => req(p),
  post: (p: string, body?: unknown) => req(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: (p: string, body?: unknown) => req(p, { method: 'PATCH', body: JSON.stringify(body) }),
}

export function money(paise: number, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format((paise || 0) / 100)
  } catch {
    return `Rs ${((paise || 0) / 100).toFixed(2)}`
  }
}
