import './env.js'
import { connectDb } from './db.js'
import { buildApp } from './app.js'

async function main() {
  const app = await buildApp({ logger: true })

  // Render/Railway/Fly inject PORT; local dev uses API_PORT (default 3001).
  const port = Number(process.env.PORT || process.env.API_PORT || 3001)
  connectDb().catch(() => {})
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`[api] listening on :${port}`)
}

main().catch((e) => {
  console.error('[api] fatal', e)
  process.exit(1)
})
