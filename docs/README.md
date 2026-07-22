# SwapHaven API — documentation

| Guide | Description |
|-------|-------------|
| [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) | Install, database, run locally, Docker |
| [DB_SCHEMA.md](./DB_SCHEMA.md) | Tables, ER diagram, enums, DB→DTO field mapping |
| [SEED_USER.md](./SEED_USER.md) | Register a test user via CLI script |
| [SEED_LISTINGS.md](./SEED_LISTINGS.md) | Bulk-create sample listings via CLI script |
| [TESTING.md](./TESTING.md) | Unit/integration tests, CI commands |
| [API_GUIDE.md](./API_GUIDE.md) | Every endpoint with examples |
| [FEATURE_LOG.md](./FEATURE_LOG.md) | Features ↔ Cursor chat transcripts (recover implementation context) |
| [SWAGGER.md](./SWAGGER.md) | OpenAPI / Swagger UI |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Railway deploy, env vars, troubleshooting |
| [S3_SETUP.md](./S3_SETUP.md) | S3 bucket, IAM, presigned uploads |
| [ADS.md](./ADS.md) | Sponsored ads — schema, endpoint, mobile flow, `npm run ads` CLI |
| [SWIPE_FEATURE.md](./SWIPE_FEATURE.md) | Discovery swipe deck — API, quota, prefetch, streaks, mobile UI, make-offer |
| [SEARCH_FEATURE.md](./SEARCH_FEATURE.md) | Listing search — architecture, sequences, API, DB, mobile flows |
| [LISTING_MANAGEMENT_FEATURE.md](./LISTING_MANAGEMENT_FEATURE.md) | Profile closet owner actions — overview |
| [LISTING_STATUS_AND_OWNER_FLOWS.md](./LISTING_STATUS_AND_OWNER_FLOWS.md) | Listing status diagram, transition paths, backend sequences |
| [MARK_AS_SOLD_FLOW.md](./MARK_AS_SOLD_FLOW.md) | Mark as Sold — API, offer cancel, open-offer SOLD UX |
| [DELETE_LISTING_FLOW.md](./DELETE_LISTING_FLOW.md) | Soft-delete listing — API, offer cancel, open-offer DELETED UX |
| [EDIT_LISTING_FLOW.md](./EDIT_LISTING_FLOW.md) | Edit listing fields & photos — PATCH contract |
| [deeplink-push-notifications.md](./deeplink-push-notifications.md) | FCM push + deep links; in-app vs push matrix (incl. sold/delete) |
| [SOCIAL_LOGIN.md](./SOCIAL_LOGIN.md) | Google / Facebook OAuth setup |
| [CREATE_ACCOUNT_OTP.md](./CREATE_ACCOUNT_OTP.md) | Email OTP signup — sequences, DFD, DB, API, mobile bind |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | PRs, harness, agent review |
| [MEETUP_SUGGESTIONS.md](./MEETUP_SUGGESTIONS.md) | Meet Halfway — transit stop suggestions between buyer and seller |

**Quick links**

- Local API: http://localhost:3001  
- Swagger: http://localhost:3001/api-docs  
- Health: http://localhost:3001/api/healthz  
- Ready (DB): http://localhost:3001/api/readyz  
