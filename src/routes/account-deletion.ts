import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { usersTable } from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import {
  AccountDeletionError,
  purgeUserAccount,
} from "../lib/account-deletion.js";

const router = Router();

const deleteAccountSchema = z.object({
  /** Explicit consent — must be true to proceed. */
  confirm: z.literal(true, {
    errorMap: () => ({ message: "Must set confirm: true to delete your account" }),
  }),
  /** Required for email/password accounts; omit for social-only if password was never set. */
  password: z.string().min(1).optional(),
});

/**
 * DELETE /api/account
 * Permanently delete the authenticated user's account and purge shared deals/chats.
 * Segregated from users/me profile routes — does not modify listing or offer APIs.
 */
router.delete("/", requireAuth, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = req.user!.sub;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, passwordHash: true },
  });
  if (!user) {
    return res.status(404).json({ error: "not_found", message: "User not found" });
  }

  if (parsed.data.password) {
    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Invalid password",
      });
    }
  }

  try {
    await purgeUserAccount(userId);
  } catch (err) {
    if (err instanceof AccountDeletionError) {
      return res.status(404).json({ error: "not_found", message: err.message });
    }
    throw err;
  }

  return res.status(204).send();
});

export default router;
