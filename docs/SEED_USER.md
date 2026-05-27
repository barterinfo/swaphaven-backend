# Seed user script

Register a new SwapHaven account from the command line — useful for local dev, testing login flows, and creating accounts before running [SEED_LISTINGS.md](./SEED_LISTINGS.md).

Calls `POST /api/auth/register` with the same payload as the mobile app signup.

---

## Quick start

### Interactive signup (local)

From the repo root (`swaphaven-backend`):

```bash
npm run seed:user
```

Prompts for **name** and **username** (email). Password is set automatically to `password123`.

If you enter a username without `@`, the script registers `username@example.com`.

### Random test user (no prompts)

```bash
npm run seed:user -- --random
```

Creates a unique `@example.com` account and prints the credentials.

### Railway

```bash
npm run seed:user -- --base-url https://swaphaven-backend-production.up.railway.app
```

Use only for **test accounts** on shared environments.

---

## Example output

```text
API: http://127.0.0.1:3001

Display name: Demo User
Username (email): demo
Using password: password123

Account created successfully.

  User ID:  78a0642b-cd22-41d2-a2ad-6f7a8b9c0d1e
  Name:     Demo User
  Email:    demo@example.com
  Password: password123
  Token:    eyJhbGciOiJIUzI1NiIsInR5...

You can log in with this account in the app, or run:
  SEED_EMAIL=demo@example.com SEED_PASSWORD='password123' npm run seed:listings
```

---

## CLI reference

```bash
npm run seed:user [-- --base-url <url>] [--random] [--help]
```

| Option | Description |
|--------|-------------|
| `--base-url <url>` | API origin (default: `API_BASE` → `PUBLIC_API_URL` → `http://127.0.0.1:3001`) |
| `--random` | Auto-generate name, email, and password |
| `--help` | Print usage |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `API_BASE` | API origin (same as `--base-url`) |
| `PUBLIC_API_URL` | Fallback API origin |
| `SEED_NAME` | Display name (skips prompts with `SEED_EMAIL`) |
| `SEED_EMAIL` | Username or full email |
| `SEED_PASSWORD` | Override default password (`password123`) |

```bash
SEED_NAME="Demo User" SEED_EMAIL=demo npm run seed:user
```

---

## Typical workflow

```bash
# 1. Start API
npm run dev

# 2. Create a user
npm run seed:user -- --random

# 3. Seed listings for that user
SEED_EMAIL=test-abc123@example.com SEED_PASSWORD='password123' npm run seed:listings
```

---

## Validation rules

Matches the API register schema:

| Field | Rule |
|-------|------|
| **Name** | 1–80 characters (you enter) |
| **Username** | Plain username or full email; plain names become `username@example.com` |
| **Password** | Fixed to `password123` (override with `SEED_PASSWORD`) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Email already registered` | Use a different email or log in instead |
| `fetch failed` | Start the API: `npm run dev` |
| `Password must be at least 8 characters` | Should not happen with default `password123` |
| `Passwords do not match` | N/A — password is not prompted |

---

## Files

| File | Role |
|------|------|
| `scripts/seed-user.ts` | CLI signup script |
| `package.json` | `"seed:user": "tsx scripts/seed-user.ts"` |

---

## Related docs

- [SEED_LISTINGS.md](./SEED_LISTINGS.md) — bulk-create listings for an account
- [API_GUIDE.md](./API_GUIDE.md) — `POST /api/auth/register`
- [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) — run API and Postgres locally
