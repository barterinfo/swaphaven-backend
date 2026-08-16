#!/usr/bin/env node
/**
 * Ops moderation CLI — act on content reports without auto-banning.
 *
 * Uses DATABASE_URL from .env (local) or .env.prod (Railway via moderate:prod).
 * Run migration 0023_user_suspend before suspending users in production.
 *
 * Usage:
 *   npm run moderate -- pending
 *   npm run moderate -- dismiss <reportId>
 *   npm run moderate -- delete-listing <listingId> [--report <reportId>]
 *   npm run moderate -- suspend <userId|email> [--reason "..."] [--report <reportId>]
 *   npm run moderate -- unsuspend <userId|email>
 *   npm run moderate -- delete-user <userId|email> --yes [--report <reportId>]
 *   npm run moderate              # interactive menu
 */

import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { pool } from "../src/db/client.js";
import {
  ModerationError,
  deleteUser,
  findUserByIdOrEmail,
  getReport,
  listPendingReports,
  markReport,
  softDeleteListing,
  suspendUser,
  unsuspendUser,
} from "../src/lib/moderation-actions.js";

function printHelp(): void {
  console.log(`Barter moderation CLI

Review pending reports, then take action manually (no auto-ban).

Commands:
  pending                              List pending content_reports
  report <reportId>                    Show one report
  dismiss <reportId>                   Mark report dismissed (false / no action)
  delete-listing <listingId>           Soft-delete listing (status → deleted)
  suspend <userId|email>               Suspend account + hide their listings
  unsuspend <userId|email>             Clear suspension
  delete-user <userId|email> --yes     Permanently delete account (cascades)

Options:
  --report <reportId>                  Mark that report actioned after the action
  --reason <text>                      Suspension reason (default: Policy violation)
  --yes                                Required for delete-user
  --help                               Show this help

Examples:
  npm run moderate -- pending
  npm run moderate -- dismiss 11111111-1111-4111-8111-111111111111
  npm run moderate -- delete-listing <listingUuid> --report <reportUuid>
  npm run moderate -- suspend user@example.com --reason "Scam listings" --report <reportUuid>
  npm run moderate -- unsuspend user@example.com
  npm run moderate -- delete-user <userUuid> --yes --report <reportUuid>
  npm run moderate:prod -- pending
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

async function cmdPending(): Promise<void> {
  const rows = await listPendingReports(50);
  if (!rows.length) {
    console.log("No pending reports.");
    return;
  }
  console.log(`Pending reports (${rows.length}):\n`);
  for (const r of rows) {
    console.log(`  ${r.id}`);
    console.log(`    ${r.targetType} ${r.targetId}`);
    console.log(`    reported: ${r.reportedName ?? "?"} <${r.reportedEmail}> (${r.reportedUserId})`);
    console.log(`    reason: ${r.reason}${r.details ? ` — ${r.details}` : ""}`);
    console.log(`    at: ${r.createdAt?.toISOString?.() ?? r.createdAt}`);
    console.log("");
  }
}

async function cmdReport(reportId: string): Promise<void> {
  const report = await getReport(reportId);
  if (!report) throw new ModerationError(`Report not found: ${reportId}`);
  console.log(JSON.stringify(report, null, 2));
}

async function maybeActionReport(reportId: string | undefined): Promise<void> {
  if (!reportId) return;
  await markReport(reportId, "actioned");
  console.log(`Report ${reportId} → actioned`);
}

async function cmdDismiss(reportId: string): Promise<void> {
  await markReport(reportId, "dismissed");
  console.log(`Report ${reportId} → dismissed (no account action)`);
}

async function cmdDeleteListing(listingId: string, reportId?: string): Promise<void> {
  const result = await softDeleteListing(listingId);
  console.log(`Listing soft-deleted: ${result.id} ("${result.title}")`);
  await maybeActionReport(reportId);
}

async function cmdSuspend(
  idOrEmail: string,
  reason: string | undefined,
  reportId?: string,
): Promise<void> {
  const user = await findUserByIdOrEmail(idOrEmail);
  if (!user) throw new ModerationError(`User not found: ${idOrEmail}`);
  const result = await suspendUser({ userId: user.id, reason });
  console.log(
    `Suspended ${result.email} (${result.userId}); soft-deleted ${result.listingsDeleted} listing(s)`,
  );
  await maybeActionReport(reportId);
}

async function cmdUnsuspend(idOrEmail: string): Promise<void> {
  const user = await findUserByIdOrEmail(idOrEmail);
  if (!user) throw new ModerationError(`User not found: ${idOrEmail}`);
  const result = await unsuspendUser(user.id);
  console.log(`Unsuspended ${result.email} (${result.userId})`);
}

async function cmdDeleteUser(
  idOrEmail: string,
  yes: boolean,
  reportId?: string,
): Promise<void> {
  if (!yes) {
    throw new ModerationError("Refusing delete-user without --yes (irreversible)");
  }
  const user = await findUserByIdOrEmail(idOrEmail);
  if (!user) throw new ModerationError(`User not found: ${idOrEmail}`);
  // Mark report first — delete cascades would remove the report row.
  await maybeActionReport(reportId);
  const result = await deleteUser(user.id);
  console.log(
    `Deleted user ${result.email} (${result.userId}); purged ${result.offersDeleted} offer(s), ${result.listingsDeleted} listing(s)`,
  );
}

async function interactive(): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log("Moderation menu\n");
    console.log("  1) List pending reports");
    console.log("  2) Dismiss report");
    console.log("  3) Soft-delete listing");
    console.log("  4) Suspend user");
    console.log("  5) Unsuspend user");
    console.log("  6) Delete user (permanent)");
    console.log("  q) Quit\n");
    const choice = (await rl.question("Choice: ")).trim();

    switch (choice) {
      case "1":
        await cmdPending();
        break;
      case "2": {
        const id = (await rl.question("Report id: ")).trim();
        await cmdDismiss(id);
        break;
      }
      case "3": {
        const listingId = (await rl.question("Listing id: ")).trim();
        const reportId = (await rl.question("Report id to mark actioned (optional): ")).trim();
        await cmdDeleteListing(listingId, reportId || undefined);
        break;
      }
      case "4": {
        const who = (await rl.question("User id or email: ")).trim();
        const reason = (await rl.question("Reason: ")).trim();
        const reportId = (await rl.question("Report id to mark actioned (optional): ")).trim();
        await cmdSuspend(who, reason || undefined, reportId || undefined);
        break;
      }
      case "5": {
        const who = (await rl.question("User id or email: ")).trim();
        await cmdUnsuspend(who);
        break;
      }
      case "6": {
        const who = (await rl.question("User id or email: ")).trim();
        const confirm = (await rl.question('Type DELETE to confirm: ')).trim();
        if (confirm !== "DELETE") {
          console.log("Aborted.");
          break;
        }
        const reportId = (await rl.question("Report id to mark actioned (optional): ")).trim();
        await cmdDeleteUser(who, true, reportId || undefined);
        break;
      }
      case "q":
      case "Q":
        break;
      default:
        console.log("Unknown choice.");
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    printHelp();
    return;
  }

  const cmd = argv[0];
  const reportId = parseFlag(argv, "--report");
  const reason = parseFlag(argv, "--reason");
  const yes = hasFlag(argv, "--yes");

  try {
    if (!cmd) {
      await interactive();
      return;
    }

    switch (cmd) {
      case "pending":
        await cmdPending();
        break;
      case "report":
        if (!argv[1]) throw new ModerationError("Usage: report <reportId>");
        await cmdReport(argv[1]);
        break;
      case "dismiss":
        if (!argv[1]) throw new ModerationError("Usage: dismiss <reportId>");
        await cmdDismiss(argv[1]);
        break;
      case "delete-listing":
        if (!argv[1]) throw new ModerationError("Usage: delete-listing <listingId>");
        await cmdDeleteListing(argv[1], reportId);
        break;
      case "suspend":
        if (!argv[1]) throw new ModerationError("Usage: suspend <userId|email>");
        await cmdSuspend(argv[1], reason, reportId);
        break;
      case "unsuspend":
        if (!argv[1]) throw new ModerationError("Usage: unsuspend <userId|email>");
        await cmdUnsuspend(argv[1]);
        break;
      case "delete-user":
        if (!argv[1]) throw new ModerationError("Usage: delete-user <userId|email> --yes");
        await cmdDeleteUser(argv[1], yes, reportId);
        break;
      default:
        printHelp();
        throw new ModerationError(`Unknown command: ${cmd}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
  void pool.end();
});
