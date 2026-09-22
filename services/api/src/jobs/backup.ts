// Daily backup job — pg_dump to BACKUP_DIR. Run via cron/scheduler before GA (Phase 9).
// Usage: pnpm --filter @ecobills/api backup   (or BACKUP_CRON schedule on host)
import 'dotenv/config'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const run = promisify(execFile)

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const dir = process.env.BACKUP_DIR || './backups'
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `ecobills-${stamp}.dump`)
  console.log(`[backup] pg_dump → ${file}`)
  await run('pg_dump', ['--format=custom', `--file=${file}`, url])
  console.log('[backup] done')
  // retention: keep last 14
  const { readdirSync, unlinkSync, statSync } = await import('node:fs')
  const files = readdirSync(dir).filter((f) => f.startsWith('ecobills-')).sort()
  while (files.length > 14) {
    const f = files.shift()!
    unlinkSync(path.join(dir, f))
    console.log(`[backup] pruned ${f}`)
  }
  void statSync
}

main().catch((e) => {
  console.error('[backup] failed:', e.message)
  process.exit(1)
})
