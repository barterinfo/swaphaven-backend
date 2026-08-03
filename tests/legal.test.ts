import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";

describe("GET /privacy", () => {
  it("returns the static privacy policy HTML page", async () => {
    const res = await request(app).get("/privacy");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Privacy Policy");
    expect(res.text).toContain("Your Responsibility &amp; Assumption of Risk");
    expect(res.text).toContain("Limitation of Liability");
  });
});

describe("GET /terms", () => {
  it("returns the static terms and conditions HTML page", async () => {
    const res = await request(app).get("/terms");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Terms and Conditions");
    expect(res.text).toContain("Your Responsibility &amp; Assumption of Risk");
    expect(res.text).toContain("Limitation of Liability");
  });
});
