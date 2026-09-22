// Phase 7 desktop dev — mirrors scripts/build.mjs: `pnpm dev` must stay green on
// machines without the Rust toolchain. If cargo/rustc are absent, explain and
// exit 0 so the parallel dev run (web + api) is unaffected. Otherwise exec the
// real `tauri dev` (which itself boots the web frontend).
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(appDir, 'package.json'))

function has(tool) {
  const probe = spawnSync(tool, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' })
  return !probe.error && probe.status === 0
}

if (!has('cargo') || !has('rustc')) {
  console.warn(
    ['', '[desktop] skipping `tauri dev`: Rust toolchain not found.', '[desktop] web + api dev servers are unaffected — run this filter on a Rust machine for the desktop shell.', ''].join('\n'),
  )
  process.exit(0)
}

let tauriCli
try {
  const pkgJsonPath = require.resolve('@tauri-apps/cli/package.json')
  const bin = require(pkgJsonPath).bin
  const entry = typeof bin === 'string' ? bin : bin?.tauri
  if (!entry) throw new Error('@tauri-apps/cli does not expose a "tauri" binary')
  tauriCli = join(dirname(pkgJsonPath), entry)
} catch (err) {
  console.error(`[desktop] cannot resolve the Tauri CLI: ${err.message}`)
  process.exit(1)
}

const dev = spawnSync(process.execPath, [tauriCli, 'dev'], { cwd: appDir, stdio: 'inherit' })
process.exit(dev.status ?? 1)
