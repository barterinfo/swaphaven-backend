# Sponsored ads

House-controlled sponsored cards interleaved into the mobile swipe deck. Add or pause a row in `sponsored_ads` and the change appears on next app cold-start — no release required.

This is intentionally **not** a real ad-network integration (AdMob / AdSense won't render on an unapproved app anyway). It's a house-ad system: you own every impression, every row, every URL.

---

## Table of contents

1. [How it works end-to-end](#how-it-works-end-to-end)
2. [Data model](#data-model)
3. [Backend endpoint](#backend-endpoint)
4. [Mobile flow](#mobile-flow)
5. [Day-to-day: the `npm run ads` CLI](#day-to-day-the-npm-run-ads-cli)
6. [Edge cases: raw SQL](#edge-cases-raw-sql)
7. [Images and S3](#images-and-s3)
8. [Testing](#testing)
9. [Shipping a new ad — a full walkthrough](#shipping-a-new-ad--a-full-walkthrough)
10. [Troubleshooting](#troubleshooting)
11. [What's not built (yet)](#whats-not-built-yet)

---

## How it works end-to-end

```
 sponsored_ads table  ──►  GET /api/ads/active  ──►  activeAdsProvider  ──►  SwipeDiscoveryNotifier
   (Postgres, admin CRUD)     (public, no auth)       (Riverpod, session-cached)   (interleaves 1 ad per 5 listings)
                                                              │
                                                              └── on error / empty ──► _kFallbackAdSlots (hardcoded)
```

Key properties:

- **Public, unauthenticated fetch.** No user identity is sent — the ads are the same for everyone. That means the endpoint is safe to put behind a CDN later.
- **Session-cached on the client.** The mobile app fetches active ads **once per session** via `activeAdsProvider` (a Riverpod `FutureProvider`). It refreshes only on cold-start or `ref.invalidate(activeAdsProvider)`. That trades a small propagation delay for zero per-swipe latency.
- **Parallel with the deck load.** `SwipeDiscoveryNotifier.load()` fires the discovery + ads fetches together with `Future.wait`. Ads never add serial latency to the deck.
- **Fallback-safe.** If the API is down, empty, or slow (4 s timeout), the mobile app uses `_kFallbackAdSlots` — a small hardcoded rotation baked into the app — so the swipe experience never breaks because of an ads outage.
- **1 ad after every 5 listing cards** (`_kAdEvery = 5` in `mobile/lib/features/discovery/di/discovery_providers.dart`).

---

## Data model

Table: **`sponsored_ads`** — defined in `src/db/schema/sponsored_ads.ts`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK, default `gen_random_uuid()`) | Server-generated. |
| `sponsor_name` | `text` (not null) | Shown top-left on the card. |
| `tagline` | `text` (not null) | One-line pitch shown above the CTA. |
| `cta_label` | `text` (not null) | Button text (e.g. "Visit GreenLoop"). |
| `cta_color` | `text` (not null) | Hex `#RRGGBB` or `#AARRGGBB`. Bad hex → brand purple. |
| `cta_url` | `text` (nullable) | `https://…` or app deep link. `NULL` renders as a no-op badge. |
| `background_image_url` | `text` (not null, default `""`) | Empty = dark-gradient card. |
| `active` | `boolean` (not null, default `true`) | Master on/off switch. |
| `weight` | `int` (not null, default `1`) | Higher = shown first in rotation. |
| `starts_at` | `timestamptz` (nullable) | Campaign start. `NULL` = unbounded. |
| `ends_at` | `timestamptz` (nullable) | Campaign end. `NULL` = unbounded. |
| `created_at` | `timestamptz` (not null, `NOW()`) | |
| `updated_at` | `timestamptz` (not null, `NOW()`) | Bumped by the CLI on every write. |

Index: `sponsored_ads_active_idx` on `(active)`. The table stays tiny (dozens of rows at most), so the date-window predicates in the query are cheap even without extra indexes.

Migration: `drizzle/0007_add_sponsored_ads.sql`.

---

## Backend endpoint

**`GET /api/ads/active`** — `src/routes/ads.ts`, mounted at `/api/ads` in `src/app.ts`.

```http
GET /api/ads/active HTTP/1.1
```

```json
{
  "ads": [
    {
      "id": "8f31…",
      "sponsorName": "GreenLoop Thrift",
      "tagline": "Trade electronics for store credit",
      "ctaLabel": "Visit GreenLoop",
      "ctaColor": "#F59E0B",
      "ctaUrl": "https://greenloop.example",
      "backgroundImageUrl": "https://cdn.example.com/ads/8f31….jpg",
      "weight": 5
    }
  ]
}
```

Filters (all applied server-side):

```sql
active = true
AND (starts_at IS NULL OR starts_at <= now())
AND (ends_at   IS NULL OR ends_at   >  now())
ORDER BY weight DESC, id
```

- Public — no `Authorization` header required.
- Response is always shape-stable: `ads: []` when nothing qualifies.
- The order of the response is the order the mobile app rotates through (`adSlots[adIndex % adSlots.length]`), so `weight DESC` really does bias impressions toward higher-weight rows early in the session.
- Documented in OpenAPI (`src/openapi/spec.ts`) under the `Ads` tag.

---

## Mobile flow

The ads feature lives under `mobile/lib/features/ads/` and follows the standard feature-first clean architecture layout (domain → application → data → di → presentation).

**Wiring path (top to bottom):**

1. `service_providers.dart` — DI for `adsRemoteDataSourceProvider` → `adsRepositoryProvider` → `loadActiveAdsUseCaseProvider`.
2. `features/ads/di/ads_providers.dart` → `activeAdsProvider`
   - `FutureProvider<List<SponsoredAd>>`.
   - Calls `LoadActiveAdsUseCase` once per session.
   - On **any** error resolves to `const []` — the swipe UI never sees an ads error.
3. `features/discovery/di/discovery_providers.dart` → `SwipeDiscoveryNotifier.load()`
   - `Future.wait([_loadDiscovery(), _resolveAdSlots()])` — parallel fetch.
   - `_resolveAdSlots()` reads `activeAdsProvider.future`; empty result **or** any exception → `_kFallbackAdSlots`.
   - `_buildDeckItems(listings, adSlots)` interleaves one ad after every 5 listings.
   - The result is stored on `SwipeDiscoveryState.deckItems` (a `List<SwipeDeckCardData>`, a sealed union of listing / ad cards).
4. `features/discovery/presentation/swipe_discovery_screen.dart`
   - Passes `deckItems` to `SwipeCardStack`.
   - Routes `onAdCtaTap: (ad) => _adUrlLauncher.open(ad.ctaUrl)` — opens `LaunchMode.externalApplication` (external browser or system-registered deep-link handler; no in-app browser).
5. `packages/barter_ui/lib/widgets/swipe_card_stack.dart`
   - `switch` on `SwipeDeckCardData`: listings render as `SwipeListingCard`, ads as `SwipeAdCard`.
   - Ads participate in the same swipe gestures as listings — the deck advances the same way.
6. `SwipeDiscoveryNotifier.dismissAd()` — dropping an ad off the top does **not** decrement the daily swipe quota.

**What's cached vs. re-fetched:**

| Trigger | Fetches ads? |
|---|---|
| App cold-start | Yes (first `activeAdsProvider` read) |
| `selectCategory()` (filter change) | No — reuses `state.adSlots` |
| Manual pull-to-refresh calling `load()` | No — `activeAdsProvider` is still cached from earlier this session |
| `ref.invalidate(activeAdsProvider)` | Yes (currently unused; wire this into a debug/refresh button if you need faster propagation) |

---

## Day-to-day: the `npm run ads` CLI

**File:** `scripts/ads.ts`. Interactive, prompt-driven. Runs against whatever `DATABASE_URL` is in your environment.

```bash
cd swaphaven-api
npm run ads
```

You'll see:

```
Sponsored ads
DB: postgresql://***@localhost:5433/swaphaven
S3: swaphaven-media-dev (ap-southeast-1)

  1) Create a new ad
  2) List ads
  3) Pause an ad
  4) Activate an ad
  5) Delete an ad
  q) Quit
```

**Create flow** walks you through each field (with sensible defaults in `[brackets]`), lets you point at a local image path (auto-uploaded to S3), previews the row, and asks for confirmation before writing.

**Image field accepts three things:**
- Empty → no image (dark-gradient card).
- `https://…` URL → used as-is, no upload.
- Local path (`./banner.jpg`, `~/Downloads/x.png`) → uploaded to `s3://<bucket>/ads/<uuid>.<ext>` with `Cache-Control: public, max-age=31536000, immutable` and the CDN URL is stored on the row.

**Pointing at production.** The header line shows the DB URL (password masked) — always check before pressing `1)`. Recommended: keep a `.env.prod` and load it explicitly rather than sourcing your shell:

```bash
env $(grep -v '^#' .env.prod | xargs) npm run ads
```

Or one-shot:

```bash
DATABASE_URL="postgresql://…railway…" \
AWS_REGION=us-east-1 S3_MEDIA_BUCKET=swaphaven-media \
AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… \
  npm run ads
```

---

## Edge cases: raw SQL

The CLI covers 95% of ops. Reach for raw SQL only when you need bulk operations, an emergency kill switch, or something the CLI doesn't expose (e.g. scheduling multiple ads at once).

### Read

```sql
-- Everything, newest first
SELECT id, sponsor_name, tagline, active, weight, starts_at, ends_at, updated_at
FROM sponsored_ads
ORDER BY created_at DESC;

-- Only what the mobile app is currently serving
SELECT id, sponsor_name, weight
FROM sponsored_ads
WHERE active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >  now())
ORDER BY weight DESC, id;
```

### Insert

```sql
INSERT INTO sponsored_ads (
  sponsor_name, tagline, cta_label, cta_color, cta_url,
  background_image_url, weight, starts_at, ends_at
) VALUES (
  'GreenLoop Thrift',
  'Trade in old electronics for store credit',
  'Visit GreenLoop',
  '#F59E0B',
  'https://greenloop.example',
  'https://cdn.example.com/ads/greenloop.jpg',
  5,
  '2026-12-01T00:00:00Z',
  '2026-12-31T23:59:59Z'
)
RETURNING id;
```

### Update

```sql
-- Change copy
UPDATE sponsored_ads
SET tagline = 'Holiday special: 2× store credit',
    weight  = 10,
    updated_at = now()
WHERE id = '8f31…';

-- Extend a campaign
UPDATE sponsored_ads
SET ends_at = '2027-01-31T23:59:59Z',
    updated_at = now()
WHERE id = '8f31…';
```

### Toggle / kill switch

```sql
-- Pause one ad
UPDATE sponsored_ads SET active = false, updated_at = now() WHERE id = '8f31…';

-- Emergency: pause every ad (mobile falls back to hardcoded rotation)
UPDATE sponsored_ads SET active = false, updated_at = now();
```

### Delete

```sql
DELETE FROM sponsored_ads WHERE id = '8f31…';
```

Deletes are hard — there's no soft-delete column. If you might want to bring an ad back, `pause` it instead.

---

## Images and S3

Ads reuse the same S3 setup as listings — see [S3_SETUP.md](./S3_SETUP.md) for the bucket / IAM configuration.

- Env: `AWS_REGION`, `S3_MEDIA_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `CDN_BASE_URL`.
- Key format: `ads/<uuid>.<ext>` (content-addressed by uuid, so cache headers are safe to set aggressively).
- Allowed formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif`.
- The CLI uploads directly (`PutObject`) with server-side credentials — it doesn't use the mobile presigned-upload flow (`POST /api/media/presign`), because the CLI already has AWS creds and one round-trip is faster.
- Public URL is built by `publicUrlForKey(key)` from `src/lib/media.ts`: prefers `CDN_BASE_URL` if set, otherwise falls back to `https://<bucket>.s3.<region>.amazonaws.com/<key>`.

**Recommended image spec:**
- Aspect ratio: portrait (~3:4 or 9:16) — the swipe card is tall.
- Longest edge: 1200 px is plenty; anything larger is wasted bytes.
- Format: WebP or JPEG for photography, PNG only when transparency matters.
- Keep it under ~200 KB so the card is instant on cold networks.

---

## Testing

**Backend** — `tests/ads.test.ts`:

- Returns `ads: []` when nothing qualifies.
- Includes only active + in-window rows.
- Excludes inactive, not-yet-started, and expired rows.
- Orders by `weight DESC`, then `id`.

Run:

```bash
cd swaphaven-api
npm test -- ads
```

**Mobile** — `mobile/test/features/ads/`:

- `sponsored_ad_model_test.dart` — DTO parsing edge cases (missing fields, invalid types, extra fields).
- `ads_repository_impl_test.dart` — data-source → entity mapping.
- `ad_url_launcher_test.dart` — empty / invalid URLs are no-ops (don't crash).
- `mobile/test/features/discovery/swipe_discovery_notifier_test.dart` overrides `activeAdsProvider` with a fake and verifies:
  - Server ads are used when present.
  - Fallback list is used when the fetch fails or is empty.
  - `topAdCard` correctly identifies when an ad is at the front of the deck.

Run:

```bash
cd mobile
flutter test test/features/ads test/features/discovery
```

---

## Shipping a new ad — a full walkthrough

Let's say GreenLoop paid for a December campaign. Here's the flow start to finish.

**1. Verify local pipeline works.** From `swaphaven-api/`:

```bash
docker compose up -d postgres
npm run dev
```

In another shell:

```bash
curl -s http://localhost:3001/api/ads/active | jq
```

You should see `{ "ads": [] }` on a fresh DB.

**2. Point the CLI at local:**

```bash
cd swaphaven-api
npm run ads
```

Pick `1) Create a new ad` and fill it in:

```
Sponsor name: GreenLoop Thrift
Tagline (one line): Trade electronics for store credit
CTA button label [Learn more]: Visit GreenLoop
CTA button colour (hex #RRGGBB) [#F59E0B]:
CTA link (https:// or app deep link, blank for no-op): https://greenloop.example
Background image (local path or https URL, blank for none): ~/Downloads/greenloop.jpg
  Uploading greenloop.jpg → s3://swaphaven-media-dev/ads/8f31….jpg ...
  Done: https://cdn.example.com/ads/8f31….jpg
Rotation weight (higher = shown more often) [1]: 5
Campaign start (blank = no bound): 2026-12-01
Campaign end (blank = no bound): 2026-12-31

Review:
  id:       (new)
  sponsor:  GreenLoop Thrift
  ...

Create this ad? [Y/n]: y
```

**3. Verify the API is serving it:**

```bash
curl -s http://localhost:3001/api/ads/active | jq '.ads | length'
# 1
```

**4. Verify the mobile app picks it up.** Cold-start the app (or hot-restart Riverpod to invalidate the session cache). Swipe past 5 listings — the 6th card is the sponsored ad. Tap the CTA — it opens in an external browser.

**5. Ship to prod.** Same CLI, prod DB:

```bash
env $(grep -v '^#' .env.prod | xargs) npm run ads
```

Because the image was uploaded to your prod bucket already (assuming `.env.prod` also has the prod S3 vars), the URL is portable. Otherwise re-run the create against prod with the same local file — a new S3 object is written to the prod bucket.

**6. Watch for issues.** Currently there's no analytics on ad impressions or CTA clicks — this is house-ads level tracking, not ad-network level. If you need this, see [What's not built (yet)](#whats-not-built-yet).

---

## Troubleshooting

**Ad doesn't appear on device after inserting.**
- The mobile app caches the ads list for the session. Cold-start the app.
- Confirm the row satisfies the query: `active = true`, `starts_at <= now()`, `ends_at > now()`. The DB stores UTC; make sure your `starts_at` isn't in the future in UTC.
- Hit `GET /api/ads/active` directly — if the row is there, the app will pick it up on next cold-start.

**"S3 is not configured" when creating.**
- Missing one of `AWS_REGION` / `S3_MEDIA_BUCKET`. The row can still be created without an image (leave the image field blank) — the card will render on a dark gradient.

**Colour comes out purple in the app.**
- The hex parser expected `#RRGGBB` or `#AARRGGBB` (case-insensitive). Bad hex → `#7C3AED` fallback. Update the row and cold-start.

**CTA tap does nothing.**
- Empty / null `cta_url` renders the CTA as a badge (no launch). Update the row.
- Invalid URI (no scheme) is silently ignored by `AdUrlLauncher.open()`. Use a full `https://…` or a registered deep link scheme (e.g. `swaphaven://…`).

**API returns `ads: []` but the row is `active = true`.**
- Time-window filter. Check `starts_at` and `ends_at` against `now() at time zone 'UTC'`.

**Mobile always shows the fallback ads.**
- The `activeAdsProvider` fetch is timing out or failing. Check the API logs and confirm `GET /api/ads/active` responds within the 4 s client timeout. Any 5xx or timeout → fallback.

---

## What's not built (yet)

Deliberately deferred to keep scope tight. Wire these in when there's a real business need:

- **Impression / click tracking.** No `ad_impressions` table, no `POST /api/ads/:id/impression`. If you need CTR math or paying advertisers, add it — the ads UI already knows which ad is on top (`SwipeDiscoveryState.topAdCard`), and the CTA tap flows through `SwipeDiscoveryScreen` where a fire-and-forget POST would slot in cleanly.
- **Category targeting.** Skipped by design. Add a `target_categories text[]` column and filter both server-side (in `/api/ads/active`) and client-side (against the currently selected category).
- **Per-user frequency capping.** All users see 1 ad per 5 listings. Configurable per-user (e.g. paying subs at 1-in-8) would need to move the interleave decision server-side or expose the cadence via the ad row.
- **In-app browser.** CTA taps open the OS browser via `LaunchMode.externalApplication`. Swap to `LaunchMode.inAppWebView` if you want retention.
- **Real ad network.** AdMob / AdSense are drop-in replacements for `_kFallbackAdSlots` — build an ad-network data source that implements `AdsRepository` and swap the binding in `service_providers.dart`. The `SwipeCardStack` already renders whatever `AdCardData` you feed it.
- **Force-refresh from the app.** `ref.invalidate(activeAdsProvider)` works but isn't wired to a UI trigger. Add it to the discovery pull-to-refresh handler if propagation lag matters.
