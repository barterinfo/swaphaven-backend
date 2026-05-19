import request from "supertest";
import { app } from "./app.js";

let seq = 0;
export const uid = () => `${++seq}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
  email: string;
  password: string;
}

export async function registerUser(overrides: Record<string, string> = {}): Promise<AuthResult> {
  const email    = `user-${uid()}@test.com`;
  const password = "TestPassword1!";
  const name     = "Test User";

  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name, ...overrides });

  if (res.status !== 201) throw new Error(`registerUser failed: ${JSON.stringify(res.body)}`);
  return { ...res.body, email, password };
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
  const res = await request(app)
    .post("/api/listings")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: `Item-${uid()}`, condition: "good", ...overrides });

  if (res.status !== 201) throw new Error(`createListing failed: ${JSON.stringify(res.body)}`);
  return res.body as ListingResult;
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
