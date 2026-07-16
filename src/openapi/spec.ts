/** OpenAPI 3.1 specification for the SwapHaven API. */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "SwapHaven API",
    version: "1.0.0",
    description: "Peer-to-peer item trading platform — Express 5 · PostgreSQL · Drizzle ORM",
    contact: { email: "api@swaphaven.io" },
  },
  // servers injected at runtime — see getOpenApiSpec() in serverUrl.ts
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
        description: "Full profile (own user, GET /api/users/me).",
        properties: {
          id:                 { type: "string", format: "uuid" },
          displayName:        { type: "string" },
          bio:                { type: "string", nullable: true },
          avatarUrl:          { type: "string", nullable: true },
          locationCity:       { type: "string", nullable: true },
          tradeScore:         { type: "integer" },
          totalTrades:        { type: "integer" },
          ratingSum:          { type: "integer" },
          ratingCount:        { type: "integer" },
          isVerified:         { type: "boolean" },
          isPhoneVerified:    { type: "boolean" },
          completionRate:     { type: "integer", minimum: 0, maximum: 100, nullable: true, description: "Percent of trades completed (server-managed)." },
          avgResponseMinutes: { type: "integer", nullable: true, description: "Average response time in minutes (server-managed)." },
          createdAt:          { type: "string", format: "date-time" },
          updatedAt:          { type: "string", format: "date-time" },
        },
      },
      PublicUserProfile: {
        type: "object",
        description: "Public profile (GET /api/users/:userId). Private lat/lng stripped; computed rating and hasLocation added.",
        properties: {
          id:                 { type: "string", format: "uuid" },
          displayName:        { type: "string" },
          bio:                { type: "string", nullable: true },
          avatarUrl:          { type: "string", nullable: true },
          locationCity:       { type: "string", nullable: true },
          hasLocation:        { type: "boolean", description: "True when lat/lng are on file; exact coords are private." },
          totalTrades:        { type: "integer" },
          rating:             { type: "number", nullable: true, description: "Computed from ratingSum / ratingCount, rounded to 1 decimal. Null when no reviews yet." },
          isVerified:         { type: "boolean" },
          isPhoneVerified:    { type: "boolean", description: "Reserved; not populated yet (defaults to false)." },
          completionRate:     { type: "integer", minimum: 0, maximum: 100, nullable: true, description: "Reserved; not populated yet (null until trade stats flow lands)." },
          avgResponseMinutes: { type: "integer", nullable: true, description: "Reserved; not populated yet (null until messaging stats flow lands)." },
          createdAt:          { type: "string", format: "date-time" },
        },
      },
      UpdateProfileRequest: {
        type: "object",
        description: "Fields a user may change on their own profile. Stats and trust signals are server-managed and cannot be set here.",
        properties: {
          displayName:  { type: "string", minLength: 1, maxLength: 80 },
          bio:          { type: "string", maxLength: 500 },
          avatarUrl:    { type: "string", maxLength: 2048 },
          locationCity: { type: "string", maxLength: 100 },
          locationLat:  { type: "number", minimum: -90, maximum: 90 },
          locationLng:  { type: "number", minimum: -180, maximum: 180 },
        },
      },
      SellerSnapshot: {
        type: "object",
        description: "Seller mini-card embedded in GET /api/listings/:id to avoid a second round-trip.",
        properties: {
          id:                 { type: "string", format: "uuid" },
          display_name:       { type: "string" },
          avatar_url:         { type: "string", nullable: true },
          is_verified:        { type: "boolean" },
          is_phone_verified:  { type: "boolean", description: "Reserved; not populated yet (defaults to false)." },
          total_trades:       { type: "integer" },
          rating:             { type: "number", nullable: true },
          location_city:      { type: "string", nullable: true },
          completion_rate:    { type: "integer", nullable: true, description: "Reserved; not populated yet." },
          avg_response_minutes: { type: "integer", nullable: true, description: "Reserved; not populated yet." },
          member_since:       { type: "string", format: "date-time" },
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
        description: "Raw DB-shape listing row (camelCase). Returned in items[] arrays alongside the serialized listings[] array.",
        properties: {
          id:                  { type: "string", format: "uuid" },
          userId:              { type: "string", format: "uuid" },
          categoryId:          { type: "string", format: "uuid", nullable: true },
          title:               { type: "string" },
          description:         { type: "string", nullable: true },
          condition:           { type: "string", enum: ["new","like_new","great","good","fair"] },
          estimatedValue:      { type: "integer" },
          estimatedValueCents: { type: "integer", nullable: true },
          isSwipeOnly:         { type: "boolean" },
          status:              { type: "string", enum: ["active","traded","paused","deleted"] },
          soldMethod:          { type: "string", enum: ["traded_on_barter","sold_for_cash","given_away"], nullable: true, description: "How the item left the seller. Set by POST /sold; null while the listing is active." },
          tradedWithUserId:    { type: "string", format: "uuid", nullable: true, description: "UUID of the SwapHaven user the seller traded with (traded_on_barter only)." },
          locationCity:        { type: "string", nullable: true },
          viewCount:           { type: "integer", description: "Approximate page-view count. Incremented by POST /api/listings/:id/view." },
          rightSwipeCount:     { type: "integer", description: "Denormalized right-swipe count. Incremented atomically on each new right swipe." },
          createdAt:           { type: "string", format: "date-time" },
          updatedAt:           { type: "string", format: "date-time" },
          images:              { type: "array", items: { $ref: "#/components/schemas/ListingImage" } },
        },
      },
      BarterListing: {
        type: "object",
        description: "barter-stack wire shape (snake_case) from serializeListingBarter. Returned in listings[] arrays and single-item detail responses.",
        properties: {
          id:                  { type: "string", format: "uuid" },
          user_id:             { type: "string", format: "uuid" },
          title:               { type: "string" },
          description:         { type: "string" },
          category:            { type: "string", nullable: true },
          condition:           { type: "string", enum: ["new","like_new","great","good","fair"] },
          estimated_value:     { type: "integer" },
          accept_cash_top_ups: { type: "boolean" },
          wanted_category_ids: { type: "array", items: { type: "string" } },
          wanted_categories:   { type: "array", items: { type: "string" } },
          images:              { type: "array", items: { type: "string", format: "uri" } },
          details: {
            type: "object",
            properties: {
              ageRange: { type: "string" },
              brand:    { type: "string" },
            },
          },
          location: {
            type: "object",
            properties: {
              address:     { type: "string" },
              city:        { type: "string" },
              state:       { type: "string" },
              country:     { type: "string" },
              postal_code: { type: "string" },
              lat:         { type: "number", nullable: true },
              lng:         { type: "number", nullable: true },
            },
          },
          status:            { type: "string", enum: ["active","traded","paused","deleted"] },
          created_at:        { type: "string", format: "date-time" },
          owner_name:        { type: "string" },
          right_swipe_count: { type: "integer", description: "Denormalized right-swipe count." },
          view_count:        { type: "integer", description: "Approximate page-view count." },
          seller:            { allOf: [{ $ref: "#/components/schemas/SellerSnapshot" }], nullable: true, description: "Embedded seller card. Present on GET /api/listings/:id; null on feed/closet responses." },
        },
      },
      SearchListingsResponse: {
        type: "object",
        properties: {
          listings: {
            type: "array",
            items: {
              allOf: [
                { $ref: "#/components/schemas/BarterListing" },
                {
                  type: "object",
                  properties: {
                    distance_miles: { type: "number", nullable: true },
                  },
                },
              ],
            },
          },
          total: { type: "integer" },
          nextOffset: { type: "integer", nullable: true },
        },
      },
      TrendingSearchListingsResponse: {
        type: "object",
        description: "Trending active listings for the search idle screen (not search keywords).",
        properties: {
          listings: {
            type: "array",
            items: {
              allOf: [
                { $ref: "#/components/schemas/BarterListing" },
                {
                  type: "object",
                  properties: {
                    distance_miles: { type: "number", nullable: true },
                  },
                },
              ],
            },
          },
          total: { type: "integer" },
        },
      },
      ListingFeedResponse: {
        type: "object",
        properties: {
          listings:   { type: "array", items: { $ref: "#/components/schemas/BarterListing" } },
          items:      { type: "array", items: { $ref: "#/components/schemas/Listing" } },
          nextCursor: { type: "string", nullable: true },
        },
      },
      SwipeDeckCard: {
        type: "object",
        properties: {
          listing:        { $ref: "#/components/schemas/Listing" },
          matchReason:    { type: "string", nullable: true },
          mutualFitScore: { type: "number" },
          hotCount:       { type: "integer", description: "Number of right swipes on this listing (mirrors listing.rightSwipeCount)." },
        },
      },
      SwipeDeckResponse: {
        type: "object",
        properties: {
          cards:                { type: "array", items: { $ref: "#/components/schemas/SwipeDeckCard" } },
          remainingSwipesToday: { type: "integer" },
          bonusSwipesAvailable: { type: "integer" },
          refreshesAt:          { type: "string", format: "date-time" },
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
      OfferListItem: {
        type: "object",
        description: "Enriched offer row for the mobile inbox (Offers tab).",
        properties: {
          id:             { type: "string", format: "uuid" },
          status:         { type: "string", enum: ["pending","accepted","denied","countered","expired","withdrawn"] },
          buyerId:        { type: "string", format: "uuid" },
          sellerId:       { type: "string", format: "uuid" },
          listingId:      { type: "string", format: "uuid" },
          cashTopUpCents: { type: "integer" },
          createdAt:      { type: "string", format: "date-time" },
          listing:        { type: "object", nullable: true },
          buyer:          { type: "object", nullable: true },
          seller:         { type: "object", nullable: true },
          offeredItems:   { type: "array", items: { type: "object" } },
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
          id:                { type: "string", format: "uuid" },
          offerId:           { type: "string", format: "uuid" },
          status:            { type: "string", enum: ["pending_meetup","completed","disputed","cancelled"] },
          meetupScheduledAt:    { type: "string", format: "date-time", nullable: true },
          meetupLocation:       { type: "string", nullable: true },
          completedAt:          { type: "string", format: "date-time", nullable: true },
          reviewWindowClosesAt: { type: "string", format: "date-time", nullable: true, description: "When the 7-day review window closes. Set on completion." },
          createdAt:            { type: "string", format: "date-time" },
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
          tags:       { type: "array", items: { type: "string" }, description: "Quick-select tags chosen by the reviewer." },
          createdAt:  { type: "string", format: "date-time" },
        },
      },
      PublicTradeReview: {
        type: "object",
        description: "Revealed review shown on a user profile. Includes reviewer display info.",
        properties: {
          id:                  { type: "string", format: "uuid" },
          tradeId:             { type: "string", format: "uuid" },
          reviewerId:          { type: "string", format: "uuid" },
          revieweeId:          { type: "string", format: "uuid" },
          rating:              { type: "integer", minimum: 1, maximum: 5 },
          comment:             { type: "string", nullable: true },
          tags:                { type: "array", items: { type: "string" } },
          createdAt:           { type: "string", format: "date-time" },
          reviewerDisplayName: { type: "string", nullable: true },
          reviewerAvatarUrl:   { type: "string", nullable: true },
        },
      },
      ReviewStatus: {
        type: "object",
        description: "Sealed review window status for a completed trade.",
        properties: {
          tradeId:        { type: "string", format: "uuid" },
          windowClosesAt: { type: "string", format: "date-time", nullable: true, description: "ISO timestamp when the 7-day review window closes." },
          windowOpen:     { type: "boolean", description: "True while the window is still open and reviews can be submitted." },
          revealed:       { type: "boolean", description: "True when both parties submitted or the window has closed." },
          myReview: {
            type: "object",
            properties: {
              submitted:   { type: "boolean" },
              submittedAt: { type: "string", format: "date-time", nullable: true },
            },
          },
          theirReview: {
            type: "object",
            description: "Only 'submitted' is exposed before reviews are revealed.",
            properties: {
              submitted: { type: "boolean" },
            },
          },
        },
      },
      Conversation: {
        type: "object",
        description: "Chats-tab row. Enriched with the offer, trade, other participant, last message, and unread count in one call.",
        properties: {
          id:    { type: "string", format: "uuid" },
          offer: {
            type: "object",
            properties: {
              id:           { type: "string", format: "uuid" },
              status:       { type: "string" },
              listing:      { type: "object", nullable: true },
              offeredItems: { type: "array", items: { type: "object" } },
            },
          },
          trade: {
            type: "object", nullable: true,
            properties: {
              id:                { type: "string", format: "uuid" },
              status:            { type: "string", enum: ["pending_meetup","completed","disputed","cancelled"] },
              meetupScheduledAt: { type: "string", format: "date-time", nullable: true },
              meetupLocation:    { type: "string", nullable: true },
            },
          },
          otherUser: {
            type: "object", nullable: true,
            properties: {
              id:          { type: "string", format: "uuid" },
              displayName: { type: "string" },
              avatarUrl:   { type: "string", nullable: true },
              isVerified:  { type: "boolean" },
            },
          },
          lastMessage: {
            type: "object", nullable: true,
            properties: {
              body:     { type: "string" },
              sentAt:   { type: "string", format: "date-time" },
              senderId: { type: "string", format: "uuid" },
            },
          },
          unreadCount: { type: "integer" },
          updatedAt:   { type: "string", format: "date-time" },
        },
      },
      MeetupSuggestion: {
        type: "object",
        description: "A named transit stop suggested as a meetup point.",
        properties: {
          name:            { type: "string" },
          lat:             { type: "number" },
          lng:             { type: "number" },
          type:            { type: "string", description: "e.g. Train Station, Bus Stop, Tram Stop" },
          distanceMeters:  { type: "integer", description: "Distance from midpoint in metres" },
        },
      },
      MeetupSuggestionsResponse: {
        type: "object",
        properties: {
          midpoint: {
            type: "object", nullable: true,
            properties: { lat: { type: "number" }, lng: { type: "number" } },
          },
          suggestions: { type: "array", items: { $ref: "#/components/schemas/MeetupSuggestion" } },
          reason: {
            type: "string", nullable: true,
            enum: ["location_unavailable", "none_found", "overpass_error"],
            description: "Populated when suggestions is empty to explain why",
          },
        },
      },
      InboxSummary: {
        type: "object",
        properties: {
          actionNeededOffers: { type: "integer", description: "Offers needing a response: seller pending, buyer countered" },
          unreadMessages:     { type: "integer", description: "Total unread messages across all conversations" },
          total:              { type: "integer", description: "Nav-badge count (actionNeededOffers + unreadMessages)" },
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
      SponsoredAd: {
        type: "object",
        description: "Curated sponsored/house-ad card interleaved into the swipe deck.",
        properties: {
          id:                 { type: "string", format: "uuid" },
          sponsorName:        { type: "string" },
          tagline:            { type: "string" },
          ctaLabel:           { type: "string" },
          ctaColor:           { type: "string", description: "Hex color for the CTA button (e.g. \"#F59E0B\")." },
          ctaUrl:             { type: "string", nullable: true, description: "http(s) or app deep link opened when the CTA is tapped." },
          backgroundImageUrl: { type: "string", description: "Card background image; empty string renders a dark gradient." },
          weight:             { type: "integer", description: "Rotation weight; higher shows more often." },
        },
      },
      SponsoredAdsResponse: {
        type: "object",
        properties: {
          ads: { type: "array", items: { $ref: "#/components/schemas/SponsoredAd" } },
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
    "/api/auth/social": {
      post: {
        tags: ["Auth"],
        summary: "Log in or sign up with a social provider",
        description:
          "Verifies a Google ID token or Facebook access token. When the provider email matches an existing account (including email/password registration), tokens are issued for that account without a password check; the password remains valid until reset. Google requires a verified email.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["provider","idToken"], properties: { provider: { type: "string", enum: ["google","facebook"] }, idToken: { type: "string", description: "Google ID token or Facebook access token" } } } } },
        },
        responses: {
          "200": { description: "Tokens issued (existing or newly created account)", content: { "application/json": { schema: { properties: { accessToken: { type: "string" }, refreshToken: { type: "string" }, user: { $ref: "#/components/schemas/User" } } } } } },
          "400": { description: "Validation error" },
          "401": { description: "Invalid social token" },
          "502": { description: "Provider unreachable" },
          "503": { description: "Provider not configured" },
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
      get: {
        tags: ["Users"], summary: "Get own profile",
        responses: { "200": { description: "Full profile", content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } } } },
      },
      patch: {
        tags: ["Users"], summary: "Update own profile",
        description: "Accepts only user-editable fields. Stats (totalTrades, ratingSum, ratingCount, isPhoneVerified, completionRate, avgResponseMinutes) are server-managed and will be ignored if sent.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateProfileRequest" } } } },
        responses: { "200": { description: "Updated profile", content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } } } },
      },
    },
    "/api/users/{userId}": {
      get: {
        tags: ["Users"], summary: "Get public profile", security: [],
        description: "Returns public fields only. lat/lng are stripped; a computed `rating` (ratingSum / ratingCount) and a `hasLocation` flag are added.",
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Public profile", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicUserProfile" } } } },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/users/{userId}/listings": {
      get: {
        tags: ["Users"], summary: "List a user's non-deleted listings (seller closet)",
        security: [],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { $ref: "#/components/parameters/limit" },
          { $ref: "#/components/parameters/cursor" },
        ],
        responses: {
          "200": {
            description: "Paginated listings with a total count for the closet header.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items:      { type: "array", items: { $ref: "#/components/schemas/Listing" } },
                    nextCursor: { type: "string", nullable: true },
                    total:      { type: "integer", description: "Total non-deleted listings for this user (for the '8 listings' header)." },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/users/{userId}/reviews": {
      get: {
        tags: ["Users"], summary: "List a user's revealed reviews",
        description: "Returns only revealed reviews — those where both parties submitted or the 7-day window closed. Includes reviewer display name and avatar.",
        security: [],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { $ref: "#/components/parameters/limit" },
          { $ref: "#/components/parameters/cursor" },
        ],
        responses: {
          "200": {
            description: "Paginated revealed reviews",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items:      { type: "array", items: { $ref: "#/components/schemas/PublicTradeReview" } },
                    nextCursor: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    // ── Media (S3 presign) ───────────────────────────────────────────────────────
    "/api/media/status": {
      get: {
        tags: ["Media"],
        summary: "S3 upload configuration status",
        security: [],
        responses: { "200": { description: "configured flag and allowed content types" } },
      },
    },
    "/api/media/presign": {
      post: {
        tags: ["Media"],
        summary: "Create presigned S3 upload URL(s) for listing images",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    required: ["contentType"],
                    properties: {
                      contentType: { type: "string", example: "image/jpeg" },
                      filename: { type: "string" },
                    },
                  },
                  {
                    type: "object",
                    required: ["files"],
                    properties: {
                      files: {
                        type: "array",
                        maxItems: 10,
                        items: {
                          type: "object",
                          required: ["contentType"],
                          properties: {
                            contentType: { type: "string" },
                            filename: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "200": { description: "Presigned upload URL and public URL" },
          "503": { description: "S3 not configured" },
        },
      },
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
        responses: { "200": { description: "Paginated listings", content: { "application/json": { schema: { $ref: "#/components/schemas/ListingFeedResponse" } } } } },
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
        responses: { "201": { description: "Listing created", content: { "application/json": { schema: { type: "object", properties: { listing: { $ref: "#/components/schemas/BarterListing" } } } } } } },
      },
    },
    "/api/listings/{listingId}": {
      get: {
        tags: ["Listings"], summary: "Get listing detail", security: [],
        description: "Returns the full BarterListing with an embedded `seller` card (SellerSnapshot). No extra round-trip needed for the seller mini-card. seller is null only if the user profile is missing.",
        parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "Listing detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    listing: { $ref: "#/components/schemas/BarterListing" },
                    id:      { type: "string", format: "uuid", description: "Legacy flat field — use listing.id." },
                    title:   { type: "string",                 description: "Legacy flat field — use listing.title." },
                    status:  { type: "string",                 description: "Legacy flat field — use listing.status." },
                    images:  { type: "array", items: { type: "string", format: "uri" }, description: "Legacy flat field — use listing.images." },
                  },
                },
              },
            },
          },
          "404": { description: "Not found" },
        },
      },
      patch: {
        tags: ["Listings"], summary: "Update listing (Edit Listing screen)",
        description: "Partial update for the Edit Listing form — all fields optional. Caller must own the listing. Close a listing via POST /sold or DELETE, not this route. Photos via POST/DELETE /api/listings/{listingId}/images.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title:               { type: "string", maxLength: 200 },
                  description:         { type: "string", maxLength: 10000 },
                  category:            { type: "string", description: "Category slug (e.g. 'cameras')." },
                  categoryId:          { type: "string", format: "uuid", description: "Category UUID when known." },
                  condition:           { type: "string", enum: ["new","like_new","great","good","fair"] },
                  estimatedValue:      { type: "integer", description: "Dollar estimate (Est. Value field)." },
                  estimatedValueCents: { type: "integer", description: "Value in cents — alternative to estimatedValue." },
                  wantedCategoryIds:   { type: "array", items: { type: "string" }, description: "Open to trade for — category slugs or UUIDs." },
                  wantedCategories:    { type: "array", items: { type: "string" }, description: "Open to trade for — display labels (e.g. 'Vintage Clothing', 'Sneakers')." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated listing.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    listing: { $ref: "#/components/schemas/BarterListing" },
                    id:      { type: "string", format: "uuid", description: "Legacy flat field — prefer listing.id." },
                    title:   { type: "string",                 description: "Legacy flat field — prefer listing.title." },
                    status:  { type: "string",                 description: "Legacy flat field — prefer listing.status." },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error." },
          "403": { description: "Forbidden — caller does not own the listing." },
          "404": { description: "Listing not found." },
        },
      },
      delete: {
        tags: ["Listings"], summary: "Delete listing (soft)",
        description: "Soft-deletes the listing (status → deleted). All pending offers are automatically denied and each buyer is notified.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Listing deleted and pending offers declined." },
          "403": { description: "Forbidden — caller does not own the listing." },
          "404": { description: "Listing not found." },
          "409": { description: "Listing is already deleted." },
        },
      },
    },
    "/api/listings/{listingId}/sold": {
      post: {
        tags: ["Listings"], summary: "Mark listing as sold / traded",
        description: "Closes the listing (status → traded). All remaining pending offers are automatically denied with a notification to each buyer. When soldMethod is `traded_on_barter` the seller's `totalTrades` count is incremented. The `shareWin` flag is echoed back for the mobile client to decide whether to show a trade-story composer.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["soldMethod"],
                properties: {
                  soldMethod:       { type: "string", enum: ["traded_on_barter", "sold_for_cash", "given_away"], description: "How the item left the seller's hands." },
                  tradedWithUserId: { type: "string", format: "uuid", description: "UUID of the user traded with (traded_on_barter only). Optional — links the closed deal to a known SwapHaven user." },
                  shareWin:         { type: "boolean", default: false, description: "When true the mobile client should show a trade-story composer after this call." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Listing marked as sold.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    listing:    { $ref: "#/components/schemas/BarterListing" },
                    id:         { type: "string", format: "uuid" },
                    status:     { type: "string", enum: ["traded"] },
                    soldMethod: { type: "string", enum: ["traded_on_barter", "sold_for_cash", "given_away"] },
                    shareWin:   { type: "boolean" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error." },
          "403": { description: "Forbidden — caller does not own the listing." },
          "404": { description: "Listing not found." },
          "409": { description: "Listing is already sold or deleted." },
        },
      },
    },
    "/api/listings/{listingId}/view": {
      post: {
        tags: ["Listings"], summary: "Increment view counter",
        description: "Fire-and-forget view ping. Responds 204 immediately; the DB write is async. Requires auth to prevent anonymous view-count inflation. Clients should call this once per unique detail-page visit.",
        parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "View counted (or silently ignored for deleted listings)." },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/listings/{listingId}/images": {
      post: { tags: ["Listings"], summary: "Add photo to listing", parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, position: { type: "integer" } } } } } }, responses: { "201": { description: "Image added" } } },
    },
    "/api/listings/{listingId}/images/{imageId}": {
      delete: { tags: ["Listings"], summary: "Remove photo", parameters: [{ name: "listingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Image removed" } } },
    },
    // ── Swipe ────────────────────────────────────────────────────────────────────
    "/api/swipe/deck": {
      get: { tags: ["Swipe"], summary: "Get today's curated swipe deck", responses: { "200": { description: "Swipe cards", content: { "application/json": { schema: { $ref: "#/components/schemas/SwipeDeckResponse" } } } } } },
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
      get: {
        tags: ["Offers"], summary: "Received offers",
        parameters: [{ $ref: "#/components/parameters/limit" }, { name: "status", in: "query", schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Paginated received offers",
            content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/OfferListItem" } }, nextCursor: { type: "string", nullable: true } } } } },
          },
        },
      },
    },
    "/api/offers/sent": {
      get: {
        tags: ["Offers"], summary: "Sent offers",
        parameters: [{ $ref: "#/components/parameters/limit" }],
        responses: {
          "200": {
            description: "Paginated sent offers",
            content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/OfferListItem" } }, nextCursor: { type: "string", nullable: true } } } } },
          },
        },
      },
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
      get: {
        tags: ["Trades"], summary: "List the caller's trades",
        description: "Returns all trades where the caller is either the buyer or seller, ordered newest first.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/limit" }],
        responses: {
          "200": {
            description: "Paginated trade list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items:      { type: "array", items: { $ref: "#/components/schemas/Trade" } },
                    nextCursor: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/trades/{tradeId}": {
      get: {
        tags: ["Trades"], summary: "Trade detail",
        description: "Returns the full trade including offer items and any submitted reviews. Caller must be a party to the trade.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Trade", content: { "application/json": { schema: { $ref: "#/components/schemas/Trade" } } } },
          "403": { description: "Forbidden — caller is not a party to this trade" },
          "404": { description: "Trade not found" },
        },
      },
    },
    "/api/trades/{tradeId}/meetup": {
      patch: {
        tags: ["Trades"], summary: "Set meetup time and location",
        description: "Either party can set or update the meetup details while the trade is in `pending_meetup` status.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["meetupScheduledAt", "meetupLocation"],
                properties: {
                  meetupScheduledAt: { type: "string", format: "date-time" },
                  meetupLocation:    { type: "string", maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated trade", content: { "application/json": { schema: { $ref: "#/components/schemas/Trade" } } } },
          "400": { description: "Validation error" },
          "403": { description: "Forbidden — caller is not a party to this trade" },
          "404": { description: "Trade not found" },
        },
      },
    },
    "/api/trades/{tradeId}/complete": {
      post: {
        tags: ["Trades"], summary: "Mark trade completed",
        description: "Marks the trade as `completed` and opens a 7-day sealed review window (`reviewWindowClosesAt = now + 7 days`). Either party can call this. The other party receives a `trade_completed` push notification.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "Trade marked complete. Use `reviewWindowClosesAt` to drive the countdown UI.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Trade" } } },
          },
          "403": { description: "Forbidden — caller is not a party to this trade" },
          "404": { description: "Trade not found" },
          "409": { description: "Trade is not in `pending_meetup` status" },
        },
      },
    },
    "/api/trades/{tradeId}/review-status": {
      get: {
        tags: ["Trades"], summary: "Review window status",
        description: "Returns the sealed-review window state for a completed trade: whether the window is open, whether both parties have submitted, and the close timestamp.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Review status", content: { "application/json": { schema: { $ref: "#/components/schemas/ReviewStatus" } } } },
          "403": { description: "Forbidden — not a party to this trade" },
          "404": { description: "Trade not found" },
          "409": { description: "Trade is not yet completed" },
        },
      },
    },
    "/api/trades/{tradeId}/reviews/mine": {
      get: {
        tags: ["Trades"], summary: "My review for this trade",
        description: "Returns the current user's own submitted review (always visible to the author, even while sealed).",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "The user's review", content: { "application/json": { schema: { $ref: "#/components/schemas/TradeReview" } } } },
          "403": { description: "Forbidden" },
          "404": { description: "Trade or review not found" },
        },
      },
    },
    "/api/trades/{tradeId}/reviews": {
      post: {
        tags: ["Trades"], summary: "Submit a review",
        description: "Submit a sealed review within the 7-day window. Reviews reveal when both parties submit or the window closes.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "tradeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["rating"],
                properties: {
                  rating:  { type: "integer", minimum: 1, maximum: 5 },
                  comment: { type: "string", maxLength: 1000 },
                  tags:    { type: "array", items: { type: "string", maxLength: 50 }, maxItems: 10, description: "Quick-select tags, e.g. 'Fast reply', 'Great condition'." },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Review submitted (sealed until revealed)", content: { "application/json": { schema: { $ref: "#/components/schemas/TradeReview" } } } },
          "403": { description: "Forbidden — not a party to this trade" },
          "404": { description: "Trade not found" },
          "409": { description: "Already reviewed, trade not completed, or review window closed" },
        },
      },
    },
    // ── Conversations ────────────────────────────────────────────────────────────
    "/api/conversations": {
      get: { tags: ["Chat"], summary: "All conversations", parameters: [{ $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { description: "Paginated conversations", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Conversation" } }, nextCursor: { type: "string", nullable: true } } } } } } } },
    },
    "/api/conversations/{conversationId}/read": {
      patch: { tags: ["Chat"], summary: "Mark conversation read (clears unread badge)", parameters: [{ name: "conversationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "204": { description: "Marked read" }, "403": { description: "Forbidden" }, "404": { description: "Not found" } } },
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
    "/api/conversations/{conversationId}/meetup-suggestions": {
      get: {
        tags: ["Chat"],
        summary: "Transit-stop meetup suggestions at the midpoint between buyer and seller",
        description: "Calculates the geographic midpoint between both users' saved locations and returns nearby transit stops from OpenStreetMap. Returns reason:\"location_unavailable\" if either user has no location on their profile.",
        parameters: [{ name: "conversationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Suggestions (may be empty)", content: { "application/json": { schema: { $ref: "#/components/schemas/MeetupSuggestionsResponse" } } } },
          "403": { description: "Not a participant" },
          "404": { description: "Conversation not found" },
        },
      },
    },
    "/api/conversations/{conversationId}/meetup": {
      patch: {
        tags: ["Chat"],
        summary: "Set trade meetup location (by conversationId)",
        description: "Convenience endpoint — resolves the trade via the conversation and applies the meetup location. meetupScheduledAt defaults to now if omitted.",
        parameters: [{ name: "conversationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["meetupLocation"], properties: { meetupLocation: { type: "string", maxLength: 500 }, meetupScheduledAt: { type: "string", format: "date-time" } } } } },
        },
        responses: {
          "200": { description: "Updated trade", content: { "application/json": { schema: { $ref: "#/components/schemas/Trade" } } } },
          "400": { description: "Validation error" },
          "403": { description: "Not a participant" },
          "404": { description: "Conversation not found" },
          "409": { description: "No trade linked to this conversation" },
        },
      },
    },
    // ── Inbox ────────────────────────────────────────────────────────────────────
    "/api/inbox/summary": {
      get: { tags: ["Chat"], summary: "Inbox badge counts", responses: { "200": { description: "Counts for the nav badge", content: { "application/json": { schema: { $ref: "#/components/schemas/InboxSummary" } } } } } },
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
    // ── Search ───────────────────────────────────────────────────────────────────
    "/api/search/listings": {
      get: {
        tags: ["Search"],
        summary: "Search active listings (paginated)",
        description:
          "Dedicated search module. Only status=active listings. Multi-token AND on title/description, optional geo radius, offset pagination. Optional seed_ids reserved for Phase 2 affinity (ignored today).",
        security: [],
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search query (normalized; length < 2 ignored)" },
          { name: "lat", in: "query", schema: { type: "number" } },
          { name: "lng", in: "query", schema: { type: "number" } },
          { name: "radius", in: "query", schema: { type: "number", minimum: 1, maximum: 25 }, description: "Max distance miles (hard filter)" },
          { name: "condition", in: "query", schema: { type: "string" }, description: "CSV of like_new,great,good,fair,new" },
          { name: "category", in: "query", schema: { type: "string" }, description: "Category slug" },
          {
            name: "sort",
            in: "query",
            schema: {
              type: "string",
              enum: ["best_match", "nearest", "newest", "value_asc", "most_saved"],
            },
          },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          { name: "seed_ids", in: "query", schema: { type: "string" }, description: "Phase 2: CSV of listing UUIDs (ignored in Phase 1)" },
        ],
        responses: {
          "200": {
            description: "Search results",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SearchListingsResponse" } } },
          },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/search/trending": {
      get: {
        tags: ["Search"],
        summary: "Trending active listings",
        description:
          "Active listings ranked by engagement (right-swipe / save signal). Used by the search idle “Trending” product grid. Tap opens listing detail.",
        security: [],
        parameters: [
          { name: "lat", in: "query", schema: { type: "number" } },
          { name: "lng", in: "query", schema: { type: "number" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 40, default: 8 } },
        ],
        responses: {
          "200": {
            description: "Trending listings",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrendingSearchListingsResponse" },
              },
            },
          },
        },
      },
    },
    // ── Ads ──────────────────────────────────────────────────────────────────────
    "/api/ads/active": {
      get: {
        tags: ["Ads"],
        summary: "List active sponsored cards",
        description: "Curated house/sponsor cards interleaved into the swipe deck. Public: no auth required. Filters rows to active = true AND within any configured starts_at/ends_at window. Ordered by weight DESC.",
        security: [],
        responses: {
          "200": { description: "Active sponsored cards", content: { "application/json": { schema: { $ref: "#/components/schemas/SponsoredAdsResponse" } } } },
        },
      },
    },
    "/api/ads/{id}/click": {
      post: {
        tags: ["Ads"],
        summary: "Record a sponsored-ad CTA click",
        description: "Increments the ad's click_count when the user taps the CTA or right-swipes an ad card. Public: no auth required. Responds with 204 immediately; the DB write is fire-and-forget.",
        security: [],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Click recorded (or ad id not found — still 204 after response is sent)" },
          "400": { description: "Invalid ad id" },
        },
      },
    },
    "/api/ads/{id}/impression": {
      post: {
        tags: ["Ads"],
        summary: "Record a sponsored-ad deck impression",
        description: "Increments the ad's impression_count when the ad card becomes the top card in the swipe deck. Public: no auth required. Responds with 204 immediately; the DB write is fire-and-forget.",
        security: [],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Impression recorded" },
          "400": { description: "Invalid ad id" },
        },
      },
    },
  },
  tags: [
    { name: "Meta",          description: "Health and metadata" },
    { name: "Auth",          description: "Authentication and session management" },
    { name: "Users",         description: "User profiles" },
    { name: "Media",         description: "S3 presigned upload URLs for listing images" },
    { name: "Listings",      description: "Item listings, categories, and owner actions (edit / mark sold / delete)" },
    { name: "Swipe",         description: "Swipe deck and streak" },
    { name: "Offers",        description: "Swap offers and counter-offers" },
    { name: "Trades",        description: "Confirmed trades, meetup coordination, and sealed peer reviews (7-day reveal window)" },
    { name: "Chat",          description: "Real-time conversation and messages" },
    { name: "Notifications", description: "In-app notification feed" },
    { name: "Ads",           description: "Sponsored / house-ad cards for the swipe deck" },
    { name: "Search",        description: "Dedicated listing search (microservice-ready module)" },
  ],
} as const;
