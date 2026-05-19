/**
 * Runs once before the entire test suite (in the main vitest process).
 * Creates the swaphaven_test database and applies all migrations fresh.
 */
import pg from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle");

const BASE_URL  = "postgresql://swaphaven:swaphaven@localhost:5433/swaphaven";
const TEST_URL  = process.env.DATABASE_URL ?? "postgresql://swaphaven:swaphaven@localhost:5433/swaphaven_test";
const TEST_DB   = TEST_URL.split("/").at(-1)!;

export async function setup(): Promise<void> {
  // Create test DB if it doesn't exist
  const adminPool = new pg.Pool({ connectionString: BASE_URL });
  try {
    await adminPool.query(`CREATE DATABASE ${TEST_DB}`);
    console.log(`[test] Created database: ${TEST_DB}`);
  } catch {
    // Already exists — reset its public schema so migrations run cleanly
  }
  await adminPool.end();

  // Connect to test DB and wipe + re-apply schema
  const testPool = new pg.Pool({ connectionString: TEST_URL });
  await testPool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await testPool.query("CREATE SCHEMA public");

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
    await testPool.query(sql);
    console.log(`[test] Applied migration: ${file}`);
  }

  await testPool.end();
  console.log("[test] Test database ready.");
}

export async function teardown(): Promise<void> {
  // Nothing to do — keep the DB around for inspection after failures
}
