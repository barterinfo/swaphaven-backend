# Announcement push

Ops-only FCM broadcast for product news, maintenance, and other messages that are **not** tied to an offer or chat.

There is **no HTTP admin route**. You send from your laptop with `npm run push:announce` (local DB) or `npm run push:announce:prod` (Railway). The CLI talks to Postgres + Firebase directly; it does not call the running API.

Related:

- All push types and app states: `barter-stack/mobile/docs/PUSH_NOTIFICATIONS.md`
- Payload field tables: `barter-stack/mobile/docs/PUSH_PAYLOAD_SPEC.md`
- FCM architecture: [deeplink-push-notifications.md](./deeplink-push-notifications.md)

---

## Table of contents

1. [What it is](#what-it-is)
2. [What the user sees](#what-the-user-sees)
3. [Who receives it](#who-receives-it)
4. [Prerequisites](#prerequisites)
5. [Commands](#commands)
6. [Production walkthrough](#production-walkthrough)
7. [Local vs production](#local-vs-production)
8. [Flags](#flags)
9. [Payload](#payload)
10. [Expected logs](#expected-logs)
11. [Troubleshooting](#troubleshooting)

---

## What it is

Trade/chat pushes (`offer`, `counter_offer`, `offer_accepted`, `new_message`) fire from API routes when a user acts. Announcements do not. An operator chooses a title and body and sends `data.type = announcement` to:

- **one user** — every device token registered for that account, or
- **everyone** — every row in `device_tokens`

Announcements are **FCM only**. They are not inserted into the `notifications` table (no in-app bell history).

```
 laptop CLI  ──►  Postgres device_tokens  ──►  Firebase Admin FCM  ──►  lock-screen card
                  (.env or .env.prod)         (FIREBASE_SERVICE_ACCOUNT_JSON)
```

---

## What the user sees

| App state | UI | Tap |
|-----------|----|-----|
| Background or killed | Native navy **Announcement** card (pill + title + body + Open App) | Opens Listings |
| Foreground | In-app banner (title + body), auto-dismiss ~6s | Dismisses only |
| App without this feature | Android: often **nothing** (unknown data-only type). iOS: may show a **plain** system alert from `aps.alert` | No listings deep link |

Android channel: `barter_announcements`. iOS category: `BARTER_ANNOUNCEMENT`.

---

## Who receives it

A device gets the push only if all of these are true:

1. A row exists in `device_tokens` for that user (registered after login via `POST /api/auth/device-token`).
2. The FCM token is still valid (uninstalled apps / rotated tokens get cleaned up after FCM rejects them).
3. The user has not turned push **Off** in Settings (that deletes the local FCM token).
4. OS notification permission is granted.
5. `FIREBASE_SERVICE_ACCOUNT_JSON` is set in the env the CLI loads.

There is no server-side per-user announcement preference. `--all` is every stored token, including stale ones.

---

## Prerequisites

Run from the **swaphaven-api** repo after `npm install`.

| Variable | Why |
|----------|-----|
| `DATABASE_URL` | Read `device_tokens` (and look up `--user` by email / id) |
| `EMAIL_HASH_PEPPER` | Must match the target DB if you pass `--user email@…` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | One-line Firebase service-account JSON (project `barter-1e079`). If missing, send is a logged no-op |
| JWT secrets + `EMAIL_ENCRYPTION_KEY` | Satisfy env validation; JWT need not match Railway for this CLI |

Copy Firebase JSON from Railway, or from a downloaded key:

```bash
node -e "const fs=require('fs');console.log('FIREBASE_SERVICE_ACCOUNT_JSON='+JSON.stringify(JSON.parse(fs.readFileSync('path/to/key.json','utf8'))))" >> .env.prod
```

`.env.prod` is created once with `npm run ads:prod:init` if you do not already have it. Set `DATABASE_URL` to the Railway Postgres **public** URL (Connect tab).

---

## Commands

Always quote `--title` and `--body`. Always put flags **after** `--` so npm does not swallow them.

| Intent | Command |
|--------|---------|
| Help | `npm run push:announce -- --help` |
| Local, one user | `npm run push:announce -- --title "…" --body "…" --user you@example.com` |
| Local, everyone (preview) | `npm run push:announce -- --title "…" --body "…" --all --dry-run` |
| Local, everyone (send) | `npm run push:announce -- --title "…" --body "…" --all --yes` |
| **Production, one user** | `npm run push:announce:prod -- --title "…" --body "…" --user you@example.com` |
| **Production, everyone (preview)** | `npm run push:announce:prod -- --title "…" --body "…" --all --dry-run` |
| **Production, everyone (send)** | `npm run push:announce:prod -- --title "…" --body "…" --all --yes` |

`--user` accepts an **email** (the address they signed up with) or a **user UUID**. `--user` and `--all` are mutually exclusive.

---

## Production walkthrough

### 1. Preview one account

```bash
cd /path/to/swaphaven-api

npm run push:announce:prod -- \
  --title "Scheduled maintenance" \
  --body "We'll be down 2–4am UTC." \
  --user you@example.com \
  --dry-run
```

Success looks like:

```
[dry-run] would send announcement to userId=bf7e922f-8a97-4642-96dd-d2c35e71c7c3 (3 device(s))
  title: Scheduled maintenance
  body:  We'll be down 2–4am UTC.
```

`(0 device(s))` means that account has no FCM tokens on production — they need to log in on a build with push On.

### 2. Send to yourself first

Same command **without** `--dry-run`:

```bash
npm run push:announce:prod -- \
  --title "Scheduled maintenance" \
  --body "We'll be down 2–4am UTC." \
  --user you@example.com
```

Background or kill the app, then confirm the navy card. Use a build that includes the announcement card (this feature is not on older store binaries).

### 3. Preview everyone

```bash
npm run push:announce:prod -- \
  --title "Scheduled maintenance" \
  --body "We'll be down 2–4am UTC." \
  --all \
  --dry-run
```

Read the token count. This is **devices**, not unique users (one person can have several phones).

### 4. Broadcast

`--all` requires `--yes`. Without it the CLI prints the count and exits.

```bash
npm run push:announce:prod -- \
  --title "Scheduled maintenance" \
  --body "We'll be down 2–4am UTC." \
  --all \
  --yes
```

FCM is sent in batches of 500 tokens. Stale tokens are deleted from `device_tokens` after FCM rejects them.

---

## Local vs production

| Script | Env file | Database |
|--------|----------|----------|
| `npm run push:announce` | `.env` | Local (often `localhost:5433` via Docker) |
| `npm run push:announce:prod` | `.env.prod` | Railway Postgres |

`ECONNREFUSED … 127.0.0.1:5433` means you ran **`push:announce`** (local) while Docker Postgres is down. For production always use **`push:announce:prod`**.

---

## Flags

| Flag | Required | Meaning |
|------|----------|---------|
| `--title <text>` | Yes | Lock-screen / banner headline |
| `--body <text>` | Yes | Body copy (native card shows up to 4 lines expanded) |
| `--user <email\|uuid>` | One of `--user` / `--all` | Target one account’s devices |
| `--all` | One of `--user` / `--all` | Every `device_tokens` row |
| `--yes` | With `--all` when not dry-run | Confirm broadcast |
| `--dry-run` | No | Count / resolve user; **do not** call FCM |
| `--help` | No | Print usage |

---

## Payload

The CLI always sends a data-only FCM message (no top-level `notification` block):

```json
{
  "data": {
    "type": "announcement",
    "title": "Scheduled maintenance",
    "body": "We'll be down 2–4am UTC.",
    "timestampLabel": "now",
    "screen": "listings"
  }
}
```

iOS also gets `aps.alert` + `category: BARTER_ANNOUNCEMENT` + `mutable-content`. Tap destination is Listings (`screen` is not configurable from the CLI today).

---

## Expected logs

**One user, send:**

```
[push] sending type=announcement to userId=<uuid> (3 device(s))
[push] delivered 3/3 (type=announcement userId=<uuid>)
Sent announcement to userId=<uuid>
```

**Broadcast:**

```
[push] broadcasting type=announcement to 42 device(s)
[push] broadcast delivered 40/42 (type=announcement)
Broadcast delivered 40/42 device(s)
```

`delivered < tokenCount` is normal when some tokens are stale (app uninstalled). Those rows are removed automatically.

**Firebase missing:**

```
[push] skipped — FIREBASE_SERVICE_ACCOUNT_JSON not set (type=announcement …)
```

Add the JSON to `.env.prod` (or `.env` for local).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| `ECONNREFUSED … :5433` | Used `push:announce` against local Docker | Use `push:announce:prod` |
| `No user found for …` | Email typo, or `EMAIL_HASH_PEPPER` in `.env.prod` ≠ Railway | Use the signup email, or pass the user UUID |
| `(0 device(s))` | No FCM token on that account | Log in on a device with push On |
| `FIREBASE_SERVICE_ACCOUNT_JSON not set` | Missing from the env file the script loaded | Append the one-line JSON |
| No card on Android | Store build without announcement type, or app in foreground | Install a build with this feature; background/kill the app |
| Plain iOS tray, not navy card | Old binary (no `BARTER_ANNOUNCEMENT` extension) | Install a build with this feature |
| Broadcast refused | `--all` without `--yes` | Re-run with `--yes`, or `--dry-run` first |
| npm ate the flags | Flags before `--` | Always `npm run push:announce:prod -- --title …` |
