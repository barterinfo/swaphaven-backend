import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema/index.js";

const { Pool } = pg;

export const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
export const testDb   = drizzle(testPool, { schema });
