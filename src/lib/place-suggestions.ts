import { OVERPASS_USER_AGENT } from "./overpass.js";

export type PlacePinKind = "area" | "venue";

export type NominatimHit = {
  lat: number;
  lng: number;
  displayName: string;
  className: string;
  type: string;
  address: Record<string, string>;
  countryCode: string | null;
};

export type PlaceSuggestion = {
  label: string;
  lat: number;
  lng: number;
  pinKind: PlacePinKind;
  placeType: string;
  countryCode: string | null;
};

const UNIT_RE =
  /\b(unit|apt|apartment|suite|#)\b|\b\d{2}-\d{2,4}\b|\b\d{4}\b/i;
const BLOCK_RE = /\b(blk|block)\b/i;

const PUBLIC_CLASSES = new Set([
  "amenity",
  "shop",
  "tourism",
  "leisure",
  "railway",
  "public_transport",
  "place",
]);

const PUBLIC_TYPES = new Set([
  "mall",
  "department_store",
  "marketplace",
  "station",
  "halt",
  "tram_stop",
  "bus_stop",
  "bus_station",
  "park",
  "neighbourhood",
  "neighborhood",
  "suburb",
  "quarter",
  "town",
  "city",
  "village",
  "hamlet",
]);

/** Country-only labels must not become a selectable "area". */
const COUNTRY_ONLY_LABELS = new Set([
  "singapore",
  "new zealand",
  "australia",
  "malaysia",
  "indonesia",
  "india",
]);

export function queryHasUnit(query: string): boolean {
  return UNIT_RE.test(query.trim());
}

function areaLabelFromAddress(address: Record<string, string>): string | null {
  for (const key of [
    "suburb",
    "neighbourhood",
    "neighborhood",
    "quarter",
    "city_district",
    "borough",
    "town",
    "city",
    "village",
  ]) {
    const value = address[key]?.trim();
    if (value && !COUNTRY_ONLY_LABELS.has(value.toLowerCase())) return value;
  }
  return null;
}

function placeTypeLabel(className: string, type: string): string {
  if (type === "mall" || type === "department_store") return "Shopping Mall";
  if (type === "marketplace") return "Market";
  if (className === "railway" || type === "station") return "Station";
  if (type === "bus_stop" || type === "bus_station") return "Bus Stop";
  if (type === "park") return "Park";
  if (
    type === "neighbourhood" ||
    type === "neighborhood" ||
    type === "suburb" ||
    type === "quarter" ||
    type === "administrative"
  ) {
    return "Neighbourhood";
  }
  if (type === "city" || type === "town" || type === "village") return "Area";
  return "Place";
}

function isSelectableAreaLabel(label: string): boolean {
  const t = label.trim();
  if (!t) return false;
  if (COUNTRY_ONLY_LABELS.has(t.toLowerCase())) return false;
  return true;
}

function areaSuggestionFromHit(
  hit: NominatimHit,
  placeType: string,
): PlaceSuggestion | null {
  const area = areaLabelFromAddress(hit.address);
  if (!area || !isSelectableAreaLabel(area)) return null;
  return {
    label: area,
    lat: hit.lat,
    lng: hit.lng,
    pinKind: "area",
    placeType,
    countryCode: hit.countryCode,
  };
}

/** Subtitle when a condo/building search resolves to its neighbourhood. */
function nearPlaceType(namedPlace: string, hit: NominatimHit): string {
  const area = areaLabelFromAddress(hit.address);
  const name = namedPlace.trim();
  if (!name || (area && name.toLowerCase() === area.toLowerCase())) {
    return "Neighbourhood";
  }
  return `Near ${name}`;
}

/**
 * Classify a Nominatim hit for listing/onboarding place pickers.
 * Returns null when the row must not be selectable (unit / unknown).
 */
export function classifyNominatimHit(
  hit: NominatimHit,
  query: string,
): PlaceSuggestion | null {
  if (queryHasUnit(query) || queryHasUnit(hit.displayName)) {
    return null;
  }

  const className = hit.className.toLowerCase();
  const type = hit.type.toLowerCase();
  const hasHouseNumber = Boolean(hit.address["house_number"]?.trim());
  const isBuilding =
    className === "building" ||
    hasHouseNumber ||
    BLOCK_RE.test(hit.displayName);

  // Buildings / house numbers / "block …": public label is the surrounding area.
  if (isBuilding) {
    const named =
      hit.address["building"]?.trim() ||
      hit.displayName.split(",")[0]?.trim() ||
      "";
    const placeType =
      named && !queryHasUnit(named) ? nearPlaceType(named, hit) : "Neighbourhood";
    return areaSuggestionFromHit(hit, placeType);
  }

  // Condo / residential estates (Hillview Heights, Reflections at Keppel Bay, …).
  // Public label is the surrounding neighbourhood only — not the condo name.
  if (className === "landuse" && type === "residential") {
    const condoName = hit.displayName.split(",")[0]?.trim() || "";
    const placeType = condoName
      ? nearPlaceType(condoName, hit)
      : "Neighbourhood";
    return areaSuggestionFromHit(hit, placeType);
  }

  // SG planning areas (and similar) are boundary/administrative with a suburb.
  if (className === "boundary" && type === "administrative") {
    const area =
      areaLabelFromAddress(hit.address) ||
      hit.displayName.split(",")[0]?.trim() ||
      null;
    if (!area || !isSelectableAreaLabel(area)) return null;
    return {
      label: area,
      lat: hit.lat,
      lng: hit.lng,
      pinKind: "area",
      placeType: "Neighbourhood",
      countryCode: hit.countryCode,
    };
  }

  const isPublic =
    PUBLIC_CLASSES.has(className) || PUBLIC_TYPES.has(type);
  if (!isPublic) return null;

  const shortName =
    hit.address["amenity"] ||
    hit.address["shop"] ||
    hit.address["tourism"] ||
    hit.address["leisure"] ||
    hit.address["railway"] ||
    hit.address["suburb"] ||
    hit.address["neighbourhood"] ||
    hit.address["neighborhood"] ||
    hit.displayName.split(",")[0]?.trim() ||
    hit.displayName;

  if (!isSelectableAreaLabel(shortName.trim())) return null;

  const isAreaType =
    type === "neighbourhood" ||
    type === "neighborhood" ||
    type === "suburb" ||
    type === "quarter" ||
    type === "administrative" ||
    type === "city" ||
    type === "town" ||
    type === "village" ||
    type === "hamlet";

  const kind = placeTypeLabel(className, type);
  const areaHint =
    hit.address["suburb"] ||
    hit.address["neighbourhood"] ||
    hit.address["neighborhood"] ||
    hit.address["quarter"] ||
    hit.address["city_district"] ||
    null;
  // Venues often share a brand name — show area under the row so picks differ.
  const placeType =
    !isAreaType && areaHint && areaHint.trim().toLowerCase() !== shortName.trim().toLowerCase()
      ? `${kind} · ${areaHint.trim()}`
      : kind;

  return {
    label: shortName.trim(),
    lat: hit.lat,
    lng: hit.lng,
    pinKind: isAreaType ? "area" : "venue",
    placeType,
    countryCode: hit.countryCode,
  };
}

function parseNominatimItem(item: unknown): NominatimHit | null {
  if (!item || typeof item !== "object") return null;
  const m = item as Record<string, unknown>;
  const lat = Number(m["lat"]);
  const lng = Number(m["lon"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const displayName = String(m["display_name"] ?? "").trim();
  if (!displayName) return null;

  const address: Record<string, string> = {};
  const addrRaw = m["address"];
  if (addrRaw && typeof addrRaw === "object") {
    for (const [k, v] of Object.entries(addrRaw as Record<string, unknown>)) {
      if (v != null) address[k] = String(v);
    }
  }

  const rawCountry = address["country_code"]?.trim().toUpperCase() ?? null;
  return {
    lat,
    lng,
    displayName,
    className: String(m["class"] ?? ""),
    type: String(m["type"] ?? ""),
    address,
    countryCode: rawCountry && rawCountry.length === 2 ? rawCountry : null,
  };
}

/** Forward-search Nominatim and return only selectable place suggestions. */
export async function fetchPlaceSuggestions(opts: {
  query: string;
  countryCode?: string | null;
  limit?: number;
}): Promise<PlaceSuggestion[]> {
  const q = opts.query.trim();
  if (q.length < 2) return [];
  if (queryHasUnit(q)) return [];

  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 15);
  const params = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "1",
    limit: String(limit * 2),
  });
  const country = opts.countryCode?.trim().toLowerCase();
  if (country && /^[a-z]{2}$/.test(country)) {
    params.set("countrycodes", country);
  }

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": OVERPASS_USER_AGENT,
      },
      signal: AbortSignal.timeout(6_000),
    },
  );
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];

  const out: PlaceSuggestion[] = [];
  // Areas: one row per public name (Nominatim often returns the same suburb
  // at several nearby points). Venues: keep distinct area subtitles.
  const seen = new Set<string>();
  for (const item of data) {
    const hit = parseNominatimItem(item);
    if (!hit) continue;
    const suggestion = classifyNominatimHit(hit, q);
    if (!suggestion) continue;
    const key =
      suggestion.pinKind === "area"
        ? `area|${suggestion.label.toLowerCase()}`
        : `venue|${suggestion.label.toLowerCase()}|${suggestion.placeType.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
    if (out.length >= limit) break;
  }
  return out;
}
