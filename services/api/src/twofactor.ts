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

export function render2faEmail(code: string, appName = 'ecoBills', kind: 'signin' | 'verify' = 'signin', logoUrl?: string) {
  const isVerify = kind === 'verify'
  const title = isVerify ? `Verify your ${appName} email` : `Your ${appName} sign-in code`
  const line1 = isVerify ? `Your ${appName} verification code is:` : `Your ${appName} sign-in code is:`
  const line2 = isVerify
    ? `It expires in ${TWO_FA_CODE_TTL_MINUTES} minutes. If you didn't create this account, ignore this email.`
    : `It expires in ${TWO_FA_CODE_TTL_MINUTES} minutes. If you didn't request this, ignore this email — your password alone cannot sign anyone in while two-step verification is on.`
  const brand = logoUrl
    ? `<img src="${logoUrl}" alt="${appName}" height="28" style="display:block;height:28px;" />`
    : `<span style="color:#17A673;font-size:22px;font-weight:bold;font-family:Arial,sans-serif;">eco</span><span style="color:#FFFFFF;font-size:22px;font-weight:bold;font-family:Arial,sans-serif;">Bills</span>`
  // Table layout + inline styles: the only combo Gmail/Outlook all respect.
  const html = [
    '<!doctype html><html><body style="margin:0;padding:0;background-color:#f4f4f2;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f2;padding:32px 16px;"><tr><td align="center">',
    '<table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;max-width:480px;">',
    `<tr><td style="background-color:#101210;padding:18px 24px;border-radius:12px 12px 0 0;">${brand}</td></tr>`,
    '<tr><td style="padding:28px 24px;font-family:Arial,Helvetica,sans-serif;color:#14171C;">',
    `<p style="margin:0 0 4px;font-size:20px;font-weight:bold;">${title}</p>`,
    `<p style="margin:0 0 16px;font-size:14px;color:#5a6270;">${line1}</p>`,
    `<div style="font-size:32px;font-weight:bold;letter-spacing:10px;text-align:center;background-color:#FAFAF8;border:1px dashed #17A673;border-radius:8px;padding:14px 8px 14px 18px;font-family:monospace;">${code}</div>`,
    `<p style="margin:16px 0 0;font-size:13px;color:#5a6270;">${line2}</p>`,
    '</td></tr>',
    '<tr><td style="padding:0 24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9aa0ab;">Sent by ecoBills · mtrxWorks</td></tr>',
    '</table></td></tr></table></body></html>',
  ].join('')
  return {
    subject: title,
    text: [`${line1} ${code}`, '', line2].join('\n'),
    html,
  }
}
