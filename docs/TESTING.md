# Testing

## Quick commands

```bash
npm run typecheck    # TypeScript only
npm test             # Full Vitest suite (needs Postgres)
npm run test:watch   # Watch mode
npm run test:coverage
```

Pre-push (same as CI):

```bash
./deploy/scripts/release.sh
# or: npm run typecheck && npm test && npm run build
```

---

## Test database

Tests use **`.env.test`** (gitignored). Copy the committed template first:

```bash
cp .env.test.example .env.test
```

Required variables (see `.env.test.example`):

```env
DATABASE_URL=postgresql://swaphaven:swaphaven@localhost:5433/swaphaven_test
JWT_ACCESS_SECRET=dev-test-access-secret-min-32-chars-long
JWT_REFRESH_SECRET=dev-test-refresh-secret-min-32-chars-long
NODE_ENV=test
AUTH_RATE_LIMIT_MAX=10000
API_RATE_LIMIT_MAX=100000
```

### Setup

```bash
cp .env.test.example .env.test

# If using docker-compose Postgres on 5433:
docker compose up postgres -d

# Global setup creates swaphaven_test and applies drizzle/*.sql
npm test
```

`tests/helpers/global-setup.ts` resets the `public` schema and runs all migrations before the suite.

`DATABASE_URL` drives both the test DB and admin connection (same host/port as CI on `5432`, local Docker on `5433` per `.env.test`).

---

## Test layout

| Path | Purpose |
|------|---------|
| `tests/auth.test.ts` | Register, login, social login, refresh, password flows |
| `tests/social-auth.test.ts` | Unit tests for `src/lib/social-auth.ts` (Google + Facebook verification) |
| `tests/listings.test.ts` | Listings CRUD, barter-shaped create body |
| `tests/offers.test.ts` | Offer lifecycle |
| `tests/trades.test.ts` | Trade completion, reviews |
| `tests/conversations.test.ts` | Chat messages |
| `tests/notifications.test.ts` | Notification side effects |
| `tests/swipe.test.ts` | Swipe deck |
| `tests/users.test.ts` | Profiles |

Helpers: `tests/helpers/fixtures.ts` (`registerUser`, `createListing`, `fullTradeSetup`).

---

## Manual smoke test (curl)

```bash
# health
curl -s http://localhost:3001/api/healthz | jq

# register
curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"password123","name":"Dev User"}' | jq

# use accessToken from response:
export TOKEN="<accessToken>"
curl -s http://localhost:3001/api/auth/me -H "Authorization: Bearer $TOKEN" | jq
```

See [API_GUIDE.md](./API_GUIDE.md) for all endpoints.

---

## CI (GitHub Actions)

On every PR:

- `npm ci`
- `npm run typecheck`
- `npm run build`
- `npm test` (Postgres service)
- Smoke `GET /api/healthz` on built server

See `.github/workflows/ci.yml`.
