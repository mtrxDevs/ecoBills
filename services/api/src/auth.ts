import type { FastifyReply, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { prisma, dbReady } from './db.js'

export type SessionUser = { id: string; businessId: string; role: 'owner' | 'staff'; name: string; email: string }

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser
    neonAuth?: NeonIdentity
  }
}

type NeonIdentity = {
  id: string
  email: string
  name?: string
  emailVerified?: boolean
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
let jwksUrl = ''

function authConfig() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim()
  const jwksUrlValue = process.env.NEON_AUTH_JWKS_URL?.trim()
  if (!baseUrl || !jwksUrlValue) throw new Error('NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL are required')
  return { baseUrl, jwksUrlValue }
}

async function verifyBearer(token: string): Promise<NeonIdentity> {
  const { baseUrl, jwksUrlValue } = authConfig()
  if (!jwks || jwksUrl !== jwksUrlValue) {
    jwks = createRemoteJWKSet(new URL(jwksUrlValue))
    jwksUrl = jwksUrlValue
  }
  // Managed Neon Auth JWTs use the Auth service origin as their issuer. The
  // configured base URL also contains the branch/database auth path.
  const issuer = new URL(baseUrl).origin
  const { payload } = await jwtVerify(token, jwks, { issuer })
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new Error('invalid_neon_identity')
  return {
    id: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === 'string' ? payload.name : undefined,
    emailVerified: payload.email_verified === true,
  }
}

export async function authenticateNeonRequest(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'unauthorized' })
    return null
  }
  try {
    const identity = await verifyBearer(header.slice('Bearer '.length).trim())
    req.neonAuth = identity
    return identity
  } catch (error) {
    req.log.debug({ error }, 'invalid Neon Auth bearer token')
    reply.code(401).send({ error: 'unauthorized' })
    return null
  }
}

export async function findOrLinkAppUser(identity: NeonIdentity) {
  const linked = await prisma.user.findUnique({ where: { neonAuthId: identity.id } })
  if (linked) return linked

  // Existing application users can be linked once by their Neon email.
  // Role and business always come from this database record.
  const byEmail = await prisma.user.findUnique({ where: { email: identity.email } })
  if (!byEmail || byEmail.neonAuthId) return null
  return prisma.user.update({
    where: { id: byEmail.id },
    data: { neonAuthId: identity.id, emailVerified: true, name: identity.name || byEmail.name },
  })
}

export async function requireDb(req: FastifyRequest, reply: FastifyReply) {
  if (!dbReady) {
    reply.code(503).send({ error: 'database_unavailable', message: 'Postgres not connected. Check DATABASE_URL.' })
    return reply
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!dbReady) return requireDb(req, reply)
  const identity = await authenticateNeonRequest(req, reply)
  if (!identity || reply.sent) return reply
  const user = await findOrLinkAppUser(identity)
  if (!user) {
    reply.code(403).send({ error: 'profile_setup_required' })
    return reply
  }
  req.user = { id: user.id, businessId: user.businessId, role: user.role as 'owner' | 'staff', name: user.name, email: user.email }
}

// ---- RBAC matrix (§6.1) ----
export type Action =
  | 'invoice.write' | 'inventory.manage' | 'stock.adjust' | 'po.send'
  | 'po.receive' | 'invoice.void' | 'reports.view' | 'settings.manage'

const STAFF_DENY: Set<Action> = new Set(['stock.adjust', 'po.send', 'invoice.void', 'reports.view', 'settings.manage'])

export function can(role: 'owner' | 'staff', action: Action) {
  if (role === 'owner') return true
  return !STAFF_DENY.has(action)
}

export function requirePerm(action: Action) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply)
    if (reply.sent) return reply
    if (!can(req.user!.role, action)) {
      reply.code(403).send({ error: 'forbidden', action })
      return reply
    }
  }
}

export const requireOwner = requirePerm('settings.manage')
