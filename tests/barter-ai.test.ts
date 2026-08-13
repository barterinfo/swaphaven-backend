/**
 * Unit tests for src/lib/barter-ai.ts.
 *
 * vi.resetModules() + vi.doMock() + dynamic import so env is fresh per test
 * (same pattern as social-auth.test.ts).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ping as PingFn, publicPing as PublicPingFn } from "../src/lib/barter-ai.js";

const SECRET = "test-internal-secret-at-least-32-characters!!";

type EnvOverrides = {
  BARTER_AI_URL?: string;
  BARTER_AI_SECRET?: string;
};

function setupMocks(envOverrides: EnvOverrides) {
  vi.resetModules();
  vi.doMock("../src/config/env.js", () => ({
    env: {
      BARTER_AI_URL: undefined,
      BARTER_AI_SECRET: undefined,
      ...envOverrides,
    },
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function loadPing(envOverrides: EnvOverrides = {}) {
  setupMocks(envOverrides);
  const mod = await import("../src/lib/barter-ai.js");
  return mod.ping as typeof PingFn;
}

async function loadPublicPing(envOverrides: EnvOverrides = {}) {
  setupMocks(envOverrides);
  const mod = await import("../src/lib/barter-ai.js");
  return mod.publicPing as typeof PublicPingFn;
}

describe("barter-ai client", () => {
  it("publicPing skips when BARTER_AI_URL is unset", async () => {
    const publicPing = await loadPublicPing({
      BARTER_AI_URL: undefined,
    });
    await expect(publicPing()).resolves.toEqual({ skipped: true });
  });

  it("publicPing calls /api/ping when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        service: "barter-ai",
        access: "public",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const publicPing = await loadPublicPing({
      BARTER_AI_URL: "http://localhost:3002",
    });
    const result = await publicPing();

    expect(result).toEqual({
      skipped: false,
      status: "ok",
      service: "barter-ai",
      access: "public",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3002/api/ping",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("skips when BARTER_AI_URL is unset", async () => {
    const ping = await loadPing({
      BARTER_AI_URL: undefined,
      BARTER_AI_SECRET: undefined,
    });
    await expect(ping()).resolves.toEqual({ skipped: true });
  });

  it("pings successfully when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        service: "barter-ai",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ping = await loadPing({
      BARTER_AI_URL: "http://localhost:3002",
      BARTER_AI_SECRET: SECRET,
    });
    const result = await ping();

    expect(result).toEqual({
      skipped: false,
      status: "ok",
      service: "barter-ai",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3002/api/internal/ping",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Internal-Key": SECRET,
        }),
      }),
    );
  });

  it("throws AppError on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const ping = await loadPing({
      BARTER_AI_URL: "http://localhost:3002",
      BARTER_AI_SECRET: SECRET,
    });
    await expect(ping()).rejects.toMatchObject({ code: "barter_ai_error" });
  });

  it("throws AppError when URL set but secret missing", async () => {
    const ping = await loadPing({
      BARTER_AI_URL: "http://localhost:3002",
      BARTER_AI_SECRET: undefined,
    });
    await expect(ping()).rejects.toMatchObject({ code: "barter_ai_misconfigured" });
  });

  it("throws AppError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const ping = await loadPing({
      BARTER_AI_URL: "http://localhost:3002",
      BARTER_AI_SECRET: SECRET,
    });
    await expect(ping()).rejects.toMatchObject({ code: "barter_ai_unreachable" });
  });
});
