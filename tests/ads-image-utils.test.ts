import { describe, expect, it } from "vitest";
import {
  explainS3UploadError,
  looksLikeDirectImageUrl,
  normalizeUserPath,
} from "../scripts/lib/ads-image-utils.js";

describe("normalizeUserPath", () => {
  it("trims whitespace", () => {
    expect(normalizeUserPath("  ~/Downloads/banner.png  ")).toBe("~/Downloads/banner.png");
  });

  it("strips single quotes from pasted paths", () => {
    expect(normalizeUserPath("'/Users/apple/Downloads/logo.jpeg'")).toBe(
      "/Users/apple/Downloads/logo.jpeg",
    );
  });

  it("strips double quotes from pasted paths", () => {
    expect(normalizeUserPath('"/tmp/ad.png"')).toBe("/tmp/ad.png");
  });

  it("leaves unquoted paths unchanged", () => {
    expect(normalizeUserPath("/Users/apple/Downloads/barter.png")).toBe(
      "/Users/apple/Downloads/barter.png",
    );
  });
});

describe("looksLikeDirectImageUrl", () => {
  it("accepts direct image URLs with common extensions", () => {
    expect(looksLikeDirectImageUrl("https://cdn.example.com/ads/banner.jpg")).toBe(true);
    expect(looksLikeDirectImageUrl("https://cdn.example.com/x.PNG")).toBe(true);
    expect(looksLikeDirectImageUrl("https://cdn.example.com/x.webp?token=abc")).toBe(true);
  });

  it("rejects CDN URLs without a file extension (e.g. Unsplash)", () => {
    expect(
      looksLikeDirectImageUrl(
        "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=600&q=80",
      ),
    ).toBe(false);
  });

  it("rejects web page URLs without image extensions", () => {
    expect(
      looksLikeDirectImageUrl("https://www.biography.com/athletes/a45977799/sachin-tendulkar"),
    ).toBe(false);
    expect(looksLikeDirectImageUrl("https://example.com/promo")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(looksLikeDirectImageUrl("not-a-url")).toBe(false);
  });
});

describe("explainS3UploadError", () => {
  it("adds bucket hint for missing bucket errors", () => {
    const msg = explainS3UploadError(
      new Error("The specified bucket does not exist"),
      "swaphaven-media-dev",
      "ap-southeast-1",
    );
    expect(msg).toContain("swaphaven-media-dev");
    expect(msg).toContain("ap-southeast-1");
    expect(msg).toContain("S3_SETUP.md");
  });

  it("adds IAM hint for access denied errors", () => {
    const msg = explainS3UploadError(
      new Error("User is not authorized to perform: s3:PutObject"),
      "swaphaven-media-prod",
      "ap-southeast-1",
    );
    expect(msg).toContain("ads/*");
    expect(msg).toContain("swaphaven-media-prod");
  });

  it("returns the original message for unknown errors", () => {
    expect(explainS3UploadError(new Error("network timeout"), "b", "r")).toBe("network timeout");
  });
});
