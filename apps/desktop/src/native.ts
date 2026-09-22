// Native low-stock check (desktop): polls /dashboard/summary and fires a native
// notification when the count grows. Phase 7 DoD — tray + notification + auto-update config.

export function createLowStockPoll(apiBase: string, intervalMs = 15 * 60 * 1000) {
  let last = 0
  async function tick() {
    try {
      const r = await fetch(`${apiBase}/dashboard/summary`, { credentials: 'include' })
      if (!r.ok) return
      const j = await r.json()
      if (j.lowStockCount > last && (window as any).__TAURI__?.notification) {
        const { sendNotification } = await import('@tauri-apps/plugin-notification').catch(() => ({ sendNotification: null as any }))
        if (sendNotification) sendNotification({ title: 'ecoBills — low stock', body: `${j.lowStockCount} items below reorder level` })
      }
      last = j.lowStockCount
    } catch {
      /* offline-tolerant: ignore */
    }
  }
  tick()
  const id = setInterval(tick, intervalMs)
  return { stop: () => clearInterval(id), getLast: () => last }
}
