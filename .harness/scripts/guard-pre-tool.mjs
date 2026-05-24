#!/usr/bin/env node
/**
 * Tight harness: block destructive shell patterns before tool use.
 */
import { readFileSync } from "node:fs";

const BLOCKED = [
  /\brm\s+-rf\b/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bgit\s+push\s+-f\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bcurl\b.*\|\s*(ba)?sh\b/i,
];

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

const command =
  input?.tool_name === "Shell" || input?.toolName === "Shell"
    ? String(input?.tool_input?.command ?? input?.toolInput?.command ?? "")
    : "";

if (!command) {
  process.exit(0);
}

for (const pattern of BLOCKED) {
  if (pattern.test(command)) {
    console.error(`[tight-harness] blocked shell command: ${command}`);
    process.exit(2);
  }
}

process.exit(0);
