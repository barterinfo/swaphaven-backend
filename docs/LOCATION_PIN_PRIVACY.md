# Location pin privacy

How Barter stores, classifies, and exposes listing and profile location so other users see a **picked place name** (condo, HDB block, MRT station, landmark, public place, or area) with an approximate pin, not a unit or exact home pin.

Cross-links: [PDPA.md](./PDPA.md) (controls already in place) · public policy HTML via `GET /privacy` · mobile [LOCATION_PIN_PRIVACY.md](../../barter-stack/mobile/docs/LOCATION_PIN_PRIVACY.md)

---

## Goals

1. A listing cannot be published without a place **chosen from suggestions**.
2. GPS alone never becomes the listing pin.
3. Units are rejected; condos/HDB blocks are selectable by name with an `area` pin, and detached houses resolve to the surrounding neighbourhood.
4. Public responses never return street address, postal code, or exact coordinates.
5. Nearby map pins come only from `GET /api/listings/map` (area cell ~100 m, or venue point).
6. Existing listing rows stay; legacy pins use the area cell.

---

## Concepts

| Concept | Storage | Visible to others |
|---------|---------|-------------------|
| **Viewer home** | Profile + local prefs (`location_lat` / `location_lng`, city label) | Place name / city only on public profile APIs; coordinates never in public user payloads |
| **Listing place** | `location_city` (public name), private lat/lng, `location_pin_kind` | City/area name, distance, map pin from map route |
| **Area pin** | `location_pin_kind = area` (or null legacy) | Pin snapped to ~100 m grid cell; label may be a neighbourhood, condo, or HDB block name |
| **Venue pin** | `location_pin_kind = venue` | Pin at the public place (MRT, mall, park, landmark, …) |

Home and listing place are **separate**. Prefilling create-listing from home does not publish until a suggestion is tapped.

---

## Classification (Nominatim → suggestion)

Implemented in `src/lib/place-suggestions.ts`. Used by `GET /api/places/suggestions`.

| Input kind | Selectable? | Public label | Pin kind |
|------------|-------------|--------------|----------|
| Unit / apt / `#` / floor-unit / 4-digit stack in query or name | No | — | — |
| Condo / HDB block / apartment building (`building`, `landuse=residential`, house number, `blk …`, …) | Yes by **name** | Condo/HDB name (e.g. Hillview Heights, Block 123, Ang Mo Kio Avenue 3) | `area` (~100 m cell) |
| Detached house (bare house number, no block/condo name) | Yes as **area** | Suburb / neighbourhood | `area` |
| SG planning area (`boundary` + `administrative`) | Yes | Suburb / area name | `area` |
| Public place / key landmark (station, MRT, mall, park, museum, hospital, `historic`, `man_made`, …) — including hits with a house number | Yes | Venue or area name | `venue` or `area` |
| Unknown class/type | No | — | — |

Duplicates with the same public area name collapse to one row. Condo searches show e.g. **Hillview Heights** · Condo · Bukit Batok.

---

## API

Leave existing listing list/detail/trending/swipe/closet shapes unchanged. `serializeListingBarter` does **not** add map pins or raw coordinates.

### `GET /api/places/suggestions?q=&country=&limit=`

- Auth optional (mobile sends headers when available).
- `q` min length 2. Units in the query return `[]`.
- Response: `{ suggestions: [{ label, lat, lng, pinKind, placeType, countryCode }] }`.

### `POST /api/listings/from-place`

- Auth required. Register **before** `/:listingId`.
- Body = create-listing fields **plus** `place: { label, lat, lng, pinKind, countryCode? }`.
- No place / unit label → **400**, no insert.
- Writes `location_city = place.label`, private coords, `location_pin_kind`, empty address/postal for this path.
- Legacy `POST /api/listings` still accepts its current body (tests / older clients); mobile publish uses **from-place**.

### `GET /api/listings/map?lat=&lng=&radius=&limit=`

- Auth optional. Radius in **miles** (same as trending).
- Omitting `limit` returns every active pin in the radius; when set, caps the newest results.
- Each item: `id`, `title`, `location_city`, `map_pin: { lat, lng, precision }`, `distance_miles`, images/category helpers.
- No address, postal code, or stored exact coordinates.
- Distance uses private stored points; pin uses `publicMapPin` (`src/lib/map-pin.ts`).

### Profile

- `PATCH /api/users/me` still updates owner home coordinates.
- `GET /api/users/:userId` exposes coarse city / `hasLocation`, not lat/lng.

---

## Database

Migration `drizzle/0038_listing_pin_kind.sql`:

```sql
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "location_pin_kind" text;
```

| Column | Role |
|--------|------|
| `location_city` | Public place / area name |
| `location_lat` / `location_lng` | Private; distance / radius only |
| `location_address` / `location_postal_code` | May exist on old rows; never in public serializers |
| `location_pin_kind` | `area` \| `venue` \| null (treat as area) |

---

## Existing listings

- Rows are not deleted or force-repicked.
- Public name = existing `location_city`.
- Distance = stored coordinates on the server.
- Map pin = ~100 m cell when kind is null/area.
- No coords → out of radius search, no pin.

---

## Tests

- Unit: `tests/place-suggestions.test.ts` (classification, map snap).
- Integration (needs DB): `tests/listings.test.ts` — from-place validation, area/venue map pins, legacy cell, unchanged detail shape.
- `POST /api/listings` still accepts its current body.

---

## Key code map

| Concern | Path |
|---------|------|
| Suggestions + classify | `src/lib/place-suggestions.ts` |
| Map cell / public pin | `src/lib/map-pin.ts` |
| Places route | `src/routes/places.ts` |
| from-place + map | `src/routes/listings.ts` |
| Public listing serialize | `src/lib/barter-listing.ts` |
| Privacy HTML nearby callout | `src/routes/legal.ts` |
| Schema | `src/db/schema/listings.ts` |
