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
| 502 | `bad_gateway` | Google or Facebook is temporarily unreachable — client should retry |
| 503 | `unavailable` | No Google client ID env vars are configured on the server |

---

## How it works

### Google

1. `google-auth-library`'s `OAuth2Client.verifyIdToken` validates the ID token signature,
   expiry, and audience (`aud`) against **any configured** of `GOOGLE_CLIENT_ID`,
   `GOOGLE_IOS_CLIENT_ID`, and `GOOGLE_ANDROID_CLIENT_ID`.
2. The payload's `email_verified` flag must be `true`.
3. Network / 5xx errors from Google's cert endpoint surface as `502` so the client can retry;
   signature / audience errors are `401`.

### Facebook

1. **Optional app-token check** — when both `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are
   set, `GET /v21.0/debug_token` confirms the token is valid and was issued to *this* app.
   Without the secrets the step is skipped (best-effort mode; any valid Facebook user token
   is accepted).
2. `GET /v21.0/me?fields=id,name,email` with the token in the `Authorization: Bearer` header
   (not the query string, to prevent token leakage in proxy / APM logs).
3. The response must include an `email` field; Facebook accounts without a confirmed email
   return `401`.

### Account creation / linking

- If no SwapHaven account exists for the verified email, one is created automatically.  
  The `password_hash` column is filled with a random unguessable value so password login is
  effectively disabled until the user sets a password via `POST /api/auth/forgot-password`.
- If an account already exists (e.g. the user previously registered with email + password),
  the social login merges into that row — the existing password is untouched.
- Display name from the provider is trimmed and capped at 80 characters, matching the
  `POST /api/auth/register` limit.
- Concurrent double-submits (common on mobile) are safe: the second request that hits the
  unique-email constraint recovers by reading the row created by the first request.

---

## Configuration

| Variable | Required | Notes |
|----------|----------|-------|
| `GOOGLE_CLIENT_ID` | For web Google sign-in | Web OAuth client ID from Google Cloud Console. Primary audience when the mobile app uses `GIDServerClientID`. |
| `GOOGLE_IOS_CLIENT_ID` | For native iOS without `GIDServerClientID` | iOS OAuth client ID. Required when the iOS app issues tokens with `aud` = the iOS client ID. |
| `GOOGLE_ANDROID_CLIENT_ID` | For native Android without server client ID | Android OAuth client ID. Required when the Android app issues tokens with `aud` = the Android client ID. |
| `FACEBOOK_APP_ID` | No | Facebook App ID. Both `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` must be set to enable app-token validation. |
| `FACEBOOK_APP_SECRET` | No | Facebook App Secret. Omit for best-effort FB verification. |

At least one Google client ID must be set for `provider: "google"`; otherwise the endpoint returns 503.

Add to `.env` (local) or Railway variables (production):

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

### Getting a Google Client ID

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID**.
3. Choose **Android**, **iOS**, or **Web application** to match your mobile client.
4. Copy the client ID — no extra console setup is needed beyond this; the server only
   verifies tokens, it never redirects users.

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
| Existing password account logs in (account linking) | Pre-existing user |
| Over-long provider name truncated to 80 chars | Display name cap |
| 502 returned when provider unreachable | Transport failure |
| 400 for unknown provider (`"twitter"`) | Zod validation |
| 400 for missing `idToken` | Zod validation |
| 401 for invalid token | Provider rejection |
| 503 when no Google client IDs configured | Missing env |

The lib unit tests (`tests/social-auth.test.ts`) test `src/lib/social-auth.ts` directly with a
mocked `OAuth2Client` and a `fetch` spy:

| Test | What it covers |
|------|---------------|
| ETIMEDOUT → 502 | Google transport-code detection |
| 5xx response → 502 | Google upstream HTTP failure |
| Signature error → 401 | Google invalid token |
| Valid token → profile returned | Google happy path |
| Multiple / mobile-only audiences passed to `verifyIdToken` | Google multi-client ID regression guard |
| No Google client IDs → 503 | Google unconfigured |
| Token sent via `Authorization` header, not URL | Facebook header security |
| `fetch` throws → 502 | Facebook transport failure |

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
| `503 unavailable` | No Google client ID env vars set (need at least one of web / iOS / Android) |
| `401 unauthorized` (Google) | Token expired (they expire in ~1 hour), or token `aud` does not match any configured client ID |
| `401 unauthorized` (Facebook) | Token expired, or `FACEBOOK_APP_ID` mismatch in debug_token check |
| `401 Facebook account has no email` | FB account has no confirmed email; ask user to add one in Facebook settings |
| `502 bad_gateway` | Transient network issue hitting Google or Facebook — retry |
