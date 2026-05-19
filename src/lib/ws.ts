import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthPayload } from "../middleware/auth.js";

// Map conversationId → Set<WebSocket>
const rooms = new Map<string, Set<WebSocket>>();

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const conversationId = url.pathname.replace("/ws/", "").replace("/ws", "");
    const token = url.searchParams.get("token");

    if (!conversationId || !token) {
      ws.close(1008, "Missing conversationId or token");
      return;
    }

    let userId: string;
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
      if (payload.typ !== "access") throw new Error("Invalid token type");
      userId = payload.sub;
    } catch {
      ws.close(1008, "Invalid or expired token");
      return;
    }

    // Join room
    if (!rooms.has(conversationId)) rooms.set(conversationId, new Set());
    rooms.get(conversationId)!.add(ws);

    ws.on("close", () => {
      rooms.get(conversationId)?.delete(ws);
      if (rooms.get(conversationId)?.size === 0) rooms.delete(conversationId);
    });

    ws.on("message", (data) => {
      try {
        const text = data.toString();
        // Attach sender for client-side use
        const broadcast = JSON.stringify({ ...JSON.parse(text), senderId: userId });
        rooms.get(conversationId)?.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(broadcast);
          }
        });
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("error", (err) => {
      console.error("[ws] client error:", err.message);
    });
  });

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
