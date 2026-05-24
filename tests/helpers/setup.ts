/**
 * Runs before every test — truncates all tables so each test starts clean.
 */
import { beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
import { testDb } from "./db.js";

dotenv.config({ path: ".env.test" });

// Tables in reverse FK-dependency order so CASCADE isn't strictly needed,
// but we use CASCADE anyway for safety.
const TRUNCATE = `
  TRUNCATE TABLE
    notifications, messages, conversations,
    trade_reviews, trades,
    counter_offer_items, counter_offers,
    offer_items, offers,
    swipes, swipe_streaks,
    listing_wants, listing_images, listings, categories,
    device_tokens, user_profiles, users
  RESTART IDENTITY CASCADE
`;

beforeEach(async () => {
  await testDb.execute(sql.raw(TRUNCATE));
});
