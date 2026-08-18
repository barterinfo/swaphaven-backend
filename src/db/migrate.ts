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

/** Match the runtime pool's hosted-Postgres TLS behavior. */
function poolSsl(
  url: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
  if (url.includes("sslmode=disable")) return undefined;
  // Strict modes use NODE_EXTRA_CA_CERTS. The Docker image includes AWS's
  // published RDS CA bundle, so RDS verifies both the certificate and hostname.
  if (url.includes("sslmode=verify-full") || url.includes("sslmode=verify-ca")) {
    return undefined;
  }
  if (
    url.includes("sslmode=require") ||
    url.includes("railway.app")
  ) {
    return { rejectUnauthorized: false };
  }
  return process.env["NODE_ENV"] === "production"
    ? { rejectUnauthorized: false }
    : undefined;
}

/** sslmode=require currently overrides Pool.ssl, so remove it for compatibility mode. */
function poolConfig(connectionString: string): pg.PoolConfig {
  const ssl = poolSsl(connectionString);
  if (!ssl) return { connectionString };
  const stripped = connectionString
    .replace(/[?&]sslmode=[^&]*/gi, "")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
  return { connectionString: stripped, ssl };
}

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("[migrate] DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new pg.Pool(poolConfig(connectionString));
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
