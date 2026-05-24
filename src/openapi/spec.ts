/** OpenAPI 3.1 specification for the SwapHaven API. */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "SwapHaven API",
    version: "1.0.0",
    description: "Peer-to-peer item trading platform — Express 5 · PostgreSQL · Drizzle ORM",
    contact: { email: "api@swaphaven.io" },
  },
  servers: [
    { url: "http://localhost:3001", description: "Local development" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error:   { type: "string" },
          message: { type: "string" },
        },
      },
      PaginatedResponse: {
        type: "object",
        properties: {
          items:      { type: "array", items: {} },
          nextCursor: { type: "string", nullable: true },
        },
      },
      User: {
        type: "object",
        properties: {
          id:    { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name:  { type: "string" },
        },
      },
      UserProfile: {
        type: "object",
        properties: {
          id:           { type: "string", format: "uuid" },
          displayName:  { type: "string" },
          bio:          { type: "string", nullable: true },
          avatarUrl:    { type: "string", nullable: true },
          locationCity: { type: "string", nullable: true },
          tradeScore:   { type: "integer" },
          totalTrades:  { type: "integer" },
          ratingSum:    { type: "integer" },
          ratingCount:  { type: "integer" },
          isVerified:   { type: "boolean" },
        },
      },
      Category: {
        type: "object",
        properties: {
          id:       { type: "string", format: "uuid" },
          name:     { type: "string" },
          slug:     { type: "string" },
          icon:     { type: "string", nullable: true },
          parentId: { type: "string", format: "uuid", nullable: true },
        },
      },
      Listing: {
        type: "object",
        properties: {
          id:                  { type: "string", format: "uuid" },
          userId:              { type: "string", format: "uuid" },
          categoryId:          { type: "string", format: "uuid", nullable: true },
          title:               { type: "string" },
          description:         { type: "string", nullable: true },
          condition:           { type: "string", enum: ["new","like_new","great","good","fair"] },
          estimatedValueCents: { type: "integer", nullable: true },
          isSwipeOnly:         { type: "boolean" },
          status:              { type: "string", enum: ["active","traded","paused","deleted"] },
          locationCity:        { type: "string", nullable: true },
          createdAt:           { type: "string", format: "date-time" },
          updatedAt:           { type: "string", format: "date-time" },
          images:              { type: "array", items: { $ref: "#/components/schemas/ListingImage" } },
        },
      },
      ListingImage: {
        type: "object",
        properties: {
          id:        { type: "string", format: "uuid" },
          listingId: { type: "string", format: "uuid" },
          url:       { type: "string", format: "uri" },
          position:  { type: "integer" },
        },
      },
      Offer: {
        type: "object",
        properties: {
          id:             { type: "string", format: "uuid" },
          listingId:      { type: "string", format: "uuid" },
          buyerId:        { type: "string", format: "uuid" },
          sellerId:       { type: "string", format: "uuid" },
          status:         { type: "string", enum: ["pending","accepted","denied","countered","expired","withdrawn"] },
          buyerNote:      { type: "string", nullable: true },
          cashTopUpCents: { type: "integer" },
          createdAt:      { type: "string", format: "date-time" },
        },
      },
      CounterOffer: {
        type: "object",
        properties: {
          id:                 { type: "string", format: "uuid" },
          offerId:            { type: "string", format: "uuid" },
          sellerId:           { type: "string", format: "uuid" },
          status:             { type: "string", enum: ["pending","accepted","denied","expired"] },
          sellerNote:         { type: "string", nullable: true },
          cashRequestedCents: { type: "integer" },
          createdAt:          { type: "string", format: "date-time" },
        },
      },
      Trade: {
        type: "object",
        properties: {
          id:          { type: "string", format: "uuid" },
          offerId:     { type: "string", format: "uuid" },
          status:      { type: "string", enum: ["pending_meetup","completed","disputed","cancelled"] },
          completedAt: { type: "string", format: "date-time", nullable: true },
          createdAt:   { type: "string", format: "date-time" },
        },
      },
      TradeReview: {
        type: "object",
        properties: {
          id:         { type: "string", format: "uuid" },
          tradeId:    { type: "string", format: "uuid" },
          reviewerId: { type: "string", format: "uuid" },
          revieweeId: { type: "string", format: "uuid" },
          rating:     { type: "integer", minimum: 1, maximum: 5 },
          comment:    { type: "string", nullable: true },
          createdAt:  { type: "string", format: "date-time" },
        },
      },
      Conversation: {
        type: "object",
        properties: {
          id:        { type: "string", format: "uuid" },
          offerId:   { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Message: {
        type: "object",
        properties: {
          id:             { type: "string", format: "uuid" },
          conversationId: { type: "string", format: "uuid" },
          senderId:       { type: "string", format: "uuid" },
          body:           { type: "string" },
          type:           { type: "string", enum: ["text","image","system"] },
          readAt:         { type: "string", format: "date-time", nullable: true },
          createdAt:      { type: "string", format: "date-time" },
        },
      },
      Notification: {
        type: "object",
        properties: {
          id:        { type: "string", format: "uuid" },
          userId:    { type: "string", format: "uuid" },
          type:      { type: "string" },
          title:     { type: "string" },
          body:      { type: "string" },
          isRead:    { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      SwipeStreak: {
        type: "object",
        properties: {
          currentStreak:        { type: "integer" },
          longestStreak:        { type: "integer" },
          lastSwipeDate:        { type: "string", format: "date", nullable: true },
          bonusSwipesRemaining: { type: "integer" },
        },
      },
    },
    parameters: {
      limit: {
        name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        description: "Number of items per page",
      },
      cursor: {
        name: "cursor", in: "query", schema: { type: "string" },
        description: "Opaque pagination cursor (base64url-encoded ISO timestamp)",
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ── Health ──────────────────────────────────────────────────────────────────
    "/api/healthz": {
      get: {
        tags: ["Meta"], summary: "Health check", security: [],
        responses: { "200": { description: "Service healthy" } },
      },
    },
    // ── Auth ────────────────────────────────────────────────────────────────────
    "/api/auth/register": {
      post: {
        tags: ["Auth"], summary: "Register a new account", security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object", required: ["email","password","name"],
                properties: {
                  email:    { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name:     { type: "string", minLength: 1, maxLength: 80 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Account created", content: { "application/json": { schema: { properties: { accessToken: { type: "string" }, refreshToken: { type: "string" }, user: { $ref: "#/components/schemas/User" } } } } } },
          "400": { description: "Validation error" },
          "409": { description: "Email already registered" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"], summary: "Log in", security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email","password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } } } },
        },
        responses: {
          "200": { description: "Tokens issued" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"], summary: "Refresh access token", security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } } },
        responses: { "200": { description: "New token pair" }, "401": { description: "Invalid or expired refresh token" } },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"], summary: "Log out (discard tokens)",
        responses: { "204": { description: "Logged out" } },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"], summary: "Get own account",
        responses: { "200": { description: "Current user", content: { "application/json": { schema: { properties: { user: { $ref: "#/components/schemas/User" } } } } } } },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"], summary: "Request password reset email", security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } },
        responses: { "200": { description: "Always succeeds (prevents enumeration)" } },
      },
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"], summary: "Reset password with token", security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email","token","newPassword"], properties: { email: { type: "string", format: "email" }, token: { type: "string" }, newPassword: { type: "string", minLength: 8 } } } } } },
        responses: { "200": { description: "Password reset" }, "400": { description: "Invalid or expired token" } },
      },
    },
    "/api/auth/device-token": {
      post: {
        tags: ["Auth"], summary: "Register push notification token",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token","platform"], properties: { token: { type: "string" }, platform: { type: "string", enum: ["ios","android","web"] } } } } } },
        responses: { "204": { description: "Token registered" } },
      },
    },
    // ── Users ────────────────────────────────────────────────────────────────────
    "/api/users/me": {
      get: { tags: ["Users"], summary: "Get own profile", responses: { "200": { description: "User profile", content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } } } } },
      patch: {
        tags: ["Users"], summary: "Update own profile",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } } },
        responses: { "200": { description: "Updated profile" } },
      },
    },
    "/api/users/{userId}": {
      get: { tags: ["Users"], summary: "Get public profile", security: [], parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Public profile" }, "404": { description: "Not found" } } },
    },
    "/api/users/{userId}/listings": {
      get: { tags: ["Users"], summary: "List a user's active listings", security: [], parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { description: "Paginated listings" } } },
    },
    "/api/users/{userId}/reviews": {
      get: { tags: ["Users"], summary: "List a user's trade reviews", security: [], parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { description: "Paginated reviews" } } },
    },
    // ── Categories & Listings ────────────────────────────────────────────────────
    "/api/categories": {
      get: { tags: ["Listings"], summary: "Get category tree", security: [], responses: { "200": { description: "Category list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Category" } } } } } } },
    },
    "/api/listings": {
      get: {
        tags: ["Listings"], summary: "Browse / search listing feed", security: [],
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search query" },
          { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
          { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" },
        ],
        responses: { "200": { description: "Paginated listings" } },
      },
      post: {
        tags: ["Listings"], summary: "Create a listing",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object", required: ["title","condition"],
                properties: {
                  title: { type: "string", maxLength: 200 },
                  description: { type: "string", maxLength: 10000 },
                  category: { type: "string", description: "Category label or slug (barter-stack)" },
                  categoryId: { type: "string", description: "Category slug (e.g. cameras) or UUID" },
                  condition: { type: "string", enum: ["new","like_new","great","good","fair"] },
                  estimatedValue: { type: "integer", description: "Dollar estimate (barter-stack / Flutter)" },
                  estimatedValueCents: { type: "integer" },
                  acceptCashTopUps: { type: "boolean" },
                  isSwipeOnly: { type: "boolean" },
                  wantedCategoryIds: { type: "array", items: { type: "string" } },
                  wantedCategories: { type: "array", items: { type: "string" } },
                  wantedFreeText: { type: "string" },
                  details: {
                    type: "object",
                    properties: { ageRange: { type: "string" }, brand: { type: "string" } },
                  },
                  location: {
                    type: "object",
                    properties: {
                      lat: { type: "number" }, lng: { type: "number" },
                      address: { type: "string" }, city: { type: "string" },
                      state: { type: "string" }, country: { type: "string" },
                      postalCode: { type: "string" },
                    },
                  },
                  images: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Listing created", content: { "application/json": { schema: { $ref: "#/components/schemas/Listing" } } } } },
      },
    },
    "/api/listings/{listingId}": {
      get: { tags: ["Listings"], summary: "Get listing detail", security: [], parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Listing", content: { "application/json": { schema: { $ref: "#/components/schemas/Listing" } } } }, "404": { description: "Not found" } } },
      patch: { tags: ["Listings"], summary: "Update listing", parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Listing" } } } }, responses: { "200": { description: "Updated listing" }, "403": { description: "Forbidden" } } },
      delete: { tags: ["Listings"], summary: "Delete listing (soft)", parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Deleted" }, "403": { description: "Forbidden" } } },
    },
    "/api/listings/{listingId}/images": {
      post: { tags: ["Listings"], summary: "Add photo to listing", parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, position: { type: "integer" } } } } } }, responses: { "201": { description: "Image added" } } },
    },
    "/api/listings/{listingId}/images/{imageId}": {
      delete: { tags: ["Listings"], summary: "Remove photo", parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Image removed" } } },
    },
    // ── Swipe ────────────────────────────────────────────────────────────────────
    "/api/swipe/deck": {
      get: { tags: ["Swipe"], summary: "Get today's curated swipe deck", responses: { "200": { description: "Swipe cards" } } },
    },
    "/api/swipe": {
      post: {
        tags: ["Swipe"], summary: "Record a swipe",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["listingId","direction"], properties: { listingId: { type: "string", format: "uuid" }, direction: { type: "string", enum: ["left","right"] } } } } } },
        responses: { "201": { description: "Swipe recorded" } },
      },
    },
    "/api/swipe/streak": {
      get: { tags: ["Swipe"], summary: "Get swipe streak", responses: { "200": { description: "Streak info", content: { "application/json": { schema: { $ref: "#/components/schemas/SwipeStreak" } } } } } },
    },
    // ── Offers ───────────────────────────────────────────────────────────────────
    "/api/offers": {
      post: {
        tags: ["Offers"], summary: "Create a swap offer",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["listingId","offeredListingIds"], properties: { listingId: { type: "string", format: "uuid" }, swipeId: { type: "string", format: "uuid" }, offeredListingIds: { type: "array", items: { type: "string", format: "uuid" } }, cashTopUpCents: { type: "integer" }, buyerNote: { type: "string" } } } } } },
        responses: { "201": { description: "Offer created", content: { "application/json": { schema: { $ref: "#/components/schemas/Offer" } } } } },
      },
    },
    "/api/offers/received": {
      get: { tags: ["Offers"], summary: "Received offers", parameters: [{ $ref: "#/components/parameters/limit" }, { name: "status", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Paginated received offers" } } },
    },
    "/api/offers/sent": {
      get: { tags: ["Offers"], summary: "Sent offers", parameters: [{ $ref: "#/components/parameters/limit" }], responses: { "200": { description: "Paginated sent offers" } } },
    },
    "/api/offers/{offerId}": {
      get: { tags: ["Offers"], summary: "Offer detail", parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Offer with counter-offer and conversation ID" }, "403": { description: "Forbidden" } } },
    },
    "/api/offers/{offerId}/accept": {
      post: { tags: ["Offers"], summary: "Accept offer → creates Trade", parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Trade and conversation created" } } },
    },
    "/api/offers/{offerId}/deny": {
      post: { tags: ["Offers"], summary: "Deny offer", parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Denied" } } },
    },
    "/api/offers/{offerId}/withdraw": {
      post: { tags: ["Offers"], summary: "Buyer withdraws offer", parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Withdrawn" } } },
    },
    "/api/offers/{offerId}/counter": {
      post: {
        tags: ["Offers"], summary: "Seller creates counter-offer",
        parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["includedOfferItemIds"], properties: { includedOfferItemIds: { type: "array", items: { type: "string", format: "uuid" } }, cashRequestedCents: { type: "integer" }, sellerNote: { type: "string" } } } } } },
        responses: { "201": { description: "Counter-offer created", content: { "application/json": { schema: { $ref: "#/components/schemas/CounterOffer" } } } } },
      },
      get: { tags: ["Offers"], summary: "Get counter-offer detail", parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Counter-offer" } } },
    },
    "/api/offers/{offerId}/counter/accept": {
      post: { tags: ["Offers"], summary: "Buyer accepts counter → creates Trade", parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Trade created" } } },
    },
    "/api/offers/{offerId}/counter/deny": {
      post: { tags: ["Offers"], summary: "Buyer declines counter-offer", parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Declined" } } },
    },
    // ── Trades ───────────────────────────────────────────────────────────────────
    "/api/trades": {
      get: { tags: ["Trades"], summary: "All user's trades", parameters: [{ $ref: "#/components/parameters/limit" }], responses: { "200": { description: "Paginated trades" } } },
    },
    "/api/trades/{tradeId}": {
      get: { tags: ["Trades"], summary: "Trade detail", parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Trade", content: { "application/json": { schema: { $ref: "#/components/schemas/Trade" } } } }, "403": { description: "Forbidden" } } },
    },
    "/api/trades/{tradeId}/complete": {
      post: { tags: ["Trades"], summary: "Mark trade completed", parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Trade marked complete" } } },
    },
    "/api/trades/{tradeId}/reviews": {
      post: {
        tags: ["Trades"], summary: "Leave a review",
        parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["rating"], properties: { rating: { type: "integer", minimum: 1, maximum: 5 }, comment: { type: "string", maxLength: 1000 } } } } } },
        responses: { "201": { description: "Review created", content: { "application/json": { schema: { $ref: "#/components/schemas/TradeReview" } } } } },
      },
    },
    // ── Conversations ────────────────────────────────────────────────────────────
    "/api/conversations": {
      get: { tags: ["Chat"], summary: "All conversations", parameters: [{ $ref: "#/components/parameters/limit" }], responses: { "200": { description: "Paginated conversations" } } },
    },
    "/api/conversations/{conversationId}": {
      get: { tags: ["Chat"], summary: "Conversation detail", parameters: [{ name: "conversationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Conversation" } } },
    },
    "/api/conversations/{conversationId}/messages": {
      get: { tags: ["Chat"], summary: "Messages (cursor-paginated)", parameters: [{ name: "conversationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { description: "Paginated messages" } } },
      post: {
        tags: ["Chat"], summary: "Send a message",
        parameters: [{ name: "conversationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["body"], properties: { body: { type: "string", maxLength: 2000 }, type: { type: "string", enum: ["text","image"], default: "text" } } } } } },
        responses: { "201": { description: "Message sent", content: { "application/json": { schema: { $ref: "#/components/schemas/Message" } } } } },
      },
    },
    // ── Notifications ────────────────────────────────────────────────────────────
    "/api/notifications": {
      get: { tags: ["Notifications"], summary: "Notification feed", parameters: [{ $ref: "#/components/parameters/limit" }, { name: "unreadOnly", in: "query", schema: { type: "boolean" } }], responses: { "200": { description: "Paginated notifications" } } },
    },
    "/api/notifications/{notificationId}/read": {
      patch: { tags: ["Notifications"], summary: "Mark one notification read", parameters: [{ name: "notificationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Marked read" } } },
    },
    "/api/notifications/read-all": {
      post: { tags: ["Notifications"], summary: "Mark all notifications read", responses: { "204": { description: "All marked read" } } },
    },
  },
  tags: [
    { name: "Meta",          description: "Health and metadata" },
    { name: "Auth",          description: "Authentication and session management" },
    { name: "Users",         description: "User profiles" },
    { name: "Listings",      description: "Item listings and categories" },
    { name: "Swipe",         description: "Swipe deck and streak" },
    { name: "Offers",        description: "Swap offers and counter-offers" },
    { name: "Trades",        description: "Confirmed trades and reviews" },
    { name: "Chat",          description: "Real-time conversation and messages" },
    { name: "Notifications", description: "In-app notification feed" },
  ],
} as const;
