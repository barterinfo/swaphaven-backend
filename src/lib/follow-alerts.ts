import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  notificationsTable,
  userBlocksTable,
  userFollowsTable,
  userProfilesTable,
} from "../db/schema/index.js";
import { sendPushToUser, type PushDataType } from "./push.js";

/** Listings from one seller inside this window become a single alert. */
const BURST_WINDOW_MS = 15 * 60 * 1000;

type ActivityType = Extract<
  PushDataType,
  | "followed_listing"
  | "followed_listing_price"
  | "followed_listing_relisted"
  | "followed_trade_accepted"
>;

/**
 * Followers who should receive activity alerts: not muted, not blocked,
 * and with the global "new listings from people you follow" switch on.
 */
export async function alertableFollowerIds(sellerId: string): Promise<string[]> {
  const follows = await db
    .select({
      followerId: userFollowsTable.followerId,
      alertsMuted: userFollowsTable.alertsMuted,
    })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followeeId, sellerId));

  const unmuted = follows.filter((row) => !row.alertsMuted).map((row) => row.followerId);
  if (!unmuted.length) return [];

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

  const candidates = unmuted.filter((id) => !blocked.has(id));
  if (!candidates.length) return [];

  const profiles = await db
    .select({
      id: userProfilesTable.id,
      followListingAlerts: userProfilesTable.followListingAlerts,
    })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.id, candidates));

  const allowed = new Set(
    profiles.filter((row) => row.followListingAlerts).map((row) => row.id),
  );
  return candidates.filter((id) => allowed.has(id));
}

async function sellerDisplayName(sellerId: string): Promise<string> {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, sellerId),
    columns: { displayName: true },
  });
  return profile?.displayName?.trim() || "Someone";
}

async function fanOutActivity(opts: {
  sellerId: string;
  type: ActivityType;
  listingId: string;
  /** seller: one row per seller in the window. listing: one row per listing. none: always insert. */
  collapse: "seller" | "listing" | "none";
  titleFor: (count: number) => string;
  bodyFor: (name: string, count: number) => string;
}): Promise<void> {
  const recipients = await alertableFollowerIds(opts.sellerId);
  if (!recipients.length) return;

  const displayName = await sellerDisplayName(opts.sellerId);
  const since = new Date(Date.now() - BURST_WINDOW_MS);

  await Promise.all(
    recipients.map(async (userId) => {
      if (opts.collapse !== "none") {
        const conditions = [
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.type, opts.type),
          eq(notificationsTable.actorUserId, opts.sellerId),
          gte(notificationsTable.createdAt, since),
        ];
        if (opts.collapse === "listing") {
          conditions.push(eq(notificationsTable.relatedListingId, opts.listingId));
        }
        const recent = await db.query.notificationsTable.findFirst({
          where: and(...conditions),
          orderBy: [desc(notificationsTable.createdAt)],
        });
        if (recent) {
          const count = recent.burstCount + 1;
          await db
            .update(notificationsTable)
            .set({
              title: opts.titleFor(count),
              body: opts.bodyFor(displayName, count),
              relatedListingId: opts.listingId,
              burstCount: count,
              isRead: false,
            })
            .where(eq(notificationsTable.id, recent.id));
          return;
        }
      }

      const title = opts.titleFor(1);
      const body = opts.bodyFor(displayName, 1);
      await db.insert(notificationsTable).values({
        userId,
        actorUserId: opts.sellerId,
        type: opts.type,
        title,
        body,
        relatedListingId: opts.listingId,
        burstCount: 1,
      });
      await sendPushToUser(userId, {
        title,
        body,
        data: {
          type: opts.type,
          listingId: opts.listingId,
          title,
          body,
        },
      }).catch((err) => {
        console.error(`[push] ${opts.type} failed:`, userId, err);
      });
    }),
  );
}

/**
 * Fan-out in-app + FCM alerts when a seller publishes a listing.
 * Further listings from the same seller within 15 minutes update that row
 * ("Alex listed 3 items") and do not send another push.
 * Fire-and-forget from the create route — never throws to the caller.
 */
export async function notifyFollowersOfNewListing(opts: {
  sellerId: string;
  listingId: string;
  listingTitle: string;
}): Promise<void> {
  const { listingTitle } = opts;
  await fanOutActivity({
    sellerId: opts.sellerId,
    type: "followed_listing",
    listingId: opts.listingId,
    collapse: "seller",
    titleFor: (count) => (count > 1 ? "New listings" : "New listing"),
    bodyFor: (name, count) =>
      count > 1 ? `${name} listed ${count} items` : `${name} listed ${listingTitle}`,
  });
}

/** Price change on an active listing. Repeat edits of the same item stay one alert. */
export async function notifyFollowersOfPriceChange(opts: {
  sellerId: string;
  listingId: string;
  listingTitle: string;
}): Promise<void> {
  const { listingTitle } = opts;
  await fanOutActivity({
    sellerId: opts.sellerId,
    type: "followed_listing_price",
    listingId: opts.listingId,
    collapse: "listing",
    titleFor: () => "Price update",
    bodyFor: (name) => `${name} changed the price of ${listingTitle}`,
  });
}

/** Paused listing returned to active. */
export async function notifyFollowersOfRelist(opts: {
  sellerId: string;
  listingId: string;
  listingTitle: string;
}): Promise<void> {
  const { listingTitle } = opts;
  await fanOutActivity({
    sellerId: opts.sellerId,
    type: "followed_listing_relisted",
    listingId: opts.listingId,
    collapse: "listing",
    titleFor: () => "Back on Barter",
    bodyFor: (name) => `${name} listed ${listingTitle} again`,
  });
}

/** Followed seller accepted a trade. */
export async function notifyFollowersOfAcceptedTrade(opts: {
  sellerId: string;
  listingId: string;
  listingTitle: string;
}): Promise<void> {
  const { listingTitle } = opts;
  await fanOutActivity({
    sellerId: opts.sellerId,
    type: "followed_trade_accepted",
    listingId: opts.listingId,
    collapse: "none",
    titleFor: () => "Trade update",
    bodyFor: (name) => `${name} accepted a trade for ${listingTitle}`,
  });
}

/** Tell the followee that someone started following them. */
export async function notifyNewFollower(opts: {
  followeeId: string;
  followerId: string;
}): Promise<void> {
  const { followeeId, followerId } = opts;
  if (followeeId === followerId) return;

  const blocked = await db
    .select({
      blockerId: userBlocksTable.blockerId,
      blockedId: userBlocksTable.blockedId,
    })
    .from(userBlocksTable)
    .where(
      or(
        and(
          eq(userBlocksTable.blockerId, followeeId),
          eq(userBlocksTable.blockedId, followerId),
        ),
        and(
          eq(userBlocksTable.blockerId, followerId),
          eq(userBlocksTable.blockedId, followeeId),
        ),
      ),
    );
  if (blocked.length) return;

  const displayName = await sellerDisplayName(followerId);
  const title = "New follower";
  const body = `${displayName} started following you`;

  await db.insert(notificationsTable).values({
    userId: followeeId,
    actorUserId: followerId,
    type: "new_follower",
    title,
    body,
  });

  await sendPushToUser(followeeId, {
    title,
    body,
    data: {
      type: "new_follower",
      userId: followerId,
      title,
      body,
    },
  }).catch((err) => {
    console.error("[push] new_follower failed:", followeeId, err);
  });
}
