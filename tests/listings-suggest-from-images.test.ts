import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser } from "./helpers/fixtures.js";
import { categoryIdBySlug } from "../src/lib/categories.js";

vi.mock("../src/lib/barter-ai.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/barter-ai.js")>();
  return {
    ...actual,
    suggestListingFromImages: vi.fn(async () => ({
      title: "Sony WH-1000XM4 Headphones",
      description: "Lightly used noise-cancelling headphones.",
      categorySlug: "electronics",
      condition: "great" as const,
      brand: "Sony",
      ageRange: "2 years",
      estimatedValueCents: 22000,
      pricingRationale: "new ~S$400; used ~S$220",
      wantedCategorySlugs: ["cameras"],
      wantedFreeText: null,
      confidence: 0.9,
    })),
  };
});

describe("POST /api/listings/suggest-from-images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires auth", async () => {
    const res = await request(app)
      .post("/api/listings/suggest-from-images")
      .send({ imageUrls: ["https://cdn.example.com/a.jpg"] });
    expect(res.status).toBe(401);
  });

  it("validates imageUrls", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/listings/suggest-from-images")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ imageUrls: [] });
    expect(res.status).toBe(400);
  });

  it("returns mapped suggestion fields", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/listings/suggest-from-images")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        imageUrls: ["https://cdn.example.com/a.jpg"],
        country: "SG",
      });
    expect(res.status).toBe(200);
    expect(res.body.title).toContain("Sony");
    expect(res.body.categoryId).toBe(categoryIdBySlug("electronics"));
    expect(res.body.estimatedValueCents).toBe(22000);
    expect(res.body.wantedCategoryIds).toEqual([categoryIdBySlug("cameras")]);
    expect(res.body.condition).toBe("great");
  });
});
