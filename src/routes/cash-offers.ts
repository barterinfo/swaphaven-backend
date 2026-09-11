import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  listingsTable,
  notificationsTable,
  offerRoundsTable,
  offerRoundItemsTable,
  offersTable,
  swipesTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { p } from "../lib/route-helpers.js";
import { serializeOfferRound } from "../lib/inbox-serializers.js";
import { ACTIVE_OFFER_STATUSES } from "../lib/active-offer-listings.js";
import { MAX_OFFER_ROUNDS } from "../lib/max-rounds.js";
import { sendPushToUser } from "../lib/push.js";
import { containsProfanity } from "../lib/moderation.js";
import { isBlockedEitherWay } from "../lib/user-blocks.js";
import { getCashOnlyQuota } from "../lib/cash-only-quota.js";
import {
  buildCashCounterOfferPush,
  buildCashOfferPush,
} from "../lib/cash-offer-push.js";

const router = Router();

const createCashOfferSchema = z.object({
  listingId: z.string().uuid(),
  cashTopUpCents: z.number().int().min(1, "Cash amount must be greater than zero"),
  swipeId: z.string().uuid().optional(),
  buyerNote: z.string().max(500).optional(),
});

const cashCounterSchema = z.object({
  buyerCashTopUpCents: z.number().int().min(0).default(0),
  sellerCashRequestedCents: z.number().int().min(0).default(0),
  sellerListingIds: z.array(z.string().uuid()).optional(),
  note: z.string().max(500).optional(),
}).superRefine((data, ctx) => {
  if (data.buyerCashTopUpCents <= 0 && data.sellerCashRequestedCents <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one cash amount must be greater than zero",
      path: ["buyerCashTopUpCents"],
    });
  }
});

// ─── GET /api/cash-offers/quota ───────────────────────────────────────────────
router.get("/quota", requireAuth, async (req, res) => {
  const quota = await getCashOnlyQuota(req.user!.sub);
  return res.json(quota);
});

// ─── POST /api/cash-offers ────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const parsed = createCashOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }

  if (containsProfanity(parsed.data.buyerNote)) {
    return res.status(400).json({
      error: "moderation",
      message: "buyerNote contains inappropriate language and cannot be used.",
    });
  }

  const { listingId, cashTopUpCents, swipeId, buyerNote } = parsed.data;
  const buyerId = req.user!.sub;

  const quota = await getCashOnlyQuota(buyerId);
  if (quota.remaining <= 0) {
    return res.status(403).json({
      error: "cash_only_quota",
      message: "You already offered cash once. List an item for barter.",
    });
  }

  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
  });
  if (!listing) {
    return res.status(404).json({ error: "not_found", message: "Listing not found" });
  }
  if (listing.userId === buyerId) {
    return res.status(400).json({
      error: "bad_request",
      message: "Cannot make an offer on your own listing",
    });
  }
  if (await isBlockedEitherWay(buyerId, listing.userId)) {
    return res.status(403).json({
      error: "forbidden",
      message: "You cannot make an offer to this user",
    });
  }
  if (listing.status !== "active") {
    return res.status(409).json({
      error: "conflict",
      message: "Listing is no longer active",
    });
  }

  let isSuperlike = false;
  if (swipeId) {
    const swipe = await db.query.swipesTable.findFirst({
      where: eq(swipesTable.id, swipeId),
      columns: { direction: true },
    });
    isSuperlike = swipe?.direction === "super";
  }

  const [offer] = await db
    .insert(offersTable)
    .values({
      listingId,
      buyerId,
      sellerId: listing.userId,
      swipeId: swipeId ?? null,
      cashTopUpCents,
      buyerNote: buyerNote ?? null,
      isSuperlike,
    })
    .returning();

  // Round 1 = cash-only proposal (no buyer items).
  const [round] = await db
    .insert(offerRoundsTable)
    .values({
      offerId: offer.id,
      roundNumber: 1,
      proposedBy: "buyer",
      buyerCashTopUpCents: cashTopUpCents,
      sellerCashRequestedCents: 0,
      note: buyerNote ?? null,
    })
    .returning();

  await db.insert(offerRoundItemsTable).values([
    {
      offerRoundId: round.id,
      listingId,
      side: "seller" as const,
      position: 0,
    },
  ]);

  await db.insert(notificationsTable).values({
    userId: listing.userId,
    type: "offer_received",
    title: "New cash offer!",
    body: "Someone offered cash for your item.",
    relatedOfferId: offer.id,
  });

  void (async () => {
    const payload = await buildCashOfferPush({
      offerId: offer.id,
      senderUserId: buyerId,
      cashTopUpCents,
      yourListingIds: [listingId],
    });
    await sendPushToUser(listing.userId, payload);
  })().catch(console.error);

  return res.status(201).json(offer);
});

// ─── POST /api/cash-offers/:offerId/counter ───────────────────────────────────
router.post("/:offerId/counter", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, offerId),
  });
  if (!offer) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  const isBuyer = offer.buyerId === userId;
  const isSeller = offer.sellerId === userId;
  if (!isBuyer && !isSeller) return res.status(403).json({ error: "forbidden" });

  if (isSeller && offer.currentTurn !== "seller") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to counter" });
  }
  if (isBuyer && offer.currentTurn !== "buyer") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to counter" });
  }
  if (!(ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return res.status(409).json({
      error: "conflict",
      message: `Cannot counter an offer with status ${offer.status}`,
    });
  }
  if (offer.roundCount >= MAX_OFFER_ROUNDS) {
    return res.status(409).json({
      error: "conflict",
      message: `Maximum negotiation rounds (${MAX_OFFER_ROUNDS}) reached`,
    });
  }

  const parsed = cashCounterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }
  if (containsProfanity(parsed.data.note)) {
    return res.status(400).json({
      error: "moderation",
      message: "note contains inappropriate language and cannot be used.",
    });
  }

  const {
    buyerCashTopUpCents,
    sellerCashRequestedCents,
    sellerListingIds: sellerListingIdsRaw,
    note,
  } = parsed.data;

  const sellerListingIds =
    sellerListingIdsRaw && sellerListingIdsRaw.length > 0
      ? sellerListingIdsRaw
      : [offer.listingId];

  const listings = await db.query.listingsTable.findMany({
    where: (t, { inArray }) => inArray(t.id, sellerListingIds),
    columns: { id: true, userId: true, status: true },
  });
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  for (const id of sellerListingIds) {
    const l = listingMap.get(id);
    if (!l) {
      return res.status(400).json({ error: "bad_request", message: `Listing ${id} not found` });
    }
    if (l.userId !== offer.sellerId) {
      return res.status(400).json({
        error: "bad_request",
        message: `Listing ${id} does not belong to the seller`,
      });
    }
    if (l.status !== "active") {
      return res.status(409).json({
        error: "conflict",
        message: `Listing ${id} is no longer active`,
      });
    }
  }

  const currentRound = await db.query.offerRoundsTable.findFirst({
    where: and(
      eq(offerRoundsTable.offerId, offerId),
      eq(offerRoundsTable.status, "pending"),
    ),
    orderBy: [desc(offerRoundsTable.roundNumber)],
  });
  if (currentRound) {
    await db
      .update(offerRoundsTable)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(eq(offerRoundsTable.id, currentRound.id));
  }

  const nextRoundNumber = offer.roundCount + 1;
  const nextTurn = isBuyer ? "seller" : "buyer";

  const [newRound] = await db
    .insert(offerRoundsTable)
    .values({
      offerId: offer.id,
      roundNumber: nextRoundNumber,
      proposedBy: isBuyer ? "buyer" : "seller",
      buyerCashTopUpCents,
      sellerCashRequestedCents,
      note: note ?? null,
    })
    .returning();

  await db.insert(offerRoundItemsTable).values(
    sellerListingIds.map((lid, i) => ({
      offerRoundId: newRound.id,
      listingId: lid,
      side: "seller" as const,
      position: i,
    })),
  );

  // Keep denormalized cash on the offer header for inbox cards.
  await db
    .update(offersTable)
    .set({
      status: "countered",
      currentTurn: nextTurn,
      roundCount: nextRoundNumber,
      cashTopUpCents: buyerCashTopUpCents,
      updatedAt: new Date(),
    })
    .where(eq(offersTable.id, offer.id));

  const notifyUserId = isBuyer ? offer.sellerId : offer.buyerId;
  await db.insert(notificationsTable).values({
    userId: notifyUserId,
    type: "counter_received",
    title: "Cash counter-offer received",
    body: "New cash terms proposed. Review and respond.",
    relatedOfferId: offer.id,
  });

  void (async () => {
    const payload = await buildCashCounterOfferPush({
      offerId: offer.id,
      senderUserId: userId,
      buyerCashTopUpCents,
      sellerCashRequestedCents,
    });
    await sendPushToUser(notifyUserId, payload);
  })().catch(console.error);

  return res.status(201).json(serializeOfferRound({ ...newRound, items: [] }));
});

export default router;
