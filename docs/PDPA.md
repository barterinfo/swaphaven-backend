# PDPA — controls already managed

Engineering record of **Singapore PDPA-oriented controls already implemented** in Barter (swaphaven-api + barter-stack mobile). This is **not legal advice** and does not replace counsel review or the live Privacy Policy HTML.

**Public policy:** `GET /privacy` (`src/routes/legal.ts`).  
**Location product detail:** [LOCATION_PIN_PRIVACY.md](./LOCATION_PIN_PRIVACY.md).

---

## Scope

What we already do so location and related personal data are collected for marketplace use, kept for distance/meetup on the server, and **not freely disclosed** as exact homes, units, or street addresses to other users.

---

## Location (implemented)

| Control | Status | Where |
|---------|--------|--------|
| Listing publish requires a **tapped suggestion**, not free-typed geocode-first-hit | Done | Mobile create-listing + `POST /api/listings/from-place` |
| **Units** rejected in suggestions and on from-place | Done | `place-suggestions.ts`, listings route |
| **Block / condo / house** → public **area** name only; pin is area cell | Done | Classification + `location_pin_kind = area` |
| **Public venues** (MRT, mall, park, …) → label + venue pin | Done | `pinKind = venue` |
| Exact listing coordinates **omitted** from feed/detail serializers | Done | `serializeListingBarter` |
| Street / postal **not** returned on public listing payloads | Done | Same |
| Nearby map pins only via **`GET /api/listings/map`** (~500 m cell or venue) | Done | `map-pin.ts`, listings map route |
| Legacy listings keep rows; map uses **area cell** when kind null | Done | Map route |
| Viewer **home** separate from listing place; Settings may show owner coords | Done | Onboarding / profile PATCH; Settings UI |
| Public **profile header** does not show home location line | Done | Mobile `profile_ui_mapper` |
| Other users’ profile API: city / `hasLocation`, not lat/lng | Done | `GET /api/users/:userId` |
| Meetup uses both homes **server-side**; chat shows public stop names | Done | Meetup suggestions feature |
| Privacy Policy nearby callout updated (picked place, no unit/block/exact pin) | Done | `legal.ts` |
| In-app ⓘ on Nearby map explaining approximate pins | Done | `BarterNearbyMapControls` |

**Product rule of thumb:** User may *type* a condo name to find suggestions; we still **save/show the neighbourhood (or public venue)**, not the building, to other people.

---

## Account & contact data (already in product)

| Control | Notes |
|---------|--------|
| Email privacy / masking on some wire shapes | Auth and social login docs |
| OTP signup before account creation | `CREATE_ACCOUNT_OTP.md` |
| Passwords hashed; social provider IDs | Auth stack |
| Report / block without auto-ban | `REPORT_AND_BLOCK.md` |

---

## Analytics & device (mobile)

| Control | Notes |
|---------|--------|
| Analytics consent paths | See mobile feature log / app-store notes |
| Prefer not tying discovery to advertising ID where review required | Historical App Store work |

---

## What other users can still see (by design)

Marketplace needs some sharing:

- Display name, photo, bio (if set)
- Listing title, photos, condition, estimated value, **public place/area name**
- Approximate **distance** and **map pin** (area or venue — not exact home)
- Public reviews / trade stats as already productized
- Chat content they send each other

They should **not** see: email/password, exact home coordinates, unit/block/condo as the public listing place, street/postal on listing APIs.

---

## Operator checklist (keep true)

When changing location or profile APIs:

1. Do not add lat/lng (or map pin) to `serializeListingBarter` / public detail without an explicit privacy review.
2. Keep create-listing mobile on **from-place** + suggestions; do not re-enable “first geocode hit publishes GPS”.
3. Prefer area cell or venue pin on any new map surface; document cell size in LOCATION_PIN_PRIVACY.
4. Update `legal.ts` Privacy Policy if disclosure rules change.
5. Add tests when classification or public wire shapes change.

---

## Related docs

| Doc | Role |
|-----|------|
| [LOCATION_PIN_PRIVACY.md](./LOCATION_PIN_PRIVACY.md) | API, DB, classification |
| [MEETUP_SUGGESTIONS.md](./MEETUP_SUGGESTIONS.md) | Midpoint meetups without exposing homes in chat |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | Hosting / transport findings |
| Mobile [LOCATION_PIN_PRIVACY.md](../../barter-stack/mobile/docs/LOCATION_PIN_PRIVACY.md) | App flows |
| Live policy | `GET /privacy` |
