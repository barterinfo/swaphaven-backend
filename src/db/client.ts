import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
import { env } from "../config/env.js";

const { Pool } = pg;

function poolSsl(): boolean | { rejectUnauthorized: boolean } | undefined {
  const url = env.DATABASE_URL;
  if (url.includes("sslmode=disable")) return undefined;
  if (url.includes("sslmode=require") || url.includes("railway.app")) {
    return { rejectUnauthorized: false };
  }
  return env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined;
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: poolSsl(),
});

export const db = drizzle(pool, { schema });
export { schema };
