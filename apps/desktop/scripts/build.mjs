// Phase 7 desktop build — thin wrapper around `tauri build` so that `pnpm -r build`
// stays green on machines without the Rust toolchain (web-only boxes, image builders),
// while still packaging for real everywhere cargo/rustc exist.
//
//   - cargo/rustc missing  -> explain how to provision Rust, skip, exit 0
//   - anything else wrong  -> real failure, non-zero exit (missing CLI, bad
//                             tauri.conf.json, Rust compile errors, bundler errors)
//
// Set ECOBILLS_REQUIRE_DESKTOP=1 (release machines / packaging CI) to turn the
// "toolchain missing" case into a hard failure instead of a skip.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(appDir, 'package.json'))
const RUST_TOOLS = ['cargo', 'rustc']

function has(tool) {
  // shell on Windows so the lookup goes through PATH/PATHEXT exactly like a terminal.
  const probe = spawnSync(tool, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' })
  return !probe.error && probe.status === 0
}

function resolveBin(pkg, binName) {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`)
  const bin = require(pkgJsonPath).bin
  const entry = typeof bin === 'string' ? bin : bin?.[binName]
  if (!entry) throw new Error(`${pkg} does not expose a "${binName}" binary`)
  return join(dirname(pkgJsonPath), entry)
}

const missingTools = RUST_TOOLS.filter((tool) => !has(tool))

if (missingTools.length > 0) {
  const strict = process.env.ECOBILLS_REQUIRE_DESKTOP === '1'
  const lines = [
    '',
    `[desktop] skipping \`tauri build\`: Rust toolchain not found (${missingTools.join(', ')}).`,
    '[desktop] web/api/mobile builds are unaffected — only the Windows package is skipped.',
    '[desktop] to package the desktop app: install Rust (https://rustup.rs) plus the "Desktop',
    '[desktop] development with C++" build tools, then run `pnpm --filter @ecobills/desktop build`.',
  ]
  if (strict) lines.push('[desktop] ECOBILLS_REQUIRE_DESKTOP=1 set — treating this as a hard failure.')
  lines.push('')
  ;(strict ? console.error : console.warn)(lines.join('\n'))
  process.exit(strict ? 1 : 0)
}

const confPath = join(appDir, 'src-tauri', 'tauri.conf.json')
if (!existsSync(confPath)) {
  console.error(`[desktop] missing ${confPath} — cannot run \`tauri build\`.`)
  process.exit(1)
}

let tauriCli
try {
  tauriCli = resolveBin('@tauri-apps/cli', 'tauri')
} catch (err) {
  console.error(`[desktop] cannot resolve the Tauri CLI: ${err.message}`)
  console.error('[desktop] run `pnpm install` in the repo root and retry.')
  process.exit(1)
}

console.log(`[desktop] Rust toolchain found — running \`tauri build\` (${confPath}).`)

// The packaged UI is baked at build time: a release bundle must point at the
// LIVE api, not localhost. Accept either variable name, then forward it as
// VITE_API_URL so `beforeBuildCommand` picks it up through env inheritance.
const apiUrl = (process.env.ECOBILLS_API_URL || process.env.VITE_API_URL || '').trim()
const requireRelease = process.env.ECOBILLS_REQUIRE_DESKTOP === '1'
if (!apiUrl || !/^https:\/\//.test(apiUrl)) {
  if (requireRelease) {
    console.error('')
    console.error('[desktop] refusing to package: no production API URL provided.')
    console.error('[desktop] the desktop UI is compiled with its API origin baked in.')
    console.error('[desktop] set it first, e.g.:')
    console.error('[desktop]   $env:ECOBILLS_API_URL="https://<your-app>.onrender.com"')
    console.error('[desktop]   pnpm --filter @ecobills/desktop build')
    console.error('')
    process.exit(1)
  }
  console.warn('')
  console.warn('[desktop] WARNING: no ECOBILLS_API_URL set — the bundle will talk to')
  console.warn('[desktop] localhost (dev/test only). Set ECOBILLS_API_URL for a real release,')
  console.warn('[desktop] or ECOBILLS_REQUIRE_DESKTOP=1 to turn this warning into a failure.')
  console.warn('')
} else {
  console.log(`[desktop] web UI will target ${apiUrl}`)
}

const build = spawnSync(process.execPath, [tauriCli, 'build'], {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DESKTOP_BUILD: 'true',
    ...(apiUrl && /^https:\/\//.test(apiUrl) ? { VITE_API_URL: apiUrl } : {}),
  },
})
process.exit(build.status ?? 1)
