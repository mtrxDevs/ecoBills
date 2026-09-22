import type { FastifyInstance } from 'fastify'
import { prisma, dbReady } from '../db.js'
import {
  hashPassword, verifyPassword, newSessionToken, tokenHash,
  setSessionCookie, clearSessionCookie, requireAuth, requirePerm,
} from '../auth.js'
import { audit } from '../audit.js'
import { signupSchema, loginSchema, createUserSchema } from '@ecobills/types'

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', async (req, reply) => {
    if (!dbReady) return reply.code(503).send({ error: 'database_unavailable' })
    const body = signupSchema.parse(req.body)
    const exists = await prisma.user.findUnique({ where: { email: body.email } })
    if (exists) return reply.code(409).send({ error: 'email_taken' })
    const business = await prisma.business.create({
      data: { name: body.businessName, state: body.state, gstin: body.gstin || null },
    })
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: body.ownerName,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: 'owner',
      },
    })
    const token = newSessionToken()
    await prisma.session.create({
      data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 30 * 86400e3) },
    })
    setSessionCookie(reply, token)
    return { user: pub(user), business }
  })

  app.post('/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!dbReady) return reply.code(503).send({ error: 'database_unavailable' })
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !(await verifyPassword(body.password, user.passwordHash)))
      return reply.code(401).send({ error: 'invalid_credentials' })
    const token = newSessionToken()
    await prisma.session.create({
      data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 30 * 86400e3) },
    })
    setSessionCookie(reply, token)
    return { user: pub(user) }
  })

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies?.ecobills_session
    if (token && dbReady) {
      await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } }).catch(() => {})
    }
    clearSessionCookie(reply)
    return { ok: true }
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { business: true } })
    if (!u) return { user: null }
    return { user: pub(u), business: u.business }
  })

  // Owner-only user management
  app.get('/users', { preHandler: requirePerm('settings.manage') }, async (req) => {
    return prisma.user.findMany({ where: { businessId: req.user!.businessId }, select: { id: true, name: true, email: true, role: true, createdAt: true } })
  })

  app.post('/users', { preHandler: requirePerm('settings.manage') }, async (req, reply) => {
    const body = createUserSchema.parse(req.body)
    const exists = await prisma.user.findUnique({ where: { email: body.email } })
    if (exists) return reply.code(409).send({ error: 'email_taken' })
    const u = await prisma.user.create({
      data: { businessId: req.user!.businessId, name: body.name, email: body.email, passwordHash: await hashPassword(body.password), role: body.role },
    })
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: 'user.create', entity: 'User', entityId: u.id, after: { email: u.email, role: u.role } })
    return pub(u)
  })
}

function pub(u: { id: string; businessId?: string; name: string; email: string; role: string }) {
  return { id: u.id, businessId: (u as any).businessId, name: u.name, email: u.email, role: u.role }
}
