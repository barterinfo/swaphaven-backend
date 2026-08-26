import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import type { AuthPayload } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { conversationsTable } from "../db/schema/index.js";

const rooms = new Map<string, Set<WebSocket>>();

const CONVERSATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PING_MS = 25_000;

function parseConversationId(pathname: string): string | null {
  const match = pathname.match(/^\/ws\/([^/]+)\/?$/);
  if (!match) return null;
  const id = match[1]!;
  return CONVERSATION_ID.test(id) ? id : null;
}

function denyUpgrade(
  socket: { write: (chunk: string) => unknown; destroy: () => void },
  status: number,
  reason: string,
): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

async function authorizeUpgrade(req: IncomingMessage): Promise<
  { conversationId: string } | { status: number; reason: string }
> {
  const url = new URL(req.url ?? "", "http://localhost");
  const conversationId = parseConversationId(url.pathname);
  const token = url.searchParams.get("token");
  if (!conversationId || !token) {
    return { status: 401, reason: "Unauthorized" };
  }

  let userId: string;
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
    if (payload.typ !== "access") throw new Error("Invalid token type");
    userId = payload.sub;
  } catch {
    return { status: 401, reason: "Unauthorized" };
  }

  const conv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, conversationId),
    with: { offer: { columns: { buyerId: true, sellerId: true } } },
  });
  if (!conv || (conv.offer.buyerId !== userId && conv.offer.sellerId !== userId)) {
    return { status: 403, reason: "Forbidden" };
  }

  return { conversationId };
}

function joinRoom(conversationId: string, ws: WebSocket): void {
  if (!rooms.has(conversationId)) rooms.set(conversationId, new Set());
  rooms.get(conversationId)!.add(ws);

  const alive = ws as WebSocket & { isAlive?: boolean };
  alive.isAlive = true;
  ws.on("pong", () => {
    alive.isAlive = true;
  });

  ws.on("close", () => {
    rooms.get(conversationId)?.delete(ws);
    if (rooms.get(conversationId)?.size === 0) rooms.delete(conversationId);
  });

  // Live send is HTTP POST → broadcastToRoom. Ignore client frames so
  // unsaved/unmoderated payloads cannot spoof a message.
  ws.on("message", () => {});

  ws.on("error", (err) => {
    console.error("[ws] client error:", err.message);
  });
}

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws" && !url.pathname.startsWith("/ws/")) {
      socket.destroy();
      return;
    }

    void authorizeUpgrade(req).then((result) => {
      if (socket.destroyed) return;
      if ("status" in result) {
        denyUpgrade(socket, result.status, result.reason);
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        joinRoom(result.conversationId, ws);
        wss.emit("connection", ws, req);
      });
    }).catch((err) => {
      console.error("[ws] upgrade error:", err instanceof Error ? err.message : err);
      if (!socket.destroyed) denyUpgrade(socket, 500, "Internal Server Error");
    });
  });

  const interval = setInterval(() => {
    for (const client of wss.clients) {
      const alive = client as WebSocket & { isAlive?: boolean };
      if (alive.isAlive === false) {
        alive.terminate();
        continue;
      }
      alive.isAlive = false;
      alive.ping();
    }
  }, PING_MS);
  interval.unref();

  wss.on("close", () => clearInterval(interval));

  return wss;
}

/** Broadcast a message to all clients in a conversation room (used from HTTP routes). */
export function broadcastToRoom(conversationId: string, payload: unknown): void {
  const room = rooms.get(conversationId);
  if (!room) return;
  const text = JSON.stringify(payload);
  room.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  });
}
