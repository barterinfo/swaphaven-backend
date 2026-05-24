import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser } from "./helpers/fixtures.js";

vi.mock("../src/lib/media.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/media.js")>();
  return {
    ...actual,
    isMediaStorageConfigured: vi.fn(),
    createPresignedImageUpload: vi.fn(),
    createPresignedImageUploads: vi.fn(),
  };
});

import * as media from "../src/lib/media.js";

describe("GET /api/media/status", () => {
  it("reports whether S3 is configured", async () => {
    vi.mocked(media.isMediaStorageConfigured).mockReturnValue(false);
    const res = await request(app).get("/api/media/status");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.allowedContentTypes).toContain("image/jpeg");
  });
});

describe("POST /api/media/presign", () => {
  beforeEach(() => {
    vi.mocked(media.isMediaStorageConfigured).mockReset();
    vi.mocked(media.createPresignedImageUpload).mockReset();
  });

  it("returns 503 when S3 is not configured", async () => {
    vi.mocked(media.isMediaStorageConfigured).mockReturnValue(false);
    const { accessToken } = await registerUser();

    const res = await request(app)
      .post("/api/media/presign")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ contentType: "image/jpeg" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("media_not_configured");
  });

  it("returns presigned upload for a single image", async () => {
    vi.mocked(media.isMediaStorageConfigured).mockReturnValue(true);
    vi.mocked(media.createPresignedImageUpload).mockResolvedValue({
      uploadUrl: "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc",
      publicUrl: "https://cdn.example.com/listings/u1/photo.jpg",
      key: "listings/u1/photo.jpg",
      expiresIn: 300,
      headers: { "Content-Type": "image/jpeg" },
    });

    const { accessToken, user } = await registerUser();
    const res = await request(app)
      .post("/api/media/presign")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ contentType: "image/jpeg", filename: "photo.jpg" });

    expect(res.status).toBe(200);
    expect(res.body.publicUrl).toContain("cdn.example.com");
    expect(media.createPresignedImageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, contentType: "image/jpeg" }),
    );
  });

  it("returns batch presign uploads", async () => {
    vi.mocked(media.isMediaStorageConfigured).mockReturnValue(true);
    vi.mocked(media.createPresignedImageUploads).mockResolvedValue([
      {
        uploadUrl: "https://bucket.s3.amazonaws.com/a",
        publicUrl: "https://cdn.example.com/a.jpg",
        key: "listings/u1/a.jpg",
        expiresIn: 300,
        headers: { "Content-Type": "image/jpeg" },
      },
    ]);

    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/media/presign")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        files: [{ contentType: "image/jpeg" }, { contentType: "image/png" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.uploads).toHaveLength(1);
  });

  it("requires authentication", async () => {
    vi.mocked(media.isMediaStorageConfigured).mockReturnValue(true);
    const res = await request(app)
      .post("/api/media/presign")
      .send({ contentType: "image/jpeg" });
    expect(res.status).toBe(401);
  });
});

describe("filterListingImageUrls", () => {
  it("rejects local paths and keeps https URLs", async () => {
    const { filterListingImageUrls } = await import("../src/lib/media.js");
    expect(
      filterListingImageUrls([
        "/var/mobile/photo.jpg",
        "https://cdn.example.com/a.jpg",
        "file:///tmp/x",
      ]),
    ).toEqual(["https://cdn.example.com/a.jpg"]);
  });
});
