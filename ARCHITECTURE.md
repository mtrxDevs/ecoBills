# ARCHITECTURE.md — ecoBills system map (Milestone 0)

How the pieces fit. For *why* choices were made, see `DECISIONS.md`.

## Layout

```
apps/web        React + Vite + TS. The product. 6 destinations (+Customers… as milestones land).
apps/desktop    Tauri v2 shell around apps/web/dist. Degrades without Rust.
apps/mobile     Capacitor shell (dashboard-only build today). Degrades without entry/platform.
services/api    Fastify + TS. All money logic lives here, never in the client.
packages/types  Zod schemas shared by API + web. One definition, no drift.
packages/ui     shadcn-style components + motion tokens. No durations outside motion-tokens.ts.
packages/config Tailwind preset + CSS tokens (single source for theme).
prisma/         Schema + migrations. PostgreSQL only.
```

## Request lifecycle

```
Browser → Vite proxy (/api/*, dev) or same-origin (SERVE_WEB=1, prod)
  → Fastify (cookie → requireAuth → requirePerm(action) → Zod parse → Prisma txn)
  → Postgres (Supabase session pooler :5432 in prod)
```

- **Routes are `/api`-prefixed plugins** (`services/api/src/index.ts` → `app.ts` factory).
- **AuthN:** scrypt password → 30-day session row → httpOnly cookie (`lax` local, `None+Secure` cross-origin via `SESSION_COOKIE_SAMESITE`). 2FA/email-verify challenges are hashed, single-use, 10-min, 5-attempt.
- **AuthZ:** `requirePerm(action)` on every sensitive route; the §6.1 Owner/Staff matrix lives in `auth.ts`. The client hiding a button is UX, not security.
- **Validation:** Zod in `packages/types`, parsed server-side; the API returns `{ error: <code> }`, the web maps codes via `ApiError`.
- **Errors:** 4xx carry stable machine codes; 500s never leak internals.

## Data invariants (never violate — see spec §2)

| Rule | Mechanism |
|---|---|
| Money = integer paise | `Int` columns; `money()` formats at render only (`packages/ui`, `apps/web/src/lib/api.ts`) |
| Tax = integer basis points | `taxRateBps` / `*_snapshot_bps`; `1800` = 18% |
| Qty = Decimal(12,3) | kg/L support; integer math in `money.ts` with milli-scaling |
| Stock is derived | Append-only `StockLedger`; current stock = `SUM(deltaQty)`. No mutable stock field exists. |
| Paid is derived | `SUM(Payment.amount)` per invoice; void allowed only at 0. Corrections use credit notes, never edits. |
| History is snapshotted | Invoice/credit lines carry `unit_price/cost_snapshot` + tax bps; price changes never rewrite the past. |
| Numbering is atomic | `InvoiceCounter(business, FY)` + `INSERT..ON CONFLICT DO NOTHING` + `UPDATE..RETURNING` in one txn. (An earlier upsert-based version raced under concurrency — caught by the integration suite.) |
| Tenancy | Every tenant table carries `business_id`; every query filters on it. RLS is deny-by-default defense-in-depth; enforcement is the API. |
| Audit | Price changes, stock adjustments, voids, credit notes, sends, 2FA lockouts → `AuditLog` with before/after. |

## Money flows

- **Sale:** invoice txn writes lines (snapshots) + `sale` ledger rows + counter increment, atomically. Payments flip `unpaid → partial → paid`.
- **Return:** credit note (new entity, never an edit) writes `return` ledger rows + reduces reported revenue/COGS in P&L.
- **Purchase:** draft PO (idempotency key at creation) → human preview → explicit send (replay returns state, never resends) → partial/decimal receive writes `purchase_receipt` rows + updates going-forward cost.
- **P&L:** accrual by issue date, net of credit notes; stock valued at last cost.

## Email

`sendEmail()` in `services/api/src/email.ts` (Resend, `Idempotency-Key` where it matters). Unconfigured or `RESEND_STUB=1` → logged stub, never throws. Sender is `RESEND_FROM` (must be a verified domain for real delivery). 2FA/verify mails are branded HTML + text fallback.

## Environments

| Var | Dev | Prod (Render) |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Supabase session pooler `:5432` | same, from service env |
| `SERVE_WEB` | `0` (Vite serves UI) | `1` (API serves `apps/web/dist`) |
| `SESSION_COOKIE_SAMESITE` | `lax` | `none` (cross-origin desktop/split) |
| `VITE_API_URL` | empty (same-origin) | API origin, baked at web build time |
| `RESEND_*` | stub unless key set | real key + verified sender |

Root `.env` is loaded explicitly by API (`src/env.ts`) and Prisma scripts (`with-env.mjs`) because `pnpm --filter` runs each package with its own cwd.

## Quality gates (Milestone 0)

`pnpm typecheck` (tsc strict) · `pnpm lint` (eslint flat, repo-wide) · `pnpm test` (vitest: unit + live-Postgres integration, skipped without a DB) · `pnpm build` (generate first, then recursive; desktop/mobile degrade loudly without toolchains). CI runs all four on push.
