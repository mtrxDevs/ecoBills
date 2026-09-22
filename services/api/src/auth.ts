import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma, dbReady } from './db.js'

const scrypt = promisify(_scrypt)

export async function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex')
  const dk = (await scrypt(pw, salt, 64)) as Buffer
  return `scrypt:${salt}:${dk.toString('hex')}`
}

export async function verifyPassword(pw: string, stored: string) {
  const [algo, salt, hex] = stored.split(':')
  if (algo !== 'scrypt' || !salt || !hex) return false
  const dk = (await scrypt(pw, salt, 64)) as Buffer
  const a = Buffer.from(hex, 'hex')
  return a.length === dk.length && timingSafeEqual(a, dk)
}

export function newSessionToken() {
  return randomBytes(32).toString('hex')
}

export function tokenHash(t: string) {
  return createHash('sha256').update(t).digest('hex')
}

export type SessionUser = { id: string; businessId: string; role: 'owner' | 'staff'; name: string; email: string }

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser
  }
}

export async function requireDb(req: FastifyRequest, reply: FastifyReply) {
  if (!dbReady) {
    reply.code(503).send({ error: 'database_unavailable', message: 'Postgres not connected. Check DATABASE_URL.' })
    return reply
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!dbReady) return requireDb(req, reply)
  const token = req.cookies?.ecobills_session
  if (!token) {
    reply.code(401).send({ error: 'unauthorized' })
    return reply
  }
  const s = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  })
  if (!s || s.expiresAt < new Date()) {
    reply.code(401).send({ error: 'unauthorized' })
    return reply
  }
  req.user = { id: s.user.id, businessId: s.user.businessId, role: s.user.role as 'owner' | 'staff', name: s.user.name, email: s.user.email }
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

function cookieSecurity() {
  // Cross-origin frontends (Tauri app, split hosting) need SameSite=None, and
  // browsers reject SameSite=None without Secure — so none implies secure.
  // Local dev stays lax over plain http. Overridden only via env, never by clients.
  const sameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase() === 'none' ? 'none' : 'lax'
  const secure = process.env.NODE_ENV === 'production' || sameSite === 'none'
  return { sameSite: sameSite as 'lax' | 'none', secure }
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  const { sameSite, secure } = cookieSecurity()
  reply.setCookie('ecobills_session', token, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  const { sameSite, secure } = cookieSecurity()
  reply.clearCookie('ecobills_session', { path: '/', sameSite, secure })
}
