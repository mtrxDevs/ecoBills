import path from 'node:path'
import dotenv from 'dotenv'

// `pnpm --filter` runs each package with its own directory as cwd, so a
// repo-root `.env` is invisible to plain dotenv. Load it explicitly by path.
// Shell environment variables still win (override: false is the default).
const repoRoot = path.join(__dirname, '..', '..', '..')
dotenv.config({ path: path.join(repoRoot, '.env') })
