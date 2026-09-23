import type { Prisma } from '@prisma/client'
import { prisma } from './db.js'

export async function audit(
  opts: {
    businessId: string
    userId: string
    action: string
    entity: string
    entityId: string
    before?: unknown
    after?: unknown
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const data = {
    businessId: opts.businessId,
    userId: opts.userId,
    action: opts.action,
    entity: opts.entity,
    entityId: opts.entityId,
    before: (opts.before as object) ?? undefined,
    after: (opts.after as object) ?? undefined,
  }

  // When inside a transaction, let failures bubble up so financial events cannot silently lose audit trails.
  if (client === prisma) {
    try {
      return await client.auditLog.create({ data })
    } catch (e) {
      console.error('[audit] failed', e)
    }
  } else {
    return await client.auditLog.create({ data })
  }
}

