import "dotenv/config";
import { createServer } from "http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createWsServer } from "./lib/ws.js";
import { pool } from "./db/client.js";

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
httpServer.listen(env.PORT, () => {
  console.log(`🚀  SwapHaven API  →  http://localhost:${env.PORT}`);
  console.log(`📖  API Docs       →  http://localhost:${env.PORT}/api-docs`);
  console.log(`🔌  WebSocket      →  ws://localhost:${env.PORT}/ws/<conversationId>?token=`);
  console.log(`📄  OpenAPI JSON   →  http://localhost:${env.PORT}/api/openapi.json`);
});
