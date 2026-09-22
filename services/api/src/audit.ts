import { prisma } from './db.js'

export async function audit(opts: {
  businessId: string
  userId: string
  action: string
  entity: string
  entityId: string
  before?: unknown
  after?: unknown
}) {
  try {
    await prisma.auditLog.create({
      data: {
        businessId: opts.businessId,
        userId: opts.userId,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        before: (opts.before as object) ?? undefined,
        after: (opts.after as object) ?? undefined,
      },
    })
  } catch (e) {
    console.error('[audit] failed', e)
  }
}
