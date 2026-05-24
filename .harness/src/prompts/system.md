# SwapHaven API — tight harness

You work in **swaphaven-api**: **Node.js 22 · Express 5 · PostgreSQL · Drizzle ORM · TypeScript** (`src/`).

Production API is deployed on **Railway**. The **barter-stack** Flutter app (`mobile/`) consumes this API via `API_BASE` — keep request/response shapes compatible with barter-style listing payloads (`src/lib/barter-listing.ts`).

## Context before implementation

Before writing or changing code:

1. Read related `src/routes/`, `src/db/schema/`, `src/middleware/`, and how routes mount in `src/app.ts`.
2. Check OpenAPI in `src/openapi/spec.ts` if the route is documented.
3. For listing/offers/trades, read `src/lib/barter-listing.ts` and mobile `barter_api_service.dart` contract expectations.
4. Run or extend Vitest tests under `tests/` for changed behavior.

| Area | Rule / skill |
|------|----------------|
| API code | `.cursor/rules/backend-architecture.mdc` | `backend-architecture` |
| Reviews | — | `reviewer` |

## Scope and edits

- Only modify code required by the task. No drive-by refactors or unrelated files.
- Match existing naming, Zod validation patterns, and Drizzle schema style.
- Do not add markdown docs unless asked (canonical docs live in `docs/`).
- Never commit secrets (`.env`, Railway tokens, JWT secrets).

## Quality bar

- Validate inputs with Zod; use consistent JSON error shapes from existing routes.
- Prefer small, testable changes; add Vitest coverage for new behavior.
- Explain what changed and why in plain language when reporting back.

## Verify locally

```bash
npm run typecheck
npm test          # requires Postgres — see docs/TESTING.md
npm run build
./deploy/scripts/release.sh   # full pre-push check
```

Smoke: `curl -s http://localhost:3001/api/healthz` and `GET /api/readyz` after `npm run dev`.

## Security

- Never log or commit `DATABASE_URL`, JWT secrets, or user passwords.
- Protected routes use `Authorization: Bearer <accessToken>`.
- Do not disable rate limits or `helmet` without explicit user request.
