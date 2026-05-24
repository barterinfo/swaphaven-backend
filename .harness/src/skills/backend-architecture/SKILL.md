---
name: backend-architecture
description: Express 5 + PostgreSQL + Drizzle conventions for swaphaven-api — routes, schema, tests, OpenAPI.
---

# Backend architecture (SwapHaven API)

## Before you implement

1. Read `src/routes/` handlers and `src/app.ts` mount order (health routes before rate limiters).
2. Read `src/db/schema/` and `drizzle/*.sql` if persistence changes.
3. Check `src/lib/barter-listing.ts` for mobile-compatible listing shapes.
4. Read matching tests in `tests/*.test.ts` and helpers in `tests/helpers/fixtures.ts`.
5. Update `src/openapi/spec.ts` when adding or changing public HTTP contracts.

## Layering

| Area | Path | Responsibility |
|------|------|----------------|
| HTTP | `src/routes/` | Routes, Zod validation, status codes, JSON |
| Schema | `src/db/schema/` | Drizzle table definitions |
| DB | `src/db/client.ts`, `src/db/migrate.ts` | Pool, migrations |
| Cross-cutting | `src/middleware/` | Auth, errors |
| Domain helpers | `src/lib/` | Barter listing mapping, pagination, WS |

Keep handlers thin: validate → query/mutate via Drizzle → map response.

## Migrations

- Commit SQL under `drizzle/` and `drizzle/meta/_journal.json` (not gitignored).
- Local dev: `npm run db:push` or `npm run db:migrate`; production: `migrate:prod` on Railway start.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

With server running: `GET /api/healthz`, `GET /api/readyz`, and exercise changed routes (see `docs/API_GUIDE.md`).
