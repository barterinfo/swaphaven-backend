# Local development

## Prerequisites

- **Node.js 22+**
- **PostgreSQL 16** (local install or Docker)
- **npm**

Optional: Docker Compose (API + Postgres together).

---

## 1. Clone and install

```bash
git clone https://github.com/barterinfo/swaphaven-backend.git
cd swaphaven-backend
npm install
```

---

## 2. Database

### Option A — local Postgres

```bash
createdb swaphaven
```

### Option B — Docker Postgres only

```bash
docker compose up postgres -d
# uses port 5433 on host → see docker-compose.yml
```

---

## 3. Environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://swaphaven:swaphaven@localhost:5432/swaphaven` |
| `JWT_ACCESS_SECRET` | 64+ char random hex |
| `JWT_REFRESH_SECRET` | 64+ char random hex |
| `PORT` | `3001` |
| `NODE_ENV` | `development` |
| `CORS_ORIGINS` | `*` or `http://localhost:3000` |
| `ENABLE_API_DOCS` | `true` |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 4. Schema

**Development (fast iteration):**

```bash
npm run db:push
```

**Production-like (SQL migrations):**

```bash
npm run db:migrate
# or: npm run build && npm run migrate:prod
```

Browse data:

```bash
npm run db:studio
```

---

## 5. Run the API

```bash
npm run dev
```

| URL | Purpose |
|-----|---------|
| http://localhost:3001/api/healthz | Liveness |
| http://localhost:3001/api/readyz | DB check |
| http://localhost:3001/api-docs | Swagger UI |
| http://localhost:3001/api/openapi.json | OpenAPI JSON |

---

## 6. Docker stack (API + Postgres)

```bash
docker compose up --build
```

Uses `.env` JWT values or compose defaults. Migrations run on container start.

---

## 7. Connect Flutter (barter-stack mobile)

In `barter-stack/mobile/lib/config/env/dev.env`:

```env
API_BASE=http://127.0.0.1:3001
```

- iOS simulator: `http://127.0.0.1:3001`  
- Android emulator: `http://10.0.2.2:3001`  
- Physical device: your machine LAN IP  

---

## 8. Common issues

| Problem | Fix |
|---------|-----|
| `DATABASE_URL is required` | Create `.env` from `.env.example` |
| `Invalid environment variables` | JWT secrets ≥ 32 characters |
| Port in use | Change `PORT` in `.env` |
| Tests fail | Copy `.env.test.example` → `.env.test`; start Postgres on port **5433** or run `docker compose up postgres` |
