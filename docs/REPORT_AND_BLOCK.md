# Report and Block — listings, users, and ops CLI

How Barter handles Apple Guideline 1.2 (user-generated content) without auto-banning: in-app Report/Block, and how to take action from the backend.

## Principles

| Action | Effect |
|--------|--------|
| **Report** (in-app) | Inserts a `content_reports` row with `status: pending`, emails support. Content stays live. Nobody is banned. |
| **Block** (in-app) | One-way hide for the blocker only (deck, search, listings, offers, chats). Other users still see the blocked person. |
| **Ops action** (this CLI) | You review pending reports, then soft-delete a listing, suspend a user, or delete an account. Mark the report `dismissed` or `actioned`. |

False reports are expected. **Do not auto-ban.** Review the queue, then decide.

### App Review Notes (paste into App Store Connect)

> Report and Block are on listing, profile, and chat menus. Reports go to a moderation queue (email + DB). We do not auto-ban; we review and act manually. Block only hides the other user for the reporter.

---

## In-app surfaces (mobile)

- Listing detail → ⋯ (other people’s listings) — report listing / block seller  
- Other user’s profile → ⋯ — report user / block  
- Chat → ⋯ — report conversation / block  

Toast after report: *Thanks — we'll review this. No one is banned automatically.*

---

## Data model

### `content_reports`

| Column | Notes |
|--------|--------|
| `reporter_id` | Who filed the report |
| `target_type` | `listing` \| `user` \| `conversation` |
| `target_id` | UUID of the target |
| `reported_user_id` | Owner / other party |
| `reason` | `spam`, `scam`, `inappropriate`, `harassment`, `prohibited_item`, `other` |
| `details` | Optional free text |
| `status` | `pending` → `dismissed` \| `actioned` |

Creating a report never changes listing status or user access.

### `user_blocks`

One-way: `blocker_id` no longer sees `blocked_id`. Not a platform ban.

### `users.suspended_at` / `users.suspended_reason`

Set by ops via the CLI. Suspended accounts get **403** on login, Google sign-in, refresh, and `GET /api/auth/me`. Active listings are soft-deleted on suspend.

Migrations:

- `drizzle/0022_safety_report_block.sql` — reports + blocks  
- `drizzle/0023_user_suspend.sql` — suspend columns  

Apply on Railway via normal migrate-on-start, or locally with `npm run db:migrate` / `db:push`.

---

## API (mobile / clients)

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/api/reports` | Queue report (`pending`). Idempotent per reporter + target. |
| `POST` | `/api/blocks/:userId` | Block (idempotent). |
| `DELETE` | `/api/blocks/:userId` | Unblock. |
| `GET` | `/api/blocks` | List blocked user ids. |

Blocked users are filtered from swipe deck, search, listing feeds, saved, offers lists, and chats. Messaging / new offers between a blocked pair return 403.

Email notify uses `SUPPORT_EMAIL` (default `support@bartersg.com`) when `RESEND_API_KEY` + `EMAIL_FROM` are set. If mailer is unset, the row still lands in `content_reports`.

Shared logic: `src/lib/moderation-actions.ts`, routes: `src/routes/safety.ts`.

---

## Ops CLI — `npm run moderate`

Script: `scripts/moderate.ts`  
Uses `DATABASE_URL` from `.env` (local) or `.env.prod` (Railway).

### Commands

| Command | Effect |
|---------|--------|
| `pending` | List open reports |
| `report <reportId>` | Print one report as JSON |
| `dismiss <reportId>` | Mark report false / no action |
| `delete-listing <listingId>` | Soft-delete listing (`status → deleted`) |
| `suspend <userId\|email>` | Lock login + soft-delete their listings + clear push tokens (reversible) |
| `unsuspend <userId\|email>` | Clear suspension |
| `delete-user <userId\|email> --yes` | Hard-delete account (cascades; irreversible) |

Options:

- `--report <reportId>` — mark that report **actioned** after the step  
- `--reason <text>` — suspension reason (default: `Policy violation`)  
- `--yes` — required for `delete-user`  
- `--help` — usage  

### Examples

```bash
# Local (.env)
npm run moderate -- pending
npm run moderate -- dismiss <reportId>
npm run moderate -- delete-listing <listingId> --report <reportId>
npm run moderate -- suspend user@example.com --reason "Scam" --report <reportId>
npm run moderate -- unsuspend user@example.com
npm run moderate -- delete-user <userId> --yes --report <reportId>

# Interactive menu
npm run moderate

# Production — .env.prod with Railway DATABASE_URL
#   npm run ads:prod:init   # once, if .env.prod missing
npm run moderate:prod -- pending
npm run moderate:prod -- suspend user@example.com --reason "Harassment" --report <reportId>
```

### Typical workflow

1. `npm run moderate:prod -- pending` (or check support email).  
2. Open the listing / profile in the app or DB and decide.  
3. Prefer the lightest fix that resolves the issue:  
   - Bad listing only → `delete-listing`  
   - Repeat offender → `suspend`  
   - Extreme / legal → `delete-user --yes`  
   - False report → `dismiss`  
4. Pass `--report <id>` so the queue row moves to `actioned` (except `dismiss`, which sets `dismissed`).

For `delete-user`, the script marks the report **actioned first** (if `--report` is set), because deleting the user cascades away report rows.

---

## What suspend vs delete-user does

### Suspend

- Sets `users.suspended_at` + `suspended_reason`  
- Soft-deletes all non-deleted listings  
- Clears `device_tokens` (no more push)  
- Clears password-reset tokens  
- Account row remains; `unsuspend` restores login  

### Delete user

Uses the segregated purge in [`src/lib/account-deletion.ts`](../src/lib/account-deletion.ts) (`purgeUserAccount`). Does **not** modify listing DELETE, mark-sold, or offer accept/deny routes.

Order of operations:

1. Soft-delete the user’s listings; deny pending offers on those listings and notify buyers.
2. Deny open offers (`pending` / `countered`) where the user is buyer or seller; notify the other party (“The other user left Barter”).
3. Notify counterparties on open trades (`pending_meetup` / `disputed`).
4. Delete trade reviews, trades, and offers involving the user (cascades chats/messages).
5. Null `traded_with_user_id` on other users’ sold listings.
6. Clear `pending_registrations` for that email.
7. Delete the `users` row (cascades profile, tokens, swipes, saved, blocks, reports).

**Survivor behavior:** the other user’s own listings stay; status unchanged (`active` unless already `traded`). Shared offers/chats/trades with the deleted user disappear.

**In-app Delete Account:** `DELETE /api/account` with `{ "confirm": true, "password": "..." }` — same purge, auth required.

Prefer **`suspend`** when reversible; **`delete-user`** / **`DELETE /api/account`** are permanent.

---

## Env vars

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Required for the CLI |
| `SUPPORT_EMAIL` | Report inbox (default `support@bartersg.com`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional; report emails when set |

---

## Related code

| Path | Role |
|------|------|
| `src/lib/account-deletion.ts` | Segregated hard-delete purge (`purgeUserAccount`) |
| `src/routes/account-deletion.ts` | `DELETE /api/account` (in-app Delete Account) |
| `src/db/schema/safety.ts` | Blocks + reports tables |
| `src/db/schema/users.ts` | `suspendedAt` / `suspendedReason` |
| `src/lib/user-blocks.ts` | Block helpers for feeds |
| `src/lib/moderation-actions.ts` | Suspend / delete / mark report |
| `src/routes/safety.ts` | HTTP report / block |
| `src/routes/auth.ts` | Reject suspended on login / social / refresh / me |
| `scripts/moderate.ts` | Ops CLI |
| Mobile `lib/features/safety/` | Report / block UI sheets |
