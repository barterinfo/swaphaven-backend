# Sponsored ads

House-controlled sponsored cards interleaved into the mobile swipe deck. Add or pause a row in `sponsored_ads` and the change appears on next app cold-start — no release required.

This is intentionally **not** a real ad-network integration (AdMob / AdSense won't render on an unapproved app anyway). It's a house-ad system: you own every impression, every row, every URL.

---

## Table of contents

1. [Quick start](#quick-start)
2. [How it works end-to-end](#how-it-works-end-to-end)
3. [Data model](#data-model)
4. [Backend endpoint](#backend-endpoint)
5. [Mobile flow](#mobile-flow)
6. [The `npm run ads` CLI](#the-npm-run-ads-cli)
7. [Field reference: weight, start, end](#field-reference-weight-start-end)
8. [Images and S3](#images-and-s3)
9. [Local vs Railway S3](#local-vs-railway-s3)
10. [Edge cases: raw SQL](#edge-cases-raw-sql)
11. [Testing](#testing)
12. [Shipping a new ad — full walkthrough](#shipping-a-new-ad--full-walkthrough)
13. [Troubleshooting](#troubleshooting)
14. [What's not built (yet)](#whats-not-built-yet)

---

## Quick start

```bash
cd swaphaven-api
npm run ads
```

1. Choose **`1) Create a new ad`**
2. Fill in sponsor name, tagline, CTA label/colour, and CTA link
3. For background image, choose **`2) Local file`** and paste a path like `~/Downloads/banner.png` — the script uploads to S3
4. Confirm → cold-start the mobile app to see it in the swipe deck (after 5 listing cards)

**Prerequisites:** `DATABASE_URL` in `.env`, and S3 vars matching Railway (see [Local vs Railway S3](#local-vs-railway-s3)). IAM must allow `ads/*` — see [Images and S3](#images-and-s3).

---

## How it works end-to-end

```
 sponsored_ads table  ──►  GET /api/ads/active  ──►  activeAdsProvider  ──►  SwipeDiscoveryNotifier
   (Postgres, admin CRUD)     (public, no auth)       (Riverpod, session-cached)   (interleaves 1 ad per 5 listings)
                                                              │
                                                              └── on error / empty ──► no ad slots (listings only)
```

Key properties:

- **Public, unauthenticated fetch.** No user identity is sent — the ads are the same for everyone.
- **Session-cached on the client.** The mobile app fetches active ads **once per session** via `activeAdsProvider`. Refreshes on cold-start or `ref.invalidate(activeAdsProvider)`.
- **Parallel with the deck load.** `SwipeDiscoveryNotifier.load()` fetches discovery + ads with `Future.wait` — ads never add serial latency.
- **Empty-safe.** API down, empty, or slow (4 s timeout) → deck shows listings only; no placeholder ads.
- **1 ad after every 5 listing cards** (`_kAdEvery = 5`).

---

## Data model

Table: **`sponsored_ads`** — `src/db/schema/sponsored_ads.ts`. Migration: `drizzle/0007_add_sponsored_ads.sql`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | Server-generated. |
| `sponsor_name` | `text` | Shown on the card. |
| `tagline` | `text` | One-line pitch above the CTA. |
| `cta_label` | `text` | Button text (e.g. "Visit GreenLoop"). |
| `cta_color` | `text` | Hex `#RRGGBB`. Bad hex → brand purple. |
| `cta_url` | `text` (nullable) | Where the CTA opens. `NULL` = no-op. |
| `background_image_url` | `text` | Empty = dark gradient. Must be a **direct image URL**. |
| `active` | `boolean` | Master on/off. Default `true`. |
| `weight` | `int` | Higher = shown earlier in rotation. Default `1`. |
| `starts_at` / `ends_at` | `timestamptz` | Optional campaign window. `NULL` = unbounded. |

---

## Backend endpoint

**`GET /api/ads/active`** — public, no auth. See OpenAPI under the `Ads` tag.

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
      "backgroundImageUrl": "https://swaphaven-media-prod.s3.ap-southeast-1.amazonaws.com/ads/8f31….jpg",
      "weight": 5
    }
  ]
}
```

Server filters: `active = true`, date window, `ORDER BY weight DESC, id`.

---

## Mobile flow

| Layer | File | Role |
|-------|------|------|
| DI | `service_providers.dart` | Wires ads repository + use case |
| Cache | `features/ads/di/ads_providers.dart` | `activeAdsProvider` — one fetch per session |
| Deck | `features/discovery/di/discovery_providers.dart` | Interleaves ads; omits slots when API is empty or down |
| Screen | `swipe_discovery_screen.dart` | CTA → `AdUrlLauncher` (external browser / deep link) |
| UI | `packages/barter_ui/…/swipe_ad_card.dart` | Card layout + `BarterCachedImage` |

Dismissing an ad does **not** decrement the daily swipe quota.

| Trigger | Re-fetches ads? |
|---------|-----------------|
| App cold-start | Yes |
| Category filter change | No |
| Pull-to-refresh (today) | No — cache still held |

---

## The `npm run ads` CLI

**File:** `scripts/ads.ts` · **Command:** `npm run ads`

Interactive menu — no flags required:

```
Sponsored ads
DB: postgresql://***@localhost:5433/swaphaven
S3: swaphaven-media-prod (ap-southeast-1)

  1) Create a new ad
  2) List ads
  3) Update an ad
  4) Pause an ad
  5) Activate an ad
  6) Delete an ad
  q) Quit
```

Always check the **DB** and **S3** header before writing — it shows which environment you're pointed at.

### Create / update fields

| Prompt | Required | Notes |
|--------|----------|-------|
| Sponsor name | Yes | Display name on the card |
| Tagline | Yes | One line |
| CTA button label | Yes | Default: `Learn more` |
| CTA button colour | Yes | Hex `#RRGGBB`. Default: `#F59E0B` |
| CTA link | No | Any URL or deep link — **where the button goes** |
| Background image | No | See below — **not the same as CTA link** |
| Rotation weight | No | Default `1`. See [Field reference](#field-reference-weight-start-end) |
| Campaign start / end | No | Optional schedule. See [Field reference](#field-reference-weight-start-end) |

Every write shows a **review + confirm** step before hitting the database.

### Background image — choose one

When creating or updating, the script asks:

```
  Background image — choose one:
    1) None          dark gradient card (no photo)
    2) Local file    upload from your machine → S3
                     e.g. ~/Downloads/banner.jpg
                          ./assets/promo.png
    3) Remote URL    use an already-hosted direct image link
                     e.g. https://cdn.example.com/ads/banner.jpg
                          https://images.unsplash.com/photo-…?w=600
                     ✗ not a web page — must point at .jpg / .png / .webp
```

**Option 2 — Local file (recommended)**

- Paste a path on your machine. Quotes are stripped automatically (`'/path/file.png'` works).
- File is uploaded to `s3://<bucket>/ads/<uuid>.<ext>`.
- You should see:

  ```
  Uploading banner.png → s3://swaphaven-media-prod/ads/….png ...
  Done: https://swaphaven-media-prod.s3.ap-southeast-1.amazonaws.com/ads/….png
  ```

- That `Done:` URL is what gets saved — and what the app loads.

**Option 3 — Remote URL**

- Must be a **direct image link** (URL ends in `.jpg`, `.png`, `.webp`, etc.).
- Web pages (articles, product pages) **will not work** as card backgrounds.

**CTA link ≠ background image**

| Field | Example | Purpose |
|-------|---------|---------|
| CTA link | `https://www.biography.com/athletes/…` | Opens when user taps the button |
| Background image | `~/Downloads/banner.png` → S3 URL | Photo shown on the card |

Pasting the same article URL into both fields produces an ad with a broken background.

### Pointing at production

```bash
env $(grep -v '^#' .env.prod | xargs) npm run ads
```

Or copy Railway's `DATABASE_URL` + S3 vars into local `.env` when you intentionally want local CLI → prod resources.

---

## Field reference: weight, start, end

These three prompts are **optional**. Leave them blank for a simple always-on ad with normal priority.

### Rotation weight

Controls **which ad appears first** when several are active, and the order they rotate through.

The API returns active ads sorted by **weight highest first**, then by `id`. The mobile app cycles through that list as it inserts one ad after every 5 listing cards.

| Weight | Effect |
|--------|--------|
| `1` (default) | Normal priority |
| `5` | Shown **before** weight-1 ads in the rotation |
| `10` | Even higher priority |

**Example:** GreenLoop at weight **10** and SwiftShip at weight **1** — GreenLoop appears first in the rotation and comes back around sooner relative to SwiftShip.

Weight is **ordering/priority**, not “show this ad N× more times per user”. With only one active ad, weight has no visible effect.

**What to enter:** A whole number. Press Enter to accept the default.

```
Rotation weight (higher = shown more often) [1]: 5
```

---

### Campaign start (`starts_at`)

The ad is **hidden until this date/time**. Before then, `GET /api/ads/active` does not return it.

**What to enter:** A date/time, or **blank** = no start limit (live immediately).

| Input | Meaning |
|-------|---------|
| *(blank)* | Starts immediately |
| `2026-12-01` | 1 Dec 2026, midnight **local time** |
| `2026-12-01T09:00:00` | 1 Dec 2026, 09:00 local |
| `2026-12-01T09:00:00Z` | 1 Dec 2026, 09:00 **UTC** (recommended for prod) |

```
Campaign start (blank = no bound): 2026-12-01
```

---

### Campaign end (`ends_at`)

The ad **stops showing after this date/time**. Once passed, it is excluded from the API (like an automatic pause).

**What to enter:** Same formats as campaign start, or **blank** = runs until you pause or delete it.

The API filter is `ends_at > now()` — the end time is **exclusive**. An end of `2026-12-31T00:00:00Z` means the ad stops at that instant.

```
Campaign end (blank = no bound): 2026-12-31
```

---

### Common combinations

| Goal | Start | End | Weight |
|------|-------|-----|--------|
| Simple always-on ad | blank | blank | `1` |
| Limited-time promo | `2026-12-01` | `2026-12-31` | `5` |
| Featured sponsor (always on, show first) | blank | blank | `10` |
| Future campaign (not live yet) | `2027-01-01` | blank | `1` |

### Tips

1. **Leave start/end blank** unless you need scheduling — most house ads don't.
2. **Use UTC in production** (`…Z` suffix) to avoid timezone surprises.
3. **Weight only matters with multiple active ads.**
4. **Changes need an app cold-start** — ads are cached per session.
5. **Pause vs dates:** `Pause` in the CLI is instant manual off; start/end are automatic scheduling.

---

## Images and S3

Ads share the same S3 bucket as listing photos but use a separate prefix: **`ads/`** (listings use `listings/`).

Full bucket setup: [S3_SETUP.md](./S3_SETUP.md).

### Environment variables

In `swaphaven-api/.env`:

```env
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
S3_MEDIA_BUCKET=swaphaven-media-prod
# Optional — base URL only, no path:
# CDN_BASE_URL=https://swaphaven-media-prod.s3.ap-southeast-1.amazonaws.com
```

### IAM policy (required for local CLI uploads)

Your IAM user needs **`ads/*`** in addition to `listings/*`:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject"],
  "Resource": [
    "arn:aws:s3:::swaphaven-media-prod/listings/*",
    "arn:aws:s3:::swaphaven-media-prod/ads/*"
  ]
}
```

Without `ads/*` you'll see:

```
User … is not authorized to perform: s3:PutObject on resource: …/ads/….
```

Listing uploads can still work — they use a different prefix.

### Bucket policy (required for the app to display images)

Public read on both prefixes:

```json
"Resource": [
  "arn:aws:s3:::swaphaven-media-prod/listings/*",
  "arn:aws:s3:::swaphaven-media-prod/ads/*"
]
```

### Image spec

- Portrait aspect (~3:4 or 9:16) — swipe cards are tall
- ~1200 px longest edge, WebP/JPEG/PNG, under ~200 KB
- Allowed extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif`

---

## Local vs Railway S3

Listing uploads working on Railway does **not** guarantee the ads CLI works locally. Common mismatches:

| Problem | Local `.env` mistake | Fix |
|---------|---------------------|-----|
| `The specified bucket does not exist` | `S3_MEDIA_BUCKET=swaphaven-media-dev` (placeholder) | Use the **same bucket name as Railway** (e.g. `swaphaven-media-prod`) |
| `not authorized … ads/…` | IAM only has `listings/*` | Add `ads/*` to IAM + bucket policy (above) |
| Image URL looks wrong | `CDN_BASE_URL` set to a full listing image path | Use base URL only, or leave unset |
| Ad shows broken image | `background_image_url` is a web page, not an image | Re-upload via CLI option 2, or use a direct `.jpg` URL |

**Recommended:** copy `S3_MEDIA_BUCKET`, `AWS_REGION`, and AWS keys from Railway API service variables into local `.env`. Do not use `.env.example`'s `swaphaven-media-dev` unless you've actually created that bucket.

Verify S3 is wired:

```bash
curl -s http://localhost:3001/api/media/status
# { "configured": true }
```

---

## Edge cases: raw SQL

The CLI covers day-to-day ops. Use SQL for bulk changes or emergencies.

```sql
-- Active ads the app is serving right now
SELECT id, sponsor_name, weight, background_image_url
FROM sponsored_ads
WHERE active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >  now())
ORDER BY weight DESC, id;

-- Pause one ad
UPDATE sponsored_ads SET active = false, updated_at = now() WHERE id = '…';

-- Emergency kill switch (mobile falls back to hardcoded ads)
UPDATE sponsored_ads SET active = false, updated_at = now();

-- Fix a bad image URL after mistaken paste
UPDATE sponsored_ads
SET background_image_url = 'https://swaphaven-media-prod.s3.ap-southeast-1.amazonaws.com/ads/….png',
    updated_at = now()
WHERE id = '…';
```

See earlier doc versions or `src/db/schema/sponsored_ads.ts` for full INSERT templates.

---

## Testing

**Backend:**

```bash
cd swaphaven-api
npm test -- ads
```

**Mobile:**

```bash
cd mobile
flutter test test/features/ads test/features/discovery
```

---

## Shipping a new ad — full walkthrough

**1. Start API + confirm endpoint**

```bash
docker compose up -d postgres
npm run dev
curl -s http://localhost:3001/api/ads/active | jq
```

**2. Create via CLI**

```bash
npm run ads
```

```
Choose: 1

Sponsor name: GreenLoop Thrift
Tagline: Trade electronics for store credit
CTA button label [Learn more]: Visit GreenLoop
CTA button colour [#F59E0B]:
CTA link: https://greenloop.example

Background image — choose one: 2
Path to image file: ~/Downloads/greenloop.jpg
  Uploading greenloop.jpg → s3://swaphaven-media-prod/ads/….jpg ...
  Done: https://swaphaven-media-prod.s3.ap-southeast-1.amazonaws.com/ads/….jpg

Create this ad? [Y/n]: y
```

**3. Verify API**

```bash
curl -s http://localhost:3001/api/ads/active | jq '.ads[0].backgroundImageUrl'
```

**4. Verify mobile** — cold-start app, swipe past 5 listings, tap CTA.

**5. Prod** — same CLI with prod `DATABASE_URL` / S3 in `.env`, or `env $(grep -v '^#' .env.prod | xargs) npm run ads`.

---

## Troubleshooting

### Ad doesn't appear on device

- **Cold-start the app** — ads are session-cached.
- Check `GET /api/ads/active` — if the row is there, the app will pick it up on next cold-start.
- Confirm `active = true` and date window (`starts_at` / `ends_at`) in UTC.

### Background image broken / empty on card

- **`background_image_url` is a web page**, not an image file. Re-run `npm run ads` → **3) Update** → change image → **2) Local file**.
- Open the saved URL in a browser — you should see the image directly, not an HTML page.
- Confirm bucket policy allows public `GetObject` on `ads/*`.

### `The specified bucket does not exist`

- Local `S3_MEDIA_BUCKET` doesn't match a real bucket. Align with Railway (see [Local vs Railway S3](#local-vs-railway-s3)).

### `not authorized to perform: s3:PutObject … ads/…`

- IAM user missing `ads/*`. Add it — listing-only policies are not enough.

### `Unsupported extension ".jpeg'"` (quote in extension)

- Path was pasted with wrapping quotes. The script strips these now; retry without quotes or with them — both work.

### CTA works but image doesn't (or vice versa)

- These are **separate fields**. CTA link = button destination. Background = image file on disk (→ S3) or direct image URL.

### Mobile shows no ads (expected when none are configured)

- `GET /api/ads/active` returned `[]` or failed. Create/activate an ad with `npm run ads`, or check the API is running and rows qualify (active + in date window).

### Colour is purple instead of your hex

- Invalid hex in `cta_color`. Use `#RRGGBB` (e.g. `#F59E0B`).

---

## Analytics (impressions & clicks)

When an ad card **reaches the top of the swipe deck**, the app fires `POST /api/ads/{id}/impression` (no auth, fire-and-forget). When a user **taps the CTA** or **right-swipes** an ad card, it fires `POST /api/ads/{id}/click`. Both endpoints increment denormalized counters on the row.

Check totals:

```sql
SELECT id, sponsor_name, impression_count, click_count, updated_at
FROM sponsored_ads
ORDER BY impression_count DESC;
```

Or run `npm run ads` → **1) List all ads** — each row shows `impressions N` and `clicks N`.

---

## What's not built (yet)

- **Category targeting** — all users see the same ads
- **Per-user frequency cap** — fixed at 1 ad per 5 listings
- **In-app browser for CTA** — opens external browser today
- **Real ad network** — house ads only today; plug in AdMob etc. later if needed
- **Force-refresh in app** — wire `ref.invalidate(activeAdsProvider)` to pull-to-refresh if needed
