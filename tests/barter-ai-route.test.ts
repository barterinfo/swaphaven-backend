import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import * as barterAiClient from "../src/lib/barter-ai.js";
import { app } from "./helpers/app.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/barter-ai/ping", () => {
  it("returns configured false when BARTER_AI_URL is unset", async () => {
    vi.spyOn(barterAiClient, "publicPing").mockResolvedValue({ skipped: true });

    const res = await request(app).get("/api/barter-ai/ping");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: false,
      message: "BARTER_AI_URL is not set",
    });
  });

  it("returns barter-ai public ping response", async () => {
    vi.spyOn(barterAiClient, "publicPing").mockResolvedValue({
      skipped: false,
      status: "ok",
      service: "barter-ai",
      access: "public",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const res = await request(app).get("/api/barter-ai/ping");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: true,
      barterAi: {
        skipped: false,
        status: "ok",
        service: "barter-ai",
        access: "public",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    });
  });
});

describe("GET /api/barter-ai/ping/internal", () => {
  it("returns internal ping response", async () => {
    vi.spyOn(barterAiClient, "ping").mockResolvedValue({
      skipped: false,
      status: "ok",
      service: "barter-ai",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const res = await request(app).get("/api/barter-ai/ping/internal");

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.barterAi.service).toBe("barter-ai");
  });
});
