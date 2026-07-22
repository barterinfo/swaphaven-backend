import {
  pgTable, uuid, text, boolean, integer,
  timestamp, pgEnum, decimal, date,
} from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", ["ios", "android", "web"]);

// ─── users ────────────────────────────────────────────────────────────────────
export const usersTable = pgTable("users", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  email:                  text("email").notNull().unique(),
  passwordHash:           text("password_hash").notNull(),
  name:                   text("name").notNull(),
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetExpires:   timestamp("password_reset_expires"),
  passwordResetAttempts:  integer("password_reset_attempts").notNull().default(0),
  createdAt:              timestamp("created_at").notNull().defaultNow(),
  updatedAt:              timestamp("updated_at").notNull().defaultNow(),
});

// ─── pending_registrations ────────────────────────────────────────────────────
/** Email/password signup awaiting OTP verification — no `users` row until verified. */
export const pendingRegistrationsTable = pgTable("pending_registrations", {
  email:        text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  name:         text("name").notNull(),
  otpHash:      text("otp_hash").notNull(),
  otpExpires:   timestamp("otp_expires").notNull(),
  otpAttempts:  integer("otp_attempts").notNull().default(0),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

// ─── user_profiles ────────────────────────────────────────────────────────────
export const userProfilesTable = pgTable("user_profiles", {
  id:           uuid("id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  displayName:  text("display_name").notNull(),
  bio:          text("bio"),
  avatarUrl:    text("avatar_url"),
  locationCity: text("location_city"),
  locationLat:  decimal("location_lat", { precision: 9, scale: 6 }),
  locationLng:  decimal("location_lng", { precision: 9, scale: 6 }),
  tradeScore:   integer("trade_score").notNull().default(0),
  totalTrades:  integer("total_trades").notNull().default(0),
  ratingSum:    integer("rating_sum").notNull().default(0),
  ratingCount:  integer("rating_count").notNull().default(0),
  isVerified:          boolean("is_verified").notNull().default(false),
  // TODO(server-managed): populated by phone verification flow (follow-up PR).
  isPhoneVerified:     boolean("is_phone_verified").notNull().default(false),
  // TODO(server-managed): populated from trade completion stats (follow-up PR).
  completionRate:      integer("completion_rate"),
  // TODO(server-managed): populated from messaging response times (follow-up PR).
  avgResponseMinutes:  integer("avg_response_minutes"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

// ─── device_tokens ────────────────────────────────────────────────────────────
export const deviceTokensTable = pgTable("device_tokens", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token:     text("token").notNull().unique(),
  platform:  platformEnum("platform").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── swipe_streaks ────────────────────────────────────────────────────────────
export const swipeStreaksTable = pgTable("swipe_streaks", {
  userId:               uuid("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  currentStreak:        integer("current_streak").notNull().default(0),
  longestStreak:        integer("longest_streak").notNull().default(0),
  lastSwipeDate:        date("last_swipe_date"),
  bonusSwipesRemaining: integer("bonus_swipes_remaining").notNull().default(0),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type User                 = typeof usersTable.$inferSelect;
export type UserProfile          = typeof userProfilesTable.$inferSelect;
export type SwipeStreak          = typeof swipeStreaksTable.$inferSelect;
export type PendingRegistration  = typeof pendingRegistrationsTable.$inferSelect;
