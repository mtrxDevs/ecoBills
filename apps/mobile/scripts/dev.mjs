// Phase 8 mobile dev — mirrors scripts/build.mjs: `pnpm dev` must stay green
// while the mobile shell has no Vite entry yet. Skips with an explanation;
// once apps/mobile/index.html exists, runs the real `vite --port 5174`.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(appDir, 'package.json'))

if (!existsSync(join(appDir, 'index.html'))) {
  console.warn(
    ['', '[mobile] skipping `vite dev`: no Vite entry (apps/mobile/index.html) yet.', '[mobile] use `pnpm --filter @ecobills/web dev` for the dashboard UI.', ''].join('\n'),
  )
  process.exit(0)
}

let viteBin
try {
  const pkgJsonPath = require.resolve('vite/package.json')
  const bin = require(pkgJsonPath).bin
  const entry = typeof bin === 'string' ? bin : bin?.vite
  if (!entry) throw new Error('vite does not expose a binary')
  viteBin = join(dirname(pkgJsonPath), entry)
} catch (err) {
  console.error(`[mobile] cannot resolve vite: ${err.message}`)
  process.exit(1)
}

const dev = spawnSync(process.execPath, [viteBin, '--port', '5174'], { cwd: appDir, stdio: 'inherit' })
process.exit(dev.status ?? 1)
