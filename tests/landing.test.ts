import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";

describe("GET /", () => {
  it("returns the landing page HTML for browser requests", async () => {
    const res = await request(app)
      .get("/")
      .set("Accept", "text/html,application/xhtml+xml");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Get the app");
    expect(res.text).toContain("App Store");
    expect(res.text).toContain("Google Play");
    expect(res.text).toContain('href="/privacy"');
    expect(res.text).toContain('href="/terms"');
  });

  it("returns JSON when the client explicitly requests application/json", async () => {
    const res = await request(app)
      .get("/")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      service: "swaphaven-api",
      health: "/api/healthz",
      ready: "/api/readyz",
    });
  });
});
