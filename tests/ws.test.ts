import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { WebSocket } from "ws";
import { createWsServer } from "../src/lib/ws.js";
import { app } from "./helpers/app.js";
import { fullTradeSetup, registerUser } from "./helpers/fixtures.js";

let server: Server;
let port: number;
const openSockets: WebSocket[] = [];

beforeAll(async () => {
  server = createServer(app);
  createWsServer(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
});

afterEach(() => {
  for (const ws of openSockets) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
  openSockets.length = 0;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function socketUrl(conversationId: string, token: string): string {
  return `ws://127.0.0.1:${port}/ws/${conversationId}?token=${encodeURIComponent(token)}`;
}

function connect(conversationId: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socketUrl(conversationId, token));
    openSockets.push(ws);
    const onClose = (code: number, reason: Buffer) => {
      reject(new Error(`closed ${code} ${reason.toString()}`));
    };
    ws.once("open", () => {
      ws.off("close", onClose);
      resolve(ws);
    });
    ws.once("close", onClose);
    ws.once("unexpected-response", (_req, res) => {
      reject(Object.assign(new Error(`unexpected ${res.statusCode}`), { statusCode: res.statusCode }));
    });
    ws.once("error", reject);
  });
}

function expectHandshakeStatus(conversationId: string, token: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socketUrl(conversationId, token));
    openSockets.push(ws);
    ws.once("unexpected-response", (_req, res) => {
      resolve(res.statusCode ?? 0);
      res.resume();
    });
    ws.once("open", () => reject(new Error("handshake succeeded")));
    ws.once("error", () => {
      // `ws` also emits error after unexpected-response; ignore if already resolved.
    });
    setTimeout(() => reject(new Error("no handshake response")), 3_000);
  });
}

function waitForJson(ws: WebSocket, timeoutMs = 3_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for ws frame")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

describe("WebSocket /ws/:conversationId", () => {
  it("lets a participant connect", async () => {
    const { seller, trade } = await fullTradeSetup();
    const ws = await connect(trade.conversationId, seller.accessToken);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it("rejects a missing token", async () => {
    const { trade } = await fullTradeSetup();
    await expect(expectHandshakeStatus(trade.conversationId, "")).resolves.toBe(401);
  });

  it("rejects an invalid token", async () => {
    const { trade } = await fullTradeSetup();
    await expect(expectHandshakeStatus(trade.conversationId, "not-a-jwt")).resolves.toBe(401);
  });

  it("rejects a third party", async () => {
    const { trade } = await fullTradeSetup();
    const stranger = await registerUser();
    await expect(expectHandshakeStatus(trade.conversationId, stranger.accessToken)).resolves.toBe(403);
  });

  it("fans a POSTed message to the other participant with sender", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    const sellerWs = await connect(trade.conversationId, seller.accessToken);
    const pending = waitForJson(sellerWs);

    const res = await request(app)
      .post(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "See you at the station", type: "text" });

    expect(res.status).toBe(201);

    const frame = await pending;
    expect(frame.event).toBe("new_message");
    const message = frame.message as Record<string, unknown>;
    expect(message.body).toBe("See you at the station");
    expect(message.senderId).toBe(buyer.user.id);
    const sender = message.sender as Record<string, unknown>;
    expect(sender.id).toBe(buyer.user.id);
    expect(typeof sender.displayName).toBe("string");
  });

  it("does not relay client frames as chat messages", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    const sellerWs = await connect(trade.conversationId, seller.accessToken);
    const buyerWs = await connect(trade.conversationId, buyer.accessToken);

    const leaked = waitForJson(sellerWs, 400).then(() => true).catch(() => false);
    buyerWs.send(JSON.stringify({ body: "spoofed, not persisted" }));
    expect(await leaked).toBe(false);
  });
});
