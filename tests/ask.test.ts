import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { AppError } from "../src/middleware/error.js";
import { askBarterAi } from "../src/lib/barter-ai.js";
import { app } from "./helpers/app.js";
import { registerUser } from "./helpers/fixtures.js";

vi.mock("../src/lib/barter-ai.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/barter-ai.js")>();
  return {
    ...actual,
    askBarterAi: vi.fn(async () => ({
      intent: "seek" as const,
      query: "camera",
      categorySlug: "cameras",
      constraints: { brand: null, condition: null, maxValueCents: null },
      sellDraft: null,
      message: "Here are cameras you can offer on.",
      items: [],
      queryEmbedding: null,
    })),
    embedText: vi.fn(async () => [0.1, 0.2, 0.3]),
    scheduleListingEmbed: vi.fn(),
    embedListingAwait: vi.fn(async () => undefined),
  };
});

// Ask routes require auth — unauthenticated calls must 401.
describe("POST /api/ask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires auth", async () => {
    const res = await request(app).post("/api/ask").send({ text: "I want a camera" });
    expect(res.status).toBe(401);
  });

  it("events require auth", async () => {
    const res = await request(app)
      .post("/api/ask/events")
      .send({
        listingId: "a0000000-0000-4000-8000-000000000001",
        kind: "selected",
      });
    expect(res.status).toBe(401);
  });

  it("wants require auth", async () => {
    const res = await request(app)
      .post("/api/ask/wants")
      .send({ query: "camera" });
    expect(res.status).toBe(401);
  });

  it("maps barter-ai upstream failures to friendly 503 ask_unavailable", async () => {
    vi.mocked(askBarterAi).mockRejectedValueOnce(
      new AppError(502, "barter_ai_error", "barter-ai ask failed with HTTP 503"),
    );
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/ask")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "I want a camera" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "ask_unavailable",
      message: "Ask is temporarily unavailable. Try search or swipe.",
    });
  });
});
