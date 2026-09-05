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
    expect(res.text).toContain("Don’t sell first. Swap first.");
    expect(res.text).toContain("Download the app");
    expect(res.text).toContain("Download Barter and trade what you have.");
    expect(res.text).toContain("App Store");
    expect(res.text).toContain("Google Play");
    expect(res.text).toContain(
      "https://play.google.com/store/apps/details?id=com.barter.app.barter_mobile&amp;hl=en_SG",
    );
    expect(res.text).toContain("store-btn--apple store-btn--disabled");
    expect(res.text).toContain('href="/privacy"');
    expect(res.text).toContain('href="/terms"');
    expect(res.text).toContain('href="/delete-account"');
    expect(res.text).toContain('href="/landing/landing.css"');
    expect(res.text).toContain('src="/landing/landing.js"');
    expect(res.text).toContain('id="swipe"');
    expect(res.text).toContain('id="nearby"');
    expect(res.text).toContain('id="offers"');
    expect(res.text).toContain('id="chat"');
    expect(res.text).toContain("Interested → make an offer");
    expect(res.text).toContain("Bugis MRT");
  });

  it("serves landing CSS and JS as static assets", async () => {
    const css = await request(app).get("/landing/landing.css");
    expect(css.status).toBe(200);
    expect(css.headers["content-type"]).toMatch(/text\/css/);
    expect(css.text).toContain("--amber");

    const js = await request(app).get("/landing/landing.js");
    expect(js.status).toBe(200);
    expect(js.headers["content-type"]).toMatch(/javascript|ecmascript/);
    expect(js.text).toContain("IntersectionObserver");
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
