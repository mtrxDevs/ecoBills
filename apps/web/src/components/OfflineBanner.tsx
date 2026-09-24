import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconWarning, Button, useToast } from '@ecobills/ui'
import { useNet } from '../lib/offline/net'
import { syncedAt, listDrafts, pushAndRefresh } from '../lib/offline/sync'

/**
 * Connectivity banner. Online: silent (syncs happen in the background).
 * Offline: says exactly what the user is looking at — cached data through a
 * date — plus what's queued and a manual retry. Never blocks the screen.
 *
 * State comes from React Query (polling + outbox-event invalidation), never
 * from setState-in-effect: the effect below only subscribes.
 */
export function OfflineBanner() {
  const online = useNet((s) => s.online)
  const toast = useToast()
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)

  const metaQ = useQuery({
    queryKey: ['offline-meta'],
    queryFn: async () => ({ age: await syncedAt(), pending: (await listDrafts()).length }),
    refetchInterval: 15000,
    staleTime: 5000,
  })

  useEffect(() => {
    const onOutbox = () => {
      qc.invalidateQueries({ queryKey: ['offline-meta'] })
    }
    window.addEventListener('ecobills-outbox', onOutbox)
    return () => window.removeEventListener('ecobills-outbox', onOutbox)
  }, [qc])

  const age = metaQ.data?.age ?? null
  const pending = metaQ.data?.pending ?? 0

  async function syncNow() {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await pushAndRefresh()
      if (r.failed.length) {
        toast.error(
          `${r.sent} sent, ${r.failed.length} need attention`,
          r.failed.map((f) => f.error).slice(0, 2).join(' · '),
        )
      } else if (r.sent > 0) {
        toast.success(r.sent === 1 ? 'Offline bill sent' : `${r.sent} offline bills sent`)
      }
      qc.invalidateQueries({ queryKey: ['offline-meta'] })
    } finally {
      setSyncing(false)
    }
  }

  if (online && pending === 0) return null

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm ${
        online
          ? 'bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]'
          : 'bg-[var(--color-warn-tint)] text-[var(--color-warn-text)]'
      }`}
    >
      {!online ? <IconWarning className="text-base" aria-hidden="true" /> : null}
      <span>
        {!online ? (
          <>
            <b>Offline.</b> Showing data through {age ? new Date(age).toLocaleString('en-IN') : 'the last sync'}. New
            bills save as drafts on this device.
          </>
        ) : (
          <>{pending} offline {pending === 1 ? 'bill' : 'bills'} waiting to send.</>
        )}
      </span>
      {pending > 0 ? (
        <Button variant="secondary" size="sm" loading={syncing} loadingLabel="Sending" disabled={!online} onClick={syncNow}>
          {online ? 'Send now' : `Send when back online (${pending})`}
        </Button>
      ) : null}
    </div>
  )
}
