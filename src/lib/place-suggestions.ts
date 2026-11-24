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
  // Key landmarks / important points that are not shops or amenities.
  "historic",
  "man_made",
  "natural",
  "aeroway",
]);

const PUBLIC_TYPES = new Set([
  "mall",
  "department_store",
  "marketplace",
  "station",
  "halt",
  "stop",
  "subway_entrance",
  "tram_stop",
  "bus_stop",
  "bus_station",
  "park",
  // Landmarks and other important public points.
  "attraction",
  "museum",
  "gallery",
  "artwork",
  "viewpoint",
  "monument",
  "memorial",
  "lighthouse",
  "fort",
  "theme_park",
  "zoo",
  "aquarium",
  "library",
  "hospital",
  "school",
  "university",
  "college",
  "place_of_worship",
  "community_centre",
  "sports_centre",
  "stadium",
  "theatre",
  "cinema",
  "hotel",
  "neighbourhood",
  "neighborhood",
  "suburb",
  "quarter",
  "town",
  "city",
  "village",
  "hamlet",
]);

/** Types that describe an area rather than a named public place. */
const AREA_TYPES = new Set([
  "neighbourhood",
  "neighborhood",
  "suburb",
  "quarter",
  "administrative",
  "city",
  "town",
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
  if (
    className === "railway" ||
    className === "public_transport" ||
    type === "station" ||
    type === "stop" ||
    type === "subway_entrance"
  ) {
    return "Station";
  }
  if (type === "bus_stop" || type === "bus_station") return "Bus Stop";
  if (type === "park") return "Park";
  if (
    className === "historic" ||
    className === "man_made" ||
    type === "attraction" ||
    type === "museum" ||
    type === "gallery" ||
    type === "artwork" ||
    type === "viewpoint" ||
    type === "monument" ||
    type === "memorial" ||
    type === "lighthouse" ||
    type === "fort" ||
    type === "theme_park" ||
    type === "zoo" ||
    type === "aquarium"
  ) {
    return "Landmark";
  }
  if (type === "library") return "Library";
  if (type === "hospital") return "Hospital";
  if (type === "hotel") return "Hotel";
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

function firstDisplaySegment(hit: NominatimHit): string {
  return hit.displayName.split(",")[0]?.trim() ?? "";
}

const BLOCK_NAME_RE = /^(?:blk|block)\s+(\d+[a-z]?)$/i;

/**
 * Named residential place (condo estate, HDB block, apartment building) as a
 * selectable suggestion in its own name. `pinKind` stays `area`, so the
 * public map pin is still snapped to the ~100 m cell in `map-pin.ts` —
 * never the exact building point. Units remain rejected before this runs.
 * Falls back to the surrounding-area suggestion when there is no usable
 * building name (e.g. a bare house number with no road/area).
 */
function namedResidentialSuggestion(
  hit: NominatimHit,
  query: string,
): PlaceSuggestion | null {
  const area = areaLabelFromAddress(hit.address);
  const named =
    hit.address["building"]?.trim() || firstDisplaySegment(hit);
  const type = hit.type.toLowerCase().split(";")[0] ?? "";

  const blockMatch = BLOCK_NAME_RE.exec(named) ?? BLOCK_NAME_RE.exec(query.trim());
  const bareNumber = /^\d+[a-z]?$/i.test(named) ? named : null;
  // A bare number is an HDB block only for multi-unit building types or an
  // explicit blk/block/hdb query — a detached house number stays area-only.
  const isMultiUnit =
    blockMatch != null ||
    ["apartments", "condominium", "residential", "dormitory"].includes(type) ||
    BLOCK_RE.test(query) ||
    /\bhdb\b/i.test(query);
  if ((blockMatch || bareNumber) && isMultiUnit) {
    const blockNo = (blockMatch?.[1] ?? bareNumber ?? "").toUpperCase();
    const road = hit.address["road"]?.trim();
    const label = road
      ? `Block ${blockNo}, ${road}`
      : area
        ? `Block ${blockNo}, ${area}`
        : `Block ${blockNo}`;
    return {
      label,
      lat: hit.lat,
      lng: hit.lng,
      pinKind: "area",
      placeType: area ? `HDB · ${area}` : "HDB",
      countryCode: hit.countryCode,
    };
  }

  if (bareNumber) return areaSuggestionFromHit(hit, "Neighbourhood");

  if (!named || queryHasUnit(named)) {
    return areaSuggestionFromHit(hit, "Neighbourhood");
  }

  const looksHdb =
    /\bhdb\b/i.test(query) ||
    /\bhdb\b/i.test(hit.displayName) ||
    BLOCK_RE.test(query);
  const kindWord = looksHdb
    ? "HDB"
    : type === "condominium" || type === "apartments" || hit.className === "landuse"
      ? "Condo"
      : "Building";
  return {
    label: named,
    lat: hit.lat,
    lng: hit.lng,
    pinKind: "area",
    placeType:
      area && area.toLowerCase() !== named.toLowerCase()
        ? `${kindWord} · ${area}`
        : kindWord,
    countryCode: hit.countryCode,
  };
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
  // Nominatim occasionally returns compound types ("attraction;theme_park").
  const type = (hit.type.toLowerCase().split(";")[0] ?? "").trim();
  const hasHouseNumber = Boolean(hit.address["house_number"]?.trim());
  const isAreaType = AREA_TYPES.has(type);
  const isPublic =
    PUBLIC_CLASSES.has(className) || PUBLIC_TYPES.has(type);

  const venueSuggestion = (): PlaceSuggestion | null => {
    // For named venues the display name leads; suburb/neighbourhood is only
    // the name for area-type rows (or when the lead segment is a number).
    const lead = firstDisplaySegment(hit);
    const shortName =
      hit.address["amenity"] ||
      hit.address["shop"] ||
      hit.address["tourism"] ||
      hit.address["leisure"] ||
      hit.address["railway"] ||
      (lead && !/^\d/.test(lead) ? lead : "") ||
      hit.address["suburb"] ||
      hit.address["neighbourhood"] ||
      hit.address["neighborhood"] ||
      lead ||
      hit.displayName;
    if (!isSelectableAreaLabel(shortName.trim())) return null;

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
      !isAreaType &&
      areaHint &&
      areaHint.trim().toLowerCase() !== shortName.trim().toLowerCase()
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
  };

  // Named public places first: an MRT station, mall, landmark, hospital, …
  // usually carries a house number in Nominatim, and that must not collapse
  // it to the surrounding area. Condo/HDB names are handled below.
  if (isPublic && !isAreaType) return venueSuggestion();

  const isBuilding =
    className === "building" ||
    hasHouseNumber ||
    BLOCK_RE.test(hit.displayName);

  // Condo / HDB / other residential buildings: selectable by name, but the
  // pin stays `area` (~100 m cell) — never the exact building point.
  if (isBuilding) return namedResidentialSuggestion(hit, query);

  // Condo / residential estates (Hillview Heights, Reflections at Keppel Bay, …).
  if (className === "landuse" && type === "residential") {
    return namedResidentialSuggestion(hit, query);
  }

  // SG planning areas (and similar) are boundary/administrative with a suburb.
  if (className === "boundary" && type === "administrative") {
    const area =
      areaLabelFromAddress(hit.address) || firstDisplaySegment(hit) || null;
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

  if (!isPublic) return null;
  return venueSuggestion();
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

/**
 * Retry spellings Nominatim misses: it returns nothing for
 * "Blk 123 Ang Mo Kio" (needs the bare number + road/area) and for
 * "Gardens by the Bay MRT" (needs the station name without the suffix).
 */
export function fallbackPlaceQueries(query: string): string[] {
  const q = query.trim();
  const candidates: string[] = [];
  const withoutBlock = q.replace(/\b(?:blk|block)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (withoutBlock.length >= 2 && withoutBlock !== q) candidates.push(withoutBlock);
  const withoutTransit = q
    .replace(/\b(?:mrt|lrt|station)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutTransit.length >= 2 && withoutTransit !== q) {
    candidates.push(withoutTransit);
  }
  return candidates;
}

async function searchNominatim(
  q: string,
  countryCode: string | null,
  limit: number,
  classifyQuery: string,
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "1",
    limit: String(limit * 2),
  });
  if (countryCode) params.set("countrycodes", countryCode);

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
    const suggestion = classifyNominatimHit(hit, classifyQuery);
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
  const rawCountry = opts.countryCode?.trim().toLowerCase();
  const country =
    rawCountry && /^[a-z]{2}$/.test(rawCountry) ? rawCountry : null;

  // Classify against the original query even on a fallback search, so an
  // explicit "Blk …" / "… MRT" still drives the HDB/station labelling.
  const first = await searchNominatim(q, country, limit, q);
  if (first.length > 0) return first;
  for (const candidate of fallbackPlaceQueries(q)) {
    const retry = await searchNominatim(candidate, country, limit, q);
    if (retry.length > 0) return retry;
  }
  return [];
}
