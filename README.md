# SwapHaven API

Peer-to-peer item trading API — **Express 5 · PostgreSQL · Drizzle · TypeScript**.

Powers the **barter-stack** Flutter app. Deployed on **[Railway](https://railway.app)**.

## Quick start

```bash
npm install
cp .env.example .env   # set DATABASE_URL + JWT secrets
createdb swaphaven
npm run db:push
npm run dev
```

- API: http://localhost:3001  
- Swagger: http://localhost:3001/api-docs  
- Health: http://localhost:3001/api/healthz  

## Documentation

| Guide | Topic |
|-------|--------|
| [docs/README.md](docs/README.md) | Index |
| [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | Local setup, Docker, Flutter `API_BASE` |
| [docs/TESTING.md](docs/TESTING.md) | Vitest, CI |
| [docs/API_GUIDE.md](docs/API_GUIDE.md) | Every endpoint + curl examples |
| [docs/SWAGGER.md](docs/SWAGGER.md) | OpenAPI / Swagger UI |
| [docs/ADS.md](docs/ADS.md) | Sponsored ads — schema, endpoint, mobile flow, `npm run ads` CLI |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Railway deploy |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | PRs, harness, agent review |

## Scripts

```bash
npm run dev              # Dev server
npm run typecheck        # TypeScript
npm test                 # Vitest (needs Postgres)
npm run build && npm start
./deploy/scripts/release.sh   # Pre-push CI check
npm run harness:apply    # Sync Cursor rules from .harness/
```

## Auth

```http
Authorization: Bearer <accessToken>
```

Refresh via `POST /api/auth/refresh`. See [docs/API_GUIDE.md](docs/API_GUIDE.md).
