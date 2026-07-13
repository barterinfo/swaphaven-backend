/**
 * Unit tests for src/lib/push.ts and route integration for push payloads.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import {
  registerUser,
  createListing,
  createOffer,
  createCounter,
  acceptOffer,
  fullTradeSetup,
} from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { deviceTokensTable } from "../src/db/schema/index.js";
import * as pushModule from "../src/lib/push.js";

const VALID_SA = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
});

const sendEachForMulticast = vi.fn();
const getApps = vi.fn(() => [] as unknown[]);
const initializeApp = vi.fn();
const cert = vi.fn((json: unknown) => json);
const getMessaging = vi.fn(() => ({ sendEachForMulticast }));

function setupFirebaseMocks() {
  sendEachForMulticast.mockReset();
  getApps.mockReturnValue([]);
  getMessaging.mockReturnValue({ sendEachForMulticast });

  vi.doMock("firebase-admin/app", () => ({ initializeApp, cert, getApps }));
  vi.doMock("firebase-admin/messaging", () => ({ getMessaging }));
}

async function loadPushModule(firebaseJson?: string) {
  vi.resetModules();
  if (firebaseJson === undefined) {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  } else {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", firebaseJson);
    setupFirebaseMocks();
  }
  return import("../src/lib/push.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendPushToUser", () => {
  it("returns early without calling FCM when FIREBASE_SERVICE_ACCOUNT_JSON is unset", async () => {
    const user = await registerUser();
    const { sendPushToUser } = await loadPushModule();

    await sendPushToUser(user.user.id, {
      title: "Test",
      body: "Body",
      data: { type: "offer", offerId: "offer-1" },
    });

    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("converts data fields to strings and calls sendEachForMulticast", async () => {
    const user = await registerUser();
    const { sendPushToUser } = await loadPushModule(VALID_SA);

    await testDb.insert(deviceTokensTable).values({
      userId: user.user.id,
      token: "fcm-token-abc",
      platform: "android",
    });

    sendEachForMulticast.mockResolvedValueOnce({
      responses: [{ success: true }],
    });

    await sendPushToUser(user.user.id, {
      title: "New offer",
      body: "Someone wants to trade",
      data: { type: "offer", offerId: "offer-123" },
    });

    expect(sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ["fcm-token-abc"],
      notification: { title: "New offer", body: "Someone wants to trade" },
      data: { type: "offer", offerId: "offer-123" },
      apns: { payload: { aps: { sound: "default" } } },
      android: { priority: "high" },
    });
  });

  it("deletes stale tokens rejected by FCM", async () => {
    const user = await registerUser();
    const { sendPushToUser } = await loadPushModule(VALID_SA);

    const [row] = await testDb
      .insert(deviceTokensTable)
      .values({ userId: user.user.id, token: "stale-token", platform: "ios" })
      .returning();

    sendEachForMulticast.mockResolvedValueOnce({
      responses: [
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered", message: "gone" },
        },
      ],
    });

    await sendPushToUser(user.user.id, {
      title: "Test",
      body: "Body",
      data: { type: "new_message", conversationId: "conv-1" },
    });

    const remaining = await testDb
      .select()
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.id, row!.id));
    expect(remaining).toHaveLength(0);
  });

  it("deletes tokens with invalid-registration-token error", async () => {
    const user = await registerUser();
    const { sendPushToUser } = await loadPushModule(VALID_SA);

    const [row] = await testDb
      .insert(deviceTokensTable)
      .values({ userId: user.user.id, token: "invalid-token", platform: "android" })
      .returning();

    sendEachForMulticast.mockResolvedValueOnce({
      responses: [
        {
          success: false,
          error: { code: "messaging/invalid-registration-token", message: "invalid" },
        },
      ],
    });

    await sendPushToUser(user.user.id, {
      title: "Test",
      body: "Body",
      data: { type: "offer", offerId: "offer-1" },
    });

    const remaining = await testDb
      .select()
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.id, row!.id));
    expect(remaining).toHaveLength(0);
  });
});

describe("route push integration", () => {
  beforeEach(() => {
    vi.spyOn(pushModule, "sendPushToUser").mockResolvedValue(undefined);
  });

  async function waitForPush() {
    await vi.waitFor(() => {
      expect(pushModule.sendPushToUser).toHaveBeenCalled();
    });
  }

  it("POST /api/offers sends offer push to seller", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);

    const res = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: sellerListing.id, offeredListingIds: [buyerListing.id] });

    expect(res.status).toBe(201);
    await waitForPush();
    expect(pushModule.sendPushToUser).toHaveBeenCalledWith(
      seller.user.id,
      expect.objectContaining({
        data: { type: "offer", offerId: res.body.id },
      }),
    );
  });

  it("POST /api/offers/:id/accept sends offer_accepted push to buyer", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    await waitForPush();
    expect(pushModule.sendPushToUser).toHaveBeenCalledWith(
      buyer.user.id,
      expect.objectContaining({
        data: { type: "offer_accepted", conversationId: res.body.conversationId },
      }),
    );
  });

  it("POST /api/offers/:id/counter sends counter_offer push to buyer", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ buyerListingIds: [buyerListing.id], sellerListingIds: [sellerListing.id] });

    expect(res.status).toBe(201);
    await waitForPush();
    expect(pushModule.sendPushToUser).toHaveBeenCalledWith(
      buyer.user.id,
      expect.objectContaining({
        data: { type: "counter_offer", offerId: offer.id },
      }),
    );
  });

  it("POST /api/offers/:id/counter/accept sends offer_accepted push to seller", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await createCounter(seller.accessToken, offer.id, buyerListing.id, sellerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/counter/accept`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    await waitForPush();
    expect(pushModule.sendPushToUser).toHaveBeenCalledWith(
      seller.user.id,
      expect.objectContaining({
        data: { type: "offer_accepted", conversationId: res.body.conversationId },
      }),
    );
  });

  it("POST /api/conversations/:id/messages sends new_message push to other user", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    const convId = trade.conversationId;

    vi.mocked(pushModule.sendPushToUser).mockClear();

    const res = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "Hello there!" });

    expect(res.status).toBe(201);
    await vi.waitFor(() => {
      expect(pushModule.sendPushToUser).toHaveBeenCalledWith(
        seller.user.id,
        expect.objectContaining({
          title: expect.any(String),
          body: "Hello there!",
          data: expect.objectContaining({
            type: "new_message",
            conversationId: convId,
            senderName: expect.any(String),
            tradeTitle: expect.stringMatching(/ Trade$/),
          }),
        }),
      );
    });
  });
});
