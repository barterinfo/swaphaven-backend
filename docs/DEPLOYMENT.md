# SwapHaven API — deployment (Railway)

We deploy **only `swaphaven-api`** (not `barter-stack/backend`). Primary host: **[Railway](https://railway.app)** with Railway PostgreSQL.

Local dev uses `npm run dev` or `docker compose up` (optional).

---

## Architecture

```text
Flutter app  ──HTTPS──►  Railway API service  ──►  Railway PostgreSQL
                              │
                         /api/healthz
                         /api/readyz
```

Listing images: S3 presigned uploads — see **[S3_SETUP.md](./S3_SETUP.md)**.

---

## 1. Railway project setup

### A. API service from GitHub

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
2. Select the repo. If the API is in a subfolder, set **Root Directory** to `swaphaven-api`.
3. Railway detects `**railway.toml`**:
  - Build: `npm ci && npm run build`
  - Start: migrations + `node dist/index.js`
  - Health: `/api/readyz`

### B. PostgreSQL database

1. In the **same project**, **+ New** → **Database** → **PostgreSQL**.
2. Wait until Postgres is **Active**.

### C. Connect `DATABASE_URL`

1. Open the **API service** → **Variables**.
2. **+ New Variable** → **Add Reference** → PostgreSQL service → `**DATABASE_URL`**.
3. You should see: `DATABASE_URL = ${{Postgres.DATABASE_URL}}` (service name may vary).

**Alternative:** Connect Postgres → API on the project canvas (auto-injects reference).

### D. Required variables (API service)


| Variable             | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| `NODE_ENV`           | `production`                                          |
| `JWT_ACCESS_SECRET`  | ≥ 32 chars (64 hex recommended)                       |
| `JWT_REFRESH_SECRET` | ≥ 32 chars                                            |
| `CORS_ORIGINS`       | `*` for staging; comma-separated app origins for prod |
| `ENABLE_API_DOCS`    | `true` (team testing) or `false` (locked down)        |
| `TRUST_PROXY`        | Optional — auto **`true`** in production (`railway.toml` sets it) |


Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Railway variable format (important):**

| Do | Don't |
|----|--------|
| `production` | `"production"` |
| `true` | `"true"` |
| `*` | `"*"` |
| **Add Reference** → Postgres → `DATABASE_URL` | Paste `${{Postgres.DATABASE_URL}}` as plain text |

Values in the Railway UI are **not** `.env` files — omit surrounding quotes.

Do **not** set `PORT` — Railway injects it automatically.

**Important:** Migrations only need `DATABASE_URL`. The API **will not start** without both JWT secrets. If logs show migrate success but health checks fail, open **Deploy Logs** and look for `Invalid environment variables` or missing `JWT_*` — then redeploy.

### E. Deploy & public URL

1. **Redeploy** after saving variables.
2. API service → **Settings** → **Networking** → **Generate Domain**.
3. Verify:

```bash
curl https://YOUR-DOMAIN.up.railway.app/api/healthz
curl https://YOUR-DOMAIN.up.railway.app/api/readyz
```

`/api/readyz` should show `"database":"up"`.

---

## 2. Mobile / remote team

Share the Railway URL with QA and developers.

```env
# Flutter (staging / team builds)
API_BASE=https://YOUR-DOMAIN.up.railway.app
```

WebSocket chat:

```text
wss://YOUR-DOMAIN.up.railway.app/ws/<conversationId>?token=<accessToken>
```

Use a **separate Railway project** or database for production vs staging when you go live.

---

## 3. Local development

```bash
npm install
cp .env.example .env
createdb swaphaven   # or use Docker Postgres below
npm run db:push      # dev schema sync
npm run dev
```

**Docker (API + Postgres on your machine):**

```bash
docker compose up --build
# http://localhost:3001/api/readyz
```

---

## 4. Migrations

On Railway, `**railway.toml**` runs `node dist/db/migrate.js` before each start.

Manual run (Railway CLI or one-off shell):

```bash
npm run build && npm run migrate:prod
```

SQL files live in `drizzle/*.sql` and `**drizzle/meta/_journal.json**` must be in git (do not gitignore `drizzle/meta/`).

---

## 5. Environment reference


| Variable             | Required       | Notes                           |
| -------------------- | -------------- | ------------------------------- |
| `DATABASE_URL`       | Yes            | Reference from Postgres service |
| `JWT_ACCESS_SECRET`  | Yes            |                                 |
| `JWT_REFRESH_SECRET` | Yes            |                                 |
| `NODE_ENV`           | Yes            | `production` on Railway         |
| `CORS_ORIGINS`       | Yes            |                                 |
| `TRUST_PROXY`        | Yes on Railway | `true`                          |
| `ENABLE_API_DOCS`    | No             | Default off in production       |
| `PUBLIC_API_URL`     | No             | e.g. your Railway domain        |
| `GOOGLE_CLIENT_ID`   | For web Google sign-in | Web OAuth client ID; primary audience when mobile uses `GIDServerClientID` |
| `GOOGLE_IOS_CLIENT_ID` | For native iOS without `GIDServerClientID` | iOS OAuth client ID — set when iOS tokens use the platform client as `aud` |
| `GOOGLE_ANDROID_CLIENT_ID` | For native Android without server client ID | Android OAuth client ID — set when Android tokens use the platform client as `aud` |
| `FACEBOOK_APP_ID`    | For Facebook   | Both required for `provider=facebook` (app token binding) |
| `FACEBOOK_APP_SECRET`| For Facebook   | Pair with `FACEBOOK_APP_ID`     |
| `PORT`               | Auto           | Set by Railway                  |


See `.env.example`.

---

## 6. Troubleshooting

### Railway still shows an old commit after `git push`

1. **Confirm GitHub has the commit**
  On GitHub → `barterinfo/swaphaven-backend` → check **main** matches your latest commit hash (`git log -1` locally).
2. **Branch must match**
  Railway → API service → **Settings** → **Source** → **Branch** = `main` (same branch you push to).
3. **Turn on deploy on push**
  **Settings** → **Source** → enable **Deploy on push** / **Automatic deployments** (wording varies).
4. **Redeploy manually (immediate fix)**
  **Deployments** tab → **⋯** on latest (or top right) → **Redeploy** → choose **Deploy latest commit**.
5. **Reconnect GitHub** (webhook stuck)
  **Settings** → **Source** → **Disconnect** → connect repo again → pick `swaphaven-backend` + branch `main`.
6. **Wrong service or project**
  Ensure you are viewing the **GitHub API service**, not the **PostgreSQL** service (Postgres does not show your app commits).
7. **Monorepo only**
  If the API ever lives inside a parent repo, set **Root Directory** to the folder that contains `package.json` and `railway.toml`.
8. **CLI redeploy** (optional)
  `npm i -g @railway/cli` → `railway login` → `railway link` → `railway up` or `railway redeploy`.


| Symptom                          | Fix                                                          |
| -------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL is required`       | Add Postgres variable **reference** on API service; redeploy |
| `/api/readyz` → `database: down` | Postgres not active or wrong reference                       |
| Build fails                      | Set **Root Directory** in monorepos; check build logs        |
| CORS errors                      | Add app origin to `CORS_ORIGINS`                             |
| Cold start slow                  | Normal on hobby plans; upgrade plan for always-on            |
| `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` | Set `TRUST_PROXY=true` (auto in production); redeploy latest |
| 404 on `/api/readyz`             | Deploy crashed before routes loaded — redeploy; try `/health` |
| Health check failed (migrate OK) | Use `sh -c 'node dist/db/migrate.js && exec node dist/index.js'`; remove Docker `ENTRYPOINT`; do not hardcode `PORT` in Dockerfile; look for `[server] Listening` |
| Logs stop after migrate only | Container exited — API never started; fix start command shell (see above) |
| `/api/readyz` → 503              | `DATABASE_URL` wrong or Postgres not linked — use Railway **reference** variable |


---

## 7. Optional: custom domain

Railway → API service → **Settings** → **Networking** → add custom domain (e.g. `api.swaphaven.io`) and follow DNS instructions.

---

## 8. Later (not required for Railway deploy)

- S3 presigned uploads for listing photos
- Second Railway environment for production
- Redis for WebSocket fan-out across instances
- Email provider for forgot-password

