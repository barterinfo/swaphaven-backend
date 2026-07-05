import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { testDb } from "./helpers/db.js";
import { sponsoredAdsTable } from "../src/db/schema/index.js";

interface AdRow {
  id: string;
  sponsorName: string;
  tagline: string;
  ctaLabel: string;
  ctaColor: string;
  ctaUrl: string | null;
  backgroundImageUrl: string;
  weight: number;
}

async function insertAd(overrides: Partial<{
  sponsorName: string;
  tagline: string;
  ctaLabel: string;
  ctaColor: string;
  ctaUrl: string | null;
  backgroundImageUrl: string;
  active: boolean;
  weight: number;
  startsAt: Date | null;
  endsAt: Date | null;
}> = {}) {
  const [row] = await testDb.insert(sponsoredAdsTable).values({
    sponsorName:        overrides.sponsorName        ?? "Test Sponsor",
    tagline:            overrides.tagline            ?? "A test tagline.",
    ctaLabel:           overrides.ctaLabel           ?? "Learn More",
    ctaColor:           overrides.ctaColor           ?? "#F59E0B",
    ctaUrl:             overrides.ctaUrl             ?? "https://example.com",
    backgroundImageUrl: overrides.backgroundImageUrl ?? "",
    active:             overrides.active             ?? true,
    weight:             overrides.weight             ?? 1,
    startsAt:           overrides.startsAt           ?? null,
    endsAt:             overrides.endsAt             ?? null,
  }).returning();
  return row!;
}

// ─── GET /api/ads/active ──────────────────────────────────────────────────────
describe("GET /api/ads/active", () => {
  beforeEach(async () => {
    // Ads is a small, table-owned resource — clear between tests to keep
    // assertions deterministic without a full DB truncate.
    await testDb.delete(sponsoredAdsTable);
  });

  it("returns an empty list when no ads exist (no auth required)", async () => {
    const res = await request(app).get("/api/ads/active");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ads: [] });
  });

  it("returns active ads with the expected shape", async () => {
    await insertAd({ sponsorName: "GreenLoop", ctaUrl: "https://greenloop.example" });

    const res = await request(app).get("/api/ads/active");
    expect(res.status).toBe(200);
    expect(res.body.ads).toHaveLength(1);
    const [ad] = res.body.ads as AdRow[];
    expect(ad.sponsorName).toBe("GreenLoop");
    expect(ad.tagline).toBe("A test tagline.");
    expect(ad.ctaLabel).toBe("Learn More");
    expect(ad.ctaColor).toBe("#F59E0B");
    expect(ad.ctaUrl).toBe("https://greenloop.example");
    expect(ad.backgroundImageUrl).toBe("");
    expect(typeof ad.id).toBe("string");
    expect(typeof ad.weight).toBe("number");
  });

  it("excludes ads where active = false", async () => {
    await insertAd({ sponsorName: "Live" });
    await insertAd({ sponsorName: "Paused", active: false });

    const res = await request(app).get("/api/ads/active");
    const names = (res.body.ads as AdRow[]).map((a) => a.sponsorName);
    expect(names).toEqual(["Live"]);
  });

  it("excludes ads whose starts_at is still in the future", async () => {
    const oneHour = 60 * 60 * 1000;
    await insertAd({ sponsorName: "Live" });
    await insertAd({ sponsorName: "Future", startsAt: new Date(Date.now() + oneHour) });

    const res = await request(app).get("/api/ads/active");
    const names = (res.body.ads as AdRow[]).map((a) => a.sponsorName);
    expect(names).toEqual(["Live"]);
  });

  it("excludes ads whose ends_at is already in the past", async () => {
    const oneHour = 60 * 60 * 1000;
    await insertAd({ sponsorName: "Live" });
    await insertAd({ sponsorName: "Expired", endsAt: new Date(Date.now() - oneHour) });

    const res = await request(app).get("/api/ads/active");
    const names = (res.body.ads as AdRow[]).map((a) => a.sponsorName);
    expect(names).toEqual(["Live"]);
  });

  it("includes ads whose window brackets now", async () => {
    const oneHour = 60 * 60 * 1000;
    await insertAd({
      sponsorName: "Running",
      startsAt: new Date(Date.now() - oneHour),
      endsAt:   new Date(Date.now() + oneHour),
    });

    const res = await request(app).get("/api/ads/active");
    const names = (res.body.ads as AdRow[]).map((a) => a.sponsorName);
    expect(names).toEqual(["Running"]);
  });

  it("orders results by weight DESC", async () => {
    await insertAd({ sponsorName: "Low",    weight: 1 });
    await insertAd({ sponsorName: "High",   weight: 10 });
    await insertAd({ sponsorName: "Middle", weight: 5 });

    const res = await request(app).get("/api/ads/active");
    const names = (res.body.ads as AdRow[]).map((a) => a.sponsorName);
    expect(names).toEqual(["High", "Middle", "Low"]);
  });
});
