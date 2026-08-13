#!/usr/bin/env node
/**
 * Copy Drizzle schema TS from swaphaven-api → ../barter-ai (shared Postgres snapshot).
 * Safe to run repeatedly. Skips when barter-ai checkout is missing.
 *
 * Used by: npm run schema:sync-barter-ai, Cursor afterFileEdit hook, git pre-commit.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BARTER_AI_ROOT = join(ROOT, "..", "barter-ai");
const SCHEMA_SRC = join(ROOT, "src", "db", "schema");
const SCHEMA_DST = join(BARTER_AI_ROOT, "src", "db", "schema");

export function isSchemaSourcePath(filePath) {
  if (typeof filePath !== "string" || !filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes("src/db/schema/") && normalized.endsWith(".ts");
}

export function syncBarterAiSchema() {
  if (!existsSync(BARTER_AI_ROOT)) {
    console.error("[schema-sync] ../barter-ai not found — skipped");
    return { synced: false, reason: "missing-barter-ai" };
  }

  if (!existsSync(SCHEMA_SRC)) {
    console.error("[schema-sync] src/db/schema not found — skipped");
    return { synced: false, reason: "missing-source" };
  }

  mkdirSync(SCHEMA_DST, { recursive: true });

  const files = readdirSync(SCHEMA_SRC).filter((f) => f.endsWith(".ts"));
  for (const file of files) {
    copyFileSync(join(SCHEMA_SRC, file), join(SCHEMA_DST, file));
  }

  console.error(`[schema-sync] Copied ${files.length} file(s) to ../barter-ai/src/db/schema/`);
  return { synced: true, files: files.length };
}

function readHookPath() {
  let payload = "";
  try {
    payload = readFileSync(0, "utf8");
  } catch {
    return null;
  }
  if (!payload.trim()) return null;

  try {
    const input = JSON.parse(payload);
    return (
      input?.file_path ??
      input?.filePath ??
      input?.path ??
      input?.tool_input?.path ??
      input?.toolInput?.path ??
      null
    );
  } catch {
    return null;
  }
}

const hookPath = readHookPath();
if (hookPath !== null && !isSchemaSourcePath(hookPath)) {
  process.exit(0);
}

syncBarterAiSchema();
process.exit(0);
