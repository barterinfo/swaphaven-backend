import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  usersTable,
  userProfilesTable,
  deviceTokensTable,
  pendingRegistrationsTable,
} from "../db/schema/index.js";
import { requireAuth, signTokens, verifyRefreshToken } from "../middleware/auth.js";
import { SocialAuthError, verifySocialToken } from "../lib/social-auth.js";
import { sendPasswordResetOtp, sendRegistrationOtp } from "../lib/mailer.js";
import { env } from "../config/env.js";

const router = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function clearPasswordReset(userId: string): Promise<void> {
  await db.update(usersTable)
    .set({
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      passwordResetAttempts: 0,
    })
    .where(eq(usersTable.id, userId));
}

async function clearPendingRegistration(email: string): Promise<void> {
  await db.delete(pendingRegistrationsTable)
    .where(eq(pendingRegistrationsTable.email, email));
}

function userPublic(u: { id: string; email: string; name: string }) {
  return { id: u.id, email: u.email, name: u.name };
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Starts signup: stores pending credentials + emails a 6-digit OTP.
// Account is created only after POST /register/verify.
const registerSchema = z.object({
  email:       z.string().email(),
  password:    z.string().min(8, "Password must be at least 8 characters"),
  name:        z.string().min(1).max(80).trim(),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { email, password, name } = parsed.data;
  const normalized = email.toLowerCase();

  const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.email, normalized) });
  if (existing) return res.status(409).json({ error: "conflict", message: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 12);
  const otp = generateOtp();
  const otpHash = sha256Hex(otp);
  const otpExpires = new Date(Date.now() + OTP_TTL_MS);
  const now = new Date();

  await db.insert(pendingRegistrationsTable)
    .values({
      email: normalized,
      passwordHash,
      name,
      otpHash,
      otpExpires,
      otpAttempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pendingRegistrationsTable.email,
      set: {
        passwordHash,
        name,
        otpHash,
        otpExpires,
        otpAttempts: 0,
        updatedAt: now,
      },
    });

  try {
    await sendRegistrationOtp({
      to: normalized,
      otp,
      expiresMinutes: OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    console.error(`[auth] Failed to send registration OTP to ${normalized}:`, err);
    await clearPendingRegistration(normalized);
    return res.status(503).json({
      error: "service_unavailable",
      message: "Unable to send verification email. Please try again.",
    });
  }

  if (env.NODE_ENV !== "production") {
    console.info(`[auth] Registration OTP for ${normalized} (dev only): ${otp}`);
  }

  return res.status(200).json({
    message: "We sent a verification code to your email.",
  });
});

// ─── POST /api/auth/register/verify ───────────────────────────────────────────
const registerVerifySchema = z.object({
  email: z.string().email(),
  /** 6-digit OTP from the verification email (field name matches reset-password). */
  token: z.string().min(1),
});

router.post("/register/verify", async (req, res) => {
  const parsed = registerVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { email, token } = parsed.data;
  const normalized = email.toLowerCase();

  const pending = await db.query.pendingRegistrationsTable.findFirst({
    where: eq(pendingRegistrationsTable.email, normalized),
  });

  const invalid = !pending
    || pending.otpExpires < new Date()
    || pending.otpAttempts >= OTP_MAX_ATTEMPTS;

  if (invalid) {
    return res.status(400).json({ error: "bad_request", message: "Invalid or expired verification code" });
  }

  const submitted = Buffer.from(sha256Hex(token.trim()), "hex");
  const stored = Buffer.from(pending.otpHash, "hex");
  if (submitted.length !== stored.length || !crypto.timingSafeEqual(submitted, stored)) {
    const attempts = pending.otpAttempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await clearPendingRegistration(normalized);
    } else {
      await db.update(pendingRegistrationsTable)
        .set({ otpAttempts: attempts, updatedAt: new Date() })
        .where(eq(pendingRegistrationsTable.email, normalized));
    }
    return res.status(400).json({ error: "bad_request", message: "Invalid or expired verification code" });
  }

  // Race: account may have been created via social while OTP was pending.
  const already = await db.query.usersTable.findFirst({ where: eq(usersTable.email, normalized) });
  if (already) {
    await clearPendingRegistration(normalized);
    return res.status(409).json({ error: "conflict", message: "Email already registered" });
  }

  let user;
  try {
    [user] = await db.insert(usersTable).values({
      email: normalized,
      passwordHash: pending.passwordHash,
      name: pending.name,
    }).returning();
    await db.insert(userProfilesTable).values({ id: user.id, displayName: pending.name });
  } catch (err) {
    if (err instanceof DatabaseError && err.code === "23505") {
      await clearPendingRegistration(normalized);
      return res.status(409).json({ error: "conflict", message: "Email already registered" });
    }
    throw err;
  }

  await clearPendingRegistration(normalized);

  const tokens = signTokens(user.id, user.email);
  return res.status(201).json({ ...tokens, user: userPublic(user) });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { email, password } = parsed.data;
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email.toLowerCase()) });

  // Use constant-time comparison to avoid user enumeration timing attacks
  const dummyHash = "$2a$12$invalidhashfortimingprotection000000000000000000000000";
  const hashToCheck = user?.passwordHash ?? dummyHash;
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!user || !valid) {
    return res.status(401).json({ error: "unauthorized", message: "Invalid email or password" });
  }

  const tokens = signTokens(user.id, user.email);
  return res.json({ ...tokens, user: userPublic(user) });
});

// ─── POST /api/auth/social ────────────────────────────────────────────────────
const socialSchema = z.object({
  provider: z.enum(["google", "facebook"]),
  idToken:  z.string().min(1),
});

router.post("/social", async (req, res) => {
  const parsed = socialSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { provider, idToken } = parsed.data;

  let profile;
  try {
    profile = await verifySocialToken(provider, idToken);
  } catch (err) {
    if (err instanceof SocialAuthError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    throw err;
  }

  const normalized = profile.email.toLowerCase();
  // Keep the display name within the same bounds as /register so it can't diverge downstream.
  const name = profile.name.trim().slice(0, 80);

  let user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, normalized) });

  if (!user) {
    // Social accounts have no local password — store an unguessable random hash so
    // password login is effectively disabled until the user sets one via reset-password.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
    try {
      [user] = await db.insert(usersTable).values({ email: normalized, passwordHash, name }).returning();
      await db.insert(userProfilesTable).values({ id: user.id, displayName: name });
      // Drop any unfinished email/password signup for this address.
      await clearPendingRegistration(normalized);
    } catch (err) {
      // Concurrent sign-up (mobile clients often double-submit): the loser of the race hits the
      // unique-email constraint — recover by reading the row the winning request just created.
      if (err instanceof DatabaseError && err.code === "23505") {
        user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, normalized) });
        if (!user) throw err;
      } else {
        throw err;
      }
    }
  }

  const tokens = signTokens(user.id, user.email);
  return res.json({ ...tokens, user: userPublic(user) });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    return res.status(400).json({ error: "validation", message: "refreshToken required" });
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: "unauthorized", message: "Invalid or expired refresh token" });
  }

  // Verify user still exists
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, payload.sub) });
  if (!user) return res.status(401).json({ error: "unauthorized", message: "User no longer exists" });

  const tokens = signTokens(user.id, user.email);
  return res.json({ ...tokens, user: userPublic(user) });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Stateless — client discards tokens. Extend with a Redis denylist for production.
router.post("/logout", requireAuth, (_req, res) => {
  return res.status(204).send();
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.user!.sub),
  });
  if (!user) return res.status(404).json({ error: "not_found", message: "User not found" });
  return res.json({ user: userPublic(user) });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  // Always return the same response — prevents email enumeration
  const generic = {
    message: "If an account exists for that email, a password reset code has been sent.",
  };

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, parsed.data.email.toLowerCase()),
  });
  if (!user) return res.json(generic);

  const otp = generateOtp();
  const tokenHash = sha256Hex(otp);
  const expires = new Date(Date.now() + OTP_TTL_MS);

  await db.update(usersTable)
    .set({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: expires,
      passwordResetAttempts: 0,
    })
    .where(eq(usersTable.id, user.id));

  try {
    await sendPasswordResetOtp({
      to: user.email,
      otp,
      expiresMinutes: OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    console.error(`[auth] Failed to send password reset OTP to ${user.email}:`, err);
    await clearPasswordReset(user.id);
    return res.status(503).json({
      error: "service_unavailable",
      message: "Unable to send reset email. Please try again.",
    });
  }

  // Dev aid — OTP is still emailed; log only outside production.
  if (env.NODE_ENV !== "production") {
    console.info(`[auth] Password reset OTP for ${user.email} (dev only): ${otp}`);
  }

  return res.json(generic);
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
const resetPasswordSchema = z.object({
  email:       z.string().email(),
  /** 6-digit OTP from the reset email (field name kept for mobile compatibility). */
  token:       z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

router.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { email, token, newPassword } = parsed.data;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email.toLowerCase()),
  });

  const invalid = !user || !user.passwordResetTokenHash || !user.passwordResetExpires
    || user.passwordResetExpires < new Date()
    || user.passwordResetAttempts >= OTP_MAX_ATTEMPTS;

  if (invalid) {
    return res.status(400).json({ error: "bad_request", message: "Invalid or expired reset code" });
  }

  const submitted = Buffer.from(sha256Hex(token.trim()), "hex");
  const stored    = Buffer.from(user.passwordResetTokenHash!, "hex");
  if (submitted.length !== stored.length || !crypto.timingSafeEqual(submitted, stored)) {
    const attempts = user.passwordResetAttempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await clearPasswordReset(user.id);
    } else {
      await db.update(usersTable)
        .set({ passwordResetAttempts: attempts })
        .where(eq(usersTable.id, user.id));
    }
    return res.status(400).json({ error: "bad_request", message: "Invalid or expired reset code" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable)
    .set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      passwordResetAttempts: 0,
    })
    .where(eq(usersTable.id, user.id));

  return res.json({ message: "Password has been reset. You can now log in." });
});

// ─── POST /api/auth/device-token ─────────────────────────────────────────────
const deviceTokenSchema = z.object({
  token:    z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
});

router.post("/device-token", requireAuth, async (req, res) => {
  const parsed = deviceTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  await db.insert(deviceTokensTable)
    .values({ userId: req.user!.sub, ...parsed.data })
    .onConflictDoUpdate({
      target: deviceTokensTable.token,
      set: { userId: req.user!.sub, platform: parsed.data.platform },
    });

  return res.status(204).send();
});

export default router;
