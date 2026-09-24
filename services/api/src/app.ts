import path from 'node:path'
import { existsSync } from 'node:fs'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { authRoutes } from './routes/auth.js'
import { customerRoutes } from './routes/customers.js'
import { inventoryRoutes } from './routes/inventory.js'
import { salesRoutes } from './routes/sales.js'
import { purchasingRoutes } from './routes/purchasing.js'
import { opsRoutes } from './routes/ops.js'

/**
 * Build the Fastify app without binding a port or connecting the database.
 * Production boot (`index.ts`) and integration tests share this factory; tests
 * drive it with `app.inject()` and manage `connectDb()` themselves.
 */
export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false })

  await app.register(cookie)
  const allowedOrigins = [
    ...(process.env.APP_URL?.split(',').map((s) => s.trim()).filter(Boolean) || []),
    // The Tauri desktop shell loads the UI from its own scheme, not https —
    // allow it explicitly so the packaged app can reach this API with cookies.
    // (Cookies stay partitioned per app; no website can ride this allowance.)
    'tauri://localhost',
    'https://tauri.localhost',
  ]
  await app.register(cors, { origin: allowedOrigins.length > 2 ? allowedOrigins : true, credentials: true })
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  app.get('/health', async () => ({ ok: true, time: new Date().toISOString() }))

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as any).statusCode || 500
    if ((err as any).name === 'ZodError') {
      return reply.code(400).send({ error: 'validation', issues: (err as any).issues })
    }
    app.log.error(err)
    const errCode = status === 500 ? 'internal' : (err as any).error || (err as any).message || 'error'
    const msg = status === 500 ? 'An internal error occurred' : (err as any).messageText || (err as any).message || errCode
    return reply.code(status).send({ error: errCode, message: msg })
  })


  await app.register(authRoutes, { prefix: '/api' })
  await app.register(customerRoutes, { prefix: '/api' })
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

  return app
}
