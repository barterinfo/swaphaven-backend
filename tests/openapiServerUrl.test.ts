import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { getOpenApiSpec, resolveApiServerUrl } from "../src/openapi/serverUrl.js";

function mockRequest(overrides: {
  protocol?: string;
  headers?: Record<string, string | undefined>;
}): Pick<Request, "protocol" | "get"> {
  const headers = overrides.headers ?? {};
  return {
    protocol: overrides.protocol ?? "http",
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

describe("resolveApiServerUrl", () => {
  it("derives URL from forwarded headers behind a proxy", () => {
    expect(
      resolveApiServerUrl(
        mockRequest({
          protocol: "http",
          headers: {
            "x-forwarded-proto": "https",
            "x-forwarded-host": "swaphaven-api.up.railway.app",
          },
        }),
      ),
    ).toBe("https://swaphaven-api.up.railway.app");
  });

  it("falls back to request host when no proxy headers", () => {
    expect(
      resolveApiServerUrl(
        mockRequest({ protocol: "http", headers: { host: "localhost:3001" } }),
      ),
    ).toBe("http://localhost:3001");
  });
});

describe("getOpenApiSpec", () => {
  it("injects the server URL into the OpenAPI spec", () => {
    const spec = getOpenApiSpec("https://swaphaven-api.up.railway.app");
    expect(spec.servers).toEqual([
      { url: "https://swaphaven-api.up.railway.app", description: "Current host" },
    ]);
    expect(spec.info.title).toBe("SwapHaven API");
  });
});
