---
name: new-api-route
description: >-
  Put each new swaphaven-api HTTP feature in its own src/routes file before
  editing a large router. Use when adding an API endpoint, route, or backend
  feature in swaphaven-api.
---

# New API route file

For a **new** HTTP feature, create `src/routes/<feature>.ts` first. Do not append the handler to a large router such as `listings.ts`.

1. New router file. Keep the handler thin: Zod validate, then existing lib/Drizzle helpers, then JSON.
2. Mount it in `src/app.ts`. If the public path shares a prefix with a router that has `/:id`, mount the new router **before** that router so the specific path is not captured.
3. Keep the public URL stable. Update `src/openapi/spec.ts` and add a focused test. Do not change the path just because the file moved.
4. Edit an existing route file only for a small change to a handler that already lives there.

Photo suggest is the pattern: `src/routes/listing-suggest.ts` is mounted at `/api/listings` before `listingsRouter`. The client path stays `POST /api/listings/suggest-from-images`.
