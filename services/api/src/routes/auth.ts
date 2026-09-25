import type { FastifyInstance } from 'fastify'
import { prisma, dbReady } from '../db.js'
import { authenticateNeonRequest, findOrLinkAppUser, requireAuth, requirePerm } from '../auth.js'
import { audit } from '../audit.js'
import { bootstrapSchema, createUserSchema } from '@ecobills/types'

const STRICT_AUTH_LIMIT = { max: 20, timeWindow: '1 minute' } as const

export async function authRoutes(app: FastifyInstance) {
  /**
   * The only app-account creation path. Neon Auth has already authenticated
   * the caller; business and Owner/Staff role are selected server-side.
   * Existing unlinked users are linked by their verified Neon email so
   * preserved application records remain usable after the migration.
   */
  app.post('/auth/bootstrap', { config: { rateLimit: STRICT_AUTH_LIMIT } }, async (req, reply) => {
    if (!dbReady) return reply.code(503).send({ error: 'database_unavailable' })
    const identity = await authenticateNeonRequest(req, reply)
    if (!identity || reply.sent) return

    const existing = await findOrLinkAppUser(identity)
    if (existing) {
      const business = await prisma.business.findUnique({ where: { id: existing.businessId } })
      return { user: pub(existing), business }
    }

    const body = bootstrapSchema.parse(req.body)
    const business = await prisma.business.create({
      data: { name: body.businessName, state: body.state, gstin: body.gstin || null },
    })
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: identity.name || body.ownerName,
        email: identity.email,
        neonAuthId: identity.id,
        passwordHash: '',
        role: 'owner',
        emailVerified: identity.emailVerified ?? true,
      },
    })
    await audit({ businessId: business.id, userId: user.id, action: 'user.bootstrap', entity: 'User', entityId: user.id })
    return { user: pub(user), business }
  })

  // Neon Auth owns the browser session. This endpoint is retained as a
  // predictable API boundary for clients and intentionally has no cookie state.
  app.post('/auth/logout', async () => ({ ok: true }))

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { business: true } })
    if (!u) return { user: null, business: null }
    return { user: pub(u), business: u.business }
  })

  // Owner-only user management creates a pending app record. The staff member
  // signs up with Neon Auth using that email; their first authenticated request
  // links the Neon subject while preserving this record's staff role/business.
  app.get('/users', { preHandler: requirePerm('settings.manage') }, async (req) => {
    return prisma.user.findMany({
      where: { businessId: req.user!.businessId },
      select: { id: true, name: true, email: true, role: true, createdAt: true, neonAuthId: true },
    })
  })

  app.post('/users', { preHandler: requirePerm('settings.manage') }, async (req, reply) => {
    const body = createUserSchema.parse(req.body)
    const exists = await prisma.user.findUnique({ where: { email: body.email } })
    if (exists) return reply.code(409).send({ error: 'email_taken' })
    const u = await prisma.user.create({
      data: {
        businessId: req.user!.businessId,
        name: body.name,
        email: body.email,
        passwordHash: '',
        role: 'staff',
      },
    })
    await audit({
      businessId: req.user!.businessId,
      userId: req.user!.id,
      action: 'user.create',
      entity: 'User',
      entityId: u.id,
      after: { email: u.email, role: u.role },
    })
    return pub(u)
  })
}

function pub(u: {
  id: string
  businessId?: string
  name: string
  email: string
  role: string
  neonAuthId?: string | null
  emailVerified?: boolean
}) {
  return {
    id: u.id,
    businessId: u.businessId,
    name: u.name,
    email: u.email,
    role: u.role,
    emailVerified: !!u.emailVerified,
    authLinked: !!u.neonAuthId,
  }
}
