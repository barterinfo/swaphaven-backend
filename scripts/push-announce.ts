#!/usr/bin/env node
/**
 * Ops CLI — send a general-announcement FCM push.
 *
 * Full guide: docs/ANNOUNCEMENTS.md
 *
 * Uses DATABASE_URL + FIREBASE_SERVICE_ACCOUNT_JSON from .env (local) or
 * .env.prod (Railway via push:announce:prod).
 *
 * Usage:
 *   npm run push:announce -- --title "..." --body "..." --user you@example.com
 *   npm run push:announce -- --title "..." --body "..." --all --yes
 *   npm run push:announce -- --title "..." --body "..." --all --dry-run
 *   npm run push:announce:prod -- --title "..." --body "..." --user <uuid>
 */

import "dotenv/config";

import { count, eq } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { deviceTokensTable } from "../src/db/schema/index.js";
import { findUserByIdOrEmail } from "../src/lib/moderation-actions.js";
import {
  sendPushBroadcast,
  sendPushToUser,
  type PushPayload,
} from "../src/lib/push.js";

function printHelp(): void {
  console.log(`Barter announcement push CLI

Send a general-announcement lock-screen card (type=announcement) via FCM.

Required:
  --title <text>                       Notification title
  --body <text>                        Notification body

Target (pick one):
  --user <userId|email>                One user's registered devices
  --all                                Every registered device token

Options:
  --yes                                Required with --all (confirms broadcast)
  --dry-run                            Count tokens; do not send
  --help                               Show this help

Examples:
  npm run push:announce -- --title "Scheduled maintenance" --body "We'll be down 2–4am UTC." --user you@example.com
  npm run push:announce -- --title "Scheduled maintenance" --body "We'll be down 2–4am UTC." --all --dry-run
  npm run push:announce -- --title "Scheduled maintenance" --body "We'll be down 2–4am UTC." --all --yes
  npm run push:announce:prod -- --title "New in Barter" --body "Save listings for later is live." --all --yes
`);
}

function parseFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function announcementPayload(title: string, body: string): PushPayload {
  return {
    title,
    body,
    data: {
      type: "announcement",
      title,
      body,
      timestampLabel: "now",
      screen: "listings",
    },
  };
}

async function countAllTokens(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(deviceTokensTable);
  return Number(row?.n ?? 0);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    printHelp();
    return;
  }

  const title = parseFlag(argv, "--title")?.trim();
  const body = parseFlag(argv, "--body")?.trim();
  const userKey = parseFlag(argv, "--user")?.trim();
  const broadcast = hasFlag(argv, "--all");
  const dryRun = hasFlag(argv, "--dry-run");
  const confirmed = hasFlag(argv, "--yes");

  if (!title || !body) {
    console.error("Missing --title and/or --body.");
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (Boolean(userKey) === broadcast) {
    console.error("Pick exactly one target: --user <id|email> or --all.");
    printHelp();
    process.exitCode = 1;
    return;
  }

  const payload = announcementPayload(title, body);

  if (userKey) {
    const user = await findUserByIdOrEmail(userKey);
    if (!user) {
      console.error(`No user found for ${userKey}`);
      process.exitCode = 1;
      return;
    }
    if (dryRun) {
      const rows = await db
        .select({ id: deviceTokensTable.id })
        .from(deviceTokensTable)
        .where(eq(deviceTokensTable.userId, user.id));
      console.log(`[dry-run] would send announcement to userId=${user.id} (${rows.length} device(s))`);
      console.log(`  title: ${title}`);
      console.log(`  body:  ${body}`);
      return;
    }
    await sendPushToUser(user.id, payload);
    console.log(`Sent announcement to userId=${user.id}`);
    return;
  }

  const tokenCount = await countAllTokens();
  if (dryRun) {
    console.log(`[dry-run] would broadcast announcement to ${tokenCount} device token(s)`);
    console.log(`  title: ${title}`);
    console.log(`  body:  ${body}`);
    return;
  }

  if (!confirmed) {
    console.error(`Broadcast would reach ${tokenCount} device token(s). Re-run with --yes to send.`);
    process.exitCode = 1;
    return;
  }

  const result = await sendPushBroadcast(payload);
  console.log(`Broadcast delivered ${result.delivered}/${result.tokenCount} device(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
