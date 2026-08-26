import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { deviceTokensTable } from "../db/schema/index.js";
import { env } from "../config/env.js";

// ─── Firebase initialisation (lazy, once) ────────────────────────────────────
// We import lazily so that the module loads fine when
// FIREBASE_SERVICE_ACCOUNT_JSON is absent (dev / test / CI).

let _messagingReady = false;
let _initFailed = false;
let _getMessaging: (() => import("firebase-admin/messaging").Messaging) | null =
  null;

async function getMessagingInstance() {
  if (_initFailed) return null;
  if (_messagingReady) return _getMessaging!();

  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  try {
    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");

    if (getApps().length === 0) {
      initializeApp({
        credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      });
    }

    _getMessaging = getMessaging;
    _messagingReady = true;
    return getMessaging();
  } catch (err) {
    _initFailed = true;
    console.error("[push] Firebase init failed:", err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type PushDataType =
  | "offer"
  | "counter_offer"
  | "offer_accepted"
  | "new_message"
  | "announcement";

const APNS_CATEGORY: Record<PushDataType, string> = {
  offer: "BARTER_OFFER",
  counter_offer: "BARTER_COUNTER",
  offer_accepted: "BARTER_ACCEPTED",
  new_message: "BARTER_MESSAGE",
  announcement: "BARTER_ANNOUNCEMENT",
};

/** FCM `sendEachForMulticast` accepts at most 500 tokens per call. */
const FCM_MULTICAST_LIMIT = 500;

/**
 * Payload for FCM data-only pushes (native custom cards + deep links).
 * Title/body are mirrored into `data` as strings; do not send a top-level
 * FCM `notification` block (that prevents native card rendering).
 */
export interface PushPayload {
  title: string;
  body: string;
  /** FCM data dict — all values must be strings. */
  data: {
    type: PushDataType;
    offerId?: string;
    conversationId?: string;
    senderName?: string;
    title?: string;
    body?: string;
    theirItemName?: string;
    yourItemName?: string;
    fairTrade?: string;
    theirImageUrl?: string;
    yourImageUrl?: string;
    valueLabel?: string;
    timestampLabel?: string;
    tradeTitle?: string;
    senderAvatarUrl?: string;
    /** Announcement tap destination; mobile defaults to listings. */
    screen?: string;
  };
}

/**
 * Sends a push notification to all registered devices for [userId].
 *
 * - Fire-and-forget: call with `.catch(console.error)` in route handlers.
 * - No-op when `FIREBASE_SERVICE_ACCOUNT_JSON` is not set.
 * - Automatically removes stale tokens that FCM rejects.
 * - Data-only multicast: no top-level `notification` (Android custom cards).
 * - iOS gets `apns.payload.aps.alert` + category + mutable-content.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const messaging = await getMessagingInstance();
  if (!messaging) {
    console.log(`[push] skipped — FIREBASE_SERVICE_ACCOUNT_JSON not set (type=${payload.data.type} userId=${userId})`);
    return;
  }

  const rows = await db
    .select({ id: deviceTokensTable.id, token: deviceTokensTable.token })
    .from(deviceTokensTable)
    .where(eq(deviceTokensTable.userId, userId));

  if (rows.length === 0) {
    console.log(`[push] no device tokens registered for userId=${userId} (type=${payload.data.type})`);
    return;
  }

  console.log(`[push] sending type=${payload.data.type} to userId=${userId} (${rows.length} device(s))`);
  const delivered = await sendToTokenRows(messaging, rows, payload);
  console.log(`[push] delivered ${delivered}/${rows.length} (type=${payload.data.type} userId=${userId})`);
}

export interface PushBroadcastResult {
  tokenCount: number;
  delivered: number;
}

/**
 * Sends a push to every registered device token (ops announcements).
 *
 * Batches FCM multicast at 500 tokens. No-op when Firebase is unset.
 */
export async function sendPushBroadcast(
  payload: PushPayload,
): Promise<PushBroadcastResult> {
  const messaging = await getMessagingInstance();
  if (!messaging) {
    console.log(`[push] skipped — FIREBASE_SERVICE_ACCOUNT_JSON not set (type=${payload.data.type} broadcast)`);
    return { tokenCount: 0, delivered: 0 };
  }

  const rows = await db
    .select({ id: deviceTokensTable.id, token: deviceTokensTable.token })
    .from(deviceTokensTable);

  if (rows.length === 0) {
    console.log(`[push] no device tokens registered (type=${payload.data.type} broadcast)`);
    return { tokenCount: 0, delivered: 0 };
  }

  console.log(`[push] broadcasting type=${payload.data.type} to ${rows.length} device(s)`);
  const delivered = await sendToTokenRows(messaging, rows, payload);
  console.log(`[push] broadcast delivered ${delivered}/${rows.length} (type=${payload.data.type})`);
  return { tokenCount: rows.length, delivered };
}

type DeviceTokenRow = { id: string; token: string };

function buildStringData(payload: PushPayload): Record<string, string> {
  const stringData: Record<string, string> = {
    title: payload.title,
    body: payload.body,
  };
  for (const [k, v] of Object.entries(payload.data)) {
    if (v !== undefined) stringData[k] = v;
  }
  return stringData;
}

async function sendToTokenRows(
  messaging: import("firebase-admin/messaging").Messaging,
  rows: DeviceTokenRow[],
  payload: PushPayload,
): Promise<number> {
  const stringData = buildStringData(payload);
  let delivered = 0;
  const staleIds: string[] = [];

  for (let offset = 0; offset < rows.length; offset += FCM_MULTICAST_LIMIT) {
    const batch = rows.slice(offset, offset + FCM_MULTICAST_LIMIT);
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((r) => r.token),
      data: stringData,
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
        },
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            sound: "default",
            mutableContent: true,
            category: APNS_CATEGORY[payload.data.type],
          },
        },
      },
      android: { priority: "high" },
    });

    response.responses.forEach((r, i) => {
      if (r.success) {
        delivered += 1;
        return;
      }
      if (
        r.error?.code === "messaging/registration-token-not-registered" ||
        r.error?.code === "messaging/invalid-registration-token"
      ) {
        staleIds.push(batch[i]!.id);
      } else {
        console.warn(`[push] failed for token index ${offset + i}: ${r.error?.code} — ${r.error?.message}`);
      }
    });
  }

  if (staleIds.length > 0) {
    console.log(`[push] removing ${staleIds.length} stale token(s)`);
    await db
      .delete(deviceTokensTable)
      .where(inArray(deviceTokensTable.id, staleIds));
  }

  return delivered;
}
