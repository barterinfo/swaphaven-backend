# SwapHaven API

Peer-to-peer item trading platform — **Express 5 · PostgreSQL · Drizzle ORM · TypeScript**.

Forked from `barter-stack/backend` (MongoDB) and re-architected with a relational schema, full offer/trade/chat lifecycle, and production-grade security.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Create a new database (do NOT reuse barter-stack DB)
createdb swaphaven

# 3. Configure environment
cp .env.example .env
# Fill in DATABASE_URL=postgresql://...@.../swaphaven and JWT secrets

# 4. Push schema
npm run db:push

# 5. Start dev server
npm run dev
```

API at `http://localhost:3001` · Docs at `http://localhost:3001/api-docs`

### Production-like local stack (Docker)

```bash
docker compose up --build
# → http://localhost:3001/api/readyz
```

---

## Deployment

**Hosted on [Railway](https://railway.app)** (GitHub → auto-deploy). We do not deploy `barter-stack/backend`.

→ **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Postgres plugin, `DATABASE_URL`, env vars, public URL

| Step | Command |
|------|---------|
| Pre-push check | `./deploy/scripts/release.sh` |
| Local Docker stack | `npm run docker:up` |
| Health | `GET /api/healthz` · `GET /api/readyz` |

---

## Database tables

| Table | Purpose |
|---|---|
| `users` | Auth accounts (email + bcrypt hash + name) |
| `user_profiles` | Display name, bio, avatar, location, trade score |
| `device_tokens` | FCM / APNs push tokens |
| `swipe_streaks` | Daily swipe streaks and bonus swipe counts |
| `categories` | Item category tree (slug-based) |
| `listings` | Items listed for trade |
| `listing_images` | Photos per listing (ordered) |
| `listing_wants` | Tags for what seller wants back |
| `swipes` | Left/right swipe per (user, listing) pair |
| `offers` | Formal swap proposals |
| `offer_items` | Buyer's items offered in exchange |
| `counter_offers` | Seller's modified terms |
| `counter_offer_items` | Which items seller accepts/removes |
| `trades` | Confirmed trades |
| `trade_reviews` | 1–5 star reviews after completed trade |
| `conversations` | One chat thread per offer |
| `messages` | Individual chat messages |
| `notifications` | In-app notification feed |

---

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/healthz` | — | Health check |
| **Auth** ||||
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Log in |
| POST | `/api/auth/refresh` | — | Rotate token pair |
| POST | `/api/auth/logout` | ✓ | Discard session |
| GET | `/api/auth/me` | ✓ | Own account |
| POST | `/api/auth/forgot-password` | — | Request reset email |
| POST | `/api/auth/reset-password` | — | Apply reset token |
| POST | `/api/auth/device-token` | ✓ | Register push token |
| **Users** ||||
| GET | `/api/users/me` | ✓ | Own profile |
| PATCH | `/api/users/me` | ✓ | Update own profile |
| GET | `/api/users/:userId` | — | Public profile |
| GET | `/api/users/:userId/listings` | — | User's listings |
| GET | `/api/users/:userId/reviews` | — | User's reviews |
| **Categories & Listings** ||||
| GET | `/api/categories` | — | Category tree |
| GET | `/api/listings` | opt | Browse / search |
| POST | `/api/listings` | ✓ | Create listing |
| GET | `/api/listings/:id` | — | Listing detail |
| PATCH | `/api/listings/:id` | ✓ | Update listing |
| DELETE | `/api/listings/:id` | ✓ | Soft-delete listing |
| POST | `/api/listings/:id/images` | ✓ | Add photo |
| DELETE | `/api/listings/:id/images/:imageId` | ✓ | Remove photo |
| **Swipe** ||||
| GET | `/api/swipe/deck` | ✓ | Today's curated deck |
| POST | `/api/swipe` | ✓ | Record swipe |
| GET | `/api/swipe/streak` | ✓ | Streak info |
| **Offers** ||||
| POST | `/api/offers` | ✓ | Create offer |
| GET | `/api/offers/received` | ✓ | Received offers |
| GET | `/api/offers/sent` | ✓ | Sent offers |
| GET | `/api/offers/:id` | ✓ | Offer detail |
| POST | `/api/offers/:id/accept` | ✓ | Accept → Trade |
| POST | `/api/offers/:id/deny` | ✓ | Deny offer |
| POST | `/api/offers/:id/withdraw` | ✓ | Withdraw offer |
| POST | `/api/offers/:id/counter` | ✓ | Counter-offer |
| GET | `/api/offers/:id/counter` | ✓ | Counter detail |
| POST | `/api/offers/:id/counter/accept` | ✓ | Accept counter → Trade |
| POST | `/api/offers/:id/counter/deny` | ✓ | Decline counter |
| **Trades** ||||
| GET | `/api/trades` | ✓ | All user's trades |
| GET | `/api/trades/:id` | ✓ | Trade detail |
| POST | `/api/trades/:id/complete` | ✓ | Mark completed |
| POST | `/api/trades/:id/reviews` | ✓ | Leave review |
| **Chat** ||||
| GET | `/api/conversations` | ✓ | All conversations |
| GET | `/api/conversations/:id` | ✓ | Conversation detail |
| GET | `/api/conversations/:id/messages` | ✓ | Messages (cursor-paged) |
| POST | `/api/conversations/:id/messages` | ✓ | Send message |
| WS | `ws://host/ws/<conversationId>?token=` | JWT | Real-time chat |
| **Notifications** ||||
| GET | `/api/notifications` | ✓ | Notification feed |
| PATCH | `/api/notifications/:id/read` | ✓ | Mark one read |
| POST | `/api/notifications/read-all` | ✓ | Mark all read |

---

## Authentication

```
Authorization: Bearer <accessToken>
```

Access tokens expire in 15 minutes. Refresh via `POST /api/auth/refresh` with your refresh token to get a new pair.

---

## WebSocket (real-time chat)

Connect to `ws://localhost:3001/ws/<conversationId>?token=<accessToken>`.
Send JSON; the server appends `senderId` and broadcasts to other clients in the room.

---

## Security

| Feature | Implementation |
|---|---|
| HTTP security headers | `helmet` |
| CORS | Configurable `CORS_ORIGINS` env var |
| Rate limiting | `express-rate-limit` — stricter on `/api/auth` |
| Input validation | Zod schemas on all request bodies |
| Password hashing | bcrypt (cost 12) |
| Token type claim | `typ: "access" \| "refresh"` prevents token substitution attacks |
| Timing-safe reset | `crypto.timingSafeEqual` for password-reset token comparison |
| Email enumeration | Forgot-password always returns same generic message |
| Stack trace hiding | Error handler strips internals in `NODE_ENV=production` |
| Request IDs | `X-Request-ID` header for log correlation |
| Graceful shutdown | SIGTERM/SIGINT drains DB pool before exit |

---

## Scripts

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm run start        # Run compiled JS
npm run typecheck    # Type-check without emitting
npm run db:push      # Push schema to DB (dev)
npm run db:generate  # Generate migration files
npm run db:migrate   # Apply migrations
npm run db:studio    # Open Drizzle Studio
```

---

## Production checklist

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. Summary:

- [ ] Railway project: GitHub service + PostgreSQL + `DATABASE_URL` reference
- [ ] `NODE_ENV=production`, strong JWT secrets, `TRUST_PROXY=true`
- [ ] `CORS_ORIGINS` set; generate public domain
- [ ] `/api/readyz` shows database up
- [ ] Flutter `API_BASE` = Railway HTTPS URL
- [ ] (Later) S3 presigned uploads for listing images
