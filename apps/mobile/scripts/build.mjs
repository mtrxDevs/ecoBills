// Phase 8 mobile build — dashboard-only web bundle + Capacitor native sync.
//
// Two inputs can legitimately be absent on a build box, and neither should take the
// whole `pnpm -r build` down:
//   - the shell's Vite entry (`index.html`) — added when the mobile shell is fleshed out
//   - the native platform folder (`android/`, created by `cap add android`)
// Both are reported loudly and skipped here. Once an entry exists a failing `vite build`
// is a real failure, and once a platform exists a failing `cap sync` is a real failure.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(appDir, 'package.json'))
const OUT_DIR = 'dist-dashboard'
const PLATFORMS = ['android', 'ios']

function resolveBin(pkg, binName) {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`)
  const bin = require(pkgJsonPath).bin
  const entry = typeof bin === 'string' ? bin : bin?.[binName]
  if (!entry) throw new Error(`${pkg} does not expose a "${binName}" binary`)
  return join(dirname(pkgJsonPath), entry)
}

function run(label, pkg, binName, args, env) {
  let bin
  try {
    bin = resolveBin(pkg, binName)
  } catch (err) {
    console.error(`[mobile] cannot resolve ${pkg}: ${err.message}`)
    console.error('[mobile] run `pnpm install` in the repo root and retry.')
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: appDir,
    stdio: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  })
  if (result.status !== 0) {
    console.error(`[mobile] ${label} failed (exit ${result.status ?? 'signal ' + result.signal}).`)
    process.exit(result.status ?? 1)
  }
}

// 1. dashboard-only web bundle — invoice-creation routes are stripped at build time.
const hasEntry = existsSync(join(appDir, 'index.html'))
if (hasEntry) {
  run(`vite build --outDir ${OUT_DIR}`, 'vite', 'vite', ['build', '--outDir', OUT_DIR], {
    VITE_DASHBOARD_ONLY: 'true',
  })
} else {
  console.warn(
    [
      '',
      `[mobile] skipping the web bundle: no Vite entry (apps/mobile/index.html) yet.`,
      '[mobile] the dashboard-only bundle is currently produced by `pnpm --filter @ecobills/web build:dashboard`.',
      '',
    ].join('\n')
  )
}

// 2. copy web assets + plugins into the native project (no-op until a platform is added).
const platforms = PLATFORMS.filter((p) => existsSync(join(appDir, p)))
if (platforms.length === 0) {
  console.warn(
    [
      '',
      `[mobile] skipping \`cap sync\`: no native platform initialised in apps/mobile (${PLATFORMS.join(
        ', '
      )}).`,
      '[mobile] run `pnpm --filter @ecobills/mobile exec cap add android` on a machine with the Android SDK.',
      '',
    ].join('\n')
  )
} else if (!hasEntry || !existsSync(join(appDir, OUT_DIR))) {
  console.warn(
    `[mobile] skipping \`cap sync\`: no web assets in apps/mobile/${OUT_DIR} to copy into ${platforms.join(', ')}.`
  )
} else {
  run(`cap sync ${platforms.join(' ')}`, '@capacitor/cli', 'cap', ['sync', ...platforms])
}
