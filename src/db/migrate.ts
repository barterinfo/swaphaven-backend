/**
 * Applies SQL migrations from /drizzle (used in Docker / production deploy).
 * Run: npm run build && npm run migrate:prod
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("[migrate] DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);

  console.log(`[migrate] Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("[migrate] All migrations applied.");
}

main().catch((err: unknown) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
