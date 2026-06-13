# Push Notification Deep Links — SwapHaven API

## Overview

The API sends push notifications via Firebase Cloud Messaging (FCM) whenever a user-facing event occurs (new offer, counter-offer, offer accepted, new chat message). Each notification carries a structured `data` payload that the mobile app parses to deep-link the user directly to the relevant Inbox item.

---

## Architecture

### Key files

| File | Purpose |
|---|---|
| `src/lib/push.ts` | Core push helper — lazy Firebase init, `sendPushToUser`, stale-token cleanup |
| `src/db/schema/` | `deviceTokensTable` — stores FCM tokens per user/platform |
| `src/routes/auth.ts` | `POST /api/auth/device-token` — registers a device token |
| `src/routes/offers.ts` | Fires `offer`, `counter_offer`, `offer_accepted` notifications |
| `src/routes/conversations.ts` | Fires `new_message` notifications |
| `src/config/env.ts` | `FIREBASE_SERVICE_ACCOUNT_JSON` env var |

---

## Environment Setup

Add the Firebase service account to `.env`:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"barter-stack",...}
```

To get the JSON:
1. Firebase Console → Project Settings → Service Accounts
2. Click **Generate new private key**
3. Paste the entire JSON as the value of `FIREBASE_SERVICE_ACCOUNT_JSON`

When this variable is absent (CI, dev without Firebase), all `sendPushToUser` calls are silently no-op'd with a log line — the API continues to work normally.

---

## FCM Data Payload Contract

Every push notification includes both a `notification` block (shown in the system tray) and a `data` block (parsed by the mobile app for deep-link routing).

```typescript
export interface PushPayload {
  title: string;
  body: string;
  data: {
    type: "offer" | "counter_offer" | "offer_accepted" | "new_message";
    offerId?: string;        // present for offer / counter_offer
    conversationId?: string; // present for offer_accepted / new_message
  };
}
```

### `type` → mobile routing

| `type` | Payload key | Mobile destination |
|---|---|---|
| `offer` | `offerId` | Inbox → Offers tab, offer highlighted |
| `counter_offer` | `offerId` | Inbox → Offers tab, offer highlighted |
| `offer_accepted` | `conversationId` | Inbox → Chats tab, conversation auto-opened |
| `new_message` | `conversationId` | Inbox → Chats tab, conversation auto-opened |

---

## Where Notifications Are Triggered

```mermaid
flowchart TD
    A1[POST /api/offers] -->|New offer created| P1["sendPushToUser(sellerId)\ntype: offer"]
    A2[POST /api/offers/:id/accept] -->|Offer accepted| P2["sendPushToUser(buyerId)\ntype: offer_accepted"]
    A3[POST /api/offers/:id/counter] -->|Counter-offer sent| P3["sendPushToUser(buyerId)\ntype: counter_offer"]
    A4[POST /api/offers/:id/counter/accept] -->|Counter accepted| P4["sendPushToUser(sellerId)\ntype: offer_accepted"]
    A5[POST /api/conversations/:id/messages] -->|New chat message| P5["sendPushToUser(otherUserId)\ntype: new_message"]

    P1 & P2 & P3 & P4 & P5 --> FCM[Firebase Cloud Messaging]
    FCM --> Device[User's Device]
```

---

## End-to-End Flow

```mermaid
sequenceDiagram
    participant Buyer as Buyer App
    participant API as SwapHaven API
    participant DB as PostgreSQL
    participant Push as src/lib/push.ts
    participant FCM as Firebase FCM
    participant Seller as Seller Device

    Buyer->>API: POST /api/offers\n{ listingId, offeredListingIds }
    API->>DB: INSERT INTO offers
    API->>DB: INSERT INTO notifications (offer_received)
    API->>Push: sendPushToUser(sellerId, { type: "offer", offerId })
    Push->>DB: SELECT token FROM device_tokens WHERE userId = sellerId
    Push->>FCM: sendEachForMulticast({ tokens, notification, data })
    FCM-->>Seller: Push notification delivered
    Seller->>Seller: User taps notification
    Note over Seller: App opens → deep-links to\nInbox → Offers tab → that offer
```

---

## `sendPushToUser` Internals

```mermaid
flowchart TD
    A[sendPushToUser called] --> B{FIREBASE_SERVICE_ACCOUNT_JSON set?}
    B -- No --> C[Log skip, return]
    B -- Yes --> D[Lazy init Firebase Admin SDK]
    D --> E[SELECT device_tokens WHERE userId = target]
    E --> F{Any tokens?}
    F -- No --> G[Log no tokens, return]
    F -- Yes --> H[Convert data values to strings]
    H --> I[messaging.sendEachForMulticast\ntokens + notification + data]
    I --> J[Log success count]
    J --> K{Any stale tokens?}
    K -- Yes --> L[DELETE stale device_tokens]
    K -- No --> M[Done]
    L --> M
```

**Stale token cleanup** — FCM returns `messaging/registration-token-not-registered` or `messaging/invalid-registration-token` for tokens that belong to uninstalled apps or expired sessions. These are automatically deleted from `device_tokens` so future sends stay fast.

---

## Device Token Registration

Mobile devices register their FCM token with the API after every login. The token is stored per user and platform.

### Endpoint

```
POST /api/auth/device-token
Authorization: Bearer <access_token>

{
  "token": "<fcm-registration-token>",
  "platform": "ios" | "android" | "web"
}
```

**Response:** `204 No Content`

The insert uses `ON CONFLICT DO NOTHING` so duplicate registrations are safe.

### Token lifecycle

```mermaid
sequenceDiagram
    participant App as Mobile App
    participant API as SwapHaven API
    participant FCM as Firebase FCM

    App->>API: POST /api/auth/device-token (on login)
    API->>API: INSERT INTO device_tokens (upsert)

    Note over App,FCM: FCM rotates tokens periodically
    FCM->>App: onTokenRefresh event
    App->>API: POST /api/auth/device-token (new token)

    Note over API,FCM: Token becomes stale (app uninstalled / expired)
    FCM-->>API: registration-token-not-registered error
    API->>API: DELETE FROM device_tokens WHERE id = staleId
```

---

## All Push Events by Route

### `POST /api/offers` — New offer

```typescript
sendPushToUser(listing.userId, {
  title: "New swap offer! 🔄",
  body: "Someone wants to trade for your item.",
  data: { type: "offer", offerId: offer.id },
});
```

### `POST /api/offers/:offerId/accept` — Offer accepted

```typescript
sendPushToUser(offer.buyerId, {
  title: "Offer accepted! 🎉",
  body: "Your trade offer was accepted. Start chatting now.",
  data: { type: "offer_accepted", conversationId: conv.id },
});
```

### `POST /api/offers/:offerId/counter` — Counter-offer sent

```typescript
sendPushToUser(offer.buyerId, {
  title: "Counter-offer received 🔁",
  body: "The seller proposed new terms. Review and respond.",
  data: { type: "counter_offer", offerId: offer.id },
});
```

### `POST /api/offers/:offerId/counter/accept` — Counter accepted

```typescript
sendPushToUser(offer.sellerId, {
  title: "Counter-offer accepted! 🎉",
  body: "The buyer accepted your counter. Time to arrange the swap.",
  data: { type: "offer_accepted", conversationId: conv.id },
});
```

### `POST /api/conversations/:convId/messages` — New chat message

```typescript
sendPushToUser(otherUserId, {
  title: senderName,
  body: parsed.data.body.slice(0, 100),
  data: { type: "new_message", conversationId: convId },
});
```

---

## Firebase Admin SDK Initialisation

The SDK initialises lazily on the first `sendPushToUser` call and reuses the instance on subsequent calls:

```mermaid
flowchart LR
    A[First sendPushToUser call] --> B{_messagingReady?}
    B -- Yes --> E[Return cached getMessaging]
    B -- No --> C{FIREBASE_SERVICE_ACCOUNT_JSON set?}
    C -- No --> D[Return null — no-op]
    C -- Yes --> F[import firebase-admin/app]
    F --> G{getApps().length === 0?}
    G -- Yes --> H[initializeApp with service account cert]
    G -- No --> I[Reuse existing app]
    H & I --> J[_messagingReady = true]
    J --> E
```

This pattern means:
- Zero startup cost — Firebase is not imported at module load time
- Works in environments without `FIREBASE_SERVICE_ACCOUNT_JSON` (CI, local dev)
- No duplicate initialisation when multiple modules import `push.ts`

---

## Testing Locally

### 1. Provide a real service account

```bash
# .env
FIREBASE_SERVICE_ACCOUNT_JSON=$(cat path/to/service-account.json)
```

### 2. Get a device FCM token

Run the Flutter app in debug mode — the token is printed to the console:

```
╔══════════════════════════════════════════════════════╗
║  FCM Registration Token                              ║
╠══════════════════════════════════════════════════════╣
  dAb3x9Qf...
╚══════════════════════════════════════════════════════╝
```

### 3. Register the token via the API

```bash
curl -X POST http://localhost:3000/api/auth/device-token \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "token": "dAb3x9Qf...", "platform": "android" }'
```

### 4. Trigger an event

```bash
# Create an offer — seller receives a push
curl -X POST http://localhost:3000/api/offers \
  -H "Authorization: Bearer <buyer-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "listingId": "...", "offeredListingIds": ["..."] }'
```

### 5. Expected server log

```
[push] sending type=offer to userId=<sellerId> (1 device(s))
[push] delivered 1/1 (type=offer userId=<sellerId>)
```

---

## Adding a New Notification Type

1. Add the new `type` string to the `PushPayload.data.type` union in `src/lib/push.ts`
2. Call `sendPushToUser` in the appropriate route handler with the new type and relevant ID
3. Update `InboxDeepLinkType` in the mobile app's `notification_deep_link.dart`
4. Add the routing logic in `InboxDeepLink.fromPayload()` and `isOfferTab` if a new tab is involved
