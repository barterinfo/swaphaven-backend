import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import {
  askEventsTable,
  listingImagesTable,
  listingsTable,
  userWantsTable,
} from "../db/schema/index.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";
import { askBarterAi, embedText } from "../lib/barter-ai.js";
import { serializeListingBarter } from "../lib/barter-listing.js";
import { CANONICAL_CATEGORIES, categoryIdBySlug } from "../lib/categories.js";
import { resolveRequestCountry } from "../lib/geo-country.js";
import { computeMatchScore } from "../lib/match-score.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/error.js";

const router = Router();

const askSkipRateLimit = () =>
  env.NODE_ENV === "development" || env.NODE_ENV === "test";

const askUserLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `ask:user:${req.user?.sub ?? req.ip ?? "anon"}`,
  validate: false,
  skip: askSkipRateLimit,
  message: {
    error: "too_many_requests",
    message: "Too many Ask requests this hour. Try again later.",
  },
});

const askBody = z.object({
  text: z.string().trim().min(1).max(500),
  threadId: z.string().uuid().optional(),
  country: z.string().trim().min(2).max(2).optional(),
  prior: z
    .object({
      intent: z.enum(["seek", "sell", "both", "unclear"]).optional(),
      query: z.string().trim().max(120).nullable().optional(),
      categorySlug: z.string().trim().max(80).nullable().optional(),
      constraints: z
        .object({
          brand: z.string().trim().max(80).nullable().optional(),
          condition: z
            .enum(["new", "like_new", "great", "good", "fair"])
            .nullable()
            .optional(),
          maxValueCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
        })
        .optional(),
    })
    .optional(),
});

const eventBody = z.object({
  listingId: z.string().uuid(),
  kind: z.enum(["selected", "dismissed", "offered"]),
  threadId: z.string().uuid().optional(),
});

const wantBody = z.object({
  query: z.string().trim().min(1).max(120),
  categorySlug: z.string().trim().max(80).nullable().optional(),
  embedding: z.array(z.number()).min(8).max(4096).optional(),
  threadId: z.string().uuid().optional(),
});

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

// POST /api/ask
router.post("/", requireAuth, askUserLimiter, async (req, res, next) => {
  try {
    const parsed = askBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation",
        message:
          parsed.error.issues.map((i) => i.message).join("; ") || "Invalid ask body",
      });
    }

    const userId = req.user!.sub;
    const threadId = parsed.data.threadId ?? randomUUID();
    const country =
      parsed.data.country?.toUpperCase() ?? resolveRequestCountry(req).country;

    const excludeIds = await getActiveNegotiationListingIds(userId);

    let ai;
    try {
      ai = await askBarterAi({
        userId,
        text: parsed.data.text,
        country,
        categoryCatalog: CANONICAL_CATEGORIES.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })),
        excludeIds,
        excludeOwnerIds: [userId],
        limit: 8,
        prior: parsed.data.prior,
      });
    } catch (err) {
      if (
        err instanceof AppError &&
        (err.statusCode === 503 ||
          err.statusCode === 502 ||
          err.code === "ask_unavailable" ||
          err.code === "barter_ai_error" ||
          err.code === "barter_ai_unreachable")
      ) {
        return res.status(503).json({
          error: "ask_unavailable",
          message: "Ask is temporarily unavailable. Try search or swipe.",
        });
      }
      throw err;
    }

    const myListings = await db.query.listingsTable.findMany({
      where: and(eq(listingsTable.userId, userId), eq(listingsTable.status, "active")),
      columns: { id: true, title: true, category: true },
      limit: 40,
    });
    const myOfferCategories = new Set(
      myListings.map((l) => l.category.trim().toLowerCase()).filter(Boolean),
    );

    const rankedIds = ai.items.map((i) => i.listingId);
    const listingsOut: Array<Record<string, unknown>> = [];

    if (rankedIds.length) {
      const rows = await db.query.listingsTable.findMany({
        where: and(
          inArray(listingsTable.id, rankedIds),
          eq(listingsTable.status, "active"),
        ),
        with: {
          user: {
            columns: { id: true, name: true },
            with: { profile: { columns: { displayName: true } } },
          },
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const images = await db
        .select({
          listingId: listingImagesTable.listingId,
          url: listingImagesTable.url,
          position: listingImagesTable.position,
        })
        .from(listingImagesTable)
        .where(inArray(listingImagesTable.listingId, rankedIds))
        .orderBy(asc(listingImagesTable.position));
      const imagesByListing = new Map<string, string[]>();
      for (const img of images) {
        const list = imagesByListing.get(img.listingId) ?? [];
        list.push(img.url);
        imagesByListing.set(img.listingId, list);
      }

      const reasonById = new Map(ai.items.map((i) => [i.listingId, i]));

      for (const id of rankedIds) {
        const listing = byId.get(id);
        if (!listing) continue;
        const ranked = reasonById.get(id);
        const { mutualFitScore, matchedWantedLabels, matchReason } =
          computeMatchScore(listing.wantedCategories ?? [], myOfferCategories);
        const ownerName =
          listing.user?.profile?.displayName?.trim() ||
          listing.user?.name?.trim() ||
          "";
        const suggested = myListings.find(
          (l) =>
            matchedWantedLabels.some(
              (label) =>
                label.trim().toLowerCase() === l.category.trim().toLowerCase(),
            ),
        );
        const serialized = serializeListingBarter(listing, {
          ownerName,
          images: imagesByListing.get(id) ?? [],
        });
        listingsOut.push({
          ...serialized,
          matchReason: ranked?.reason || matchReason,
          mutualFitScore,
          matchedWantedLabels,
          suggestedClosetListingId: suggested?.id ?? null,
          score: ranked?.score ?? 0,
        });
      }
    }

    let sellDraft: {
      title: string;
      description: string;
      categorySlug: string;
      categoryId: string | null;
    } | null = null;
    if (ai.sellDraft) {
      sellDraft = {
        title: ai.sellDraft.title,
        description: ai.sellDraft.description,
        categorySlug: ai.sellDraft.categorySlug,
        categoryId: categoryIdBySlug(ai.sellDraft.categorySlug) ?? null,
      };
    }

    return res.json({
      threadId,
      intent: ai.intent,
      query: ai.query,
      categorySlug: ai.categorySlug,
      constraints: ai.constraints,
      message: ai.message,
      listings: listingsOut,
      sellDraft,
      queryEmbedding: ai.queryEmbedding,
      canWatch: ai.intent === "seek" || ai.intent === "both",
    });
  } catch (err) {
    next(err);
    return;
  }
});

// POST /api/ask/events — record select / dismiss / offer for taste learning
router.post("/events", requireAuth, async (req, res, next) => {
  try {
    const parsed = eventBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation",
        message:
          parsed.error.issues.map((i) => i.message).join("; ") || "Invalid event",
      });
    }
    const userId = req.user!.sub;
    const listing = await db.query.listingsTable.findFirst({
      where: eq(listingsTable.id, parsed.data.listingId),
      columns: { id: true },
    });
    if (!listing) {
      return res.status(404).json({ error: "not_found", message: "Listing not found" });
    }

    const [row] = await db
      .insert(askEventsTable)
      .values({
        userId,
        listingId: parsed.data.listingId,
        kind: parsed.data.kind,
        threadId: parsed.data.threadId ?? null,
      })
      .returning();

    return res.status(201).json({
      id: row.id,
      listingId: row.listingId,
      kind: row.kind,
      createdAt: row.createdAt,
    });
  } catch (err) {
    next(err);
    return;
  }
});

// POST /api/ask/wants — Keep watching
router.post("/wants", requireAuth, async (req, res, next) => {
  try {
    const parsed = wantBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation",
        message:
          parsed.error.issues.map((i) => i.message).join("; ") || "Invalid want",
      });
    }
    const userId = req.user!.sub;
    const queryNormalized = normalizeQuery(parsed.data.query);
    let embedding = parsed.data.embedding ?? null;
    if (!embedding) {
      embedding = await embedText(parsed.data.query);
    }

    const existing = await db.query.userWantsTable.findFirst({
      where: and(
        eq(userWantsTable.userId, userId),
        eq(userWantsTable.queryNormalized, queryNormalized),
        eq(userWantsTable.status, "active"),
      ),
    });

    if (existing) {
      const [updated] = await db
        .update(userWantsTable)
        .set({
          queryText: parsed.data.query.trim(),
          embedding: embedding ?? existing.embedding,
          categorySlug: parsed.data.categorySlug ?? existing.categorySlug,
          updatedAt: new Date(),
        })
        .where(eq(userWantsTable.id, existing.id))
        .returning();
      return res.json({
        id: updated.id,
        query: updated.queryText,
        categorySlug: updated.categorySlug,
        status: updated.status,
        refreshed: true,
      });
    }

    const [created] = await db
      .insert(userWantsTable)
      .values({
        userId,
        queryText: parsed.data.query.trim(),
        queryNormalized,
        embedding,
        categorySlug: parsed.data.categorySlug ?? null,
        status: "active",
      })
      .returning();

    return res.status(201).json({
      id: created.id,
      query: created.queryText,
      categorySlug: created.categorySlug,
      status: created.status,
      refreshed: false,
    });
  } catch (err) {
    next(err);
    return;
  }
});

// GET /api/ask/wants — list active wants for the signed-in user
router.get("/wants", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const rows = await db.query.userWantsTable.findMany({
      where: and(
        eq(userWantsTable.userId, userId),
        eq(userWantsTable.status, "active"),
      ),
      orderBy: (t, { desc }) => [desc(t.updatedAt)],
      limit: 50,
    });
    return res.json({
      wants: rows.map((w) => ({
        id: w.id,
        query: w.queryText,
        categorySlug: w.categorySlug,
        status: w.status,
        createdAt: w.createdAt,
        lastNotifiedAt: w.lastNotifiedAt,
      })),
    });
  } catch (err) {
    next(err);
    return;
  }
});

// DELETE /api/ask/wants/:wantId — pause / stop watching
router.delete("/wants/:wantId", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const wantIdRaw = req.params.wantId;
    const wantId = Array.isArray(wantIdRaw) ? wantIdRaw[0] : wantIdRaw;
    if (!wantId || !z.string().uuid().safeParse(wantId).success) {
      return res.status(400).json({ error: "validation", message: "Invalid want id" });
    }
    const [updated] = await db
      .update(userWantsTable)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(eq(userWantsTable.id, wantId), eq(userWantsTable.userId, userId)),
      )
      .returning();
    if (!updated) {
      return res.status(404).json({ error: "not_found", message: "Want not found" });
    }
    return res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
