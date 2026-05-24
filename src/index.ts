console.log(
  `[boot] PORT=${process.env["PORT"] ?? "(unset)"} NODE_ENV=${process.env["NODE_ENV"] ?? "(unset)"}`,
);

import "dotenv/config";
import { createServer } from "http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createWsServer } from "./lib/ws.js";
import { pool } from "./db/client.js";

console.log(
  `[server] Booting (NODE_ENV=${env.NODE_ENV}, PORT=${env.PORT}, TRUST_PROXY=${env.TRUST_PROXY})`,
);

const app        = createApp();
const httpServer = createServer(app);
createWsServer(httpServer);

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] ${signal} received — shutting down gracefully…`);
  httpServer.close(async () => {
    await pool.end();
    console.log("[server] DB pool drained. Bye.");
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.on("error", (err: NodeJS.ErrnoException) => {
  console.error("[server] Failed to bind:", err.message);
  process.exit(1);
});

httpServer.listen(env.PORT, env.HOST, () => {
  console.log(`[server] Listening on http://${env.HOST}:${env.PORT}`);
  console.log(`[server] Health: /api/healthz  Ready (DB): /api/readyz`);
});
