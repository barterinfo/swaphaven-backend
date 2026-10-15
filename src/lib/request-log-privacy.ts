const PRECISE_LOCATION_QUERY_KEYS = new Set([
  "lat",
  "lng",
  "latitude",
  "longitude",
]);

/** Preserve request diagnostics without writing precise coordinates to logs. */
export function sanitizeRequestUrlForLogs(requestUrl: string): string {
  try {
    const parsed = new URL(requestUrl, "http://request.local");
    for (const key of [...parsed.searchParams.keys()]) {
      if (PRECISE_LOCATION_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return requestUrl.split("?")[0] ?? "/";
  }
}
