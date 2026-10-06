import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { emailOutboxTable } from "../../db/schema/index.js";
import type { ActivityEmailPayload } from "../../db/schema/activity_email.js";
import { shouldEnqueueActivityEmail } from "./gates.js";

export type ActivityEmailEventType =
  | "new_swap_offer"
  | "new_cash_offer"
  | "swap_counter"
  | "cash_counter"
  | "offer_accepted"
  | "offer_declined"
  | "offer_withdrawn"
  | "new_message"
  | "listing_saved";

/**
 * Enqueue an activity email if the user has push off and is offline.
 * Chat messages coalesce into one pending row per conversation.
 */
export async function enqueueActivityEmail(args: {
  userId: string;
  eventType: ActivityEmailEventType;
  payload: ActivityEmailPayload;
  summary: string;
  coalesceKey?: string | null;
}): Promise<"enqueued" | "coalesced" | "skipped"> {
  if (!(await shouldEnqueueActivityEmail(args.userId))) {
    return "skipped";
  }

  if (args.coalesceKey) {
    const existing = await db.query.emailOutboxTable.findFirst({
      where: and(
        eq(emailOutboxTable.userId, args.userId),
        eq(emailOutboxTable.coalesceKey, args.coalesceKey),
        eq(emailOutboxTable.status, "pending"),
      ),
    });
    if (existing) {
      const prevCount =
        typeof existing.payload["messageCount"] === "number"
          ? (existing.payload["messageCount"] as number)
          : 1;
      const messageCount = prevCount + 1;
      await db
        .update(emailOutboxTable)
        .set({
          payload: { ...args.payload, messageCount },
          summary:
            messageCount > 1
              ? `${args.summary} (+${messageCount - 1} more)`
              : args.summary,
        })
        .where(eq(emailOutboxTable.id, existing.id));
      return "coalesced";
    }
  }

  await db.insert(emailOutboxTable).values({
    userId: args.userId,
    eventType: args.eventType,
    coalesceKey: args.coalesceKey ?? null,
    payload: args.payload,
    summary: args.summary,
    status: "pending",
  });
  return "enqueued";
}
