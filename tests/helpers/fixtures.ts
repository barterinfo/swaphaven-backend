import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { categoryIdBySlug } from "../../src/lib/categories.js";
import { pendingRegistrationsTable } from "../../src/db/schema/index.js";
import { app } from "./app.js";
import { testDb } from "./db.js";

let seq = 0;
export const uid = () => `${++seq}-${Math.random().toString(36).slice(2, 7)}`;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
  email: string;
  password: string;
}

/** Completes email+password signup through OTP verify (plants a known OTP after start). */
export async function registerUser(overrides: Record<string, string> = {}): Promise<AuthResult> {
  const email    = `user-${uid()}@test.com`;
  const password = "TestPassword1!";
  const name     = "Test User";
  const body = { email, password, name, ...overrides };
  const normalized = String(body.email).toLowerCase();

  const start = await request(app).post("/api/auth/register").send(body);
  if (start.status !== 200) {
    throw new Error(`registerUser start failed: ${JSON.stringify(start.body)}`);
  }

  const otp = "123456";
  await testDb.update(pendingRegistrationsTable)
    .set({
      otpHash: sha256Hex(otp),
      otpAttempts: 0,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
    })
    .where(eq(pendingRegistrationsTable.email, normalized));

  const res = await request(app)
    .post("/api/auth/register/verify")
    .send({ email: normalized, token: otp });

  if (res.status !== 201) {
    throw new Error(`registerUser verify failed: ${JSON.stringify(res.body)}`);
  }
  return { ...res.body, email: normalized, password: body.password };
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export interface ListingResult {
  id: string;
  title: string;
  userId: string;
  status: string;
}

export async function createListing(
  accessToken: string,
  overrides: Record<string, unknown> = {},
): Promise<ListingResult> {
  // Accept legacy slug overrides (`category: "electronics"`) and map to UUID.
  const slug =
    typeof overrides.category === "string"
      ? overrides.category
      : typeof overrides.categoryId === "string" &&
          !String(overrides.categoryId).includes("-")
        ? String(overrides.categoryId)
        : "electronics";
  const resolvedCategoryId =
    (typeof overrides.categoryId === "string" &&
    String(overrides.categoryId).includes("-")
      ? overrides.categoryId
      : categoryIdBySlug(slug)) ?? categoryIdBySlug("electronics")!;

  const { categoryId: _ignoredCategoryId, ...restOverrides } = overrides;
  const res = await request(app)
    .post("/api/listings")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      title: `Item-${uid()}`,
      condition: "good",
      ...restOverrides,
      categoryId: resolvedCategoryId,
    });

  if (res.status !== 201) throw new Error(`createListing failed: ${JSON.stringify(res.body)}`);
  const body = res.body as {
    id?: string;
    title?: string;
    userId?: string;
    status?: string;
    listing?: { id?: string; title?: string; user_id?: string; status?: string };
  };
  return {
    id: body.listing?.id ?? body.id ?? "",
    title: body.listing?.title ?? body.title ?? "",
    userId: body.listing?.user_id ?? body.userId ?? "",
    status: body.listing?.status ?? body.status ?? "",
  };
}

// ─── Offers ───────────────────────────────────────────────────────────────────

export async function createOffer(
  buyerToken: string,
  listingId: string,
  offeredListingId: string,
) {
  const res = await request(app)
    .post("/api/offers")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ listingId, offeredListingIds: [offeredListingId] });

  if (res.status !== 201) throw new Error(`createOffer failed: ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

/**
 * Posts a counter-offer round on behalf of either party.
 * Defaults to zero cash on both sides; pass overrides to change individual fields.
 */
export async function createCounter(
  actorToken: string,
  offerId: string,
  buyerListingId: string,
  sellerListingId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post(`/api/offers/${offerId}/counter`)
    .set("Authorization", `Bearer ${actorToken}`)
    .send({
      buyerListingIds: [buyerListingId],
      sellerListingIds: [sellerListingId],
      buyerCashTopUpCents: 0,
      sellerCashRequestedCents: 0,
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`createCounter failed: ${JSON.stringify(res.body)}`);
  return res.body as { id: string; roundNumber: number; status: string };
}

export async function acceptOffer(sellerToken: string, offerId: string) {
  const res = await request(app)
    .post(`/api/offers/${offerId}/accept`)
    .set("Authorization", `Bearer ${sellerToken}`);

  if (res.status !== 200) throw new Error(`acceptOffer failed: ${JSON.stringify(res.body)}`);
  return res.body as { id: string; offerId: string; conversationId: string };
}

// ─── Full flow shortcuts ───────────────────────────────────────────────────────

/**
 * Creates two users + listings, buyer makes offer on seller's listing,
 * seller accepts → returns trade + conversationId.
 */
export async function fullTradeSetup() {
  const seller = await registerUser();
  const buyer  = await registerUser();

  const sellerListing = await createListing(seller.accessToken);
  const buyerListing  = await createListing(buyer.accessToken);

  const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);
  const trade = await acceptOffer(seller.accessToken, offer.id);

  return { seller, buyer, sellerListing, buyerListing, offer, trade };
}
