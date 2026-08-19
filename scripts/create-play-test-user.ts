#!/usr/bin/env node
/**
 * Create a SwapHaven login for Google Play internal testing — no email OTP.
 *
 * Inserts directly into Postgres (same rows as POST /register + /register/verify).
 * Use for Play Console testers and reviewers who cannot receive OTP emails.
 *
 * Usage:
 *   npm run create:play-test-user
 *   npm run create:play-test-user:prod
 *   PLAY_TEST_EMAIL=playtest@bartersg.com PLAY_TEST_PASSWORD='...' npm run create:play-test-user:prod
 */
import bcrypt from "bcryptjs";
import { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { db, pool } from "../src/db/client.js";
import {
  pendingRegistrationsTable,
  userProfilesTable,
  usersTable,
} from "../src/db/schema/index.js";
import { containsProfanity } from "../src/lib/moderation.js";
import { hashEmail, sealEmail } from "../src/lib/email-privacy.js";

const DEFAULT_NAME = "Google Play Tester";
const DEFAULT_PASSWORD = "PlayTest2026!";

type CliOptions = {
  email?: string;
  help: boolean;
  name?: string;
  password?: string;
  resetPassword: boolean;
};

function printHelp(): void {
  console.log(`Create a Google Play test login (no OTP)

Usage:
  npm run create:play-test-user
  npm run create:play-test-user:prod

Options:
  --email <address>       Login email (or username — appends @bartersg.com)
  --password <password>   Login password (min 8 chars)
  --name <display name>   Display name (default: ${DEFAULT_NAME})
  --reset-password        Update password when the email already exists
  --help                  Show this help

Environment:
  PLAY_TEST_EMAIL         Same as --email
  PLAY_TEST_PASSWORD      Same as --password (default: ${DEFAULT_PASSWORD})
  PLAY_TEST_NAME          Same as --name
  DATABASE_URL            Required (.env local, .env.prod for production)

Examples:
  npm run create:play-test-user -- --email playtest --password 'PlayTest2026!'
  PLAY_TEST_EMAIL=playtest@bartersg.com npm run create:play-test-user:prod
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { help: false, resetPassword: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--reset-password") {
      options.resetPassword = true;
      continue;
    }
    if (arg === "--email") {
      options.email = argv[++i];
      if (!options.email) throw new Error("--email requires a value");
      continue;
    }
    if (arg === "--password") {
      options.password = argv[++i];
      if (!options.password) throw new Error("--password requires a value");
      continue;
    }
    if (arg === "--name") {
      options.name = argv[++i];
      if (!options.name) throw new Error("--name requires a value");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function normalizeEmail(usernameOrEmail: string): string {
  const value = usernameOrEmail.trim().toLowerCase();
  if (!value) throw new Error("Email is required");
  if (value.includes("@")) return value;
  return `${value}@bartersg.com`;
}

function resolvePassword(explicit?: string): string {
  const password = explicit?.trim() || process.env.PLAY_TEST_PASSWORD?.trim() || DEFAULT_PASSWORD;
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return password;
}

async function resolveDetails(options: CliOptions): Promise<{
  email: string;
  name: string;
  password: string;
}> {
  const rawEmail = options.email?.trim() || process.env.PLAY_TEST_EMAIL?.trim();
  const email = rawEmail
    ? normalizeEmail(rawEmail)
    : normalizeEmail(await promptLine("Email or username [playtest]: ") || "playtest");

  const name =
    options.name?.trim() ||
    process.env.PLAY_TEST_NAME?.trim() ||
    DEFAULT_NAME;

  if (containsProfanity(name)) {
    throw new Error("Name contains inappropriate language and cannot be used.");
  }

  const envPassword = options.password ?? process.env.PLAY_TEST_PASSWORD;
  const password = envPassword?.trim()
    ? resolvePassword(envPassword)
    : resolvePassword(await promptLine(`Password [${DEFAULT_PASSWORD}]: `) || DEFAULT_PASSWORD);

  return { email, name, password };
}

async function createPlayTestUser(details: {
  email: string;
  name: string;
  password: string;
  resetPassword: boolean;
}): Promise<{ userId: string; created: boolean }> {
  const sealed = sealEmail(details.email);
  const emailHash = hashEmail(details.email);
  const passwordHash = await bcrypt.hash(details.password, 12);

  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.emailHash, emailHash),
  });

  if (existing) {
    if (!details.resetPassword) {
      throw new Error(
        "Email already registered. Log in with these credentials or re-run with --reset-password.",
      );
    }

    await db
      .update(usersTable)
      .set({
        passwordHash,
        name: details.name,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existing.id));

    await db
      .update(userProfilesTable)
      .set({
        displayName: details.name,
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.id, existing.id));

    await db
      .delete(pendingRegistrationsTable)
      .where(eq(pendingRegistrationsTable.emailHash, emailHash));

    return { userId: existing.id, created: false };
  }

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        emailHash: sealed.emailHash,
        emailCiphertext: sealed.emailCiphertext,
        emailMasked: sealed.emailMasked,
        passwordHash,
        name: details.name,
      })
      .returning();

    await db.insert(userProfilesTable).values({
      id: user.id,
      displayName: details.name,
    });

    await db
      .delete(pendingRegistrationsTable)
      .where(eq(pendingRegistrationsTable.emailHash, emailHash));

    return { userId: user.id, created: true };
  } catch (err) {
    if (err instanceof DatabaseError && err.code === "23505") {
      throw new Error("Email already registered. Re-run with --reset-password to update the password.");
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required (.env for local, .env.prod for production).");
  }

  const details = await resolveDetails(options);
  const result = await createPlayTestUser({
    ...details,
    resetPassword: options.resetPassword,
  });

  console.log(result.created ? "\nAccount created (no OTP required).\n" : "\nPassword updated.\n");
  console.log("  Google Play login credentials:");
  console.log(`  Email:    ${details.email}`);
  console.log(`  Password: ${details.password}`);
  console.log(`  Name:     ${details.name}`);
  console.log(`  User ID:  ${result.userId}`);
  console.log("\nAdd these to Play Console → Testing → Internal testing → Testers notes.");
  console.log("Testers sign in with email + password in the app (not Google Sign-In).");
}

main()
  .catch((err: unknown) => {
    console.error("\nFailed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
