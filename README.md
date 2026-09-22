# ecoBills v0.1.1 — mtrxWorks

One tool for stock, billing, P&L, and automated supplier ordering for local/small businesses.

## Quickstart (Phase 0 DoD)

```bash
cp .env.example .env
docker compose up -d db        # local Postgres
pnpm install
pnpm --filter @ecobills/prisma migrate:dev
pnpm --filter @ecobills/api seed   # optional demo data
pnpm dev                        # web :5173 + api :3001
```

Without Docker the API still boots; DB routes return 503 until `DATABASE_URL` connects.

## Quality gates (Milestone 0)

```bash
pnpm typecheck   # tsc strict, every package
pnpm lint        # eslint flat config, repo-wide — no echo-ok stubs
pnpm test        # vitest: unit tests always; API integration tests need a live
                 # DATABASE_URL (they skip without one) and force RESEND_STUB
pnpm build       # regenerates the Prisma Client, then builds everything
```

CI (`.github/workflows/ci.yml`) runs all four on every push. Integration tests
create `M0 Test`-prefixed businesses and delete them in `afterAll`; never point
them at production. See `ARCHITECTURE.md` for the system map.

## Using Supabase as the database

Supabase replaces the local Docker Postgres — no schema or code changes needed.

1. Create a project at [supabase.com](https://supabase.com) (free tier: 500 MB, fine for v0.1).
2. Dashboard → **Connect** → connection string, **Session pooler** method (pooler host, port `5432`). Copy it.
3. Paste it as `DATABASE_URL` in `.env` (keep `?schema=public`).
4. `pnpm db:migrate` (creates all tables) → `pnpm db:seed` (demo shop) → `pnpm dev`.
5. You can stop the local DB: `docker compose down`. Switch back anytime by restoring the local URL.

Rules: never use the transaction pooler (`:6543` + `?pgbouncer=true`) — it breaks the interactive transactions behind gapless invoice numbering. Free-tier projects get **no automatic backups** and pause after a week idle, so keep our `pg_dump` backup job (`pnpm --filter @ecobills/api backup`) on a schedule; before real customer data, consider Pro for daily backups.

## Deploy (single service)

The API serves the built web UI itself when `SERVE_WEB=1`, so one long-running
service (Render / Railway / Fly — not Vercel serverless, which can't run the
Puppeteer PDF step) hosts everything:

- Build command: `corepack enable && NODE_ENV=development pnpm install --frozen-lockfile && pnpm build`
  (`NODE_ENV=development` matters: Render defaults builds to production, and
  pnpm skips devDependencies then — but tsc, the Prisma CLI, and Vite *are*
  devDependencies. Runtime still uses the service's own `NODE_ENV=production`.
  Root `pnpm build` regenerates the Prisma Client first, so the API always
  compiles against fresh types.)
- Start command: `pnpm --filter @ecobills/api start`
- Env: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `SERVE_WEB=1`,
  `NODE_ENV=production`, `APP_URL=https://<your-service>`, `RESEND_*`.
  Use `SESSION_COOKIE_SAMESITE=none` only if a frontend on another origin
  (Tauri app, split hosting) must log in — same-origin needs nothing.
- PDF export falls back to printable HTML wherever Chromium is absent; for real
  PDFs, deploy where headless Chromium runs (or add it to the image).

## Troubleshooting

- **`P1012: Environment variable not found: DATABASE_URL`** — you skipped the `.env` step. Run `Copy-Item .env.example .env` at the repo root and fill in `DATABASE_URL`. All commands (`db:migrate`, `db:seed`, `pnpm dev`) read the root `.env` automatically.
- **`P1001: Can't reach database server at localhost:5432`** — no Postgres is running. Either `docker compose up -d db` (needs Docker Desktop), install Postgres locally, or point `DATABASE_URL` at a hosted DB (Neon/Supabase/Railway), then re-run `pnpm db:migrate`.

## Layout

```
apps/web        React + Vite + TS (the product)
apps/desktop    Tauri shell
apps/mobile     Capacitor shell (dashboard-only build)
services/api    Fastify + TS
packages/ui     shared shadcn-style components
packages/types  shared Zod schemas
packages/config shared tsconfig/tailwind
prisma/         Prisma schema + migrations
```

## Non-negotiables (see spec §1)
- Money = integer paise; tax = integer basis points. Qty = Decimal (kg/L support).
- Stock & amount_paid are derived (ledger / payments sum), never mutable fields.
- Invoice/credit lines snapshot price/cost/tax.
- No auto-send email; idempotent PO send; server-side RBAC; audit log; daily backups before GA.
