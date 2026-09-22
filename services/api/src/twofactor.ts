import { randomInt, timingSafeEqual, createHash } from 'node:crypto'

// Email 2FA policy (v0.1): opt-in per user, 6-digit code over email.
export const TWO_FA_CODE_TTL_MINUTES = 10
export const TWO_FA_MAX_ATTEMPTS = 5

/** Cryptographically random 6-digit code, zero-padded range handled by bounds. */
export function generateNumericCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0')
}

export function hashChallengeSecret(s: string) {
  return createHash('sha256').update(s).digest('hex')
}

/** Constant-time code comparison against the stored hash. */
export function verifyChallengeCode(presented: string, storedHash: string) {
  const a = Buffer.from(hashChallengeSecret(presented), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export type ChallengeState = {
  expiresAt: Date
  attempts: number
  consumedAt: Date | null
}

/** A challenge is usable only while unconsumed, unexpired, and under the attempt cap. */
export function isChallengeUsable(c: ChallengeState, now = new Date()) {
  if (c.consumedAt) return false
  if (c.attempts >= TWO_FA_MAX_ATTEMPTS) return false
  if (c.expiresAt <= now) return false
  return true
}

export function render2faEmail(code: string, appName = 'ecoBills', kind: 'signin' | 'verify' = 'signin') {
  if (kind === 'verify') {
    return {
      subject: `Verify your ${appName} email`,
      text: [
        `Your ${appName} verification code is: ${code}`,
        '',
        `It expires in ${TWO_FA_CODE_TTL_MINUTES} minutes. If you didn't create this account, ignore this email.`,
      ].join('\n'),
    }
  }
  return {
    subject: `Your ${appName} sign-in code`,
    text: [
      `Your ${appName} sign-in code is: ${code}`,
      '',
      `It expires in ${TWO_FA_CODE_TTL_MINUTES} minutes. If you didn't request this, ignore this email — your password alone cannot sign anyone in while two-step verification is on.`,
    ].join('\n'),
  }
}
