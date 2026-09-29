import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("inbox email deep link redirects", () => {
  const app = createApp();

  it("redirects offer link to landing", async () => {
    const res = await request(app).get("/inbox/offers/abc-123");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://www.bartersg.com/");
  });

  it("redirects chat link to landing", async () => {
    const res = await request(app).get("/inbox/chats/conv-1");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://www.bartersg.com/");
  });

  it("redirects listing bookmark link to landing", async () => {
    const res = await request(app).get("/inbox/listings/listing-1");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://www.bartersg.com/");
  });
});
