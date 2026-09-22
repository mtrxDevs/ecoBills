import type { FastifyInstance } from 'fastify'
import { prisma, dbReady } from '../db.js'
import {
  hashPassword, verifyPassword, newSessionToken, tokenHash,
  setSessionCookie, clearSessionCookie, requireAuth, requirePerm,
} from '../auth.js'
import { audit } from '../audit.js'
import { sendEmail } from '../email.js'
import {
  generateNumericCode, hashChallengeSecret, verifyChallengeCode,
  isChallengeUsable, render2faEmail, TWO_FA_CODE_TTL_MINUTES, TWO_FA_MAX_ATTEMPTS,
} from '../twofactor.js'
import {
  signupSchema, loginSchema, createUserSchema,
  verify2faSchema, resend2faSchema, enable2faSchema, disable2faSchema,
} from '@ecobills/types'

const STRICT_AUTH_LIMIT = { max: 20, timeWindow: '1 minute' } as const

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
    // No session yet: the inbox must be proven first. The wizard completes
    // signup via POST /auth/verify-email.
    const challengeToken = await issueChallenge(user.id, user.email, 'email_verify')
    return { emailVerificationRequired: true, challengeToken }
  })

  app.post('/auth/login', { config: { rateLimit: STRICT_AUTH_LIMIT } }, async (req, reply) => {
    if (!dbReady) return reply.code(503).send({ error: 'database_unavailable' })
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !(await verifyPassword(body.password, user.passwordHash)))
      return reply.code(401).send({ error: 'invalid_credentials' })
    // Unverified inboxes prove themselves first — even before 2FA.
    if (!user.emailVerified) {
      const challengeToken = await issueChallenge(user.id, user.email, 'email_verify')
      return { emailVerificationRequired: true, challengeToken }
    }
    // No session yet when 2FA is on — the code step completes the login.
    if (user.twoFactorEnabled) {
      const challengeToken = await issueChallenge(user.id, user.email, 'two_factor')
      return { twoFactorRequired: true, challengeToken }
    }
    await createSession(user.id, reply)
    return { user: pub(user) }
  })

  // Complete a login challenge. Strictly rate-limited + attempt-capped.
  app.post('/auth/2fa/verify', { config: { rateLimit: STRICT_AUTH_LIMIT } }, async (req, reply) => {
    if (!dbReady) return reply.code(503).send({ error: 'database_unavailable' })
    const body = verify2faSchema.parse(req.body)
    const user = await consumeChallenge(body.challengeToken, body.code, 'two_factor', reply)
    if (!user) return // consumeChallenge already replied
    await createSession(user.id, reply)
    await audit({ businessId: user.businessId, userId: user.id, action: '2fa.login', entity: 'User', entityId: user.id })
    return { user: pub(user) }
  })

  // Prove an inbox (signup, or a grandfathered login). Flips the flag, then
  // either opens the session or chains into the 2FA step when that is on.
  app.post('/auth/verify-email', { config: { rateLimit: STRICT_AUTH_LIMIT } }, async (req, reply) => {
    if (!dbReady) return reply.code(503).send({ error: 'database_unavailable' })
    const body = verify2faSchema.parse(req.body)
    const user = await consumeChallenge(body.challengeToken, body.code, 'email_verify', reply)
    if (!user) return
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    await audit({ businessId: user.businessId, userId: user.id, action: 'email.verified', entity: 'User', entityId: user.id })
    if (user.twoFactorEnabled) {
      const challengeToken = await issueChallenge(user.id, user.email, 'two_factor')
      return { twoFactorRequired: true, challengeToken }
    }
    await createSession(user.id, reply)
    return { user: pub({ ...user, emailVerified: true }) }
  })

  // New code, new challenge; the old one dies with it.
  app.post('/auth/2fa/resend', { config: { rateLimit: STRICT_AUTH_LIMIT } }, async (req, reply) => {
    if (!dbReady) return reply.code(503).send({ error: 'database_unavailable' })
    const body = resend2faSchema.parse(req.body)
    const ch = await prisma.twoFactorChallenge.findUnique({
      where: { tokenHash: hashChallengeSecret(body.challengeToken) },
      include: { user: true },
    })
    if (!ch) return reply.code(401).send({ error: 'invalid_challenge' })
    await prisma.twoFactorChallenge.updateMany({
      where: { userId: ch.userId, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    const challengeToken = await issueChallenge(ch.userId, ch.user.email, ch.purpose as 'two_factor' | 'email_verify')
    return { challengeToken }
  })

  // --- self-service 2FA management (any authenticated user, own account only) ---

  // Step 1: prove you can read the account's email.
  app.post('/auth/2fa/setup', { preHandler: requireAuth }, async (req) => {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
    const challengeToken = await issueChallenge(me.id, me.email, 'two_factor')
    return { challengeToken }
  })

  // Step 2: enter the code → flag flips on.
  app.post('/auth/2fa/enable', { preHandler: requireAuth }, async (req, reply) => {
    const body = enable2faSchema.parse(req.body)
    const ch = await prisma.twoFactorChallenge.findUnique({
      where: { tokenHash: hashChallengeSecret(body.challengeToken) },
    })
    if (!ch || ch.userId !== req.user!.id || ch.purpose !== 'two_factor' || !isChallengeUsable(ch)) {
      return reply.code(401).send({ error: 'invalid_challenge' })
    }
    if (!verifyChallengeCode(body.code, ch.codeHash)) {
      await prisma.twoFactorChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } })
      return reply.code(401).send({ error: 'invalid_code' })
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorEnabled: true } }),
      prisma.twoFactorChallenge.updateMany({ where: { userId: req.user!.id, consumedAt: null }, data: { consumedAt: new Date() } }),
    ])
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: '2fa.enable', entity: 'User', entityId: req.user!.id })
    return { ok: true }
  })

  // Disabling requires the password — a stolen session alone can't strip 2FA.
  app.post('/auth/2fa/disable', { preHandler: requireAuth }, async (req, reply) => {
    const body = disable2faSchema.parse(req.body)
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
    if (!(await verifyPassword(body.password, me.passwordHash)))
      return reply.code(401).send({ error: 'invalid_credentials' })
    await prisma.$transaction([
      prisma.user.update({ where: { id: me.id }, data: { twoFactorEnabled: false } }),
      prisma.twoFactorChallenge.deleteMany({ where: { userId: me.id } }),
    ])
    await audit({ businessId: req.user!.businessId, userId: req.user!.id, action: '2fa.disable', entity: 'User', entityId: me.id })
    return { ok: true }
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

/** Create a challenge, email the code, return the (plaintext) challenge token. */
async function issueChallenge(userId: string, email: string, purpose: 'two_factor' | 'email_verify') {
  const code = generateNumericCode()
  const challengeToken = newSessionToken()
  await prisma.twoFactorChallenge.create({
    data: {
      userId,
      purpose,
      codeHash: hashChallengeSecret(code),
      tokenHash: hashChallengeSecret(challengeToken),
      expiresAt: new Date(Date.now() + TWO_FA_CODE_TTL_MINUTES * 60e3),
    },
  })
  const { subject, text, html } = render2faEmail(code, 'ecoBills', purpose === 'email_verify' ? 'verify' : 'signin', publicLogoUrl())
  const r = await sendEmail({ to: email, subject, text, html })
  if (r.stub) console.log(`[2fa:stub] code for ${email}: ${code} (no RESEND_API_KEY — read it here in dev)`)
  return challengeToken
}

/**
 * Absolute logo URL for emails, or undefined when there is no public base to
 * hang it on (local dev serves localhost, which no inbox can load — the
 * template falls back to a text brand mark instead of a broken image).
 */
function publicLogoUrl() {
  const base = (process.env.APP_URL || '').split(',')[0].trim().replace(/\/$/, '')
  if (!base || /localhost|127\.0\.0\.1/i.test(base)) return undefined
  return `${base}/logo.png`
}

/**
 * Validate a challenge of the expected purpose. Returns the user on success,
 * or replies with the failure and returns null. Single-use, expiry- and
 * attempt-capped. A token minted for one purpose never works for the other.
 */
async function consumeChallenge(challengeToken: string, code: string, purpose: 'two_factor' | 'email_verify', reply: any) {
  const ch = await prisma.twoFactorChallenge.findUnique({
    where: { tokenHash: hashChallengeSecret(challengeToken) },
    include: { user: true },
  })
  if (!ch || ch.purpose !== purpose || ch.consumedAt) {
    reply.code(401).send({ error: 'invalid_challenge' })
    return null
  }
  if (ch.attempts >= TWO_FA_MAX_ATTEMPTS) {
    await prisma.twoFactorChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } })
    reply.code(403).send({ error: 'challenge_locked' })
    return null
  }
  if (!isChallengeUsable(ch)) {
    // Only expiry remains (consumed/locked handled above).
    await prisma.twoFactorChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } })
    reply.code(410).send({ error: 'challenge_expired' })
    return null
  }
  if (!verifyChallengeCode(code, ch.codeHash)) {
    const attempts = ch.attempts + 1
    await prisma.twoFactorChallenge.update({
      where: { id: ch.id },
      data: { attempts, ...(attempts >= TWO_FA_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}) },
    })
    if (attempts >= TWO_FA_MAX_ATTEMPTS) {
      await audit({ businessId: ch.user.businessId, userId: ch.userId, action: '2fa.locked', entity: 'User', entityId: ch.userId, after: { attempts } })
      reply.code(403).send({ error: 'challenge_locked' })
      return null
    }
    reply.code(401).send({ error: 'invalid_code' })
    return null
  }
  await prisma.twoFactorChallenge.updateMany({
    where: { userId: ch.userId, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  return ch.user
}

async function createSession(userId: string, reply: any) {
  const token = newSessionToken()
  await prisma.session.create({
    data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 30 * 86400e3) },
  })
  setSessionCookie(reply, token)
}

function pub(u: { id: string; businessId?: string; name: string; email: string; role: string; twoFactorEnabled?: boolean; emailVerified?: boolean }) {
  return { id: u.id, businessId: (u as any).businessId, name: u.name, email: u.email, role: u.role, twoFactorEnabled: !!(u as any).twoFactorEnabled, emailVerified: !!(u as any).emailVerified }
}
