// Thin wrapper around the OpenStreetMap Overpass API for finding transit stops
// near a coordinate. Results are cached in-memory per rounded midpoint (≈100 m
// grid) for one hour so the public endpoint is not hammered on repeated calls.

export interface TransitSuggestion {
  name: string;
  lat: number;
  lng: number;
  /** Human-readable OSM category: "Train Station", "Bus Stop", etc. */
  type: string;
  /** Great-circle distance from the query centre in metres (rounded). */
  distanceMeters: number;
}

interface OverpassElement {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

const _cache = new Map<string, { suggestions: TransitSuggestion[]; expiresAt: number }>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function osmTransitType(tags: Record<string, string>): string {
  if (tags["railway"] === "station") return "Train Station";
  if (tags["railway"] === "halt")    return "Train Stop";
  if (tags["railway"] === "tram_stop") return "Tram Stop";
  if (tags["amenity"] === "bus_station") return "Bus Station";
  if (tags["highway"] === "bus_stop") return "Bus Stop";
  return "Transit Stop";
}

/**
 * Returns up to `maxResults` named transit stops within `radiusMeters` of the
 * given coordinates, deduplicated by name (nearest per name kept), sorted by
 * ascending distance. Throws on network or parse errors (caller decides how to
 * surface the failure).
 */
export async function fetchTransitSuggestions(
  lat: number,
  lng: number,
  radiusMeters = 2_000,
  maxResults = 8,
): Promise<TransitSuggestion[]> {
  const key = cacheKey(lat, lng);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.suggestions;

  // Combine the four most common transit node types in one Overpass union.
  const query = [
    `[out:json][timeout:10];`,
    `(`,
    `node["railway"~"station|halt|tram_stop"]["name"](around:${radiusMeters},${lat},${lng});`,
    `node["amenity"="bus_station"]["name"](around:${radiusMeters},${lat},${lng});`,
    `node["highway"="bus_stop"]["name"](around:${radiusMeters},${lat},${lng});`,
    `node["public_transport"="stop_position"]["name"](around:${radiusMeters},${lat},${lng});`,
    `);out body 40;`,
  ].join("");

  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);

  const data = (await resp.json()) as OverpassResponse;

  // Deduplicate by name — keep the nearest node when the same stop name
  // appears on multiple nodes (e.g. per-platform entries).
  const byName = new Map<string, TransitSuggestion>();
  for (const el of data.elements) {
    const name = el.tags?.["name"];
    if (!name) continue;
    const dist = Math.round(haversineMeters(lat, lng, el.lat, el.lon));
    const existing = byName.get(name);
    if (!existing || dist < existing.distanceMeters) {
      byName.set(name, { name, lat: el.lat, lng: el.lon, type: osmTransitType(el.tags), distanceMeters: dist });
    }
  }

  const suggestions = [...byName.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, maxResults);

  _cache.set(key, { suggestions, expiresAt: Date.now() + CACHE_TTL_MS });
  return suggestions;
}
