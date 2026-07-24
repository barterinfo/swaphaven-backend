# SwapHaven API — Railway → EC2 migration guide

Step-by-step guide to move **swaphaven-api** from Railway to an **AWS EC2** host, including env vars, DNS (GoDaddy / `bartersg.com`), TLS, Postgres, and Universal Links / App Links.

Related docs:

- Current Railway deploy: [DEPLOYMENT.md](./DEPLOYMENT.md)
- S3 media: [S3_SETUP.md](./S3_SETUP.md)
- Local Docker: [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md)

---

## 0. Target architecture

```text
                    GoDaddy DNS
                         │
         ┌───────────────┼───────────────┐
         │               │               │
   bartersg.com    www.bartersg.com   (optional api.*)
         │               │
         └───────┬───────┘
                 │  A / Elastic IP
                 ▼
            EC2 (Ubuntu)
         Nginx :443 (TLS)
                 │
                 ▼ proxy_pass
         Docker API :3001
                 │
                 ▼
         Postgres (RDS recommended)
                 │
                 ▼
              S3 (unchanged)
```

**Defaults used in this guide**

| Item | Value |
|------|--------|
| Public share / deep-link host | `bartersg.com` (+ `www.bartersg.com`) |
| API listen port (container) | `3001` |
| TLS | Let’s Encrypt via Certbot + Nginx |
| Process model | Docker (`Dockerfile` production target) |
| Postgres | **Amazon RDS** (recommended) — not Postgres inside the same EC2 box for production |

Mobile share links and Universal/App Links expect verification files at:

- `https://bartersg.com/.well-known/apple-app-site-association`
- `https://bartersg.com/.well-known/assetlinks.json`
- `https://bartersg.com/listings/:id` (HTML preview / store redirect)

Those routes are served by **swaphaven-api**, so `bartersg.com` must resolve to the same host that runs the API (same as Railway custom domain today).

---

## 1. Pre-migration inventory (copy from Railway)

Do this **before** tearing down Railway.

### 1.1 Export env vars from Railway

Railway → API service → **Variables**. Copy every key/value into a secure notes file (1Password / encrypted doc). You will recreate them on EC2 as `/opt/swaphaven/api/.env`.

### 1.2 Note public URLs in use

| Usage | Current (Railway) | After EC2 |
|-------|-------------------|-----------|
| Mobile `API_BASE` | e.g. `https://….up.railway.app` or `https://bartersg.com` | `https://bartersg.com` (or keep Railway URL until cutover) |
| Custom domain | `bartersg.com` / `www.bartersg.com` → Railway CNAME | Same names → EC2 Elastic IP (A records) |
| WebSockets | `wss://…/ws/...` | `wss://bartersg.com/ws/...` |

### 1.3 Database dump

On a machine with Railway Postgres access (Railway CLI, or temporary public URL):

```bash
# Example: dump from Railway Postgres connection string
pg_dump "$RAILWAY_DATABASE_URL" --no-owner --format=custom -f swaphaven.dump
```

Keep the dump offline until restore onto RDS/EC2 Postgres.

### 1.4 Confirm deep-link code is deployed

Before migrating DNS away from Railway, ensure production already serves:

```bash
curl -sS https://bartersg.com/.well-known/assetlinks.json
curl -sS https://bartersg.com/.well-known/apple-app-site-association
curl -sS https://bartersg.com/api/healthz
```

If you see `{"error":"not_found","message":"Resource not found"}`, the well-known routes are **not** on the live deploy yet — push/redeploy swaphaven-api first (or you’ll migrate the same gap to EC2).

---

## 2. AWS prerequisites

1. AWS account with permissions for EC2, Elastic IP, Security Groups, and (recommended) RDS.
2. SSH key pair created in the EC2 region you choose (e.g. `ap-southeast-1` for Singapore).
3. Domain `bartersg.com` in GoDaddy (or wherever DNS is managed).
4. GitHub access to `swaphaven-backend` (or your API repo).

Suggested instance (starting point):

| Setting | Suggestion |
|---------|------------|
| AMI | Ubuntu 24.04 LTS |
| Instance type | `t3.small` or `t3.medium` |
| Storage | 30+ GB gp3 |
| Elastic IP | Allocate and associate (stable DNS target) |

---

## 3. EC2 networking / security groups

Create a security group, e.g. `swaphaven-api-sg`:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | Your IP / VPN only | Admin |
| HTTP | 80 | `0.0.0.0/0` | Certbot + HTTP→HTTPS redirect |
| HTTPS | 443 | `0.0.0.0/0` | Public API + deep links |
| Custom TCP | 3001 | **Do not open publicly** | Only localhost / Nginx |

If using **RDS** in the same VPC:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| PostgreSQL | 5432 | EC2 security group only | DB access |

Do **not** expose Postgres to `0.0.0.0/0`.

---

## 4. Provision Postgres (RDS recommended)

1. Create RDS PostgreSQL 16 (or match Railway major version).
2. Same VPC as EC2; private subnet preferred.
3. Master username/password → store securely.
4. Note connection URL shape:

```text
postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/swaphaven
```

5. Create database `swaphaven` if the master DB name differs.

**Alternative (simpler, weaker):** run Postgres in Docker Compose on the same EC2 (fine for staging; avoid for serious production).

---

## 5. EC2 bootstrap

SSH in:

```bash
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

Install Docker + Nginx + Certbot:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx

# Docker (official convenience script or apt repo — pick one approach)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# log out / back in so docker group applies

sudo systemctl enable --now docker nginx
```

Create app directories:

```bash
sudo mkdir -p /opt/swaphaven/api
sudo chown -R ubuntu:ubuntu /opt/swaphaven
```

Clone / pull the API:

```bash
cd /opt/swaphaven
git clone https://github.com/barterinfo/swaphaven-backend.git api
# or: git pull if already cloned
cd api
```

---

## 6. Environment variables on EC2

Create `/opt/swaphaven/api/.env` (never commit this file).

### 6.1 Required

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | RDS URL from step 4 |
| `JWT_ACCESS_SECRET` | **Copy from Railway** (≥ 32 chars) — changing invalidates all sessions |
| `JWT_REFRESH_SECRET` | **Copy from Railway** |
| `JWT_ACCESS_EXPIRES_IN` | `15m` (default) |
| `JWT_REFRESH_EXPIRES_IN` | `30d` (default) |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | `3001` |
| `TRUST_PROXY` | `true` (Nginx terminates TLS) |
| `CORS_ORIGINS` | Comma-separated app origins, or `*` for early staging |

Generate new secrets only if you intentionally want to force re-login:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 6.2 Strongly recommended for production

| Variable | Notes |
|----------|--------|
| `PUBLIC_API_URL` | `https://bartersg.com` |
| `ENABLE_API_DOCS` | `false` in locked-down prod |
| `AUTH_RATE_LIMIT_MAX` | e.g. `20` |
| `API_RATE_LIMIT_MAX` | e.g. `300` |
| `RATE_LIMIT_WINDOW_MS` | `900000` |

### 6.3 Auth / social (copy from Railway if used)

| Variable | Notes |
|----------|--------|
| `GOOGLE_CLIENT_ID` | Web client ID |
| `GOOGLE_IOS_CLIENT_ID` | If needed |
| `GOOGLE_ANDROID_CLIENT_ID` | If needed |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Both required for Facebook |

### 6.4 S3 media (copy from Railway)

| Variable | Notes |
|----------|--------|
| `AWS_REGION` | e.g. `ap-southeast-1` |
| `AWS_ACCESS_KEY_ID` | Prefer IAM role on EC2 instead of long-lived keys when possible |
| `AWS_SECRET_ACCESS_KEY` | Omit if using instance role |
| `S3_MEDIA_BUCKET` | Existing bucket — no need to recreate |
| `S3_MEDIA_PREFIX` | `listings` |
| `S3_PRESIGN_EXPIRES_SEC` | `300` |
| `CDN_BASE_URL` | If CloudFront is in front of S3 |

Prefer attaching an **IAM instance profile** with `s3:PutObject` / `s3:GetObject` on the media bucket and leaving access keys unset.

### 6.5 Push + email (copy from Railway)

| Variable | Notes |
|----------|--------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON as **one line** |
| `RESEND_API_KEY` | Password-reset OTP |
| `EMAIL_FROM` | Verified Resend from-address |

### 6.6 Universal Links / App Links (share product)

| Variable | Notes |
|----------|--------|
| `APPLE_TEAM_ID` | Apple Developer Team ID (Xcode shows `DEVELOPMENT_TEAM`, e.g. `4GK8WMS4PB`) |
| `IOS_BUNDLE_ID` | Default `com.barter.app.barterMobile` |
| `ANDROID_PACKAGE_ID` | Default `com.barter.app.barter_mobile` |
| `ANDROID_SHA256_CERT_FINGERPRINT` | Release keystore SHA-256 (colon-separated hex) |
| `IOS_APP_STORE_URL` | When App Store listing exists |
| `ANDROID_PLAY_STORE_URL` | When Play Store listing exists |

Without `APPLE_TEAM_ID` / Android fingerprint, `.well-known` still responds but App Links / Universal Links **will not verify** on devices.

### 6.7 Optional

| Variable | Notes |
|----------|--------|
| `DAILY_SWIPE_LIMIT` | Positive integer or leave unset for unlimited |

### 6.8 Example `.env` skeleton

```bash
DATABASE_URL=postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/swaphaven
JWT_ACCESS_SECRET=paste-from-railway
JWT_REFRESH_SECRET=paste-from-railway
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
TRUST_PROXY=true
CORS_ORIGINS=*
ENABLE_API_DOCS=false
PUBLIC_API_URL=https://bartersg.com

# S3 / social / FCM / Resend — paste from Railway
# AWS_REGION=...
# FIREBASE_SERVICE_ACCOUNT_JSON={...}
# RESEND_API_KEY=...
# EMAIL_FROM=...

APPLE_TEAM_ID=4GK8WMS4PB
IOS_BUNDLE_ID=com.barter.app.barterMobile
ANDROID_PACKAGE_ID=com.barter.app.barter_mobile
ANDROID_SHA256_CERT_FINGERPRINT=AA:BB:CC:...
# IOS_APP_STORE_URL=https://apps.apple.com/app/idXXXXXXXX
# ANDROID_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.barter.app.barter_mobile
```

Lock down permissions:

```bash
chmod 600 /opt/swaphaven/api/.env
```

---

## 7. Restore database onto RDS

```bash
# From your laptop (or EC2 if dump was uploaded)
pg_restore --no-owner --dbname="$NEW_DATABASE_URL" swaphaven.dump
```

If restore is awkward, alternative:

1. Point empty RDS at a temporary API start so migrations create schema (`node dist/db/migrate.js`).
2. Then copy data with `pg_dump`/`pg_restore` or a logical sync tool.

Verify:

```bash
psql "$NEW_DATABASE_URL" -c '\dt'
```

---

## 8. Run the API with Docker on EC2

From `/opt/swaphaven/api`:

```bash
docker build -t swaphaven-api:latest .

docker run -d \
  --name swaphaven-api \
  --restart unless-stopped \
  --env-file /opt/swaphaven/api/.env \
  -p 127.0.0.1:3001:3001 \
  swaphaven-api:latest
```

The image `CMD` runs migrations then `node dist/index.js`.

Check logs and health (on the box):

```bash
docker logs -f swaphaven-api
curl -sS http://127.0.0.1:3001/api/healthz
curl -sS http://127.0.0.1:3001/api/readyz
```

`/api/readyz` must show `"database":"up"`.

### Optional: Compose on EC2 (API only, RDS external)

You can adapt `docker-compose.yml` to drop the local `postgres` service and pass `DATABASE_URL` from `.env`. Keep the published port bound to `127.0.0.1:3001` so only Nginx is public.

---

## 9. Nginx reverse proxy + TLS

### 9.1 Temporary HTTP site (for Certbot)

`/etc/nginx/sites-available/bartersg.com`:

```nginx
server {
    listen 80;
    server_name bartersg.com www.bartersg.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/bartersg.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 9.2 Point DNS at EC2 **before** Certbot (or use DNS challenge)

See [§10 DNS](#10-dns-godaddy--cutover-from-railway). For a clean cutover, many teams:

1. Bring EC2 + Nginx + API up on Elastic IP.
2. Lower TTL on GoDaddy records ahead of time (e.g. 600s).
3. Switch A records to Elastic IP.
4. Issue certs once HTTP reaches EC2.

Issue certificates:

```bash
sudo certbot --nginx -d bartersg.com -d www.bartersg.com
```

Certbot will adjust the Nginx site for HTTPS. Confirm WebSocket headers remain present after Certbot edits (re-add `Upgrade` / `Connection` if Certbot’s template dropped them).

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. DNS (GoDaddy) — cutover from Railway

### 10.1 What you recently did for Railway

For Railway custom domain `www.bartersg.com`, Railway typically asked for:

| Type | Name (GoDaddy) | Value (example) | Purpose |
|------|----------------|-----------------|--------|
| CNAME | `www` | `oya2f7mh.up.railway.app` | Point www → Railway |
| TXT | `_railway-verify.www` | `railway-verify=…` | Ownership verify |

Railway’s UI often shows CNAME **Name `@`** for hostname `www.bartersg.com` — on GoDaddy that maps to Name **`www`**.

Bare `bartersg.com` may have been an **A** record or separate Railway custom domain.

### 10.2 What to change for EC2

EC2 does **not** use Railway CNAMEs. Use the Elastic IP:

| Type | Name | Value | Notes |
|------|------|--------|------|
| **A** | `@` | `YOUR_ELASTIC_IP` | Root `bartersg.com` |
| **A** | `www` | `YOUR_ELASTIC_IP` | Or CNAME `www` → `bartersg.com` |

Remove / replace:

- CNAME `www` → `*.up.railway.app`
- Railway `_railway-verify*` TXT records (no longer needed)
- Any GoDaddy **domain forwarding** / Website Builder that overrides DNS

### 10.3 GoDaddy UI steps

1. GoDaddy → **Domain Portfolio** → `bartersg.com` → **DNS**.
2. Edit existing `www` record (do not add a second `www` — GoDaddy errors with “conflicts with another record”).
3. Change `www` to **A** → Elastic IP (or CNAME → `bartersg.com`).
4. Edit `@` **A** record to the same Elastic IP (replace parking / old IP).
5. Delete Railway verify TXT records.
6. Save; wait for propagation (often minutes; up to hours).

### 10.4 Verify DNS

```bash
dig +short bartersg.com A
dig +short www.bartersg.com A
# both should equal YOUR_ELASTIC_IP
```

Browser / curl:

```bash
curl -sS https://bartersg.com/api/healthz
curl -sS https://bartersg.com/.well-known/assetlinks.json
curl -sS https://bartersg.com/.well-known/apple-app-site-association
```

You should **not** see Railway’s old host in redirects, and you should **not** see Express `not_found` for `.well-known` routes.

---

## 11. Mobile / client cutover

After HTTPS on `bartersg.com` is healthy:

1. Set Flutter env:

```env
API_BASE=https://bartersg.com
SHARE_BASE_URL=https://bartersg.com
```

(`mobile/lib/config/env/production.env` and any CI `--dart-define`.)

2. Ship an app build that already includes:
   - iOS Associated Domains `applinks:bartersg.com`
   - Android App Links intent-filter for `https://bartersg.com/listings`
3. Re-verify App Links after DNS + TLS stabilize (Android may cache failed verification).

WebSockets:

```text
wss://bartersg.com/ws/<conversationId>?token=<accessToken>
```

---

## 12. Cutover checklist (order matters)

1. [ ] Inventory Railway env vars + dump DB.
2. [ ] Confirm deep-link routes work on current host (or deploy them first).
3. [ ] Create EC2 + Elastic IP + security groups.
4. [ ] Create RDS; restore dump; confirm `\dt`.
5. [ ] Write `/opt/swaphaven/api/.env` (same JWTs as Railway).
6. [ ] `docker build` + `docker run` on `127.0.0.1:3001`; `/api/readyz` OK.
7. [ ] Configure Nginx HTTP proxy.
8. [ ] Lower DNS TTL (optional, a day ahead).
9. [ ] Switch GoDaddy `@` / `www` to Elastic IP; remove Railway CNAMEs.
10. [ ] Certbot TLS for `bartersg.com` + `www`.
11. [ ] Verify healthz, readyz, `.well-known/*`, sample `/listings/:id`.
12. [ ] Point mobile `API_BASE` / `SHARE_BASE_URL` at `https://bartersg.com`.
13. [ ] Smoke-test login, listings, offer chat (WSS), image upload.
14. [ ] Keep Railway running read-only ~24–48h as rollback.
15. [ ] Decommission Railway API + Postgres after confidence window.

---

## 13. Rollback

If EC2 fails after DNS cutover:

1. In GoDaddy, restore `www` CNAME (and root records) to Railway values from your notes.
2. Wait for DNS / TLS; confirm `https://bartersg.com/api/healthz`.
3. Leave EC2 up for debugging without taking production traffic.

If only the app misbehaves but DNS is fine, roll back the mobile `API_BASE` build instead of DNS.

---

## 14. Ongoing ops on EC2

### Deploy new API versions

```bash
cd /opt/swaphaven/api
git pull
docker build -t swaphaven-api:latest .
docker stop swaphaven-api && docker rm swaphaven-api
docker run -d \
  --name swaphaven-api \
  --restart unless-stopped \
  --env-file /opt/swaphaven/api/.env \
  -p 127.0.0.1:3001:3001 \
  swaphaven-api:latest
```

### Logs

```bash
docker logs -f --tail=200 swaphaven-api
sudo journalctl -u nginx -f
```

### Cert renewal

Certbot installs a renew timer. Test:

```bash
sudo certbot renew --dry-run
```

### Backups

- Enable **RDS automated backups** + snapshot before risky deploys.
- Optionally nightly `pg_dump` to S3.

---

## 15. Troubleshooting


| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `not_found` on `/.well-known/*` | Old API image without well-known routes | Rebuild/redeploy latest `main` |
| DNS still hits Railway | CNAME `www` not removed | Replace with A → Elastic IP |
| GoDaddy “www conflicts” | Existing `www` record | Edit/delete old record; don’t add duplicate |
| Certbot fails | DNS not pointing at EC2 yet | Fix A records; retry |
| `/api/readyz` database down | Bad `DATABASE_URL` / SG | Check RDS SG allows EC2 SG on 5432 |
| CORS errors | `CORS_ORIGINS` | Add client origins or `*` for staging |
| WSS fails | Nginx missing Upgrade headers | Restore WebSocket proxy headers |
| App Links don’t open app | Missing fingerprint / AASA / HTTPS | Set `APPLE_TEAM_ID`, Android SHA-256; confirm HTTPS 200 on well-known |
| Images fail upload | S3 IAM / keys | Fix instance role or `AWS_*` vars |

---

## 16. Security reminders

- Never commit `.env` or paste secrets into git / chat logs.
- Restrict SSH to your IP; prefer SSM Session Manager later.
- Keep `TRUST_PROXY=true` only behind Nginx (or another trusted proxy).
- Prefer IAM roles over long-lived AWS access keys on the instance.
- Turn `ENABLE_API_DOCS=false` in production unless the team needs Swagger.

---

## 17. Quick reference — health URLs after migration

```bash
curl -sS https://bartersg.com/api/healthz
curl -sS https://bartersg.com/api/readyz
curl -sS https://bartersg.com/.well-known/assetlinks.json
curl -sS https://bartersg.com/.well-known/apple-app-site-association
curl -sS -A "Mozilla/5.0" https://bartersg.com/listings/<listing-uuid> | head
```
