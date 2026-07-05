import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { testDb } from "./helpers/db.js";
import { sponsoredAdsTable } from "../src/db/schema/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    ctaUrl:             "ctaUrl" in overrides ? overrides.ctaUrl! : "https://example.com",
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

  it("returns null ctaUrl and backgroundImageUrl when unset", async () => {
    await insertAd({ ctaUrl: null, backgroundImageUrl: "" });

    const res = await request(app).get("/api/ads/active");
    const [ad] = res.body.ads as AdRow[];
    expect(ad.ctaUrl).toBeNull();
    expect(ad.backgroundImageUrl).toBe("");
  });

  it("returns S3 background image URL from the database", async () => {
    const imageUrl = "https://swaphaven-media-prod.s3.ap-southeast-1.amazonaws.com/ads/test.png";
    await insertAd({ backgroundImageUrl: imageUrl });

    const res = await request(app).get("/api/ads/active");
    expect((res.body.ads as AdRow[])[0]!.backgroundImageUrl).toBe(imageUrl);
  });

  it("does not expose internal columns (active, startsAt, endsAt)", async () => {
    await insertAd();

    const res = await request(app).get("/api/ads/active");
    const [ad] = res.body.ads as Record<string, unknown>[];
    expect(Object.keys(ad).sort()).toEqual([
      "backgroundImageUrl",
      "ctaColor",
      "ctaLabel",
      "ctaUrl",
      "id",
      "sponsorName",
      "tagline",
      "weight",
    ]);
  });

  it("tie-breaks equal weight by id ascending", async () => {
    const first = await insertAd({ sponsorName: "B", weight: 5 });
    const second = await insertAd({ sponsorName: "A", weight: 5 });

    const res = await request(app).get("/api/ads/active");
    const ids = (res.body.ads as AdRow[]).map((a) => a.id);
    const expected = [first.id, second.id].sort();
    expect(ids).toEqual(expected);
  });

  it("includes ads whose starts_at is in the past", async () => {
    await insertAd({ sponsorName: "Live" });
    await insertAd({ sponsorName: "Started", startsAt: new Date(Date.now() - 60_000) });

    const res = await request(app).get("/api/ads/active");
    const names = (res.body.ads as AdRow[]).map((a) => a.sponsorName);
    expect(names).toContain("Live");
    expect(names).toContain("Started");
  });
});

// ─── POST /api/ads/:id/click ──────────────────────────────────────────────────
describe("POST /api/ads/:id/click", () => {
  beforeEach(async () => {
    await testDb.delete(sponsoredAdsTable);
  });

  it("returns 204 and increments click_count (no auth required)", async () => {
    const ad = await insertAd();

    const res = await request(app).post(`/api/ads/${ad.id}/click`);
    expect(res.status).toBe(204);

    await sleep(50);
    const [row] = await testDb
      .select({ clickCount: sponsoredAdsTable.clickCount })
      .from(sponsoredAdsTable)
      .where(eq(sponsoredAdsTable.id, ad.id));
    expect(row!.clickCount).toBe(1);
  });

  it("increments click_count on repeated clicks", async () => {
    const ad = await insertAd();

    await request(app).post(`/api/ads/${ad.id}/click`);
    await request(app).post(`/api/ads/${ad.id}/click`);
    const res = await request(app).post(`/api/ads/${ad.id}/click`);
    expect(res.status).toBe(204);

    await sleep(50);
    const [row] = await testDb
      .select({ clickCount: sponsoredAdsTable.clickCount })
      .from(sponsoredAdsTable)
      .where(eq(sponsoredAdsTable.id, ad.id));
    expect(row!.clickCount).toBe(3);
  });

  it("returns 400 for a non-uuid id", async () => {
    const res = await request(app).post("/api/ads/not-a-uuid/click");
    expect(res.status).toBe(400);
  });

  it("returns 204 for an unknown ad id without throwing", async () => {
    const res = await request(app).post(
      "/api/ads/00000000-0000-4000-8000-000000000001/click",
    );
    expect(res.status).toBe(204);
  });

  it("increments clicks on paused ads (cached deck may still reference them)", async () => {
    const ad = await insertAd({ active: false });

    const res = await request(app).post(`/api/ads/${ad.id}/click`);
    expect(res.status).toBe(204);

    await sleep(50);
    const [row] = await testDb
      .select({ clickCount: sponsoredAdsTable.clickCount })
      .from(sponsoredAdsTable)
      .where(eq(sponsoredAdsTable.id, ad.id));
    expect(row!.clickCount).toBe(1);
  });
});

// ─── POST /api/ads/:id/impression ─────────────────────────────────────────────
describe("POST /api/ads/:id/impression", () => {
  beforeEach(async () => {
    await testDb.delete(sponsoredAdsTable);
  });

  it("returns 204 and increments impression_count (no auth required)", async () => {
    const ad = await insertAd();

    const res = await request(app).post(`/api/ads/${ad.id}/impression`);
    expect(res.status).toBe(204);

    await sleep(50);
    const [row] = await testDb
      .select({ impressionCount: sponsoredAdsTable.impressionCount })
      .from(sponsoredAdsTable)
      .where(eq(sponsoredAdsTable.id, ad.id));
    expect(row!.impressionCount).toBe(1);
  });

  it("increments impression_count on repeated impressions", async () => {
    const ad = await insertAd();

    await request(app).post(`/api/ads/${ad.id}/impression`);
    await request(app).post(`/api/ads/${ad.id}/impression`);
    const res = await request(app).post(`/api/ads/${ad.id}/impression`);
    expect(res.status).toBe(204);

    await sleep(50);
    const [row] = await testDb
      .select({ impressionCount: sponsoredAdsTable.impressionCount })
      .from(sponsoredAdsTable)
      .where(eq(sponsoredAdsTable.id, ad.id));
    expect(row!.impressionCount).toBe(3);
  });

  it("returns 400 for a non-uuid id", async () => {
    const res = await request(app).post("/api/ads/not-a-uuid/impression");
    expect(res.status).toBe(400);
  });

  it("returns 204 for an unknown ad id without throwing", async () => {
    const res = await request(app).post(
      "/api/ads/00000000-0000-4000-8000-000000000001/impression",
    );
    expect(res.status).toBe(204);
  });

  it("increments impressions on paused ads (cached deck may still reference them)", async () => {
    const ad = await insertAd({ active: false });

    const res = await request(app).post(`/api/ads/${ad.id}/impression`);
    expect(res.status).toBe(204);

    await sleep(50);
    const [row] = await testDb
      .select({ impressionCount: sponsoredAdsTable.impressionCount })
      .from(sponsoredAdsTable)
      .where(eq(sponsoredAdsTable.id, ad.id));
    expect(row!.impressionCount).toBe(1);
  });
});
