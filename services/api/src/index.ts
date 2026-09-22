import './env.js'
import path from 'node:path'
import { existsSync } from 'node:fs'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { connectDb } from './db.js'
import { authRoutes } from './routes/auth.js'
import { inventoryRoutes } from './routes/inventory.js'
import { salesRoutes } from './routes/sales.js'
import { purchasingRoutes } from './routes/purchasing.js'
import { opsRoutes } from './routes/ops.js'

async function main() {
  const app = Fastify({ logger: true })

  await app.register(cookie)
  await app.register(cors, { origin: process.env.APP_URL?.split(',') || true, credentials: true })
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  app.get('/health', async () => ({ ok: true, time: new Date().toISOString() }))

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as any).statusCode || 500
    if ((err as any).name === 'ZodError') {
      return reply.code(400).send({ error: 'validation', issues: (err as any).issues })
    }
    app.log.error(err)
    return reply.code(status).send({ error: status === 500 ? 'internal' : (err as any).message || 'error' })
  })

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(inventoryRoutes, { prefix: '/api' })
  await app.register(salesRoutes, { prefix: '/api' })
  await app.register(purchasingRoutes, { prefix: '/api' })
  await app.register(opsRoutes, { prefix: '/api' })

  // Same-origin web hosting for single-service deploys (Render/Railway/Fly).
  // Off by default: local `pnpm dev` uses the Vite dev server + proxy instead.
  // __dirname is services/api/{src,dist}, so ../../../ is the repo root either way.
  const webDist = path.join(__dirname, '..', '..', '..', 'apps', 'web', 'dist')
  if (process.env.SERVE_WEB === '1' && existsSync(path.join(webDist, 'index.html'))) {
    // Defaults: wildcard serves files with a miss falling through to the
    // not-found handler below; index serves / from index.html.
    await app.register(fastifyStatic, { root: webDist })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not_found' })
      // SPA fallback: any other GET is a client-side route → the shell.
      // Non-GET unknowns are genuine 404s.
      if (req.method === 'GET') return reply.sendFile('index.html')
      return reply.code(404).send({ error: 'not_found' })
    })
    console.log(`[api] serving web UI from ${webDist}`)
  }

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
