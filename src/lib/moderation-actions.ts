import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  contentReportsTable,
  deviceTokensTable,
  listingsTable,
  usersTable,
  userProfilesTable,
} from "../db/schema/index.js";
import {
  AccountDeletionError,
  purgeUserAccount,
  type PurgeUserAccountResult,
} from "./account-deletion.js";
import { hashEmail } from "./email-privacy.js";

export class ModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationError";
  }
}

export async function findUserByIdOrEmail(idOrEmail: string) {
  const key = idOrEmail.trim();
  const looksLikeUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  if (looksLikeUuid) {
    const byId = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, key),
    });
    if (byId) return byId;
  }
  return db.query.usersTable.findFirst({
    where: eq(usersTable.emailHash, hashEmail(key)),
  });
}

export async function listPendingReports(limit = 50) {
  return db
    .select({
      id: contentReportsTable.id,
      targetType: contentReportsTable.targetType,
      targetId: contentReportsTable.targetId,
      reportedUserId: contentReportsTable.reportedUserId,
      reporterId: contentReportsTable.reporterId,
      reason: contentReportsTable.reason,
      details: contentReportsTable.details,
      status: contentReportsTable.status,
      createdAt: contentReportsTable.createdAt,
      reportedEmail: usersTable.emailMasked,
      reportedName: userProfilesTable.displayName,
    })
    .from(contentReportsTable)
    .innerJoin(usersTable, eq(usersTable.id, contentReportsTable.reportedUserId))
    .leftJoin(userProfilesTable, eq(userProfilesTable.id, contentReportsTable.reportedUserId))
    .where(eq(contentReportsTable.status, "pending"))
    .orderBy(desc(contentReportsTable.createdAt))
    .limit(limit);
}

export async function getReport(reportId: string) {
  return db.query.contentReportsTable.findFirst({
    where: eq(contentReportsTable.id, reportId),
  });
}

/** Soft-delete a listing (status → deleted). Does not ban the owner. */
export async function softDeleteListing(listingId: string): Promise<{ id: string; title: string }> {
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
    columns: { id: true, title: true, status: true },
  });
  if (!listing) throw new ModerationError(`Listing not found: ${listingId}`);
  if (listing.status === "deleted") {
    return { id: listing.id, title: listing.title };
  }
  await db
    .update(listingsTable)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(listingsTable.id, listingId));
  return { id: listing.id, title: listing.title };
}

/**
 * Suspend a user: block login/refresh/social, soft-delete active listings,
 * clear push tokens. Does not delete the account row.
 */
export async function suspendUser(params: {
  userId: string;
  reason?: string;
}): Promise<{ userId: string; email: string; listingsDeleted: number }> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, params.userId),
  });
  if (!user) throw new ModerationError(`User not found: ${params.userId}`);

  const now = new Date();
  await db
    .update(usersTable)
    .set({
      suspendedAt: now,
      suspendedReason: params.reason?.trim() || "Policy violation",
      updatedAt: now,
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      passwordResetAttempts: 0,
    })
    .where(eq(usersTable.id, user.id));

  const deleted = await db
    .update(listingsTable)
    .set({ status: "deleted", updatedAt: now })
    .where(and(eq(listingsTable.userId, user.id), ne(listingsTable.status, "deleted")))
    .returning({ id: listingsTable.id });

  await db.delete(deviceTokensTable).where(eq(deviceTokensTable.userId, user.id));

  return {
    userId: user.id,
    email: user.emailMasked,
    listingsDeleted: deleted.length,
  };
}

/** Clear suspension so the user can sign in again. */
export async function unsuspendUser(userId: string): Promise<{ userId: string; email: string }> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });
  if (!user) throw new ModerationError(`User not found: ${userId}`);

  await db
    .update(usersTable)
    .set({
      suspendedAt: null,
      suspendedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  return { userId: user.id, email: user.emailMasked };
}

/**
 * Permanently delete a user via the segregated account-deletion purge.
 * Ops CLI wrapper — does not modify listing or offer route logic.
 */
export async function deleteUser(userId: string): Promise<PurgeUserAccountResult> {
  try {
    return await purgeUserAccount(userId);
  } catch (err) {
    if (err instanceof AccountDeletionError) {
      throw new ModerationError(err.message);
    }
    throw err;
  }
}

export async function markReport(
  reportId: string,
  status: "dismissed" | "actioned",
): Promise<void> {
  const report = await getReport(reportId);
  if (!report) throw new ModerationError(`Report not found: ${reportId}`);
  await db
    .update(contentReportsTable)
    .set({ status })
    .where(eq(contentReportsTable.id, reportId));
}
