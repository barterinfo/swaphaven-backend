# Seed user script

Register a new SwapHaven account from the command line — useful for local dev, testing login flows, and creating accounts before running [SEED_LISTINGS.md](./SEED_LISTINGS.md).

Signup is **email OTP**: the script calls `POST /api/auth/register`, then `POST /api/auth/register/verify` with the code (same as the mobile app). Details: [CREATE_ACCOUNT_OTP.md](./CREATE_ACCOUNT_OTP.md).

Requires a running API with mailer configured (`RESEND_API_KEY`, `EMAIL_FROM`), **or** use the OTP printed in non-production server logs.

---

## Quick start

### Interactive signup (local)

From the repo root (`swaphaven-api`):

```bash
npm run seed:user
```

Prompts for **name** and **username** (email). Password is set automatically to `password123`.
Then prompts for the **6-digit OTP** (or set `SEED_OTP`).

If you enter a username without `@`, the script registers `username@example.com`.

### Random test user

```bash
# With OTP from env (e.g. copied from server logs)
SEED_OTP=123456 npm run seed:user -- --random
```

Creates a unique `@example.com` account, then verifies with `SEED_OTP` or a prompt.

### Railway

```bash
npm run seed:user -- --base-url https://swaphaven-backend-production.up.railway.app
```

Use only for **test accounts** on shared environments. You must receive the email OTP (or use `SEED_OTP` if you captured it).

---

## Example output

```text
API: http://127.0.0.1:3001

Using password: password123

Verification code sent. Check email (or non-prod server logs).

Enter 6-digit OTP from email (or server logs): 482910

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
| `--random` | Auto-generate name and email |
| `--help` | Print usage |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `API_BASE` | API origin (same as `--base-url`) |
| `PUBLIC_API_URL` | Fallback API origin |
| `SEED_NAME` + `SEED_EMAIL` | Skip name/email prompts when both set |
| `SEED_PASSWORD` | Override default password (`password123`) |
| `SEED_OTP` | Skip OTP prompt (use code from email / server logs) |

```bash
SEED_NAME="Demo User" SEED_EMAIL=demo SEED_OTP=482910 npm run seed:user
```

---

## Typical workflow

```bash
# 1. Start API
npm run dev

# 2. Create a user (use OTP from logs / email)
SEED_OTP=<code> npm run seed:user -- --random

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
| **OTP** | 6-digit code from email or non-prod server log |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Email already registered` | Use a different email or log in instead |
| `Unable to send verification email` / 503 | Set `RESEND_API_KEY` and `EMAIL_FROM`, or check server logs |
| `Invalid or expired verification code` | Re-run register (or seed) for a fresh OTP |
| `fetch failed` | Start the API: `npm run dev` |
| `Password must be at least 8 characters` | Should not happen with default `password123` |

---

## Files

| File | Role |
|------|------|
| `scripts/seed-user.ts` | CLI signup script (register + verify) |
| `package.json` | `"seed:user": "tsx scripts/seed-user.ts"` |

---

## Related docs

- [CREATE_ACCOUNT_OTP.md](./CREATE_ACCOUNT_OTP.md) — OTP signup sequences, DB, API
- [SEED_LISTINGS.md](./SEED_LISTINGS.md) — bulk-create listings for an account
- [API_GUIDE.md](./API_GUIDE.md) — auth endpoints
- [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) — run API and Postgres locally
