import { create } from 'zustand'

// Single shared connectivity state. navigator.onLine lies behind captive
// portals, so a cheap heartbeat against /api/health decides. One monitor for
// the whole app (started once in App); screens just read the flag.
type NetState = { online: boolean; lastBeat: number; set: (online: boolean) => void }

export const useNet = create<NetState>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastBeat: 0,
  set: (online) => set({ online, lastBeat: Date.now() }),
}))

let started = false

export function startNetMonitor() {
  if (started || typeof window === 'undefined') return
  started = true
  // App-lifetime singleton: intentionally never stopped.
  const alive = true
  let timer = 0
  const beat = async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      if (alive) useNet.getState().set(res.ok && navigator.onLine)
    } catch {
      if (alive) useNet.getState().set(false)
    }
    if (alive) timer = window.setTimeout(beat, 20000)
  }
  const onUp = () => {
    void beat()
  }
  const onDown = () => useNet.getState().set(false)
  window.addEventListener('online', onUp)
  window.addEventListener('offline', onDown)
  void beat()
  void timer
}
