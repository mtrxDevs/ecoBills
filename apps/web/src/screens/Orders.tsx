import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconCheck,
  IconWarning,
  PageHint,
  PageTitle,
  Panel,
  SkeletonList,
  StaggerItem,
  StaggerList,
  TextAreaField,
  TextField,
  motionLimits,
  useToast,
} from '@ecobills/ui'
import { api, money } from '../lib/api'
import { useMe } from '../lib/store'

/**
 * Orders. Endpoints, payloads and the human-in-the-loop invariant are
 * unchanged from v0.1.1:
 *   GET  /purchase-orders
 *   POST /purchase-orders/from-low-stock
 *   POST /purchase-orders/:id/send      { subject, body }   (owner only)
 *   POST /purchase-orders/:id/receive   { lines: [{ lineId, qtyReceived }] }
 *
 * A draft is still only ever sent by an explicit click, the preview still says
 * so, and no auto-email is introduced. The hand-rolled fixed overlay became a
 * <Panel> (Escape to close, focus moved in and restored, scroll locked), the
 * "✓" glyph became a drawn SVG checkmark, and the list gained the loading and
 * error states it was missing.
 */
export function Orders() {
  const qc = useQueryClient()
  const toast = useToast()
  const { me } = useMe()
  const isOwner = me?.user?.role === 'owner'
  const [preview, setPreview] = useState<any>(null)
  const [celebrate, setCelebrate] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['pos'],
    queryFn: () => api.get('/purchase-orders'),
  })

  const fromLow = useMutation({
    mutationFn: () => api.post('/purchase-orders/from-low-stock'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos'] })
      toast.success('Draft order created', 'Review it below, then send it yourself when you are ready.')
    },
    onError: (e: any) => toast.error('Could not draft an order', e instanceof Error ? e.message : undefined),
  })

  const send = useMutation({
    mutationFn: (po: any) => api.post(`/purchase-orders/${po.id}/send`, { subject: po.emailSubject, body: po.emailBody }),
    onSuccess: () => {
      setCelebrate(true)
      qc.invalidateQueries({ queryKey: ['pos'] })
      window.setTimeout(() => {
        setCelebrate(false)
        setPreview(null)
      }, motionLimits.successHoldMs)
    },
    onError: (e: any) => toast.error('The order was not sent', e instanceof Error ? e.message : undefined),
  })

  const receive = useMutation({
    mutationFn: (po: any) => {
      const lines = po.lines.map((l: any) => ({ lineId: l.id, qtyReceived: Number(l.qtyRequested) }))
      return api.post(`/purchase-orders/${po.id}/receive`, { lines })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos'] })
      toast.success('Stock received', 'The ledger has been updated for every line.')
    },
    onError: (e: any) => toast.error('Could not receive this order', e instanceof Error ? e.message : undefined),
  })

  const orders: any[] = data || []

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageTitle>Orders</PageTitle>
          <PageHint>Draft, preview, send. Nothing leaves your shop until you click Send.</PageHint>
        </div>
        <Button onClick={() => fromLow.mutate()} loading={fromLow.isPending} loadingLabel="Drafting order">
          Review low-stock order
        </Button>
      </div>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError ? (
        <ErrorState
          title="Could not load your purchase orders"
          description="No order has been changed or sent. Check the connection and try again."
          detail={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : !orders.length ? (
        <EmptyState
          icon="cart"
          title="No purchase orders"
          description="Draft one per supplier from the items that are running low."
          action={
            <Button onClick={() => fromLow.mutate()} loading={fromLow.isPending} loadingLabel="Drafting order">
              Review low-stock order
            </Button>
          }
        />
      ) : (
        <StaggerList className="flex flex-col gap-3">
          {orders.map((po: any, i: number) => (
            <StaggerItem key={po.id} index={i}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--color-ink)]">{po.supplier?.name}</p>
                    <p className="tnum text-xs text-[var(--color-ink-subtle)]">
                      {po.lines.length} {po.lines.length === 1 ? 'item' : 'items'} · {po.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setPreview(po)}>
                      Preview
                    </Button>
                    {po.status === 'draft' && isOwner ? (
                      <Button size="sm" onClick={() => setPreview(po)}>
                        Review &amp; send
                      </Button>
                    ) : null}
                    {po.status === 'sent' || po.status === 'partial' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={receive.isPending && receive.variables?.id === po.id}
                        loadingLabel="Receiving"
                        onClick={() => receive.mutate(po)}
                      >
                        Mark received
                      </Button>
                    ) : null}
                  </div>
                </div>

                {po.followUpNudge ? (
                  <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warn-tint)] p-3">
                    <IconWarning className="mt-0.5 shrink-0 text-base text-[var(--color-warn-text)]" />
                    <p className="text-sm text-[var(--color-warn-text)]">
                      Sent a while ago with nothing received. Follow up? No email is ever sent automatically.
                    </p>
                  </div>
                ) : null}

                <ul className="mt-3 flex flex-col gap-1 text-sm text-[var(--color-ink-muted)]">
                  {po.lines.map((l: any) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{l.item?.name}</span>
                      <span className="tnum shrink-0">
                        {String(l.qtyRequested)} requested · {String(l.qtyReceived)} received
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {/* Preview / send. `celebrate` drives the Send button's checkmark morph,
          so there is exactly one animated element when the order goes out. */}
      <Panel
        open={Boolean(preview)}
        onClose={() => (send.isPending ? undefined : setPreview(null))}
        side="center"
        size="lg"
        title={celebrate ? 'Order sent' : 'Order preview'}
        description={celebrate ? undefined : 'Nothing is sent yet. Check the wording, then send it yourself.'}
        footer={
          celebrate ? (
            <Button variant="secondary" className="w-full" onClick={() => setPreview(null)}>
              Close
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {isOwner ? (
                <Button
                  className="flex-1"
                  loading={send.isPending}
                  success={celebrate}
                  loadingLabel="Sending order"
                  successLabel="Order sent"
                  onClick={() => preview && send.mutate(preview)}
                >
                  Send (explicit)
                </Button>
              ) : (
                <p className="flex-1 text-sm text-[var(--color-ink-muted)]">
                  Only the owner can send orders. Your preview is ready for review.
                </p>
              )}
              <Button variant="secondary" onClick={() => setPreview(null)} disabled={send.isPending}>
                Close
              </Button>
            </div>
          )
        }
      >
        {preview ? (
          celebrate ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span
                aria-hidden="true"
                className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-accent-tint)] text-[var(--color-success-text)]"
              >
                <IconCheck className="text-2xl" />
              </span>
              <p className="font-display font-semibold text-[var(--color-ink)]">Order sent</p>
              <p className="text-sm text-[var(--color-ink-muted)]">The supplier has been emailed. Nothing else is pending.</p>
              {/* Live region already exists in the DOM; only its text changes. */}
              <span role="status" aria-live="polite" className="sr-only">
                Order sent
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[var(--color-ink-muted)]">To:</span>
                <span className="text-[var(--color-ink)]">
                  {preview.supplier?.contactEmail || 'No supplier email. Add one first.'}
                </span>
                {!preview.supplier?.contactEmail ? <Badge tone="warn">No email on file</Badge> : null}
              </div>

              <TextField
                label="Subject"
                value={preview.emailSubject || ''}
                onValueChange={(v) => setPreview({ ...preview, emailSubject: v })}
                validate={(v) => (v.trim() ? undefined : 'A subject is required before sending.')}
              />

              <TextAreaField
                label="Body"
                rows={10}
                value={preview.emailBody || ''}
                onValueChange={(v) => setPreview({ ...preview, emailBody: v })}
              />

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">Lines</p>
                <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-control)] border border-[var(--color-border)] text-sm">
                  {preview.lines.map((l: any) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-[var(--color-ink)]">{l.item?.name}</span>
                        <span className="tnum text-[var(--color-ink-muted)]">
                          {String(l.qtyRequested)} {l.item?.unit || ''} · {money(l.lastKnownPrice ?? 0)}
                        </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        ) : null}
      </Panel>
    </div>
  )
}
