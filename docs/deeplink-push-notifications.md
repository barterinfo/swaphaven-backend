# Push Notification Deep Links — SwapHaven API

## Overview

The API can notify users in **two different channels**:

| Channel | Mechanism | What the user sees |
|---------|-----------|--------------------|
| **In-app (DB) notification** | `INSERT` into `notifications` | Appears in the app’s notifications list (`GET /api/notifications`) |
| **Push (FCM)** | `sendPushToUser` in `src/lib/push.ts` | Lock-screen / system tray; tap deep-links into Inbox |

These are **independent**. Many events do both. Some events write a DB notification **only** (no FCM push).

The API sends push via Firebase Cloud Messaging (FCM) when a handler calls `sendPushToUser`. Each FCM message carries a structured `data` payload that the mobile app parses to deep-link into the relevant Inbox item.

---

## In-app vs push — important distinction

```mermaid
flowchart LR
  Event[Server event] --> DB["INSERT notifications\n(in-app feed)"]
  Event --> Push{"Calls sendPushToUser?"}
  Push -->|Yes| FCM[FCM → device tray]
  Push -->|No| None[No lock-screen push]
  DB --> AppList[Mobile notifications inbox]
```

### Events that send **both** DB notification + FCM push

| Event | Route / helper | DB `notifications.type` | FCM `data.type` |
|-------|----------------|-------------------------|-----------------|
| New offer | `POST /api/offers` | `offer_received` | `offer` |
| Offer accepted | `POST /api/offers/:id/accept` (and counter accept alias) | `offer_accepted` | `offer_accepted` |
| Counter sent | `POST /api/offers/:id/counter` | (counter notification) | `counter_offer` |
| New chat message | `POST /api/conversations/:id/messages` | (as implemented) | `new_message` |

### Events that write **DB notification only** (no FCM push)

| Event | Where | DB type | Why it matters |
|-------|--------|---------|----------------|
| **Listing marked sold** — pending target offers cancelled | `cancelPendingOffersAndNotify` in `src/routes/listings.ts` (from `POST …/sold`) | `offer_denied` | Buyer sees “Offer declined” **in-app**, but **no** push banner |
| **Listing deleted** — pending target offers cancelled | Same helper (from `DELETE /api/listings/:id`) | `offer_denied` | Same — in-app only |
| Offer denied by party | `handleDeny` in `offers.ts` | `offer_denied` | In-app only (no `sendPushToUser`) |
| Offer withdrawn | `POST /api/offers/:id/withdraw` | (withdraw notification if present) | Check handler — currently no push |

**Mark sold / delete detail**

When the owner marks a listing sold or deletes it, `cancelPendingOffersAndNotify`:

1. Finds offers with `listingId = that listing` and `status = pending`
2. Sets them to `denied`
3. Inserts `notifications` rows for each buyer (`type: offer_denied`, body like *“…has been marked as sold. Your offer has been declined.”*)
4. **Does not** call `sendPushToUser`

So buyers are notified in the app notification feed, but they will **not** get a phone lock-screen push for that automatic decline unless a future change adds FCM there.

Related listing docs: [MARK_AS_SOLD_FLOW.md](./MARK_AS_SOLD_FLOW.md), [DELETE_LISTING_FLOW.md](./DELETE_LISTING_FLOW.md), [LISTING_STATUS_AND_OWNER_FLOWS.md](./LISTING_STATUS_AND_OWNER_FLOWS.md).

---

## Architecture

### Key files

| File | Purpose |
|---|---|
| `src/lib/push.ts` | Core push helper — lazy Firebase init, data-only `sendPushToUser`, APNS categories, stale-token cleanup |
| `src/lib/push-card-context.ts` | Builds rich card fields (names, images, fairTrade, valueLabel, copy) |
| `src/db/schema/` | `deviceTokensTable` — stores FCM tokens per user/platform; `notifications` — in-app feed |
| `src/routes/auth.ts` | `POST /api/auth/device-token` — registers a device token |
| `src/routes/offers.ts` | Fires `offer`, `counter_offer`, `offer_accepted` **push**; deny/withdraw are DB-only |
| `src/routes/listings.ts` | `cancelPendingOffersAndNotify` — **DB `offer_denied` only, no push** |
| `src/routes/conversations.ts` | Fires `new_message` push |
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

When this variable is absent (CI, dev without Firebase), all `sendPushToUser` calls are silently no-op'd with a log line — the API continues to work normally. **DB notifications are still inserted** regardless of Firebase.

---

## FCM Data Payload Contract

Pushes are **data-only** — there is **no** top-level FCM `notification` block. A top-level `notification` causes Android/iOS to show a plain system tray item and prevents native custom cards (`PushNotifOffer` / Counter / Accepted / Message).

**Golden rules**

1. Everything for the card lives under `data` (plus `apns.payload.aps.alert` for iOS).
2. All `data` values are **strings** (e.g. `fairTrade: "true"`, never a boolean).

`sendPushToUser` always mirrors `title` / `body` into `data`, sets APNS `mutable-content: 1`, and sets `aps.category` from `type`:

| `data.type` | APNS `category` |
|---|---|
| `offer` | `BARTER_OFFER` |
| `counter_offer` | `BARTER_COUNTER` |
| `offer_accepted` | `BARTER_ACCEPTED` |
| `new_message` | `BARTER_MESSAGE` |

```typescript
export interface PushPayload {
  title: string;
  body: string;
  data: {
    type: "offer" | "counter_offer" | "offer_accepted" | "new_message";
    offerId?: string;
    conversationId?: string;
    senderName?: string;
    title?: string;
    body?: string;
    theirItemName?: string;
    yourItemName?: string;
    fairTrade?: string;       // "true" when sides within 15%
    theirImageUrl?: string;
    yourImageUrl?: string;
    valueLabel?: string;      // counter cards
    timestampLabel?: string;  // usually "now"
    tradeTitle?: string;      // chat cards
    senderAvatarUrl?: string;
  };
}
```

Perspective for item fields: relative to the **recipient** — `their*` = sender’s side, `your*` = recipient’s side. Multi-item titles are joined with `" + "`.

Card field builders live in `src/lib/push-card-context.ts`.

### `type` → mobile routing

| `type` | Payload key | Mobile destination |
|---|---|---|
| `offer` | `offerId` | Inbox → Offers tab, offer highlighted |
| `counter_offer` | `offerId` | Inbox → Offers tab, offer highlighted |
| `offer_accepted` | `conversationId` (also sends `offerId`) | Inbox → Chats tab, conversation auto-opened |
| `new_message` | `conversationId` | Inbox → Chats tab, conversation auto-opened |

There is **no** FCM `data.type` today for `offer_denied` / listing sold-or-deleted auto-decline, because those paths do not call `sendPushToUser`.

---

## Where **push** notifications are triggered

```mermaid
flowchart TD
    A1[POST /api/offers] -->|New offer created| P1["sendPushToUser(sellerId)\ntype: offer"]
    A2[POST /api/offers/:id/accept] -->|Offer accepted| P2["sendPushToUser(other party)\ntype: offer_accepted"]
    A3[POST /api/offers/:id/counter] -->|Counter-offer sent| P3["sendPushToUser(other party)\ntype: counter_offer"]
    A4[POST /api/offers/:id/counter/accept] -->|Counter accepted| P4["sendPushToUser(other party)\ntype: offer_accepted"]
    A5[POST /api/conversations/:id/messages] -->|New chat message| P5["sendPushToUser(otherUserId)\ntype: new_message"]

    P1 & P2 & P3 & P4 & P5 --> FCM[Firebase Cloud Messaging]
    FCM --> Device[User's Device]

    S1[POST /listings/:id/sold] --> DB1["DB offer_denied only\nNO sendPushToUser"]
    S2[DELETE /listings/:id] --> DB1
    S3[POST /offers/:id/deny] --> DB2["DB offer_denied only\nNO sendPushToUser"]
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
    API->>Push: sendPushToUser(sellerId, rich offer data)
    Push->>DB: SELECT token FROM device_tokens WHERE userId = sellerId
    Push->>FCM: sendEachForMulticast({ tokens, data, apns.alert })
    FCM-->>Seller: Data-only push → native Offer card
    Seller->>Seller: User taps notification
    Note over Seller: App opens → deep-links to\nInbox → Offers tab → that offer
```

### Mark sold / delete — in-app only (no push)

```mermaid
sequenceDiagram
    participant Owner
    participant API as listings.ts
    participant DB
    participant BuyerApp as Buyer app later

    Owner->>API: POST /listings/:id/sold (or DELETE)
    API->>DB: UPDATE listing status
    API->>DB: UPDATE pending offers → denied
    API->>DB: INSERT notifications (offer_denied)
    Note over API: No sendPushToUser
    BuyerApp->>API: GET /api/notifications
    API-->>BuyerApp: Includes offer_denied rows
```

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
    H --> I[messaging.sendEachForMulticast\ntokens + data-only + apns.alert]
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

Rich fields are built by `src/lib/push-card-context.ts` (names, images, fair-trade, value labels). Examples below show the shape after enrichment.

### `POST /api/offers` — New offer (seller receives)

```typescript
sendPushToUser(listing.userId, {
  title: "New Trade Offer from Alex",
  body: "Alex wants to swap their Canon EOS R10 for your Levi's Jacket.",
  data: {
    type: "offer",
    offerId: offer.id,
    senderName: "Alex",
    theirItemName: "Canon EOS R10",
    yourItemName: "Levi's Jacket",
    fairTrade: "true",           // optional — only when sides within 15%
    theirImageUrl: "https://…",  // optional
    yourImageUrl: "https://…",   // optional
    timestampLabel: "now",
  },
});
```

### `POST /api/offers/:offerId/accept` (and counter/accept) — Offer accepted

```typescript
sendPushToUser(notifyUserId, {
  title: "Offer Accepted!",
  body: "Sarah accepted your offer. Your Canon AE-1 is heading to a new home!",
  data: {
    type: "offer_accepted",
    conversationId: conv.id,
    offerId: offer.id,
    senderName: "Sarah",
    yourItemName: "Canon AE-1",
    theirItemName: "Air Jordan 1",
    yourImageUrl: "https://…",
    theirImageUrl: "https://…",
    timestampLabel: "now",
  },
});
```

### `POST /api/offers/:offerId/counter` — Counter-offer sent

```typescript
sendPushToUser(notifyUserId, {
  title: "Maya sweetened the deal",
  body: "Maya updated their offer with Sony a6400 + Camera Strap.",
  data: {
    type: "counter_offer",
    offerId: offer.id,
    senderName: "Maya",
    theirItemName: "Sony a6400 + Camera Strap",
    valueLabel: "Estimated value: $680 total",
    theirImageUrl: "https://…",
    timestampLabel: "now",
  },
});
```

### `POST /api/conversations/:convId/messages` — New chat message

```typescript
sendPushToUser(otherUserId, {
  title: senderName,
  body: messageBody.slice(0, 100),
  data: {
    type: "new_message",
    conversationId: convId,
    senderName,
    body: messageBody.slice(0, 100),
    tradeTitle: `${listingTitle} Trade`,  // optional
    senderAvatarUrl: "https://…",         // optional
    timestampLabel: "now",
  },
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
