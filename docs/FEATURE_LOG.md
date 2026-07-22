# Feature log

Maps implemented features and lasting fixes to the Cursor chat transcripts that produced them.
Use this to recover implementation details later without grepping every transcript.

## How to add an entry

After finishing a feature or fix in a chat, append one row to the table below:

| Date | Feature | Areas touched | Chat |
|------|---------|---------------|------|
| YYYY-MM-DD | Short 4–8 word name | key paths or areas | `[Short title](<transcript-uuid>)` |

**Finding the transcript uuid:** chats are stored at
`~/.cursor/projects/Users-apple-projects-barter-stack/agent-transcripts/<uuid>/<uuid>.jsonl`.
Cite prior chats as `[title](uuid)`.

**Recoverability:** every chat is already persisted as JSONL on disk. This log is a
lookup table so you (or an agent) can jump straight to the right transcript tomorrow.
Full turn-by-turn detail remains in the linked file.


Cross-repo work also appears in [barter-stack `mobile/docs/FEATURE_LOG.md`](../../barter-stack/mobile/docs/FEATURE_LOG.md).

## Entries

| Date | Feature | Areas touched | Chat |
|------|---------|---------------|------|
| 2026-05-24 | Dynamic OpenAPI server URL | src/openapi/serverUrl.ts, src/openapi/spec.ts, src/app.ts, tests/openapiServerUrl.test.ts | [Dynamic OpenAPI server URL](38b71ff3-407b-4def-8aef-a47c23a0d601) |
| 2026-05-27 | Add listing seed catalog scripts | seed-listings, listing-fixtures, package.json, seed docs | [Add listing seed catalog scripts](124a2f8c-cae4-4f3d-8c81-26229e7bddaf) |
| 2026-05-30 | Unified inbox offers and chats | mobile inbox feature, inbox/offers/conversations routes, trades schema | [Unified inbox offers and chats](aa0587d6-b800-408e-b9b6-d05f4568596e) |
| 2026-06-02 | Fix PATCH users/me validation | src/routes/users.ts | [Fix PATCH users/me validation](a7fe47ee-07a8-493a-8ccf-e9e5fb27465f) |
| 2026-06-03 | Add Google Facebook social auth | social-auth.ts, auth routes, openapi, auth tests, SOCIAL_LOGIN.md | [Add Google Facebook social auth](5a7252d2-38f7-4ffa-b2b7-20e0cfa86d63) |
| 2026-06-04 | Hide offered items from swipe | src/routes/swipe.ts, tests/swipe.test.ts | [Hide offered items from swipe](4775d06d-ea4f-491b-8aed-37c9611eb7e9) |
| 2026-06-05 | Fix Google social auth flow | api_endpoints, auth_remote_data_source, social-auth, env | [Fix Google social auth flow](013a4825-5ce9-443a-9b1e-0964b5600f4e) |
| 2026-06-05 | Right-swipe like counts on listings | right-swipe-count, listings/swipe routes, swipe_listing_card, closet listing models | [Right-swipe like counts on listings](912d8e55-26e6-4d3b-b76c-321b3c0a5fda) |
| 2026-06-08 | Meetup point suggestions feature | overpass.ts, conversations, tradechat meetup sheet | [Meetup point suggestions feature](b9765311-5d18-4c4d-b1fa-957be2ad4a55) |
| 2026-06-10 | Fix token refresh and secure storage | token_refresh_handler, base_api_service, storage, auth/push, src/lib/push.ts | [Fix token refresh and secure storage](8ab6726b-05ff-4f27-a334-02f0ef765d52) |
| 2026-06-10 | Merge main and wire push | mobile inbox/push/navigation, src/lib/push.ts, offers/conversations routes | [Merge main and wire push](279f1bbd-2cae-407b-b8d2-bb5245dfc05f) ([also](3dad6cd3-00ab-4d5c-9791-fd45be771c85), [also](8ccd3805-514a-493b-9536-b89ec3b26054)) |
| 2026-06-14 | Add obscenity content moderation | src/lib/moderation.ts, listings/users/auth/conversations/offers/trades routes | [Add obscenity content moderation](f6c4ee7d-9eda-4263-8674-119aab613d5b) |
| 2026-06-14 | Build push notification UI cards | barter_ui notifications, push services, inbox/tradechat, conversations/push | [Build push notification UI cards](880f9108-9768-4287-9ca3-514646eba3e4) |
| 2026-06-14 | Enrich listing detail APIs | src/routes/listings.ts, src/lib/barter-listing.ts, users/listings schema | [Enrich listing detail APIs](2bcb9f59-339e-468d-9df3-8d108eb35381) |
| 2026-06-15 | Listing image relevance moderation | image-moderation.ts, listings routes | [Listing image relevance moderation](b861c456-891a-4c0a-b49f-cabf3e1750a4) |
| 2026-06-30 | Fix batch media presign response | src/routes/media.ts | [Fix batch media presign response](be2207e2-898f-480d-a86c-3d643f129829) |
| 2026-07-04 | Add swipe mutual match score | src/routes/swipe.ts, discovery swipe entities/models, barter_ui swipe card | [Add swipe mutual match score](22b90f73-cad8-44a8-81a1-7824996a377f) |
| 2026-07-04 | Rewrite Trending Near You feed | listings feed feature, listings route, listings_screen, nav tabs | [Rewrite Trending Near You feed](5aa0e8f1-aa31-4642-9a40-e650f20be270) |
| 2026-07-05 | Sponsored swipe discovery ad cards | barter_ui swipe ads, discovery, ads feature, swaphaven ads routes/schema | [Sponsored swipe discovery ad cards](8b6e531b-82e9-4aef-b45b-6158f0da6474) ([also](fc29aaae-c938-4ddf-9d83-5b49e0e0ebb2)) |
| 2026-07-06 | Counter-offer extra items backend | offers schema/routes, counter-offer serializer, drizzle migrations, offers tests | [Counter-offer extra items backend](9ac69823-0ac3-4243-aa63-7dc4d7d78dfd) |
| 2026-07-06 | Enable counter-offer ping-pong | offers routes, counter migrations, inbox entities, counter UI | [Enable counter-offer ping-pong](18fb9605-391e-43af-b17d-e52f95edee07) |
| 2026-07-08 | Implement forgot password email flow | src/routes/auth.ts, src/lib/mailer.ts, auth_screen.dart | [Implement forgot password email flow](78a6c21b-fb66-4d36-aec1-ef953f7de78e) ([also](6cf3b1a4-ed80-465e-8c5d-6a01a167c770)) |
| 2026-07-08 | Publish ads to remote database | scripts/ads.ts, package.json, .env.prod.example | [Publish ads to remote database](493bd321-e656-4a7b-9839-e6d88bd9f80a) |
| 2026-07-10 | Build multi-item counter offer flow | offers schema/routes, inbox serializers, counter_offer/offer_detail screens | [Build multi-item counter offer flow](561bae17-c518-4a1e-922c-654a4457a0e0) |
| 2026-07-11 | Add fresh database reset script | scripts/reset-db.ts, package.json | [Add fresh database reset script](3d53391e-f18f-4127-8e0a-af75dd2526c8) |
| 2026-07-11 | Fix obscenity content moderation | src/lib/moderation.ts, listings/users/auth/conversations/offers/trades routes | [Fix obscenity content moderation](5363aecc-3992-4ded-88d8-8636827171b4) |
| 2026-07-13 | Update counter-offer unit tests | offers.test, push.test, inbox tests, fixtures | [Update counter-offer unit tests](05cfe84a-4ade-4ef7-b95b-04e188e65e76) |
| 2026-07-14 | Build trade review window APIs | trades/users routes, drizzle review migration, openapi spec | [Build trade review window APIs](2eb18388-325f-45b9-bc9d-c024deb9fda4) |
| 2026-07-14 | Listing delete edit sold APIs | listings routes, schema, migration 0012, openapi, docs, tests | [Listing delete edit sold APIs](a762d433-6824-4500-8013-e8e302555e29) |
| 2026-07-15 | End-to-end listing search flow | swaphaven search module, search feature, barter_ui search widgets | [End-to-end listing search flow](8e034782-c876-43f8-b3c6-f7385f5bf8b2) |
| 2026-07-15 | Fix drizzle migration journal order | drizzle/meta/_journal.json | [Fix drizzle migration journal order](7047dc65-9097-4265-b905-dcee4e539e45) |
| 2026-07-16 | Fix trade review window timing | src/lib/review-window.ts, src/routes/trades.ts, src/routes/users.ts, tests/trades.test.ts | [Fix trade review window timing](1c2cf938-c226-4828-9bfd-4eb6bb84000a) ([also](3a3ef046-e120-4412-a21d-c6258002d47b)) |
| 2026-07-16 | Review feature plan implementation | api:scripts/verify-review-db-state.ts | [Review feature plan implementation](b0791992-d910-4a61-9a74-71ed66775f3e) |
| 2026-07-19 | Add fullscreen splash screen | splash, launch screens, swipe deck UI, swipe API owner name | [Add fullscreen splash screen](c9f49741-715d-46eb-8eae-c0c2d0e3ff4b) |
| 2026-07-19 | Category personalization and onboarding polish | onboarding, discovery/swipe, nearby, categories cache, create listing, swipe API | [Category personalization and onboarding polish](951110f1-936e-4072-9384-4714a3d4c3a2) |
| 2026-07-19 | Swipe deck prefetch and limits | swipe routes, discovery feature, env config, tests | [Swipe deck prefetch and limits](bd273065-62bb-4812-a7d4-ec110f7cbd5e) |
| 2026-07-22 | Email OTP create-account flow | auth routes, pending_registrations, auth_screen, onboarding providers, OpenAPI/docs | [Email OTP create-account flow](fbc47598-9205-4f76-8755-b6fde39da847) |
| 2026-07-22 | Fix edit listing and mark sold | edit_listing_screen.dart, mark_as_sold, listings routes, trade-partners API | [Fix edit listing and mark sold](51950220-8488-4cd3-afdc-9d9d031016f3) |
| 2026-07-22 | Strike sold items in trade offers | offers inbox serializers, offer/counter screens, push payloads, listing-owner docs | [Strike sold items in trade offers](9fd321f2-3f95-4e46-8bc5-0e135349c28f) |

## Summaries

### Dynamic OpenAPI server URL

- **Date:** 2026-05-24
- **Chat:** [Dynamic OpenAPI server URL](38b71ff3-407b-4def-8aef-a47c23a0d601)
- **Areas:** src/openapi/serverUrl.ts, src/openapi/spec.ts, src/app.ts, tests/openapiServerUrl.test.ts
- **Summary:** Made Swagger/OpenAPI server URL follow the request host (or PUBLIC_API_URL) instead of hardcoded localhost.

### Add listing seed catalog scripts

- **Date:** 2026-05-27
- **Chat:** [Add listing seed catalog scripts](124a2f8c-cae4-4f3d-8c81-26229e7bddaf)
- **Areas:** seed-listings, listing-fixtures, package.json, seed docs
- **Summary:** Added seed:listings tooling with a large Singapore product catalog and local seeding documentation.

### Unified inbox offers and chats

- **Date:** 2026-05-30
- **Chat:** [Unified inbox offers and chats](aa0587d6-b800-408e-b9b6-d05f4568596e)
- **Areas:** mobile inbox feature, inbox/offers/conversations routes, trades schema
- **Summary:** Built unified inbox API and mobile feature for offers and chat listings with serializers and screens.
- **Also tracked in:** barter-stack FEATURE_LOG

### Fix PATCH users/me validation

- **Date:** 2026-06-02
- **Chat:** [Fix PATCH users/me validation](a7fe47ee-07a8-493a-8ccf-e9e5fb27465f)
- **Areas:** src/routes/users.ts
- **Summary:** Relaxed avatarUrl and profile Zod validation so PATCH /api/users/me accepts valid profile updates.

### Add Google Facebook social auth

- **Date:** 2026-06-03
- **Chat:** [Add Google Facebook social auth](5a7252d2-38f7-4ffa-b2b7-20e0cfa86d63)
- **Areas:** social-auth.ts, auth routes, openapi, auth tests, SOCIAL_LOGIN.md
- **Summary:** Implemented POST /api/auth/social with Google/Facebook token verification, race-safe signup, and docs/tests.

### Hide offered items from swipe

- **Date:** 2026-06-04
- **Chat:** [Hide offered items from swipe](4775d06d-ea4f-491b-8aed-37c9611eb7e9)
- **Areas:** src/routes/swipe.ts, tests/swipe.test.ts
- **Summary:** Excluded listings already in an active offer/negotiation from the swipe deck.

### Fix Google social auth flow

- **Date:** 2026-06-05
- **Chat:** [Fix Google social auth flow](013a4825-5ce9-443a-9b1e-0964b5600f4e)
- **Areas:** api_endpoints, auth_remote_data_source, social-auth, env
- **Summary:** Fixed mobile social auth path/body field mismatch and Google client audience verification so Google sign-in reaches the API successfully.
- **Also tracked in:** barter-stack FEATURE_LOG

### Right-swipe like counts on listings

- **Date:** 2026-06-05
- **Chat:** [Right-swipe like counts on listings](912d8e55-26e6-4d3b-b76c-321b3c0a5fda)
- **Areas:** right-swipe-count, listings/swipe routes, swipe_listing_card, closet listing models
- **Summary:** Exposed aggregated right-swipe counts on listing/swipe APIs and showed heart like counts on profile and swipe cards.
- **Also tracked in:** barter-stack FEATURE_LOG

### Meetup point suggestions feature

- **Date:** 2026-06-08
- **Chat:** [Meetup point suggestions feature](b9765311-5d18-4c4d-b1fa-957be2ad4a55)
- **Areas:** overpass.ts, conversations, tradechat meetup sheet
- **Summary:** Added Overpass-based midway meetup suggestions API and trade chat UI to find public meeting points.
- **Also tracked in:** barter-stack FEATURE_LOG

### Fix token refresh and secure storage

- **Date:** 2026-06-10
- **Chat:** [Fix token refresh and secure storage](8ab6726b-05ff-4f27-a334-02f0ef765d52)
- **Areas:** token_refresh_handler, base_api_service, storage, auth/push, src/lib/push.ts
- **Summary:** Fixed 401 refresh-and-retry, moved tokens to secure storage, delayed device-token registration until login, and added push send logs.
- **Also tracked in:** barter-stack FEATURE_LOG

### Merge main and wire push

- **Date:** 2026-06-10
- **Chat:** [Merge main and wire push](279f1bbd-2cae-407b-b8d2-bb5245dfc05f)
- **See also:** [`3dad6cd3…`](3dad6cd3-00ab-4d5c-9791-fd45be771c85), [`8ccd3805…`](8ccd3805-514a-493b-9536-b89ec3b26054)
- **Areas:** mobile inbox/push/navigation, src/lib/push.ts, offers/conversations routes
- **Summary:** Merged main into the branch resolving conflicts, then wired Firebase push sending on the API and inbox/deep-link handling on mobile.
- **Also tracked in:** barter-stack FEATURE_LOG

### Add obscenity content moderation

- **Date:** 2026-06-14
- **Chat:** [Add obscenity content moderation](f6c4ee7d-9eda-4263-8674-119aab613d5b)
- **Areas:** src/lib/moderation.ts, listings/users/auth/conversations/offers/trades routes
- **Summary:** Added obscenity filtering for user-generated text across key write routes to block vulgar names and content.

### Build push notification UI cards

- **Date:** 2026-06-14
- **Chat:** [Build push notification UI cards](880f9108-9768-4287-9ca3-514646eba3e4)
- **Areas:** barter_ui notifications, push services, inbox/tradechat, conversations/push
- **Summary:** Added in-app push notification cards, deep-link routing, and API push wiring for chat and related notification flows.
- **Also tracked in:** barter-stack FEATURE_LOG

### Enrich listing detail APIs

- **Date:** 2026-06-14
- **Chat:** [Enrich listing detail APIs](2bcb9f59-339e-468d-9df3-8d108eb35381)
- **Areas:** src/routes/listings.ts, src/lib/barter-listing.ts, users/listings schema
- **Summary:** Expanded listing detail responses with seller and related data and added POST /listings/:id/view for view counts.

### Listing image relevance moderation

- **Date:** 2026-06-15
- **Chat:** [Listing image relevance moderation](b861c456-891a-4c0a-b49f-cabf3e1750a4)
- **Areas:** image-moderation.ts, listings routes
- **Summary:** Added cheap Rekognition-based image-to-title/description relevance checks on listing create.

### Fix batch media presign response

- **Date:** 2026-06-30
- **Chat:** [Fix batch media presign response](be2207e2-898f-480d-a86c-3d643f129829)
- **Areas:** src/routes/media.ts
- **Summary:** Changed batch image presign JSON from uploads to files so multi-image listing uploads match the mobile client.

### Add swipe mutual match score

- **Date:** 2026-07-04
- **Chat:** [Add swipe mutual match score](22b90f73-cad8-44a8-81a1-7824996a377f)
- **Areas:** src/routes/swipe.ts, discovery swipe entities/models, barter_ui swipe card
- **Summary:** Added mutual match scoring on swipe feed cards by comparing wanted categories to the viewer’s closet across API and mobile UI.
- **Also tracked in:** barter-stack FEATURE_LOG

### Rewrite Trending Near You feed

- **Date:** 2026-07-04
- **Chat:** [Rewrite Trending Near You feed](5aa0e8f1-aa31-4642-9a40-e650f20be270)
- **Areas:** listings feed feature, listings route, listings_screen, nav tabs
- **Summary:** Rewrote the feed tab as nearby trending rankings with API/mobile wiring, map-style UI, and offer-swap entry.
- **Also tracked in:** barter-stack FEATURE_LOG

### Sponsored swipe discovery ad cards

- **Date:** 2026-07-05
- **Chat:** [Sponsored swipe discovery ad cards](8b6e531b-82e9-4aef-b45b-6158f0da6474)
- **See also:** [`fc29aaae…`](fc29aaae-c938-4ddf-9d83-5b49e0e0ebb2)
- **Areas:** barter_ui swipe ads, discovery, ads feature, swaphaven ads routes/schema
- **Summary:** Built pixel-matched sponsored swipe cards on mobile and wired an ads API/schema with admin tooling for serving them in the deck.
- **Also tracked in:** barter-stack FEATURE_LOG

### Counter-offer extra items backend

- **Date:** 2026-07-06
- **Chat:** [Counter-offer extra items backend](9ac69823-0ac3-4243-aa63-7dc4d7d78dfd)
- **Areas:** offers schema/routes, counter-offer serializer, drizzle migrations, offers tests
- **Summary:** Persisted and returned seller/buyer extra listing arrays on counter-offers so mobile-sent extras are no longer dropped.

### Enable counter-offer ping-pong

- **Date:** 2026-07-06
- **Chat:** [Enable counter-offer ping-pong](18fb9605-391e-43af-b17d-e52f95edee07)
- **Areas:** offers routes, counter migrations, inbox entities, counter UI
- **Summary:** Extended counter-offer API and schema for alternating buyer/seller rounds with listing toggles, plus related mobile entity/UI updates.
- **Also tracked in:** barter-stack FEATURE_LOG

### Implement forgot password email flow

- **Date:** 2026-07-08
- **Chat:** [Implement forgot password email flow](78a6c21b-fb66-4d36-aec1-ef953f7de78e)
- **See also:** [`6cf3b1a4…`](6cf3b1a4-ed80-465e-8c5d-6a01a167c770)
- **Areas:** src/routes/auth.ts, src/lib/mailer.ts, auth_screen.dart
- **Summary:** Added email OTP password-reset on the API and wired the mobile forgot-password flow, plus later auth/swipe logo tweaks.
- **Also tracked in:** barter-stack FEATURE_LOG

### Publish ads to remote database

- **Date:** 2026-07-08
- **Chat:** [Publish ads to remote database](493bd321-e656-4a7b-9839-e6d88bd9f80a)
- **Areas:** scripts/ads.ts, package.json, .env.prod.example
- **Summary:** Extended the ads script and npm wiring so seed ads can target production/remote DB config.

### Build multi-item counter offer flow

- **Date:** 2026-07-10
- **Chat:** [Build multi-item counter offer flow](561bae17-c518-4a1e-922c-654a4457a0e0)
- **Areas:** offers schema/routes, inbox serializers, counter_offer/offer_detail screens
- **Summary:** Added turn/round-aware counter offers with multi-item selection on API and mobile inbox/offer screens.
- **Also tracked in:** barter-stack FEATURE_LOG

### Add fresh database reset script

- **Date:** 2026-07-11
- **Chat:** [Add fresh database reset script](3d53391e-f18f-4127-8e0a-af75dd2526c8)
- **Areas:** scripts/reset-db.ts, package.json
- **Summary:** Added a db reset script using drizzle push --force to recreate a clean schema despite migration conflicts.

### Fix obscenity content moderation

- **Date:** 2026-07-11
- **Chat:** [Fix obscenity content moderation](5363aecc-3992-4ded-88d8-8636827171b4)
- **Areas:** src/lib/moderation.ts, listings/users/auth/conversations/offers/trades routes
- **Summary:** Restored obscenity moderation so filtered content is enforced across listing, user, auth, conversation, offer, and trade write paths.

### Update counter-offer unit tests

- **Date:** 2026-07-13
- **Chat:** [Update counter-offer unit tests](05cfe84a-4ade-4ef7-b95b-04e188e65e76)
- **Areas:** offers.test, push.test, inbox tests, fixtures
- **Summary:** Expanded backend and Flutter inbox unit tests to cover the new counter-offer turn flow and fixtures.
- **Also tracked in:** barter-stack FEATURE_LOG

### Build trade review window APIs

- **Date:** 2026-07-14
- **Chat:** [Build trade review window APIs](2eb18388-325f-45b9-bc9d-c024deb9fda4)
- **Areas:** trades/users routes, drizzle review migration, openapi spec
- **Summary:** Implemented completed-trade review APIs with a one-week review window and profile visibility after the window closes.

### Listing delete edit sold APIs

- **Date:** 2026-07-14
- **Chat:** [Listing delete edit sold APIs](a762d433-6824-4500-8013-e8e302555e29)
- **Areas:** listings routes, schema, migration 0012, openapi, docs, tests
- **Summary:** Added listing management APIs for delete, edit, and mark-as-sold with sold metadata migration and docs.

### End-to-end listing search flow

- **Date:** 2026-07-15
- **Chat:** [End-to-end listing search flow](8e034782-c876-43f8-b3c6-f7385f5bf8b2)
- **Areas:** swaphaven search module, search feature, barter_ui search widgets
- **Summary:** Added a dedicated search API/module and mobile search UI from swipe/nearby with pagination, recent queries, and relevance signals.
- **Also tracked in:** barter-stack FEATURE_LOG

### Fix drizzle migration journal order

- **Date:** 2026-07-15
- **Chat:** [Fix drizzle migration journal order](7047dc65-9097-4265-b905-dcee4e539e45)
- **Areas:** drizzle/meta/_journal.json
- **Summary:** Resolved duplicate migration journal indexes so 0013_search_trgm_indexes is the latest entry.

### Fix trade review window timing

- **Date:** 2026-07-16
- **Chat:** [Fix trade review window timing](1c2cf938-c226-4828-9bfd-4eb6bb84000a)
- **See also:** [`3a3ef046…`](3a3ef046-e120-4412-a21d-c6258002d47b)
- **Areas:** src/lib/review-window.ts, src/routes/trades.ts, src/routes/users.ts, tests/trades.test.ts
- **Summary:** Fixed 409s on POST /trades/:id/reviews by basing the review window on trade completion time so reviews persist and return correctly.

### Review feature plan implementation

- **Date:** 2026-07-16
- **Chat:** [Review feature plan implementation](b0791992-d910-4a61-9a74-71ed66775f3e)
- **Areas:** api:scripts/verify-review-db-state.ts
- **Summary:** Implemented review-feature plan todos end-to-end.
- **Also tracked in:** barter-stack FEATURE_LOG

### Add fullscreen splash screen

- **Date:** 2026-07-19
- **Chat:** [Add fullscreen splash screen](c9f49741-715d-46eb-8eae-c0c2d0e3ff4b)
- **Areas:** splash, launch screens, swipe deck UI, swipe API owner name
- **Summary:** Added a fullscreen webp splash and launch assets, refined swipe card controls, and surfaced owner name initials from the swipe API.
- **Also tracked in:** barter-stack FEATURE_LOG

### Category personalization and onboarding polish

- **Date:** 2026-07-19
- **Chat:** [Category personalization and onboarding polish](951110f1-936e-4072-9384-4714a3d4c3a2)
- **Areas:** onboarding, discovery/swipe, nearby, categories cache, create listing, swipe API
- **Summary:** Removed onboarding swappers fluff, cached shared categories, and wired category filters/personalization across swipe, nearby, and listing create.
- **Also tracked in:** barter-stack FEATURE_LOG

### Swipe deck prefetch and limits

- **Date:** 2026-07-19
- **Chat:** [Swipe deck prefetch and limits](bd273065-62bb-4812-a7d4-ec110f7cbd5e)
- **Areas:** swipe routes, discovery feature, env config, tests
- **Summary:** Fixed daily swipe limit handling and added deck prefetch so discovery loads the next batch before cards run out.
- **Also tracked in:** barter-stack FEATURE_LOG

### Email OTP create-account flow

- **Date:** 2026-07-22
- **Chat:** [Email OTP create-account flow](fbc47598-9205-4f76-8755-b6fde39da847)
- **Areas:** auth routes, pending_registrations, auth_screen, onboarding providers, OpenAPI/docs
- **Summary:** Implemented email-OTP registration across API and mobile, per-user onboarding binding, and DB_SCHEMA/API_GUIDE/OpenAPI updates.
- **Also tracked in:** barter-stack FEATURE_LOG

### Fix edit listing and mark sold

- **Date:** 2026-07-22
- **Chat:** [Fix edit listing and mark sold](51950220-8488-4cd3-afdc-9d9d031016f3)
- **Areas:** edit_listing_screen.dart, mark_as_sold, listings routes, trade-partners API
- **Summary:** Fixed listing PATCH validation and added trade-partner picker for mark-as-sold flow.
- **Also tracked in:** barter-stack FEATURE_LOG

### Strike sold items in trade offers

- **Date:** 2026-07-22
- **Chat:** [Strike sold items in trade offers](9fd321f2-3f95-4e46-8bc5-0e135349c28f)
- **Areas:** offers inbox serializers, offer/counter screens, push payloads, listing-owner docs
- **Summary:** Surfaced sold/deleted listing state in offers and counters with strike-through UI, adjusted totals, and excluded unavailable items from counter flows.
- **Also tracked in:** barter-stack FEATURE_LOG

