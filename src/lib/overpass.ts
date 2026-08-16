// Meetup-point lookup near a coordinate. Prefers OpenStreetMap Overpass
// (transit + malls + markets) and races public mirrors. When those 504 /
// timeout — common on the free instances — falls back to Nominatim search
// with a bounded viewbox, which is typically ~1s.
// Results are cached in-memory per rounded midpoint (≈100 m grid) for one
// hour so public endpoints are not hammered on repeated calls.
//
// Public Overpass instances reject Node's default (empty) User-Agent with
// HTTP 406 / 429. Always send an identifying User-Agent.

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
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface NominatimHit {
  name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
}

/** Public Overpass mirrors raced in parallel. Keep in sync with tests/overpass.test.ts. */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

export const OVERPASS_USER_AGENT = "SwapHaven/1.0 (meetup-suggestions; api@swaphaven.io)";

const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour
const OVERPASS_TIMEOUT_MS = 8_000;
const NOMINATIM_TIMEOUT_MS = 6_000;

const _cache = new Map<string, { suggestions: TransitSuggestion[]; expiresAt: number }>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export function resetOverpassCache(): void {
  _cache.clear();
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

function nominatimMeetupType(cls: string, type: string): string | null {
  if (cls === "railway" && (type === "station" || type === "halt" || type === "tram_stop")) {
    return type === "station" ? "Train Station" : type === "halt" ? "Train Stop" : "Tram Stop";
  }
  if (cls === "amenity" && type === "bus_station") return "Bus Station";
  if (cls === "highway" && type === "bus_stop") return "Bus Stop";
  if (cls === "shop" && (type === "mall" || type === "department_store")) return "Shopping Mall";
  if (cls === "amenity" && type === "marketplace") return "Market";
  if (type === "station") return "Train Station";
  return null;
}

function viewbox(lat: number, lng: number, radiusMeters: number): string {
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  // Nominatim: left, top, right, bottom
  return `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`;
}

function identHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": OVERPASS_USER_AGENT,
  };
}

/** Resolves with the first fulfilled value; rejects only when every input rejects. */
function firstFulfilled<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const errors: unknown[] = [];
    let remaining = promises.length;
    if (remaining === 0) {
      reject(new Error("no sources"));
      return;
    }
    for (const p of promises) {
      p.then(resolve, (err) => {
        errors.push(err);
        remaining--;
        if (remaining === 0) {
          const detail = errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
          reject(new Error(detail));
        }
      });
    }
  });
}

/** First non-empty list wins. Empty lists wait for a sibling that might have hits. */
function firstNonEmpty(sources: Promise<TransitSuggestion[]>[]): Promise<TransitSuggestion[]> {
  return new Promise((resolve, reject) => {
    const errors: unknown[] = [];
    let pending = sources.length;
    let sawEmpty = false;
    if (pending === 0) {
      resolve([]);
      return;
    }
    for (const src of sources) {
      src.then(
        (rows) => {
          if (rows.length > 0) {
            resolve(rows);
            return;
          }
          sawEmpty = true;
          pending--;
          if (pending === 0) resolve([]);
        },
        (err) => {
          errors.push(err);
          pending--;
          if (pending === 0) {
            if (sawEmpty) resolve([]);
            else {
              const detail = errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
              reject(new Error(`Meetup POI lookup failed: ${detail}`));
            }
          }
        },
      );
    }
  });
}

async function queryOneOverpass(
  url: string,
  query: string,
  signal: AbortSignal,
): Promise<OverpassResponse> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...identHeaders(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!resp.ok) throw new Error(`${url} HTTP ${resp.status}`);
  const data = (await resp.json()) as OverpassResponse;
  if (!Array.isArray(data.elements)) throw new Error(`${url} missing elements array`);
  return data;
}

function mapOverpassElements(
  elements: OverpassElement[],
  lat: number,
  lng: number,
  maxResults: number,
): TransitSuggestion[] {
  const byName = new Map<string, TransitSuggestion>();
  for (const el of elements) {
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
  return [...byName.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, maxResults);
}

async function fetchNominatimSuggestions(
  lat: number, lng: number, radiusMeters: number, maxResults: number, signal: AbortSignal,
): Promise<TransitSuggestion[]> {
  const box = viewbox(lat, lng, radiusMeters);
  const queries = ["station", "mall"];

  const hits = await Promise.all(queries.map(async (q) => {
    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "15");
    url.searchParams.set("viewbox", box);
    url.searchParams.set("bounded", "1");
    const resp = await fetch(url, {
      headers: identHeaders(),
      signal: AbortSignal.any([signal, AbortSignal.timeout(NOMINATIM_TIMEOUT_MS)]),
    });
    if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
    const data = (await resp.json()) as NominatimHit[];
    return Array.isArray(data) ? data : [];
  }));

  const byName = new Map<string, TransitSuggestion>();
  for (const hit of hits.flat()) {
    const name = hit.name?.trim();
    const elLat = hit.lat != null ? Number(hit.lat) : NaN;
    const elLon = hit.lon != null ? Number(hit.lon) : NaN;
    if (!name || !Number.isFinite(elLat) || !Number.isFinite(elLon)) continue;
    const type = nominatimMeetupType(hit.class ?? "", hit.type ?? "");
    if (!type) continue;
    const dist = Math.round(haversineMeters(lat, lng, elLat, elLon));
    if (dist > radiusMeters) continue;
    const existing = byName.get(name);
    if (!existing || dist < existing.distanceMeters) {
      byName.set(name, { name, lat: elLat, lng: elLon, type, distanceMeters: dist });
    }
  }

  return [...byName.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, maxResults);
}

/**
 * Returns up to `maxResults` named meetup points within `radiusMeters` of the
 * given coordinates. Includes MRT/LRT stations, train stops, bus stations,
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

  // Keep this cheap: individual bus_stop / stop_position nodes make public
  // Overpass instances time out. Stations + malls + markets are enough.
  const filters = [
    `node["railway"~"station|halt|tram_stop"]["name"]${around};`,
    `node["amenity"="bus_station"]["name"]${around};`,
    `node["shop"="mall"]["name"]${around};`,
    `node["amenity"="marketplace"]["name"]${around};`,
    `way["shop"="mall"]["name"]${around};`,
    `way["amenity"="marketplace"]["name"]${around};`,
  ];

  const query = `[out:json][timeout:7];(${filters.join("")});out center body 40;`;
  const ac = new AbortController();
  const overpassSignal = AbortSignal.any([ac.signal, AbortSignal.timeout(OVERPASS_TIMEOUT_MS)]);

  try {
    const suggestions = await firstNonEmpty([
      firstFulfilled(
        OVERPASS_ENDPOINTS.map((url) => queryOneOverpass(url, query, overpassSignal)),
      ).then((data) => mapOverpassElements(data.elements, lat, lng, maxResults)),
      fetchNominatimSuggestions(lat, lng, radiusMeters, maxResults, ac.signal),
    ]);
    _cache.set(key, { suggestions, expiresAt: Date.now() + CACHE_TTL_MS });
    return suggestions;
  } finally {
    ac.abort();
  }
}
