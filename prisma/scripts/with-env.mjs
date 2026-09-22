// `pnpm --filter @ecobills/prisma` runs with cwd = prisma/, so a repo-root
// `.env` is invisible to the Prisma CLI. Preload it, then exec prisma with the
// same argv. Shell env still wins; a missing .env is fine (fall back to shell).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const prismaDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootEnv = join(prismaDir, '..', '.env')

if (existsSync(rootEnv) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(rootEnv)
} else if (existsSync(rootEnv)) {
  const { config } = await import('dotenv').catch(() => ({ config: null }))
  if (config) config({ path: rootEnv })
  else console.warn('[prisma] root .env found but could not be loaded (old node, no dotenv) — using shell env.')
}

const args = process.argv.slice(2)
const r = spawnSync('prisma', args, { cwd: prismaDir, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
