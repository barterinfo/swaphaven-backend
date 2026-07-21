/**
 * Runs before every test — truncates all tables so each test starts clean.
 */
import { beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
import { categoriesTable } from "../../src/db/schema/index.js";
import { CANONICAL_CATEGORIES } from "../../src/lib/categories.js";
import { testDb, testPool } from "./db.js";

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
  // Re-seed canonical categories (same rows as drizzle/0015_seed_categories.sql).
  await testDb.insert(categoriesTable).values([...CANONICAL_CATEGORIES]);
});

afterAll(async () => {
  await testPool.end();
});
