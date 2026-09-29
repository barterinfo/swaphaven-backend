import { eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  notificationsTable,
  userBlocksTable,
} from "../db/schema/index.js";
import { followerIds } from "./user-follows.js";
import { sendPushToUser } from "./push.js";

/**
 * Fan-out in-app + FCM alerts to followers when a seller publishes a listing.
 * Fire-and-forget from the create route — never throws to the caller.
 */
export async function notifyFollowersOfNewListing(opts: {
  sellerId: string;
  listingId: string;
  listingTitle: string;
}): Promise<void> {
  const { sellerId, listingId, listingTitle } = opts;
  const followers = await followerIds(sellerId);
  if (!followers.length) return;

  const blockRows = await db
    .select({
      blockerId: userBlocksTable.blockerId,
      blockedId: userBlocksTable.blockedId,
    })
    .from(userBlocksTable)
    .where(
      or(
        eq(userBlocksTable.blockerId, sellerId),
        eq(userBlocksTable.blockedId, sellerId),
      ),
    );

  const blocked = new Set<string>();
  for (const row of blockRows) {
    if (row.blockerId === sellerId) blocked.add(row.blockedId);
    else blocked.add(row.blockerId);
  }

  const recipientIds = followers.filter((id) => !blocked.has(id));
  if (!recipientIds.length) return;

  const sellerProfile = await db.query.userProfilesTable.findFirst({
    where: (t, { eq: eqCol }) => eqCol(t.id, sellerId),
    columns: { displayName: true },
  });
  const displayName = sellerProfile?.displayName?.trim() || "Someone";
  const title = "New listing";
  const body = `${displayName} listed ${listingTitle}`;

  await db.insert(notificationsTable).values(
    recipientIds.map((userId) => ({
      userId,
      type: "followed_listing" as const,
      title,
      body,
      relatedListingId: listingId,
    })),
  );

  await Promise.all(
    recipientIds.map((userId) =>
      sendPushToUser(userId, {
        title,
        body,
        data: {
          type: "followed_listing",
          listingId,
          title,
          body,
        },
      }).catch((err) => {
        console.error("[push] followed_listing failed:", userId, err);
      }),
    ),
  );
}
