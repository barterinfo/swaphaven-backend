#!/usr/bin/env node
/**
 * Mirror Drizzle schema TS from swaphaven-api → ../barter-admin-api (read-only snapshot).
 * Delegates to barter-admin-api/scripts/sync-schema.mjs. Skips when that checkout is missing.
 *
 * Used by: npm run schema:sync-admin-api, Cursor afterFileEdit hook, git pre-commit.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isSchemaSourcePath, readHookPath } from "./sync-barter-ai-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_SYNC_SCRIPT = join(ROOT, "..", "barter-admin-api", "scripts", "sync-schema.mjs");

const hookPath = readHookPath();
if (hookPath !== null && !isSchemaSourcePath(hookPath)) {
  process.exit(0);
}

if (!existsSync(ADMIN_SYNC_SCRIPT)) {
  console.error("[schema-sync] ../barter-admin-api not found — skipped");
  process.exit(0);
}

process.env.SWAPHAVEN_API_DIR ??= ROOT;
const { syncAdminSchema } = await import(pathToFileURL(ADMIN_SYNC_SCRIPT).href);
syncAdminSchema();
process.exit(0);
