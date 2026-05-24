#!/usr/bin/env node
/**
 * Tight harness: after edits under src/ or tests/, remind to run checks.
 */
import { readFileSync } from "node:fs";

let payload = "";
try {
  payload = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

if (!payload.trim()) {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(payload);
} catch {
  process.exit(0);
}

const path =
  input?.tool_input?.path ??
  input?.toolInput?.path ??
  input?.file_path ??
  "";

if (
  typeof path === "string" &&
  (path.includes("src/") || path.includes("tests/"))
) {
  console.error(
    "[tight-harness] source changed — run: npm run typecheck && npm test",
  );
}

process.exit(0);
