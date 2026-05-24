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

Tests use **`.env.test`** (default):

```env
DATABASE_URL=postgresql://swaphaven:swaphaven@localhost:5433/swaphaven_test
```

### Setup

```bash
# If using docker-compose Postgres on 5433:
docker compose up postgres -d

# Global setup creates swaphaven_test and applies drizzle/*.sql
npm test
```

`tests/helpers/global-setup.ts` resets the `public` schema and runs all migrations before the suite.

---

## Test layout

| Path | Purpose |
|------|---------|
| `tests/auth.test.ts` | Register, login, refresh, password flows |
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
