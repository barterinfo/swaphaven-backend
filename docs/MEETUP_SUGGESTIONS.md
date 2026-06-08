# Meet Halfway — Meetup Suggestions

> **Linked Jira story:** [SCRUM-21](https://prayagmittal.atlassian.net/browse/SCRUM-21)

The meetup suggestions feature helps trade participants find a neutral, public transit stop to meet at. When a barter trade is in `pending_meetup` status, either party can request a list of nearby transit stops computed from the geographic midpoint between the two users' saved locations.

---

## How it works

```
buyer location (lat, lng)
        +
seller location (lat, lng)
        │
        ▼
  midpoint = ((lat1+lat2)/2, (lng1+lng2)/2)
        │
        ▼
  Overpass API (OpenStreetMap)
  — queries nodes/ways within 2 km of midpoint
  — MRT/LRT stations, tram stops, bus stations, bus stops,
    shopping malls, markets
        │
        ▼
  deduplicate by name → sort by distance → return top 8
```

The Overpass query runs against the public [overpass-api.de](https://overpass-api.de) endpoint. Results are cached in-memory per rounded midpoint (≈100 m grid precision) for **1 hour** to avoid hammering the free public endpoint.

---

## Prerequisites

Both the buyer and the seller must have coordinates saved in their `user_profiles` rows (`location_lat`, `location_lng`). These are populated:

- **On new onboarding completion** — `OnboardingCompleteNotifier.markComplete()` calls `PATCH /api/users/me` after saving to local storage.
- **On first app launch** (backfill) — `OnboardingCompleteNotifier.hydrateFromStorage()` fires a sync on startup when the user is authenticated and has local location data but the server profile may be missing it.

If either user has no location set, the suggestions endpoint returns `reason: "location_unavailable"` rather than an error.

---

## API reference

### `GET /api/conversations/:conversationId/meetup-suggestions`

Returns transit-stop suggestions near the midpoint between buyer and seller.

**Auth:** Bearer token required. Caller must be a participant (buyer or seller) of the conversation.

**Response — success:**
```json
{
  "midpoint": { "lat": 1.3000, "lng": 103.8198 },
  "suggestions": [
    {
      "name": "Bugis MRT",
      "lat": 1.3009,
      "lng": 103.8199,
      "type": "Train Station",
      "distanceMeters": 120
    },
    {
      "name": "Queen St Bus Terminal",
      "lat": 1.2994,
      "lng": 103.8523,
      "type": "Bus Station",
      "distanceMeters": 480
    }
  ]
}
```

**Response — no location set:**
```json
{ "midpoint": null, "suggestions": [], "reason": "location_unavailable" }
```

**Response — no stops near midpoint:**
```json
{ "midpoint": { "lat": ..., "lng": ... }, "suggestions": [], "reason": "none_found" }
```

**Response — Overpass unreachable:**
```json
{ "midpoint": { "lat": ..., "lng": ... }, "suggestions": [], "reason": "overpass_error" }
```

| Field | Type | Notes |
|---|---|---|
| `midpoint` | `{ lat, lng } \| null` | `null` when location unavailable |
| `suggestions` | `TransitSuggestion[]` | Sorted ascending by `distanceMeters` |
| `suggestions[].name` | `string` | OSM `name` tag |
| `suggestions[].lat` / `.lng` | `number` | Stop coordinates |
| `suggestions[].type` | `string` | "MRT Station", "Train Station", "Train Stop", "Tram Stop", "Bus Station", "Bus Stop", "Shopping Mall", "Market", or "Transit Stop" |
| `suggestions[].distanceMeters` | `integer` | Haversine distance from midpoint (metres) |
| `reason` | `string \| undefined` | Present only when `suggestions` is empty |

**Status codes:**

| Code | Meaning |
|------|---------|
| `200` | Success (suggestions may be empty — check `reason`) |
| `401` | No / invalid token |
| `403` | Caller is not a participant |
| `404` | Conversation not found |

---

### `PATCH /api/conversations/:conversationId/meetup`

Convenience endpoint — sets the meetup location on the trade linked to this conversation. Mobile only needs the `conversationId`; this endpoint resolves conversation → offer → trade internally.

**Auth:** Bearer token required. Caller must be a participant.

**Request body:**
```json
{
  "meetupLocation": "Bugis MRT",
  "meetupScheduledAt": "2026-06-15T10:00:00.000Z"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `meetupLocation` | `string` (1–500 chars) | Yes | Free-text name of the chosen stop |
| `meetupScheduledAt` | ISO 8601 datetime | No | Defaults to `now` when omitted |

**Response:** Updated `Trade` object (same shape as `PATCH /api/trades/:tradeId/meetup`).

**Status codes:**

| Code | Meaning |
|------|---------|
| `200` | Trade updated |
| `400` | Validation error (empty `meetupLocation`, invalid date) |
| `403` | Caller is not a participant |
| `404` | Conversation not found |
| `409` | No trade linked to this conversation |

---

## Implementation details

### Backend — `src/lib/overpass.ts`

The Overpass client is a standalone module with no external dependencies beyond the Node.js built-in `fetch`. Key design decisions:

- **OSM types queried:**
  - Nodes: `railway~"station|halt|tram_stop"`, `amenity=bus_station`, `highway=bus_stop`, `public_transport=stop_position`, `shop=mall`, `amenity=marketplace`
  - Ways (with `out center`): `shop=mall`, `amenity=marketplace` — malls and markets are often mapped as closed ways; Overpass returns their bounding-box centroid
  - MRT/LRT stations are distinguished from generic train stations by checking `station=subway` or `station=light_rail` on `railway=station` nodes
- **Deduplication:** Multiple OSM nodes/ways often represent the same physical place (one node per platform, one per entrance, etc.). Results are grouped by name and the closest entry to the midpoint is kept.
- **Cache:** `Map<string, { suggestions, expiresAt }>` keyed on `"${lat.toFixed(3)},${lng.toFixed(3)}"`. TTL = 1 hour. Cache is in-process (resets on server restart).
- **Timeout:** The Overpass HTTP request has a 15-second `AbortSignal` timeout. Overpass itself is asked for a 12-second server-side timeout (`[timeout:12]`). If either fires, the route returns `reason: "overpass_error"` with an empty list — never a 5xx.
- **Max raw results:** 80 nodes/ways fetched from Overpass, then sliced to 10 after deduplication and sorting.

### Mobile — `meetup_suggestions_sheet.dart`

The bottom sheet is a `StatefulWidget` that:
1. Calls `ChatRemoteDataSource.getMeetupSuggestions()` in `initState`.
2. Shows a loading spinner, then one of four states: location unavailable / no stops found / Overpass error (with retry) / list of suggestions.
3. On suggestion tap, calls `ChatRemoteDataSource.applyMeetupSuggestion()` → pops the sheet → fires `onApplied` callback → shows a SnackBar.

The sheet receives a reference to `ChatRemoteDataSource` directly from `TradeActionBar` via `context.read<ChatRemoteDataSource>()` (the datasource is provided by `chatProviders()` in the parent `ChatPageDark` route).

### Mobile — `TradeActionBar`

Updated layout (shown only when `trade.status == pending_meetup`):

```
┌──────────────────────────────────────┐
│  📍  Find Meeting Point              │  ← violet accent, full width
├─────────────────┬────────────────────┤
│  ✓ Mark Complete│  ✗ Cancel Trade    │  ← existing actions
└─────────────────┴────────────────────┘
```

---

## Testing

```bash
# Run all conversation tests (includes 12 meetup-specific cases)
npm test -- --reporter=verbose tests/conversations.test.ts
```

The Overpass module is mocked in tests (`vi.mock('../src/lib/overpass.js')`) so tests are deterministic and do not make real network calls.

Test cases cover:
- `location_unavailable` when neither user has location set (default for test fixtures)
- Suggestions returned when both users have location (mocked Overpass response)
- Buyer and seller symmetry (both can call the endpoint)
- `401 / 403 / 404` on auth/access/not-found
- `PATCH /meetup` — sets location, accepts explicit datetime, validates empty string, 403/404

---

## Deployment notes

No database migrations required. The feature uses existing columns:

| Table | Column | Used for |
|-------|--------|----------|
| `user_profiles` | `location_lat`, `location_lng` | Source coordinates for midpoint |
| `trades` | `meetup_location` | Written when user selects a suggestion |
| `trades` | `meetup_scheduled_at` | Written alongside location (defaults to `now`) |

The Overpass public endpoint is free with no API key. If request volume grows significantly, consider self-hosting an Overpass instance or switching the cache to Redis for multi-instance deployments.
