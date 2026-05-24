/**
 * Runs once before the entire test suite (in the main vitest process).
 * Creates the test database (if needed) and applies all migrations fresh.
 *
 * Uses DATABASE_URL from the environment (CI: port 5432) or .env.test (local: 5433).
 */
import pg from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle");

const TEST_URL =
  process.env.DATABASE_URL ??
  "postgresql://swaphaven:swaphaven@localhost:5433/swaphaven_test";

/** Maintenance DB on the same host/port as TEST_URL (for CREATE DATABASE). */
function maintenanceUrl(testUrl: string): string {
  const parsed = new URL(testUrl);
  const adminDb = process.env.TEST_DATABASE_ADMIN_DB ?? "postgres";
  parsed.pathname = `/${adminDb}`;
  return parsed.toString();
}

function testDatabaseName(testUrl: string): string {
  const name = new URL(testUrl).pathname.replace(/^\//, "");
  if (!name) throw new Error(`Invalid DATABASE_URL (missing database name): ${testUrl}`);
  return name;
}

export async function setup(): Promise<void> {
  const testDbName = testDatabaseName(TEST_URL);

  try {
    const adminPool = new pg.Pool({ connectionString: maintenanceUrl(TEST_URL) });
    try {
      await adminPool.query(`CREATE DATABASE "${testDbName}"`);
      console.log(`[test] Created database: ${testDbName}`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // 42P04 = duplicate_database — already exists (CI image or prior run)
      if (code !== "42P04") {
        console.warn(
          `[test] CREATE DATABASE skipped (${code ?? "unknown"}): ${(err as Error).message}`,
        );
      }
    } finally {
      await adminPool.end();
    }
  } catch (err) {
    // CI images often pre-create POSTGRES_DB; continue if we can reach the test DB
    console.warn(`[test] Admin connection skipped: ${(err as Error).message}`);
  }

  const testPool = new pg.Pool({ connectionString: TEST_URL });
  try {
    await testPool.query("SELECT 1");
  } catch (err) {
    await testPool.end();
    throw new Error(
      `Cannot connect to test database at ${TEST_URL}. ` +
        "Start Postgres (e.g. docker compose up postgres -d) or set DATABASE_URL.",
      { cause: err },
    );
  }

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
  // Keep DB around for inspection after failures
}
