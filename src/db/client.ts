import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
import { env } from "../config/env.js";

const { Pool } = pg;

function poolSsl(): boolean | { rejectUnauthorized: boolean } | undefined {
  const url = env.DATABASE_URL;
  if (url.includes("sslmode=disable")) return undefined;
  // Strict modes are handled by node-pg using the CA bundle configured in
  // NODE_EXTRA_CA_CERTS (the Docker image includes the AWS RDS bundle).
  if (url.includes("sslmode=verify-full") || url.includes("sslmode=verify-ca")) {
    return undefined;
  }
  if (
    url.includes("sslmode=require") ||
    url.includes("railway.app")
  ) {
    return { rejectUnauthorized: false };
  }
  return env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined;
}

function connectionString(): string {
  const ssl = poolSsl();
  if (!ssl) return env.DATABASE_URL;
  return env.DATABASE_URL
    .replace(/[?&]sslmode=[^&]*/gi, "")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
}

export const pool = new Pool({
  connectionString: connectionString(),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: poolSsl(),
});

export const db = drizzle(pool, { schema });
export { schema };
