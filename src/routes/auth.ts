import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { usersTable, userProfilesTable, deviceTokensTable } from "../db/schema/index.js";
import { requireAuth, signTokens, verifyRefreshToken } from "../middleware/auth.js";

const router = Router();

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function userPublic(u: { id: string; email: string; name: string }) {
  return { id: u.id, email: u.email, name: u.name };
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
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
  const [user] = await db.insert(usersTable).values({ email: normalized, passwordHash, name }).returning();
  await db.insert(userProfilesTable).values({ id: user.id, displayName: name });

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
    message: "If an account exists for that email, password reset instructions have been sent.",
  };

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, parsed.data.email.toLowerCase()),
  });
  if (!user) return res.json(generic);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawToken);
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(usersTable)
    .set({ passwordResetTokenHash: tokenHash, passwordResetExpires: expires })
    .where(eq(usersTable.id, user.id));

  // In development, log the raw token. In production, send via email service.
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth] Password reset token for ${user.email} (dev only): ${rawToken}`);
  }

  return res.json(generic);
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
const resetPasswordSchema = z.object({
  email:       z.string().email(),
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
    || user.passwordResetExpires < new Date();

  if (invalid) {
    return res.status(400).json({ error: "bad_request", message: "Invalid or expired reset token" });
  }

  // Timing-safe token comparison
  const submitted = Buffer.from(sha256Hex(token.trim()), "hex");
  const stored    = Buffer.from(user.passwordResetTokenHash!, "hex");
  if (submitted.length !== stored.length || !crypto.timingSafeEqual(submitted, stored)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid or expired reset token" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable)
    .set({ passwordHash, passwordResetTokenHash: null, passwordResetExpires: null })
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
    .onConflictDoNothing();

  return res.status(204).send();
});

export default router;
