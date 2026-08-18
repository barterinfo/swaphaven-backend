# SwapHaven API — Railway security audit

**Audit date:** 18 August 2026  
**Scope:** `swaphaven-api` as currently deployed on Railway, including the API,
Railway Postgres, Docker configuration, production endpoints, S3 integration,
authentication, authorization, and runtime dependencies.

Future EC2/RDS infrastructure is outside this audit.

## Important interpretation

This is a point-in-time source and configuration review. It identified
vulnerabilities that could be exploited, but it found **no evidence that the
backend or database has already been compromised**. Confirming or excluding a
historical breach requires Railway access logs, database audit logs, S3 access
logs, and authentication/session telemetry.

Do not place credentials, database URLs, access tokens, environment values, or
customer data in this document.

## Priority order

1. Remove exact addresses, postal codes, and coordinates from public responses.
2. Fix cross-listing image deletion and offered-listing ownership validation.
3. Add refresh-session revocation and enforce suspensions on active sessions.
4. Limit S3 upload size, quantity, and orphan retention.
5. Upgrade vulnerable runtime dependencies, especially Drizzle ORM and `ws`.
6. Harden production CORS, API documentation, WebSocket tokens, and database TLS.

## Confirmed findings

### SEC-001 — Public disclosure of precise listing locations

**Severity:** High  
**Status:** Open  
**Evidence:** `src/lib/barter-listing.ts:195-224`,
`src/routes/listings.ts:80-122`, `src/routes/users.ts:108-133`,
`src/search/queries.ts:211-267`

Public listing, search, detail, and user-listing responses can include exact
latitude, longitude, street address, and postal code without requiring
authentication. `GET /api/listings` also returns raw database rows through
`items`, bypassing the serialized response shape.

An attacker could associate a seller's valuable items with a precise home or
storage location, creating stalking, harassment, or theft risk.

**Required remediation**

- Keep exact location data in Postgres for distance calculations.
- Public responses should return city/general area and `distance_miles` only.
- Remove `address`, `postal_code`, `lat`, and `lng` from public serializers.
- Replace raw `items: rawItems` responses with sanitized DTOs.
- Return exact coordinates only through an authenticated owner-only endpoint if
  editing requires them.

**Expected client impact:** Small. The mobile app already supports
`distance_miles` and displays city on item details. Feed parsing should
eventually stop using exact coordinates as a local distance fallback.

### SEC-002 — Cross-listing image deletion

**Severity:** Medium  
**Status:** Open  
**Evidence:** `src/routes/listings.ts:708-716`

The route verifies that the caller owns the listing, but the image deletion
query filters only by image ID. An authenticated user who owns any listing and
knows another listing's public image UUID may delete that image.

**Required remediation:** Delete using both image ID and listing ID, or load the
image first and verify that it belongs to the caller-owned listing.

### SEC-003 — Offers can include listings owned by other users

**Severity:** Medium  
**Status:** Open  
**Evidence:** `src/routes/offers.ts:95-158`

`offeredListingIds` are accepted without verifying that every listing is active
and owned by the authenticated buyer. A user can therefore represent another
seller's public listing as their own offered item.

**Required remediation:** Load every offered listing and require all IDs to be
active and owned by `req.user.sub`; reject missing, inactive, duplicated, or
foreign listings.

### SEC-004 — Presigned S3 uploads lack resource limits

**Severity:** Medium  
**Status:** Open  
**Evidence:** `src/routes/media.ts:44-74`, `src/lib/media.ts:92-151`

Authenticated users can repeatedly request batches of presigned uploads.
Current controls do not enforce object size, per-user storage, daily upload
volume, or cleanup of uploads that never become attached to a listing.

This can cause S3 storage and transfer charges or turn the bucket into
uncontrolled public storage.

**Required remediation**

- Prefer presigned POST policies with `content-length-range`.
- Add per-user request and storage quotas.
- Validate object MIME type and actual size after upload.
- Delete expired orphan uploads.
- Consider a private bucket served through CloudFront.

### SEC-005 — Refresh tokens cannot be revoked

**Severity:** Medium  
**Status:** Open  
**Evidence:** `src/middleware/auth.ts:57-74`,
`src/routes/auth.ts:307-338`, `src/routes/auth.ts:453-463`

A stolen refresh token can remain usable for its full lifetime after logout,
password reset, or rotation because refresh sessions are not persisted and old
tokens are not revoked.

**Required remediation:** Store hashed refresh sessions with rotation and reuse
detection, or add a per-user token version that is incremented on logout,
password reset, suspension, and security-sensitive account changes.

### SEC-006 — Permanent account deletion lacks recent reauthentication

**Severity:** Medium  
**Status:** Open  
**Evidence:** `src/routes/account-deletion.ts:15-55`

A valid access token is sufficient to permanently delete the account and
related data. Password verification is optional, and social accounts are not
required to provide a fresh provider assertion.

**Required remediation:** Require recent authentication. Password accounts
should confirm their password; social accounts should provide a fresh verified
provider token.

### SEC-007 — Suspension does not invalidate active access tokens

**Severity:** Medium  
**Status:** Open  
**Evidence:** `src/middleware/auth.ts:19-37`,
`src/lib/moderation-actions.ts:85-123`

Suspension blocks future login or refresh, but an already issued access token
continues to authorize protected requests until it expires.

**Required remediation:** Check account status on protected requests, preferably
with a short-lived cache, and revoke sessions through a token version or
persisted session records.

### SEC-008 — Registration reveals whether an email exists

**Severity:** Low  
**Status:** Open  
**Evidence:** `src/routes/auth.ts:78-81`

Registration responds differently for registered and unregistered email
addresses. Attackers can test whether someone has a SwapHaven account. Existing
auth rate limiting reduces bulk enumeration but does not eliminate it.

**Required remediation:** Return an indistinguishable response and notify the
existing account separately when appropriate.

## Defense-in-depth findings

### SEC-009 — Production CORS accepts arbitrary origins

**Severity:** Low  
**Status:** Open  
**Evidence:** `src/app.ts:48-61`

The current bearer-token model prevents automatic browser credential
attachment, so this is not presently a standalone account-takeover path.
However, arbitrary origins increase exposure and could become dangerous if
cookie authentication is introduced.

**Required remediation:** Allow only known production web origins and disable
credentialed CORS unless browser cookies are required.

### SEC-010 — API documentation and readiness are public

**Severity:** Low  
**Status:** Open  
**Evidence:** `src/app.ts:87-105`, `src/app.ts:133-151`

Public OpenAPI/Swagger and database readiness endpoints simplify
reconnaissance.

**Required remediation:** Disable or authenticate production API docs. Keep
readiness internal where Railway permits; retain a minimal public liveness
endpoint for Railway health checks.

### SEC-011 — Railway Postgres certificate is not strictly verified

**Severity:** Medium (defense in depth)  
**Status:** Open  
**Evidence:** `src/db/client.ts`, `src/db/migrate.ts`

Railway database traffic is encrypted, but compatibility mode uses
`rejectUnauthorized: false`, so the database server's certificate identity is
not strictly verified. Exploitation requires a network interception or
compromised platform/network position; no ordinary internet-only exploit was
confirmed.

**Required remediation:** Obtain the appropriate Railway/Postgres CA, enable
strict certificate and hostname verification, and reject `sslmode=disable` in
production.

### SEC-012 — Known vulnerable dependencies

**Severity:** Medium  
**Status:** Open  
**Evidence:** `package.json`, `package-lock.json`

The dependency audit reported 21 advisories across the full dependency tree:
8 high, 12 moderate, and 1 low. Many affect development or transitive tooling.
The main runtime priorities are:

- `drizzle-orm` below `0.45.2`: improperly escaped SQL identifiers.
- `ws` below `8.21.0`: memory-exhaustion denial of service through fragmented
  WebSocket messages.

No reachable user-controlled SQL identifier sink was confirmed during this
audit, but the vulnerable ORM should still be upgraded.

**Required remediation:** Upgrade direct dependencies to fixed releases, update
the lockfile, then run type checking, tests, migration validation, and a
production Docker build. Do not blindly run a breaking `npm audit fix --force`.

### SEC-013 — WebSocket access tokens appear in URLs

**Severity:** Low  
**Status:** Open  
**Evidence:** `src/lib/ws.ts:11-16`

Query-string access tokens can be retained by Railway, reverse-proxy, or
application logs.

**Required remediation:** Exchange the normal access token for a short-lived,
single-use WebSocket ticket and ensure query strings are redacted from logs.

## Existing controls that reduce risk

- Drizzle parameter binding is used consistently; no user-built raw SQL query
  was confirmed.
- Passwords use bcrypt, and OTPs use cryptographic randomness, expiry, attempt
  limits, and constant-time comparisons.
- Google and Facebook tokens receive provider/application validation.
- Email addresses are HMAC-indexed, AES-GCM encrypted at rest, and masked in
  responses.
- Most listing, offer, trade, and conversation mutations already enforce owner
  or participant authorization.
- API and authentication rate limits are enabled.
- Helmet/HSTS, generic production errors, and request-body limits are enabled.
- The production container runs as a non-root user and installs from the
  lockfile using `npm ci`.
- Production secret files are ignored and excluded from the Docker build
  context.

## Verification after remediation

For each fix:

1. Add an integration test that demonstrates the previous exploit and verifies
   the corrected behavior.
2. Run `npm run typecheck`, `npm test`, and `npm run build`.
3. Build the production Docker image.
4. Deploy through Railway and verify `/api/healthz` and `/api/readyz`.
5. Test authorization with two independent users and one anonymous client.
6. Confirm API responses and logs contain no credentials, precise locations, or
   unnecessary personal data.

## Audit maintenance

Review this document after authentication, listing-location, media-upload,
WebSocket, database, or deployment changes. Mark findings resolved only after a
regression test exists and the Railway deployment has been verified.
