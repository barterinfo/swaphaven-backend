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

/** Payload that the mobile `InboxDeepLink.fromPayload()` parses. */
export interface PushPayload {
  title: string;
  body: string;
  /** FCM data dict — keys must be strings. */
  data: {
    type: "offer" | "counter_offer" | "offer_accepted" | "new_message";
    offerId?: string;
    conversationId?: string;
  };
}

/**
 * Sends a push notification to all registered devices for [userId].
 *
 * - Fire-and-forget: call with `.catch(console.error)` in route handlers.
 * - No-op when `FIREBASE_SERVICE_ACCOUNT_JSON` is not set.
 * - Automatically removes stale tokens that FCM rejects.
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

  const stringData: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data)) {
    if (v !== undefined) stringData[k] = v;
  }

  const response = await messaging.sendEachForMulticast({
    tokens: rows.map((r) => r.token),
    notification: { title: payload.title, body: payload.body },
    data: stringData,
    apns: { payload: { aps: { sound: "default" } } },
    android: { priority: "high" },
  });

  const successCount = response.responses.filter((r) => r.success).length;
  console.log(`[push] delivered ${successCount}/${rows.length} (type=${payload.data.type} userId=${userId})`);

  // Remove tokens that FCM no longer recognises.
  const staleIds: string[] = [];
  response.responses.forEach((r, i) => {
    if (
      !r.success &&
      (r.error?.code === "messaging/registration-token-not-registered" ||
        r.error?.code === "messaging/invalid-registration-token")
    ) {
      staleIds.push(rows[i]!.id);
    } else if (!r.success) {
      console.warn(`[push] failed for token index ${i}: ${r.error?.code} — ${r.error?.message}`);
    }
  });

  if (staleIds.length > 0) {
    console.log(`[push] removing ${staleIds.length} stale token(s) for userId=${userId}`);
    await db
      .delete(deviceTokensTable)
      .where(inArray(deviceTokensTable.id, staleIds));
  }
}
