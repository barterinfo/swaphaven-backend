import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOMINATIM_SEARCH_URL,
  OVERPASS_ENDPOINTS,
  OVERPASS_USER_AGENT,
  fetchTransitSuggestions,
  resetOverpassCache,
} from "../src/lib/overpass.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const orchardMrt = {
  type: "node",
  id: 1,
  lat: 1.3048,
  lon: 103.8318,
  tags: { name: "Orchard MRT", railway: "station", station: "subway" },
};

const nominatimOrchard = {
  name: "Orchard",
  lat: "1.30312",
  lon: "103.83138",
  class: "railway",
  type: "station",
};

function mockByUrl(handler: (url: string) => Response | Promise<Response>): void {
  vi.mocked(fetch).mockImplementation(async (input) => handler(String(input)));
}

describe("fetchTransitSuggestions", () => {
  beforeEach(() => {
    resetOverpassCache();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an identifying User-Agent (Overpass rejects Node's empty UA with 406)", async () => {
    mockByUrl((url) => {
      if (url.includes("nominatim")) return jsonResponse(200, []);
      return jsonResponse(200, { elements: [orchardMrt] });
    });

    await fetchTransitSuggestions(1.304, 103.832);

    const overpassCall = vi.mocked(fetch).mock.calls.find(([u]) => String(u).includes("overpass"));
    expect(overpassCall?.[1]).toEqual(expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "User-Agent": OVERPASS_USER_AGENT,
        Accept: "application/json",
      }),
    }));
  });

  it("uses a successful Overpass mirror when another returns 406", async () => {
    mockByUrl((url) => {
      if (url.includes("nominatim")) return jsonResponse(200, []);
      if (url.includes("overpass-api.de")) return jsonResponse(406, { error: "Not Acceptable" });
      if (url.includes("kumi.systems")) return jsonResponse(200, { elements: [orchardMrt] });
      return jsonResponse(504, {});
    });

    const suggestions = await fetchTransitSuggestions(1.305, 103.833);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.name).toBe("Orchard MRT");
    expect(suggestions[0]?.type).toBe("MRT Station");
  });

  it("falls back to Nominatim when every Overpass mirror fails", async () => {
    mockByUrl((url) => {
      if (url.startsWith(NOMINATIM_SEARCH_URL)) return jsonResponse(200, [nominatimOrchard]);
      return jsonResponse(504, {});
    });

    const suggestions = await fetchTransitSuggestions(1.3048, 103.8318);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.name).toBe("Orchard");
    expect(suggestions[0]?.type).toBe("Train Station");
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith(NOMINATIM_SEARCH_URL))).toBe(true);
  });

  it("returns an empty list when both sources have no named stops", async () => {
    mockByUrl((url) => {
      if (url.includes("nominatim")) return jsonResponse(200, []);
      return jsonResponse(200, { elements: [] });
    });

    await expect(fetchTransitSuggestions(28.159, -24.279)).resolves.toEqual([]);
  });

  it("throws after Overpass and Nominatim both fail", async () => {
    mockByUrl(() => jsonResponse(504, {}));

    await expect(fetchTransitSuggestions(1.306, 103.834)).rejects.toThrow(
      /Meetup POI lookup failed/,
    );
  });

  it("caches a successful response so a second call does not hit the network", async () => {
    mockByUrl((url) => {
      if (url.includes("nominatim")) return jsonResponse(200, []);
      return jsonResponse(200, { elements: [orchardMrt] });
    });

    const first = await fetchTransitSuggestions(1.307, 103.835);
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length;
    const second = await fetchTransitSuggestions(1.307, 103.835);

    expect(first).toEqual(second);
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsAfterFirst);
  });
});
