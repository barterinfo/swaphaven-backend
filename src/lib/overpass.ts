// Thin wrapper around the OpenStreetMap Overpass API for finding suitable
// meetup points near a coordinate. Covers transit stops, MRT stations,
// shopping malls, and markets — practical for Singapore.
// Results are cached in-memory per rounded midpoint (≈100 m grid) for one
// hour so the public endpoint is not hammered on repeated calls.

export interface TransitSuggestion {
  name: string;
  lat: number;
  lng: number;
  /** Human-readable OSM category: "MRT Station", "Shopping Mall", etc. */
  type: string;
  /** Great-circle distance from the query centre in metres (rounded). */
  distanceMeters: number;
}

interface OverpassElement {
  type: "node" | "way";
  id: number;
  // nodes supply lat/lon directly; ways supply a center object (out center)
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
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

function osmMeetupType(tags: Record<string, string>): string {
  // MRT/LRT — subway stations before the generic railway station check
  if (tags["railway"] === "station" && (tags["station"] === "subway" || tags["station"] === "light_rail")) {
    return "MRT Station";
  }
  if (tags["railway"] === "station") return "Train Station";
  if (tags["railway"] === "halt")    return "Train Stop";
  if (tags["railway"] === "tram_stop") return "Tram Stop";
  if (tags["amenity"] === "bus_station") return "Bus Station";
  if (tags["highway"] === "bus_stop") return "Bus Stop";
  if (tags["shop"] === "mall") return "Shopping Mall";
  if (tags["amenity"] === "marketplace") return "Market";
  return "Transit Stop";
}

/**
 * Returns up to `maxResults` named meetup points within `radiusMeters` of the
 * given coordinates. Includes MRT/LRT stations, train stops, bus stops,
 * shopping malls, and markets. Results are deduplicated by name (nearest node
 * per name kept) and sorted by ascending distance from the midpoint. Throws on
 * network or parse errors (caller decides how to surface the failure).
 */
export async function fetchTransitSuggestions(
  lat: number,
  lng: number,
  radiusMeters = 2_000,
  maxResults = 10,
): Promise<TransitSuggestion[]> {
  const key = cacheKey(lat, lng);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.suggestions;

  const around = `(around:${radiusMeters},${lat},${lng})`;

  // Transit nodes (point geometry)
  const transitNodes = [
    `node["railway"~"station|halt|tram_stop"]["name"]${around};`,
    `node["amenity"="bus_station"]["name"]${around};`,
    `node["highway"="bus_stop"]["name"]${around};`,
    `node["public_transport"="stop_position"]["name"]${around};`,
  ];

  // Mall and market — may be mapped as nodes OR closed ways; query both.
  // "out center" instructs Overpass to return the bounding-box centre for ways.
  const placeNodes = [
    `node["shop"="mall"]["name"]${around};`,
    `node["amenity"="marketplace"]["name"]${around};`,
    `way["shop"="mall"]["name"]${around};`,
    `way["amenity"="marketplace"]["name"]${around};`,
  ];

  const query =
    `[out:json][timeout:12];(${[...transitNodes, ...placeNodes].join("")});out center body 80;`;

  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);

  const data = (await resp.json()) as OverpassResponse;

  // Deduplicate by name — keep the nearest entry when the same place name
  // appears on multiple nodes or way centroids (e.g. per-platform entries).
  const byName = new Map<string, TransitSuggestion>();
  for (const el of data.elements) {
    const name = el.tags?.["name"];
    if (!name) continue;
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (elLat === undefined || elLon === undefined) continue;
    const dist = Math.round(haversineMeters(lat, lng, elLat, elLon));
    const existing = byName.get(name);
    if (!existing || dist < existing.distanceMeters) {
      byName.set(name, { name, lat: elLat, lng: elLon, type: osmMeetupType(el.tags), distanceMeters: dist });
    }
  }

  const suggestions = [...byName.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, maxResults);

  _cache.set(key, { suggestions, expiresAt: Date.now() + CACHE_TTL_MS });
  return suggestions;
}
