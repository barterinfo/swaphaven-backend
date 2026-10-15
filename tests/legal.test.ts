import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";

describe("GET /privacy", () => {
  it("returns the static privacy policy HTML page", async () => {
    const res = await request(app).get("/privacy");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Privacy Policy");
    expect(res.text).toContain("Personal Data Protection Act 2012");
    expect(res.text).toContain("How nearby listings work");
    expect(res.text).toContain("Overseas Transfers");
    expect(res.text).toContain("Access, Correction, Withdrawal, and Complaints");
    expect(res.text).toContain("Data Protection Officer");
    expect(res.text).toContain("support@bartersg.com");
    expect(res.text).toContain("OpenAI");
    expect(res.text).toContain("Google Firebase");
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

describe("GET /delete-account", () => {
  it("returns the account deletion help page", async () => {
    const res = await request(app).get("/delete-account");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("How do I delete my Barter account?");
    expect(res.text).toContain("Delete my profile");
    expect(res.text).toContain("This cannot be undone");
    expect(res.text).toContain("Uploaded images");
    expect(res.text).toContain("support@bartersg.com");
  });
});
