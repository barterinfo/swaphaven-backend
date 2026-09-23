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
      description: "A lovely film camera for trades. Listed 2026-09-08. Ref 520069.",
    });

    const res = await request(app)
      .get(`/listings/${listing.id}`)
      .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Vintage Camera Share Preview");
    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain("A lovely film camera for trades.");
    expect(res.text).not.toContain("Listed 2026-09-08");
    expect(res.text).not.toContain("Ref 520069");
  });

  it("shows App Store and Google Play buttons for desktop browsers", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken, {
      title: "Desktop Store Buttons Listing",
    });

    const res = await request(app)
      .get(`/listings/${listing.id}`)
      .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15");

    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain("App Store");
    expect(res.text).toContain("Google Play");
    expect(res.text).toContain("apps.apple.com/sg/app/barter-exchange");
    expect(res.text).toContain("play.google.com/store/apps/details");
    expect(res.text).not.toContain('href="#">Open in Barter');
    expect(res.text).toContain("On Barter now");
    expect(res.text).toContain('class="spotlight"');
    expect(res.text).toContain('class="logo-mark"');
    expect(res.text).toContain('aria-label="Barter home"');
    expect(res.text).toMatch(/class="brand"[^>]*href="\/"/);
    expect(res.text).toContain("store-btn--apple");
    expect(res.text).toContain("store-btn--google");
    expect(res.text).toContain("Download on the");
    expect(res.text).toContain("Get it on");
    expect(res.text).toContain('data-listing-mosaic');
    expect(res.text).toContain("orb--amber");
  });

  it("shows other active listings in a More on Barter grid", async () => {
    const owner = await registerUser();
    const featured = await createListing(owner.accessToken, { title: "Featured Cheese Board" });
    const other = await createListing(owner.accessToken, { title: "Other Acoustic Guitar" });

    const { listingImagesTable } = await import("../src/db/schema/index.js");
    const { testDb } = await import("./helpers/db.js");
    await testDb.insert(listingImagesTable).values([
      { listingId: featured.id, url: "https://cdn.example.com/cheese.jpg", position: 0 },
      { listingId: other.id, url: "https://cdn.example.com/guitar.jpg", position: 0 },
    ]);

    const res = await request(app)
      .get(`/listings/${featured.id}`)
      .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15");

    expect(res.status).toBe(200);
    expect(res.text).toContain("More on Barter");
    expect(res.text).toContain("Featured Cheese Board");
    expect(res.text).toContain(`/listings/${other.id}`);
    expect(res.text).toContain("Other Acoustic Guitar");
    expect(res.text).toContain("https://cdn.example.com/guitar.jpg");
    expect(res.text).toContain("bg-tile");
    expect(res.text).toContain("https://cdn.example.com/cheese.jpg");
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

  it("hands Android browsers an intent:// to the installed app before Play", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken, {
      title: "Android Store Redirect Listing",
    });

    const res = await request(app)
      .get(`/listings/${listing.id}`)
      .set(
        "User-Agent",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain(`intent://www.bartersg.com/listings/${listing.id}#Intent;`);
    expect(res.text).toContain(`package=${env.ANDROID_PACKAGE_ID}`);
    expect(res.text).toContain("Open in Barter");
    expect(res.text).toContain("S.browser_fallback_url=");
    expect(res.text).toContain("play.google.com");
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

  it("hands Android browsers an intent:// to the installed app before Play", async () => {
    const { accessToken, user } = await registerUser({ name: "Android Intent Profile" });
    await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`/users/${user.id}`)
      .set(
        "User-Agent",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      );

    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain(`intent://www.bartersg.com/users/${user.id}#Intent;`);
    expect(res.text).toContain(`package=${env.ANDROID_PACKAGE_ID}`);
    expect(res.text).toContain("Open in Barter");
  });
});
