# API guide

Base URL (local): `http://localhost:3001`  
Base URL (Railway): `https://<your-domain>.up.railway.app`

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
| POST | `/api/auth/login` | — |
| POST | `/api/auth/refresh` | — |
| POST | `/api/auth/logout` | ✓ |
| GET | `/api/auth/me` | ✓ |
| POST | `/api/auth/forgot-password` | — |
| POST | `/api/auth/reset-password` | — |
| POST | `/api/auth/social` | — |
| POST | `/api/auth/device-token` | ✓ |

### Register

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "alice@example.com",
    "password": "password123",
    "name": "Alice"
  }'
```

Response includes `accessToken`, `refreshToken`, `user`.

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
automatically if it does not exist yet. See [SOCIAL_LOGIN.md](./SOCIAL_LOGIN.md) for setup,
error codes, and test instructions.

### Refresh

```bash
curl -s -X POST http://localhost:3001/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

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

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/categories` | — |
| GET | `/api/listings` | optional |
| POST | `/api/listings` | ✓ |
| GET | `/api/listings/:id` | — |
| PATCH | `/api/listings/:id` | ✓ owner |
| DELETE | `/api/listings/:id` | ✓ owner |
| POST | `/api/listings/:id/images` | ✓ owner |
| DELETE | `/api/listings/:id/images/:imageId` | ✓ owner |

### Create listing (Flutter / barter-shaped body)

Matches the **barter-stack mobile** create-listing flow:

```bash
curl -s -X POST http://localhost:3001/api/listings \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Vintage camera",
    "description": "Works great",
    "categoryId": "cameras",
    "category": "Cameras",
    "estimatedValue": 250,
    "condition": "great",
    "acceptCashTopUps": true,
    "wantedCategoryIds": ["electronics","books"],
    "wantedCategories": ["Electronics","Books"],
    "details": { "ageRange": "5-10 years", "brand": "Canon" },
    "location": { "lat": 37.77, "lng": -122.42, "address": "San Francisco" },
    "images": ["/local/path/photo.jpg"]
  }'
```

Response: `{ "listing": { ... snake_case fields ... } }`

### Browse feed

```bash
curl -s 'http://localhost:3001/api/listings?status=active'
```

Returns `{ "listings": [...], "items": [...], "nextCursor": "..." }`.

### Add image URL

```bash
curl -s -X POST http://localhost:3001/api/listings/<listingId>/images \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://cdn.example.com/photo.jpg","position":0}'
```

---

## Swipe

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/swipe/deck` | ✓ |
| POST | `/api/swipe` | ✓ |
| GET | `/api/swipe/streak` | ✓ |

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
| POST | `/api/offers/:offerId/counter` | ✓ seller |
| GET | `/api/offers/:offerId/counter` | ✓ |
| POST | `/api/offers/:offerId/counter/accept` | ✓ buyer |
| POST | `/api/offers/:offerId/counter/deny` | ✓ buyer |

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
| POST | `/api/trades/:tradeId/complete` | ✓ |
| POST | `/api/trades/:tradeId/reviews` | ✓ |

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
  -d '{"rating":5,"comment":"Great trade!"}'
```

---

## Chat

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/conversations` | ✓ |
| GET | `/api/conversations/:id` | ✓ |
| GET | `/api/conversations/:id/messages` | ✓ |
| POST | `/api/conversations/:id/messages` | ✓ |

### Send message

```bash
curl -s -X POST http://localhost:3001/api/conversations/<conversationId>/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"body":"Hey, when works to meet?"}'
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

---

## Mobile client mapping

| Mobile (`barter-stack`) | SwapHaven API |
|-------------------------|---------------|
| `API_BASE` + `/api/auth/login` | Same |
| `createProduct` → POST `/api/listings` | Barter-shaped JSON body |
| `listListingsActive` → GET `/api/listings` | Reads `listings` key |
| Bearer token | `Authorization: Bearer` |

See **barter-stack/mobile** `lib/core/services/api_endpoints.dart` and `barter_api_service.dart`.
