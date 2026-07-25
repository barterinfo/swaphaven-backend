#!/usr/bin/env tsx
/**
 * Wipes the database and pushes the current Drizzle schema from scratch.
 *
 * Usage (local dev only — never run against production):
 *   npm run db:reset
 *
 * What it does:
 *   1. Drops the public schema (all tables, enums, sequences, etc.)
 *   2. Recreates the public schema
 *   3. Runs `drizzle-kit push --force` to create all tables from the schema
 *
 * Note: uses push instead of migrate because duplicate 0009_* migration file
 * names cause drizzle's file-based migrator to silently skip all migrations.
 */
import "dotenv/config";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import pg from "pg";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("[reset-db] DATABASE_URL is required");
    process.exit(1);
  }

  if (
    process.env["NODE_ENV"] === "production" ||
    connectionString.includes("railway.app")
  ) {
    console.error(
      "[reset-db] Refusing to run against production. Unset NODE_ENV=production or remove railway.app from DATABASE_URL.",
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });

  console.log("[reset-db] Dropping public schema…");
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("GRANT ALL ON SCHEMA public TO public");
  await pool.end();
  console.log("[reset-db] Schema wiped.");

  console.log("[reset-db] Pushing schema…");
  execSync("npx drizzle-kit push --config drizzle.config.ts --force", {
    cwd: projectRoot,
    stdio: "inherit",
  });

  console.log("[reset-db] Done. Fresh database ready.");
  console.log(
    "[reset-db] Tip: run `npm run seed:user` then `npm run seed:listings` to populate it.",
  );
}

main().catch((err: unknown) => {
  console.error("[reset-db] Failed:", err);
  process.exit(1);
});
