import type { Request } from "express";
import geoip from "geoip-lite";

/** Singapore — last-resort home when GPS, IP, and locale all fail. */
export const FALLBACK_COUNTRY = "SG";
export const FALLBACK_LAT = 1.3521;
export const FALLBACK_LNG = 103.8198;
export const FALLBACK_CITY = "Singapore";

/** Cloudflare / CDN unknown-country sentinels — not real ISO codes. */
const INVALID_COUNTRY_CODES = new Set(["", "XX", "T1", "A1", "A2", "O1"]);

/**
 * Approximate city centroids for common launch markets when IP city is unknown.
 * Used by GET /api/geo/me so the client can seed prefs without GPS.
 */
const COUNTRY_CENTROIDS: Record<
  string,
  { city: string; lat: number; lng: number }
> = {
  SG: { city: "Singapore", lat: 1.3521, lng: 103.8198 },
  NZ: { city: "Auckland", lat: -36.8509, lng: 174.7645 },
  IN: { city: "New Delhi", lat: 28.6139, lng: 77.209 },
  MY: { city: "Kuala Lumpur", lat: 3.139, lng: 101.6869 },
  AU: { city: "Sydney", lat: -33.8688, lng: 151.2093 },
  US: { city: "New York", lat: 40.7128, lng: -74.006 },
  GB: { city: "London", lat: 51.5074, lng: -0.1278 },
  PH: { city: "Manila", lat: 14.5995, lng: 120.9842 },
  ID: { city: "Jakarta", lat: -6.2088, lng: 106.8456 },
  TH: { city: "Bangkok", lat: 13.7563, lng: 100.5018 },
  JP: { city: "Tokyo", lat: 35.6762, lng: 139.6503 },
  KR: { city: "Seoul", lat: 37.5665, lng: 126.978 },
  CN: { city: "Shanghai", lat: 31.2304, lng: 121.4737 },
  HK: { city: "Hong Kong", lat: 22.3193, lng: 114.1694 },
  TW: { city: "Taipei", lat: 25.033, lng: 121.5654 },
  VN: { city: "Ho Chi Minh City", lat: 10.8231, lng: 106.6297 },
};

export type GeoSource = "header" | "ip" | "fallback";

export type ResolvedGeo = {
  country: string;
  city: string;
  lat: number;
  lng: number;
  source: GeoSource;
};

/** Normalize to uppercase ISO-3166-1 alpha-2, or null if unusable. */
export function normalizeCountryCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== 2) return null;
  if (INVALID_COUNTRY_CODES.has(code)) return null;
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

function headerCountry(req: Request): string | null {
  const candidates = [
    req.headers["cf-ipcountry"],
    req.headers["cloudfront-viewer-country"],
    req.headers["x-vercel-ip-country"],
    req.headers["x-country-code"],
  ];
  for (const raw of candidates) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const code = normalizeCountryCode(value);
    if (code) return code;
  }
  return null;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/, "");
  if (v === "127.0.0.1" || v === "::1" || v === "localhost") return true;
  if (v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  if (v.startsWith("172.")) {
    const second = Number(v.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function lookupIpCountry(ip: string): string | null {
  if (!ip || isPrivateOrLocalIp(ip)) return null;
  try {
    const hit = geoip.lookup(ip.replace(/^::ffff:/, ""));
    return normalizeCountryCode(hit?.country);
  } catch {
    return null;
  }
}

export function countryCentroid(country: string): {
  city: string;
  lat: number;
  lng: number;
} {
  return (
    COUNTRY_CENTROIDS[country] ?? {
      city: FALLBACK_CITY,
      lat: FALLBACK_LAT,
      lng: FALLBACK_LNG,
    }
  );
}

/** Resolve ISO-2 from CDN headers, then IP DB, else Singapore. */
export function resolveRequestCountry(req: Request): {
  country: string;
  source: GeoSource;
} {
  const fromHeader = headerCountry(req);
  if (fromHeader) return { country: fromHeader, source: "header" };

  const ip = req.ip ?? "";
  const fromIp = lookupIpCountry(ip);
  if (fromIp) return { country: fromIp, source: "ip" };

  return { country: FALLBACK_COUNTRY, source: "fallback" };
}

/** Full geo seed for onboarding when GPS is denied. */
export function resolveRequestGeo(req: Request): ResolvedGeo {
  const { country, source } = resolveRequestCountry(req);
  const centroid = countryCentroid(country);
  return {
    country,
    city: centroid.city,
    lat: centroid.lat,
    lng: centroid.lng,
    source,
  };
}
