# API guide

Base URL (local): `http://localhost:3001`  
Base URL (Railway): `https://<your-domain>.up.railway.app`

Interactive OpenAPI: [SWAGGER.md](./SWAGGER.md) → `http://localhost:3001/api-docs`  
Schema reference: [DB_SCHEMA.md](./DB_SCHEMA.md)

**Auth header** (protected routes):

```http
Authorization: Bearer <accessToken>
```

**Errors** usually look like:

```json
{ "error": "validation", "message": { "field": ["reason"] } }
```

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | Service index |
| GET | `/health` | — | Redirects to `/api/healthz` |
| GET | `/api/healthz` | — | Liveness |
| GET | `/api/readyz` | — | DB connectivity |

```bash
curl -s http://localhost:3001/api/healthz
```

---

## Auth

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | — |
| POST | `/api/auth/register/verify` | — |
| POST | `/api/auth/login` | — |
| POST | `/api/auth/refresh` | — |
| POST | `/api/auth/logout` | ✓ |
| GET | `/api/auth/me` | ✓ |
| POST | `/api/auth/forgot-password` | — |
| POST | `/api/auth/reset-password` | — |
| POST | `/api/auth/social` | — |
| POST | `/api/auth/device-token` | ✓ |

### Register (email OTP — two steps)

Signup stores a **pending** registration and emails a 6-digit OTP. Tokens are issued only after verify.
Full sequences, DFD, and schema: [CREATE_ACCOUNT_OTP.md](./CREATE_ACCOUNT_OTP.md).

```bash
# 1) Start — 200 message only (no tokens)
curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "alice@example.com",
    "password": "password123",
    "name": "Alice"
  }'

# 2) Verify — 201 accessToken, refreshToken, user
curl -s -X POST http://localhost:3001/api/auth/register/verify \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","token":"123456"}'
```

Requires `RESEND_API_KEY` + `EMAIL_FROM`. In non-production the OTP is also logged on the server.

### Login

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"password123"}'
```

### Social login (Google / Facebook)

```bash
# Google
curl -s -X POST http://localhost:3001/api/auth/social \
  -H 'Content-Type: application/json' \
  -d '{"provider":"google","idToken":"<google-id-token>"}'

# Facebook
curl -s -X POST http://localhost:3001/api/auth/social \
  -H 'Content-Type: application/json' \
  -d '{"provider":"facebook","idToken":"<facebook-access-token>"}'
```

Returns the same `{ accessToken, refreshToken, user }` shape as login. Creates the account
automatically if it does not exist yet. See [SOCIAL_LOGIN.md](./SOCIAL_LOGIN.md).

### Refresh

```bash
curl -s -X POST http://localhost:3001/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

### Device token (push)

```bash
curl -s -X POST http://localhost:3001/api/auth/device-token \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"token":"<fcm-token>","platform":"ios"}'
```

`platform`: `ios` | `android` | `web`. See [deeplink-push-notifications.md](./deeplink-push-notifications.md).

---

## Users

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/users/me` | ✓ |
| PATCH | `/api/users/me` | ✓ |
| GET | `/api/users/:userId` | — |
| GET | `/api/users/:userId/listings` | — |
| GET | `/api/users/:userId/reviews` | — |

### Update profile

```bash
curl -s -X PATCH http://localhost:3001/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"Alice T.","bio":"Trader in NYC"}'
```

---

## Media (S3 uploads)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/media/status` | — |
| POST | `/api/media/presign` | ✓ |

Setup: [S3_SETUP.md](./S3_SETUP.md)

### Presign one image

```bash
curl -s -X POST http://localhost:3001/api/media/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"contentType":"image/jpeg","filename":"photo.jpg"}' | jq
```

Upload the file with **PUT** to `uploadUrl` using header `Content-Type: image/jpeg`, then use `publicUrl` in listing `images`.

---

## Categories & listings

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/categories` | — | Category tree |
| GET | `/api/listings` | optional | Feed / browse |
| POST | `/api/listings` | ✓ | Create |
| GET | `/api/listings/trending` | optional | Trending + recent |
| GET | `/api/listings/:id` | — | Detail + seller card |
| PATCH | `/api/listings/:id` | ✓ owner | Edit fields |
| DELETE | `/api/listings/:id` | ✓ owner | Soft-delete |
| POST | `/api/listings/:id/view` | ✓ | Increment view count |
| POST | `/api/listings/:id/sold` | ✓ owner | Mark sold |
| GET | `/api/listings/:id/trade-partners` | ✓ owner | Past trade partners for sold flow |
| POST | `/api/listings/:id/images` | ✓ owner | Attach image URL |
| DELETE | `/api/listings/:id/images/:imageId` | ✓ owner | Remove image |

Feature docs: [LISTING_MANAGEMENT_FEATURE.md](./LISTING_MANAGEMENT_FEATURE.md),
[EDIT_LISTING_FLOW.md](./EDIT_LISTING_FLOW.md),
[MARK_AS_SOLD_FLOW.md](./MARK_AS_SOLD_FLOW.md),
[DELETE_LISTING_FLOW.md](./DELETE_LISTING_FLOW.md),
[LISTING_STATUS_AND_OWNER_FLOWS.md](./LISTING_STATUS_AND_OWNER_FLOWS.md).

### Create listing

`categoryId` must be a **category UUID** (from `GET /api/categories`), not a slug.
`images` must be **https** URLs from the media presign flow (not local paths).

```bash
# Resolve a category id first
CAT=$(curl -s http://localhost:3001/api/categories | jq -r '.[0].id')

curl -s -X POST http://localhost:3001/api/listings \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"title\": \"Vintage camera\",
    \"description\": \"Works great\",
    \"categoryId\": \"$CAT\",
    \"category\": \"Cameras\",
    \"estimatedValue\": 250,
    \"condition\": \"great\",
    \"acceptCashTopUps\": true,
    \"wantedCategoryIds\": [\"$CAT\"],
    \"wantedCategories\": [\"Cameras\"],
    \"details\": { \"ageRange\": \"5-10 years\", \"brand\": \"Canon\" },
    \"location\": { \"lat\": 37.77, \"lng\": -122.42, \"address\": \"San Francisco\", \"city\": \"San Francisco\" },
    \"images\": [\"https://cdn.example.com/listings/photo.jpg\"]
  }"
```

Response: `{ "listing": { ... } }` (barter-shaped fields).

### Browse feed

```bash
curl -s 'http://localhost:3001/api/listings?status=active'
```

Returns `{ "listings": [...], "items": [...], "nextCursor": "..." }`.

### Trending

```bash
curl -s http://localhost:3001/api/listings/trending
```

Returns `{ "trending": [...], "others": [...] }` — highest `right_swipe_count` first, then recent.

### Mark as sold

```bash
curl -s -X POST http://localhost:3001/api/listings/<listingId>/sold \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"soldMethod":"sold_for_cash"}'
```

`soldMethod`: `traded_on_barter` | `sold_for_cash` | `given_away`. For `traded_on_barter`, include `tradedWithUserId`.

### Add image URL

```bash
curl -s -X POST http://localhost:3001/api/listings/<listingId>/images \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://cdn.example.com/photo.jpg","position":0}'
```

---

## Search

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/search/listings` | optional |
| GET | `/api/search/trending` | optional |

Full design: [SEARCH_FEATURE.md](./SEARCH_FEATURE.md).

```bash
curl -s 'http://localhost:3001/api/search/listings?q=camera&limit=20'
curl -s http://localhost:3001/api/search/trending
```

---

## Sponsored ads

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/ads/active` | — |
| POST | `/api/ads/:id/click` | — |
| POST | `/api/ads/:id/impression` | — |

See [ADS.md](./ADS.md).

```bash
curl -s http://localhost:3001/api/ads/active
curl -s -X POST http://localhost:3001/api/ads/<adId>/impression
curl -s -X POST http://localhost:3001/api/ads/<adId>/click
```

---

## Swipe

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/swipe/deck` | ✓ |
| POST | `/api/swipe` | ✓ |
| GET | `/api/swipe/streak` | ✓ |

See [SWIPE_FEATURE.md](./SWIPE_FEATURE.md).

### Record swipe

```bash
curl -s -X POST http://localhost:3001/api/swipe \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"listingId":"<uuid>","direction":"right"}'
```

`direction`: `left` | `right`

---

## Offers

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/offers` | ✓ |
| GET | `/api/offers/received` | ✓ |
| GET | `/api/offers/sent` | ✓ |
| GET | `/api/offers/:offerId` | ✓ |
| POST | `/api/offers/:offerId/accept` | ✓ seller |
| POST | `/api/offers/:offerId/deny` | ✓ seller |
| POST | `/api/offers/:offerId/withdraw` | ✓ buyer |
| POST | `/api/offers/:offerId/counter` | ✓ |
| GET | `/api/offers/:offerId/counter` | ✓ |
| POST | `/api/offers/:offerId/counter/accept` | ✓ buyer |
| POST | `/api/offers/:offerId/counter/deny` | ✓ buyer |

Negotiation uses `offer_rounds` / `current_turn` / `round_count` (see [DB_SCHEMA.md](./DB_SCHEMA.md)).

### Create offer

```bash
curl -s -X POST http://localhost:3001/api/offers \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "listingId": "<seller-listing-uuid>",
    "offeredListingIds": ["<buyer-listing-uuid>"],
    "cashTopUpCents": 0,
    "buyerNote": "Happy to meet downtown"
  }'
```

### Accept (creates trade + conversation)

```bash
curl -s -X POST http://localhost:3001/api/offers/<offerId>/accept \
  -H "Authorization: Bearer $TOKEN"
```

---

## Trades

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/trades` | ✓ |
| GET | `/api/trades/:tradeId` | ✓ |
| PATCH | `/api/trades/:tradeId/meetup` | ✓ |
| POST | `/api/trades/:tradeId/complete` | ✓ |
| GET | `/api/trades/:tradeId/review-status` | ✓ |
| GET | `/api/trades/:tradeId/reviews/mine` | ✓ |
| POST | `/api/trades/:tradeId/reviews` | ✓ |

See [REVIEW_FEATURE.md](./REVIEW_FEATURE.md), [MEETUP_SUGGESTIONS.md](./MEETUP_SUGGESTIONS.md).

### Schedule meetup

```bash
curl -s -X PATCH http://localhost:3001/api/trades/<tradeId>/meetup \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"meetupScheduledAt":"2026-07-25T18:00:00.000Z","meetupLocation":"Union Square"}'
```

### Complete trade

```bash
curl -s -X POST http://localhost:3001/api/trades/<tradeId>/complete \
  -H "Authorization: Bearer $TOKEN"
```

### Leave review

```bash
curl -s -X POST http://localhost:3001/api/trades/<tradeId>/reviews \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"rating":5,"comment":"Great trade!","tags":["Fast reply","On time"]}'
```

---

## Chat & inbox

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/inbox/summary` | ✓ |
| GET | `/api/conversations` | ✓ |
| GET | `/api/conversations/:id` | ✓ |
| GET | `/api/conversations/:id/messages` | ✓ |
| POST | `/api/conversations/:id/messages` | ✓ |
| PATCH | `/api/conversations/:id/read` | ✓ |
| GET | `/api/conversations/:id/meetup-suggestions` | ✓ |
| PATCH | `/api/conversations/:id/meetup` | ✓ |

### Inbox badge counts

```bash
curl -s http://localhost:3001/api/inbox/summary \
  -H "Authorization: Bearer $TOKEN"
```

Returns `{ "actionNeededOffers", "unreadMessages", "total" }`.

### Send message

```bash
curl -s -X POST http://localhost:3001/api/conversations/<conversationId>/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"body":"Hey, when works to meet?"}'
```

### Mark conversation read

```bash
curl -s -X PATCH http://localhost:3001/api/conversations/<conversationId>/read \
  -H "Authorization: Bearer $TOKEN"
```

### Meetup via conversation

```bash
curl -s http://localhost:3001/api/conversations/<conversationId>/meetup-suggestions \
  -H "Authorization: Bearer $TOKEN"

curl -s -X PATCH http://localhost:3001/api/conversations/<conversationId>/meetup \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"meetupScheduledAt":"2026-07-25T18:00:00.000Z","meetupLocation":"Civic Center BART"}'
```

### WebSocket

Connect:

```text
ws://localhost:3001/ws/<conversationId>?token=<accessToken>
```

Send JSON (server adds `senderId` and broadcasts).

---

## Notifications

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/notifications` | ✓ |
| PATCH | `/api/notifications/:id/read` | ✓ |
| POST | `/api/notifications/read-all` | ✓ |

```bash
curl -s 'http://localhost:3001/api/notifications?unreadOnly=true' \
  -H "Authorization: Bearer $TOKEN"
```

Types include `reviews_revealed` (mutual review unlock). See [DB_SCHEMA.md](./DB_SCHEMA.md) enums.

---

## Mobile client mapping

| Mobile (`barter-stack`) | SwapHaven API |
|-------------------------|---------------|
| `API_BASE` + `/api/auth/login` | Same |
| `authRegister` / `authRegisterVerify` | OTP create-account |
| `createProduct` → POST `/api/listings` | UUID `categoryId` + https image URLs |
| `listListingsActive` → GET `/api/listings` | Reads `listings` key |
| Search / trending / ads / inbox | Matching `/api/search/*`, `/api/ads/*`, `/api/inbox/summary` |
| Bearer token | `Authorization: Bearer` |

See **barter-stack/mobile** `lib/core/services/api_endpoints.dart` and `barter_api_service.dart`.
