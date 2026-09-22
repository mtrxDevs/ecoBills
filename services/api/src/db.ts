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
  console.error('[api] DATABASE_URL unreachable — booting degraded (DB routes → 503). See .env.example.')
  return false
}
