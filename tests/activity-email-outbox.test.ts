import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, uid } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import {
  deviceTokensTable,
  emailOutboxTable,
  userPresenceTable,
} from "../src/db/schema/index.js";
import { enqueueActivityEmail } from "../src/lib/activity-email/enqueue.js";
import { processActivityEmailOutbox } from "../src/lib/activity-email/outbox-worker.js";

const sendMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/lib/activity-email/send.js", () => ({
  sendActivityEmail: (...args: unknown[]) => sendMock(...args),
}));

async function setOfflinePushOff(userId: string): Promise<void> {
  await testDb
    .insert(userPresenceTable)
    .values({
      userId,
      lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
      isForeground: false,
      pushEnabled: false,
      pushReportedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPresenceTable.userId,
      set: {
        lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
        isForeground: false,
        pushEnabled: false,
        pushReportedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function backdatePending(userId: string, minutesAgo: number): Promise<void> {
  await testDb.execute(sql`
    UPDATE email_outbox
    SET created_at = now() - (${minutesAgo} || ' minutes')::interval
    WHERE user_id = ${userId}::uuid AND status = 'pending'
  `);
}

describe("activity email outbox", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  it("POST /api/presence/heartbeat records presence and cancels pending", async () => {
    const user = await registerUser();
    await setOfflinePushOff(user.user.id);

    await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "Someone saved your item",
      payload: {
        listingTitle: "Guitar",
        saverName: "Alex",
        buttonUrl: "https://www.bartersg.com/users/x",
      },
    });

    const pendingBefore = await testDb.query.emailOutboxTable.findMany({
      where: and(
        eq(emailOutboxTable.userId, user.user.id),
        eq(emailOutboxTable.status, "pending"),
      ),
    });
    expect(pendingBefore).toHaveLength(1);

    const res = await request(app)
      .post("/api/presence/heartbeat")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ state: "foreground", pushEnabled: false });
    expect(res.status).toBe(204);

    const pendingAfter = await testDb.query.emailOutboxTable.findMany({
      where: and(
        eq(emailOutboxTable.userId, user.user.id),
        eq(emailOutboxTable.status, "pending"),
      ),
    });
    expect(pendingAfter).toHaveLength(0);

    const cancelled = await testDb.query.emailOutboxTable.findMany({
      where: and(
        eq(emailOutboxTable.userId, user.user.id),
        eq(emailOutboxTable.status, "cancelled"),
      ),
    });
    expect(cancelled).toHaveLength(1);
  });

  it("skips enqueue when push is enabled", async () => {
    const user = await registerUser();
    await setOfflinePushOff(user.user.id);
    await testDb
      .update(userPresenceTable)
      .set({ pushEnabled: true })
      .where(eq(userPresenceTable.userId, user.user.id));

    const result = await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "Someone saved your item",
      payload: { listingTitle: "X", saverName: "Y", buttonUrl: "https://x" },
    });
    expect(result).toBe("skipped");

    const rows = await testDb.query.emailOutboxTable.findMany({
      where: eq(emailOutboxTable.userId, user.user.id),
    });
    expect(rows).toHaveLength(0);
  });

  it("skips enqueue when user is online", async () => {
    const user = await registerUser();
    await testDb.insert(userPresenceTable).values({
      userId: user.user.id,
      lastSeenAt: new Date(),
      isForeground: true,
      pushEnabled: false,
      pushReportedAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "Someone saved your item",
      payload: { listingTitle: "X", saverName: "Y", buttonUrl: "https://x" },
    });
    expect(result).toBe("skipped");
  });

  it("falls back to device_tokens when push never reported", async () => {
    const user = await registerUser();
    await testDb.insert(deviceTokensTable).values({
      userId: user.user.id,
      token: `tok-${uid()}`,
      platform: "ios",
    });

    const result = await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "Someone saved your item",
      payload: { listingTitle: "X", saverName: "Y", buttonUrl: "https://x" },
    });
    expect(result).toBe("skipped");
  });

  it("enqueues when push off and offline, then sends after delay", async () => {
    const user = await registerUser();
    await setOfflinePushOff(user.user.id);

    expect(
      await enqueueActivityEmail({
        userId: user.user.id,
        eventType: "new_swap_offer",
        summary: "Buyer wants to swap for your Vintage Guitar",
        payload: {
          listingTitle: "Vintage Guitar",
          senderName: "Buyer",
          offeredItemsLabel: "Camera",
          buttonUrl: "https://www.bartersg.com/inbox/offers/x",
        },
      }),
    ).toBe("enqueued");

    sendMock.mockClear();
    expect(await processActivityEmailOutbox()).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();

    await backdatePending(user.user.id, 31);
    expect(await processActivityEmailOutbox()).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const sent = await testDb.query.emailOutboxTable.findMany({
      where: and(
        eq(emailOutboxTable.userId, user.user.id),
        eq(emailOutboxTable.status, "sent"),
      ),
    });
    expect(sent).toHaveLength(1);
  });

  it("digest includes only pending rows; later activity is a new window", async () => {
    const user = await registerUser();
    await setOfflinePushOff(user.user.id);

    await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "A saved your item",
      payload: { listingTitle: "A", saverName: "A", buttonUrl: "https://x" },
    });
    await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "B saved your item",
      payload: { listingTitle: "B", saverName: "B", buttonUrl: "https://x" },
    });

    await backdatePending(user.user.id, 31);
    sendMock.mockClear();
    expect(await processActivityEmailOutbox()).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCall = sendMock.mock.calls[0]![1] as { subject: string; text: string };
    expect(firstCall.subject).toContain("2 updates");
    expect(firstCall.text).toContain("A saved your item");
    expect(firstCall.text).toContain("B saved your item");

    await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "C saved your item",
      payload: { listingTitle: "C", saverName: "C", buttonUrl: "https://x" },
    });
    await backdatePending(user.user.id, 31);
    sendMock.mockClear();
    expect(await processActivityEmailOutbox()).toBe(1);
    const secondCall = sendMock.mock.calls[0]![1] as { subject: string; text: string };
    // Single pending row uses the event template (not the digest shell).
    expect(secondCall.text).toContain("C bookmarked your C");
    expect(secondCall.text).not.toContain("A saved your item");
    expect(secondCall.text).not.toContain("B saved your item");
  });

  it("coalesces chat messages into one pending row", async () => {
    const user = await registerUser();
    await setOfflinePushOff(user.user.id);
    const key = `new_message:conv-${uid()}`;

    expect(
      await enqueueActivityEmail({
        userId: user.user.id,
        eventType: "new_message",
        coalesceKey: key,
        summary: "Alex messaged you about Guitar",
        payload: {
          listingTitle: "Guitar",
          senderName: "Alex",
          quote: "Hi",
          buttonUrl: "https://www.bartersg.com/inbox/chats/c",
          messageCount: 1,
        },
      }),
    ).toBe("enqueued");

    for (let i = 0; i < 4; i++) {
      expect(
        await enqueueActivityEmail({
          userId: user.user.id,
          eventType: "new_message",
          coalesceKey: key,
          summary: "Alex messaged you about Guitar",
          payload: {
            listingTitle: "Guitar",
            senderName: "Alex",
            quote: `msg ${i}`,
            buttonUrl: "https://www.bartersg.com/inbox/chats/c",
            messageCount: 1,
          },
        }),
      ).toBe("coalesced");
    }

    const rows = await testDb.query.emailOutboxTable.findMany({
      where: and(
        eq(emailOutboxTable.userId, user.user.id),
        eq(emailOutboxTable.status, "pending"),
      ),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload["messageCount"]).toBe(5);
    expect(rows[0]!.summary).toContain("+4 more");
  });

  it("cancels due rows when push is turned on before send", async () => {
    const user = await registerUser();
    await setOfflinePushOff(user.user.id);
    await enqueueActivityEmail({
      userId: user.user.id,
      eventType: "listing_saved",
      summary: "Someone saved your item",
      payload: { listingTitle: "X", saverName: "Y", buttonUrl: "https://x" },
    });
    await backdatePending(user.user.id, 31);

    await testDb
      .update(userPresenceTable)
      .set({ pushEnabled: true })
      .where(eq(userPresenceTable.userId, user.user.id));

    sendMock.mockClear();
    expect(await processActivityEmailOutbox()).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();

    const cancelled = await testDb.query.emailOutboxTable.findMany({
      where: and(
        eq(emailOutboxTable.userId, user.user.id),
        eq(emailOutboxTable.status, "cancelled"),
      ),
    });
    expect(cancelled).toHaveLength(1);
  });
});
