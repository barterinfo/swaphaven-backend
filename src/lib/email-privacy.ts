import crypto from "crypto";
import { env } from "../config/env.js";

/** Lowercase + trim. All hash/encrypt/mask input goes through this. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deterministic HMAC for login / OTP / social lookup. Never returned by APIs. */
export function hashEmail(email: string): string {
  return crypto
    .createHmac("sha256", env.EMAIL_HASH_PEPPER)
    .update(normalizeEmail(email), "utf8")
    .digest("hex");
}

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(env.EMAIL_ENCRYPTION_KEY, "utf8").digest();
}

/** AES-256-GCM. Format: `iv.tag.ciphertext` (base64url). */
export function encryptEmail(email: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizeEmail(email), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptEmail(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid email ciphertext");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Display form: first + last local-part chars. Not unique. */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (local.length === 1) return `${local}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/** Columns written on insert — never store plaintext email. */
export function sealEmail(email: string): {
  emailHash: string;
  emailCiphertext: string;
  emailMasked: string;
} {
  const normalized = normalizeEmail(email);
  return {
    emailHash: hashEmail(normalized),
    emailCiphertext: encryptEmail(normalized),
    emailMasked: maskEmail(normalized),
  };
}
