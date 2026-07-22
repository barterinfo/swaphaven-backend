/**
 * Runs before every test — truncates all tables so each test starts clean.
 */
import { beforeEach, afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
import { categoriesTable } from "../../src/db/schema/index.js";
import { CANONICAL_CATEGORIES } from "../../src/lib/categories.js";
import { testDb, testPool } from "./db.js";

dotenv.config({ path: ".env.test" });

// Global mailer stub so signup OTP (and reset) never hit Resend in tests.
vi.mock("../../src/lib/mailer.js", () => ({
  sendPasswordResetOtp: vi.fn().mockResolvedValue(undefined),
  sendRegistrationOtp: vi.fn().mockResolvedValue(undefined),
  MailerError: class MailerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MailerError";
    }
  },
}));

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
    device_tokens, user_profiles, users,
    pending_registrations
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
