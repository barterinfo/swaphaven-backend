#!/usr/bin/env tsx
/** @deprecated Use `npm run db:clear` — forwards for backward compatibility. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "clear-db.ts",
);

const result = spawnSync("tsx", [script, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
