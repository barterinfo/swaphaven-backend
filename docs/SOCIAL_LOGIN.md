# Social login — `POST /api/auth/social`

Sign in (or sign up) with a Google or Facebook account. The endpoint verifies the provider
token server-side, then finds-or-creates the SwapHaven user by the verified email address
and returns the same token pair as `POST /api/auth/login`.

---

## Request

```http
POST /api/auth/social
Content-Type: application/json
```

```json
{
  "provider": "google",
  "idToken": "<id-token-from-provider>"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `provider` | `"google" \| "facebook"` | Yes | |
| `idToken` | string | Yes | Google ID token **or** Facebook user access token |

---

## Response `200 OK`

Same shape as `POST /api/auth/login`:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "alice@gmail.com",
    "name": "Alice"
  }
}
```

Use `accessToken` as `Authorization: Bearer <token>` on protected routes.
`refreshToken` follows the same lifecycle as regular login (rotate via `POST /api/auth/refresh`).

---

## Error responses

| Status | `error` code | When |
|--------|-------------|------|
| 400 | `validation` | `provider` not `google`/`facebook`, or `idToken` missing |
| 401 | `unauthorized` | Invalid or expired provider token, unverified Google email, or FB token not issued to this app |
| 409 | `conflict` | Verified email already registered with email + password |
| 502 | `bad_gateway` | Google or Facebook is temporarily unreachable — client should retry |
| 503 | `unavailable` | Google: no `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_IDS` configured. Facebook: credentials missing, or only one of `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` set |

---

## How it works

### Google

1. `google-auth-library`'s `OAuth2Client.verifyIdToken` validates the ID token signature,
   expiry, and audience against `GOOGLE_CLIENT_IDS` (comma-separated env) or legacy `GOOGLE_CLIENT_ID`.
2. The payload's `email_verified` flag must be `true`.
3. Network / 5xx errors from Google's cert endpoint surface as `502` so the client can retry;
   signature / audience errors are `401`.

### Facebook

1. **App-token check** — both `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` must be set.
   `GET /v21.0/debug_token` confirms the token is valid and was issued to *this* app.
   If either credential is missing, or only one is set, `provider: "facebook"` returns `503`.
2. `GET /v21.0/me?fields=id,name,email` with the token in the `Authorization: Bearer` header
   (not the query string, to prevent token leakage in proxy / APM logs).
3. Graph API upstream `5xx` responses map to `502` (retryable); invalid tokens are `401`.
4. The response must include an `email` field; Facebook accounts without a confirmed email
   return `401`.

### Account creation / linking

- If no SwapHaven account exists for the verified email, one is created automatically.
  The `password_hash` column stores a sentinel value so password login is disabled until
  the user sets a password via `POST /api/auth/forgot-password` / `reset-password`.
- If an account already exists from **email + password registration**, social sign-in returns
  `409 conflict` — the verified provider email does not prove ownership of that local account.
- If an account was created by a previous social sign-in (same email), tokens are issued again.
- Display name from the provider is trimmed and capped at 80 characters, matching the
  `POST /api/auth/register` limit.
- Concurrent double-submits (common on mobile) are safe: the second request that hits the
  unique-email constraint recovers by reading the row created by the first request.

---

## Configuration

| Variable | Required | Notes |
|----------|----------|-------|
| `GOOGLE_CLIENT_IDS` | For Google | Comma-separated OAuth client IDs (Web, Android, iOS). Legacy `GOOGLE_CLIENT_ID` (single ID) still works. Without any ID, `provider: "google"` returns 503. |
| `GOOGLE_CLIENT_ID` | For Google | Deprecated alias for a single client ID. |
| `FACEBOOK_APP_ID` | For Facebook | Both `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` required for `provider: "facebook"`. |
| `FACEBOOK_APP_SECRET` | For Facebook | Pair with `FACEBOOK_APP_ID`; half-configured credentials return 503. |

Add to `.env` (local) or Railway variables (production):

```env
GOOGLE_CLIENT_IDS=web-id.apps.googleusercontent.com,ios-id.apps.googleusercontent.com
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

### Getting a Google Client ID

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID**.
3. Choose **Android**, **iOS**, or **Web application** to match your mobile client.
4. Copy each client ID into `GOOGLE_CLIENT_IDS` (comma-separated) — the server only
   verifies tokens; it never redirects users.

### Getting Facebook app credentials

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps** → your app →
   **Settings** → **Basic**.
2. Copy **App ID** and **App Secret**.
3. Ensure `email` is listed under **Permissions** for your app's login product.

---

## Testing

### Automated tests

```bash
npm test                          # run full suite (includes social login tests)
npx vitest run tests/auth.test.ts # auth route tests only
npx vitest run tests/social-auth.test.ts  # lib unit tests (Google + Facebook verification)
```

The route tests (`tests/auth.test.ts`) mock `verifySocialToken` to avoid live provider calls:

| Test | What it covers |
|------|---------------|
| New account created, tokens returned | Happy path — new user |
| Concurrent double-submit returns same `user.id` | 23505 race recovery |
| Password account + same email social sign-in | `409 conflict` |
| Over-long provider name truncated to 80 chars | Display name cap |
| 502 returned when provider unreachable | Transport failure |
| 400 for unknown provider (`"twitter"`) | Zod validation |
| 400 for missing `idToken` | Zod validation |
| 401 for invalid token | Provider rejection |
| 503 when Google not configured | Missing env |
| 503 when Facebook not configured | Missing / half-configured FB creds |

The lib unit tests (`tests/social-auth.test.ts`) test `src/lib/social-auth.ts` directly with a
mocked `OAuth2Client` and a `fetch` spy:

| Test | What it covers |
|------|---------------|
| ETIMEDOUT → 502 | Google transport-code detection |
| 5xx response → 502 | Google upstream HTTP failure |
| Signature error → 401 | Google invalid token |
| Valid token → profile returned | Google happy path |
| Multiple client IDs in audience | `GOOGLE_CLIENT_IDS` |
| Token sent via `Authorization` header, not URL | Facebook header security |
| `fetch` throws → 502 | Facebook transport failure |
| debug_token / `/me` 5xx → 502 | Facebook upstream HTTP failure |

### Manual smoke test (real tokens required)

Obtain a real provider token on a device or using a test account, then:

```bash
# Google
curl -s -X POST http://localhost:3001/api/auth/social \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "google",
    "idToken": "<google-id-token>"
  }' | jq

# Facebook
curl -s -X POST http://localhost:3001/api/auth/social \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "facebook",
    "idToken": "<facebook-access-token>"
  }' | jq
```

Expected: `200` with `accessToken`, `refreshToken`, and `user`.

Use the returned `accessToken` to confirm the session works:

```bash
export TOKEN="<accessToken>"
curl -s http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Common errors during smoke test

| Symptom | Likely cause |
|---------|-------------|
| `503 unavailable` (Google) | `GOOGLE_CLIENT_IDS` / `GOOGLE_CLIENT_ID` not set in `.env` |
| `503 unavailable` (Facebook) | `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` missing or only one set |
| `409 conflict` | Email already registered with password — use password login |
| `401 unauthorized` (Google) | Token expired (they expire in ~1 hour) or client ID not in `GOOGLE_CLIENT_IDS` |
| `401 unauthorized` (Facebook) | Token expired, or `FACEBOOK_APP_ID` mismatch in debug_token check |
| `401 Facebook account has no email` | FB account has no confirmed email; ask user to add one in Facebook settings |
| `502 bad_gateway` | Transient network issue hitting Google or Facebook — retry |
