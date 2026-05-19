import { relations } from "drizzle-orm";
import { usersTable, userProfilesTable, deviceTokensTable, swipeStreaksTable } from "./users.js";
import { categoriesTable, listingsTable, listingImagesTable, listingWantsTable } from "./listings.js";
import { swipesTable } from "./swipes.js";
import {
  offersTable, offerItemsTable, counterOffersTable, counterOfferItemsTable,
} from "./offers.js";
import { tradesTable, tradeReviewsTable } from "./trades.js";
import { conversationsTable, messagesTable } from "./messages.js";
import { notificationsTable } from "./notifications.js";

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersRelations = relations(usersTable, ({ one, many }) => ({
  profile:       one(userProfilesTable, { fields: [usersTable.id], references: [userProfilesTable.id] }),
  deviceTokens:  many(deviceTokensTable),
  swipeStreak:   one(swipeStreaksTable, { fields: [usersTable.id], references: [swipeStreaksTable.userId] }),
  listings:      many(listingsTable),
  swipes:        many(swipesTable, { relationName: "swiper" }),
  sentOffers:    many(offersTable, { relationName: "buyer" }),
  receivedOffers:many(offersTable, { relationName: "seller" }),
  notifications: many(notificationsTable),
}));

export const userProfilesRelations = relations(userProfilesTable, ({ one }) => ({
  user: one(usersTable, { fields: [userProfilesTable.id], references: [usersTable.id] }),
}));

export const deviceTokensRelations = relations(deviceTokensTable, ({ one }) => ({
  user: one(usersTable, { fields: [deviceTokensTable.userId], references: [usersTable.id] }),
}));

export const swipeStreaksRelations = relations(swipeStreaksTable, ({ one }) => ({
  user: one(usersTable, { fields: [swipeStreaksTable.userId], references: [usersTable.id] }),
}));

// ─── Categories & Listings ────────────────────────────────────────────────────
export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  listings: many(listingsTable),
  wants:    many(listingWantsTable),
}));

export const listingsRelations = relations(listingsTable, ({ one, many }) => ({
  user:      one(usersTable, { fields: [listingsTable.userId], references: [usersTable.id] }),
  category:  one(categoriesTable, { fields: [listingsTable.categoryId], references: [categoriesTable.id] }),
  images:    many(listingImagesTable),
  wants:     many(listingWantsTable),
  swipes:    many(swipesTable),
  offerItems:many(offerItemsTable),
}));

export const listingImagesRelations = relations(listingImagesTable, ({ one }) => ({
  listing: one(listingsTable, { fields: [listingImagesTable.listingId], references: [listingsTable.id] }),
}));

export const listingWantsRelations = relations(listingWantsTable, ({ one }) => ({
  listing:  one(listingsTable, { fields: [listingWantsTable.listingId], references: [listingsTable.id] }),
  category: one(categoriesTable, { fields: [listingWantsTable.categoryId], references: [categoriesTable.id] }),
}));

// ─── Swipes ───────────────────────────────────────────────────────────────────
export const swipesRelations = relations(swipesTable, ({ one }) => ({
  swiper:  one(usersTable, { fields: [swipesTable.swiperId],  references: [usersTable.id], relationName: "swiper" }),
  listing: one(listingsTable, { fields: [swipesTable.listingId], references: [listingsTable.id] }),
}));

// ─── Offers ───────────────────────────────────────────────────────────────────
export const offersRelations = relations(offersTable, ({ one, many }) => ({
  listing:      one(listingsTable, { fields: [offersTable.listingId], references: [listingsTable.id] }),
  buyer:        one(usersTable, { fields: [offersTable.buyerId],   references: [usersTable.id], relationName: "buyer" }),
  seller:       one(usersTable, { fields: [offersTable.sellerId],  references: [usersTable.id], relationName: "seller" }),
  items:        many(offerItemsTable),
  counterOffer: one(counterOffersTable, { fields: [offersTable.id], references: [counterOffersTable.offerId] }),
  trade:        one(tradesTable, { fields: [offersTable.id], references: [tradesTable.offerId] }),
  conversation: one(conversationsTable, { fields: [offersTable.id], references: [conversationsTable.offerId] }),
}));

export const offerItemsRelations = relations(offerItemsTable, ({ one }) => ({
  offer:   one(offersTable, { fields: [offerItemsTable.offerId],   references: [offersTable.id] }),
  listing: one(listingsTable, { fields: [offerItemsTable.listingId], references: [listingsTable.id] }),
  counterOfferItem: one(counterOfferItemsTable, { fields: [offerItemsTable.id], references: [counterOfferItemsTable.offerItemId] }),
}));

export const counterOffersRelations = relations(counterOffersTable, ({ one, many }) => ({
  offer:  one(offersTable, { fields: [counterOffersTable.offerId], references: [offersTable.id] }),
  seller: one(usersTable, { fields: [counterOffersTable.sellerId], references: [usersTable.id] }),
  items:  many(counterOfferItemsTable),
}));

export const counterOfferItemsRelations = relations(counterOfferItemsTable, ({ one }) => ({
  counterOffer: one(counterOffersTable, { fields: [counterOfferItemsTable.counterOfferId], references: [counterOffersTable.id] }),
  offerItem:    one(offerItemsTable, { fields: [counterOfferItemsTable.offerItemId], references: [offerItemsTable.id] }),
}));

// ─── Trades ───────────────────────────────────────────────────────────────────
export const tradesRelations = relations(tradesTable, ({ one, many }) => ({
  offer:        one(offersTable, { fields: [tradesTable.offerId], references: [offersTable.id] }),
  counterOffer: one(counterOffersTable, { fields: [tradesTable.counterOfferId], references: [counterOffersTable.id] }),
  reviews:      many(tradeReviewsTable),
}));

export const tradeReviewsRelations = relations(tradeReviewsTable, ({ one }) => ({
  trade:    one(tradesTable, { fields: [tradeReviewsTable.tradeId], references: [tradesTable.id] }),
  reviewer: one(usersTable, { fields: [tradeReviewsTable.reviewerId], references: [usersTable.id] }),
  reviewee: one(usersTable, { fields: [tradeReviewsTable.revieweeId], references: [usersTable.id] }),
}));

// ─── Conversations & Messages ─────────────────────────────────────────────────
export const conversationsRelations = relations(conversationsTable, ({ one, many }) => ({
  offer:    one(offersTable, { fields: [conversationsTable.offerId], references: [offersTable.id] }),
  messages: many(messagesTable),
}));

export const messagesRelations = relations(messagesTable, ({ one }) => ({
  conversation: one(conversationsTable, { fields: [messagesTable.conversationId], references: [conversationsTable.id] }),
  sender:       one(userProfilesTable, { fields: [messagesTable.senderId], references: [userProfilesTable.id] }),
}));

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsRelations = relations(notificationsTable, ({ one }) => ({
  user: one(usersTable, { fields: [notificationsTable.userId], references: [usersTable.id] }),
}));
