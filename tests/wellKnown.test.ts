import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";
import { env } from "../src/config/env.js";

describe("GET /.well-known/apple-app-site-association", () => {
  it("returns AASA JSON with applinks details for /listings/*", async () => {
    const res = await request(app).get("/.well-known/apple-app-site-association");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      applinks: {
        apps: [],
        details: [
          {
            paths: ["/listings/*", "/users/*"],
          },
        ],
      },
    });
    expect(res.body.applinks.details[0].appID).toContain(env.IOS_BUNDLE_ID);
  });
});

describe("GET /.well-known/assetlinks.json", () => {
  it("returns Digital Asset Links JSON for the Android package", async () => {
    const res = await request(app).get("/.well-known/assetlinks.json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.ANDROID_PACKAGE_ID,
      },
    });
    expect(Array.isArray(res.body[0].target.sha256_cert_fingerprints)).toBe(true);
  });
});

describe("GET /listings/:listingId", () => {
  it("returns HTML preview containing the listing title", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken, {
      title: "Vintage Camera Share Preview",
      description: "A lovely film camera for trades.",
    });

    const res = await request(app)
      .get(`/listings/${listing.id}`)
      .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Vintage Camera Share Preview");
    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain("A lovely film camera for trades.");
  });

  it("returns 404 HTML for an unknown listing id", async () => {
    const res = await request(app).get(
      "/listings/00000000-0000-4000-8000-000000000000",
    );

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Listing not found");
  });

  it("returns 404 HTML for a non-uuid path segment", async () => {
    const res = await request(app).get("/listings/not-a-uuid");

    expect(res.status).toBe(404);
    expect(res.text).toContain("Listing not found");
  });
});

describe("GET /users/:userId", () => {
  it("returns HTML preview containing the display name", async () => {
    const { accessToken, user } = await registerUser({ name: "Share Profile User" });
    // Ensure profile exists via /me
    await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`/users/${user.id}`)
      .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Share Profile User");
    expect(res.text).toContain('property="og:title"');
  });

  it("returns 404 HTML for an unknown user id", async () => {
    const res = await request(app).get(
      "/users/00000000-0000-4000-8000-000000000000",
    );

    expect(res.status).toBe(404);
    expect(res.text).toContain("Profile not found");
  });
});
