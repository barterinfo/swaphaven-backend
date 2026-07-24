# Share links & DNS — Railway + GoDaddy

This documents the **final** DNS / deep-link setup for product and profile sharing:

- Share URLs use **`https://www.bartersg.com`** (not the bare apex).
- **`www.bartersg.com`** is a Railway custom domain on **swaphaven-api**.
- Bare **`bartersg.com`** is forwarded in GoDaddy to `https://www.bartersg.com` (browsers only).
- Mobile App Links / Universal Links are configured for **`www.bartersg.com`**.

Related code:

| Area | Location |
|------|----------|
| AASA + assetlinks | `src/routes/wellKnown.ts` → `/.well-known/*` |
| Listing preview HTML | `src/routes/listingPreview.ts` → `GET /listings/:id` |
| Profile preview HTML | `src/routes/profilePreview.ts` → `GET /users/:id` |
| Flutter share base | `SHARE_BASE_URL` in `barter-stack/mobile/lib/config/env/*.env` |
| iOS Associated Domains | `applinks:www.bartersg.com` in `Runner.entitlements` |
| Android App Links | intent-filter host `www.bartersg.com`, paths `/listings`, `/users` |

---

## 1. Why `www` and not bare `bartersg.com`

Railway asks for a **CNAME on `@`** for the root hostname. **GoDaddy does not allow a CNAME on `@`** (root). You also had a Website Builder **A** record on `@`, which conflicts with a root CNAME.

**Decision:** make **`www.bartersg.com`** the canonical share / App Links host, and use GoDaddy **domain forwarding** so people who type `bartersg.com` still land on `www`.

| Host | Role |
|------|------|
| `www.bartersg.com` | Canonical — shares, Universal Links, App Links, API via custom domain |
| `bartersg.com` | Forward only (301) → `https://www.bartersg.com` |

Do **not** rely on bare-domain forwarding for App Links verification. Apple/Google must fetch `.well-known` from the **exact** host declared in the app (`www.bartersg.com`).

---

## 2. Railway — custom domain

### 2.1 Add the domain

1. Open [Railway](https://railway.app) → project → **swaphaven-api** service.
2. **Settings** → **Networking** / **Public Networking**.
3. **Custom Domain** → add **`www.bartersg.com`**.
4. Open **Configure DNS Records** and copy the values Railway shows (they look like):

| Type | Name (Railway UI) | Value (example — use yours) | Purpose |
|------|-------------------|-----------------------------|---------|
| CNAME | `@` | `oya2f7mh.up.railway.app` | Traffic for `www.bartersg.com` |
| TXT | `_railway-verify` | `railway-verify=…` | Ownership proof |

Railway’s **Name `@`** means “this hostname itself.” Because the hostname is `www.bartersg.com`, on GoDaddy that becomes Name **`www`**.

Wait until Railway shows the domain **Active** / certificate issued (yellow warnings clear).

### 2.2 Optional: bare `bartersg.com` on Railway

You can add `bartersg.com` as a second custom domain, but GoDaddy **cannot** create Railway’s root CNAME `@`. Skip bare Railway domain unless you move DNS to a provider with CNAME flattening (e.g. Cloudflare) or later point `@` with an **A** record to EC2 (see [EC2_MIGRATION.md](./EC2_MIGRATION.md)).

---

## 3. GoDaddy — DNS records

### 3.1 Open DNS

1. [GoDaddy Domain Portfolio](https://dcc.godaddy.com/) → **`bartersg.com`**.
2. **DNS** / **Manage DNS**.

### 3.2 Records for `www` → Railway

| Type | Name (GoDaddy) | Value | TTL |
|------|----------------|-------|-----|
| **CNAME** | `www` | Railway hostname, e.g. `oya2f7mh.up.railway.app` | 1 Hour |
| **TXT** | `_railway-verify.www` | Full `railway-verify=…` string from Railway for **www** | 1 Hour |

Notes:

- If GoDaddy says **“Record name www conflicts with another record”**, **edit or delete** the existing `www` record first — do not add a second one.
- Railway Name `_railway-verify` for hostname `www.bartersg.com` → GoDaddy Name **`_railway-verify.www`**.
- Do **not** put `https://` in the CNAME value.

### 3.3 Root / bare domain forwarding

Do **not** try CNAME `@` → Railway on GoDaddy (invalid name / not allowed).

Instead:

1. On the domain page, open **Forwarding** / **Domain Forwarding**.
2. Forward **domain** (`bartersg.com` / `@`):
   - **Forward to:** `https://www.bartersg.com`
   - **Type:** Permanent (**301**)
   - **Forward only** (not masking)
3. Save.

GoDaddy may manage an `@` **A** record for forwarding (e.g. Website Builder / forwarding target). That is expected for this setup. Leave the **`www` CNAME to Railway** intact.

### 3.4 What you should end up with (summary)

| Name | Type | Points to |
|------|------|-----------|
| `www` | CNAME | `*.up.railway.app` (Railway) |
| `_railway-verify.www` | TXT | Railway verify string |
| `@` | Forwarding (and/or A owned by forwarding) | → `https://www.bartersg.com` |

NS records (`nsXX.domaincontrol.com`) stay as GoDaddy defaults unless you move nameservers.

---

## 4. Backend env vars (Railway Variables)

Set on the **API** service (see `.env.example`). Values in Railway UI: **no wrapping quotes**.

| Variable | Required for deep links? | Notes |
|----------|--------------------------|--------|
| `APPLE_TEAM_ID` | **Yes (iOS)** | Apple Developer Team ID (e.g. `4GK8WMS4PB` from Xcode `DEVELOPMENT_TEAM`) |
| `ANDROID_SHA256_CERT_FINGERPRINT` | **Yes (Android)** | Signing cert SHA-256 (see §6 / §7) |
| `IOS_BUNDLE_ID` | Optional | Default `com.barter.app.barterMobile` |
| `ANDROID_PACKAGE_ID` | Optional | Default `com.barter.app.barter_mobile` |
| `IOS_APP_STORE_URL` | When published | Store redirect if app not installed |
| `ANDROID_PLAY_STORE_URL` | When published | Play Store redirect if app not installed |

Redeploy after changing these so `/.well-known/*` reflects the new values.

---

## 5. Flutter env

Already set in the mobile repo:

```env
SHARE_BASE_URL=https://www.bartersg.com
```

Files:

- `barter-stack/mobile/lib/config/env/dev.env`
- `barter-stack/mobile/lib/config/env/production.env`

Share buttons build:

- Listings: `https://www.bartersg.com/listings/<listingId>`
- Profiles: `https://www.bartersg.com/users/<userId>`

`API_BASE` can remain the Railway `*.up.railway.app` URL or later the custom domain; it is independent of `SHARE_BASE_URL`.

---

## 6. Verify (after DNS + deploy)

```bash
# Health
curl -sS https://www.bartersg.com/api/healthz

# Android Digital Asset Links
curl -sS https://www.bartersg.com/.well-known/assetlinks.json

# iOS Universal Links association
curl -sS https://www.bartersg.com/.well-known/apple-app-site-association

# Listing preview (use a real listing UUID)
curl -sS -A "Mozilla/5.0" https://www.bartersg.com/listings/<listing-uuid> | head

# Profile preview (use a real user UUID)
curl -sS -A "Mozilla/5.0" https://www.bartersg.com/users/<user-uuid> | head

# Bare domain should redirect to www
curl -sSI https://bartersg.com | head
```

Expected:

- `.well-known` returns JSON (not `{"error":"not_found",...}`).
- AASA `paths` include `/listings/*` and `/users/*`.
- `assetlinks.json` includes your package name and SHA-256 fingerprint(s).
- Bare domain responds with a **301/302** to `www`.

On a **real device** with the app installed and logged in:

1. Share a listing / profile from the app.
2. Open the link from Notes / Messages / WhatsApp.
3. App should open directly to that screen (or login → then that screen).

---

## 7. Current Android signing note (dev / pre-store)

Today, Flutter release builds still use the **debug** keystore (`signingConfig = debug` in `android/app/build.gradle.kts`).

For App Links on current `--release` installs, put the **debug** SHA-256 in Railway:

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

Copy the `SHA256:` line into `ANDROID_SHA256_CERT_FINGERPRINT`.

Or:

```bash
cd barter-stack/mobile/android && ./gradlew signingReport
```

---

## 8. Later — when releasing to App Store / Play Store

Do these before or as part of production release. Deep links will break for production users if you skip the signing / store steps.

### 8.1 Android — real release signing

1. Create a **release keystore** (or use Play App Signing).
2. Wire `signingConfigs.release` in `android/app/build.gradle.kts` (stop signing release with debug).
3. Get the fingerprint that **users’ installs** are signed with:

**If you upload yourself (no Play App Signing):**

```bash
keytool -list -v -keystore /path/to/upload-keystore.jks -alias <alias>
```

**If Google Play App Signing is on (typical):**

1. Play Console → your app → **Setup** → **App integrity** (or **App signing**).
2. Copy **App signing key certificate** → **SHA-256**.
3. Prefer that fingerprint over the upload-key fingerprint for `assetlinks.json`.

4. Set Railway:

```env
ANDROID_SHA256_CERT_FINGERPRINT=<play-or-release-sha256>
```

5. Redeploy API. Confirm `assetlinks.json`.
6. Reinstall a **Play-signed** (or store) build and re-test App Links.

You may temporarily list **both** debug and release fingerprints in code/config if you still need local testing; production should at least include the Play app-signing cert.

### 8.2 iOS — Apple Developer + Associated Domains

1. Ensure App ID has **Associated Domains** capability enabled.
2. Confirm `APPLE_TEAM_ID` on Railway matches the team that signs the App Store build.
3. Confirm entitlements ship `applinks:www.bartersg.com`.
4. After first production deploy of AASA, wait for Apple to refresh (can take time; reinstall app if stuck).
5. Test Universal Links from Notes/Safari (long-press link → “Open in …”).

### 8.3 Store URLs (not-installed fallback)

When listings exist:

```env
IOS_APP_STORE_URL=https://apps.apple.com/app/idXXXXXXXX
ANDROID_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.barter.app.barter_mobile
```

Redeploy API. Opening a share link without the app should redirect mobile browsers to the correct store.

### 8.4 Mobile production env

Confirm before store builds:

```env
API_BASE=https://www.bartersg.com
# or keep Railway API URL if you prefer splitting API host — share host must stay www:
SHARE_BASE_URL=https://www.bartersg.com
```

Ship a build that includes current deep-link + share code. After changing Associated Domains / intent-filters, users need a **new install** (not only hot reload).

### 8.5 Post-release checklist

- [ ] `https://www.bartersg.com/.well-known/assetlinks.json` shows Play/release SHA-256
- [ ] `https://www.bartersg.com/.well-known/apple-app-site-association` has correct `appID` (`TEAMID.bundleId`) and `/listings/*`, `/users/*`
- [ ] Store URLs set; no-app open goes to App Store / Play Store
- [ ] Cold start + warm start deep links work for listing and profile
- [ ] Logged-out user: link → login → lands on shared screen
- [ ] Bare `bartersg.com` still 301s to `www`
- [ ] Android: `adb shell pm get-app-links com.barter.app.barter_mobile` shows verified (when debugging)

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `{"error":"not_found"}` on `.well-known` | Old API deploy without well-known routes — redeploy swaphaven-api |
| GoDaddy “www conflicts” | Existing `www` record — edit/delete, don’t duplicate |
| “Invalid name” for CNAME `@` | GoDaddy forbids root CNAME — use `www` + forwarding |
| Link opens browser, not app | Missing/wrong `APPLE_TEAM_ID` or SHA-256; AASA/assetlinks not on `www`; app not rebuilt; Android verification failed |
| Share link uses bare domain | Flutter `SHARE_BASE_URL` still old — set `https://www.bartersg.com` and rebuild |
| Works in debug APK, not Play build | Still using debug fingerprint — add Play **app signing** SHA-256 |

---

## 10. Later cutover to EC2

When moving off Railway, replace the `www` CNAME with **A** records to the Elastic IP and drop Railway verify TXT records. See [EC2_MIGRATION.md §10](./EC2_MIGRATION.md#10-dns-godaddy--cutover-from-railway). Keep **`SHARE_BASE_URL=https://www.bartersg.com`** unless you deliberately migrate the app to the bare domain and update entitlements + intent-filters + AASA together.
