/** ~500 m grid cell for public map pins (area accuracy, not building-level). */
const CELL_DEG = 0.0045;

export type MapPinPrecision = "area" | "venue";

export type MapPin = {
  lat: number;
  lng: number;
  precision: MapPinPrecision;
};

/** Snap a coordinate to the center of a fixed ~500 m grid cell. */
export function snapToNeighbourhoodCell(lat: number, lng: number): {
  lat: number;
  lng: number;
} {
  const cellLat = (Math.floor(lat / CELL_DEG) + 0.5) * CELL_DEG;
  const cellLng = (Math.floor(lng / CELL_DEG) + 0.5) * CELL_DEG;
  return {
    lat: Math.round(cellLat * 1e6) / 1e6,
    lng: Math.round(cellLng * 1e6) / 1e6,
  };
}

/**
 * Public map pin for a listing. Venue pins use the stored point; area pins
 * (and legacy rows with null kind) use the neighbourhood cell.
 */
export function publicMapPin(opts: {
  lat: number | null;
  lng: number | null;
  pinKind: "area" | "venue" | null | undefined;
}): MapPin | null {
  if (opts.lat == null || opts.lng == null) return null;
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) return null;

  if (opts.pinKind === "venue") {
    return {
      lat: Math.round(opts.lat * 1e6) / 1e6,
      lng: Math.round(opts.lng * 1e6) / 1e6,
      precision: "venue",
    };
  }

  const cell = snapToNeighbourhoodCell(opts.lat, opts.lng);
  return { ...cell, precision: "area" };
}

export function haversineMiles(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = radians(toLat - fromLat);
  const lngDelta = radians(toLng - fromLng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(fromLat)) *
      Math.cos(radians(toLat)) *
      Math.sin(lngDelta / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}
