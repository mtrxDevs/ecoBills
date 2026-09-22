import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
export let dbReady = false

export async function connectDb(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      dbReady = true
      console.log('[api] postgres connected')
      return true
    } catch (e) {
      console.warn(`[api] db not ready (${i + 1}/${retries}) — retrying in 2s`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  // Stay up degraded (503 on DB routes) and keep trying in the background:
  // hosted Postgres (pauses, pooler blips, cold starts) recovers on its own,
  // and the API must come back with it instead of needing a restart.
  console.error('[api] DATABASE_URL unreachable — booting degraded (DB routes → 503). Retrying in background.')
  let trying = false
  const t = setInterval(async () => {
    if (trying || dbReady) return
    trying = true
    try {
      await prisma.$queryRaw`SELECT 1`
      dbReady = true
      clearInterval(t)
      console.log('[api] postgres connected (background retry)')
    } catch {
      /* stay degraded, try again next tick */
    } finally {
      trying = false
    }
  }, 15000)
  return false
}
