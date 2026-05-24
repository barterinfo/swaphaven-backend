# Swagger / OpenAPI

## Open locally

1. Start the API: `npm run dev`
2. Open **http://localhost:3001/api-docs**

Raw spec: **http://localhost:3001/api/openapi.json**

Swagger is enabled when `ENABLE_API_DOCS=true` (default in development). In production on Railway, set `ENABLE_API_DOCS=true` for staging or `false` when locked down.

---

## Authenticate in Swagger UI

1. Call **POST /api/auth/register** or **POST /api/auth/login**
2. Copy `accessToken` from the response
3. Click **Authorize** (top right)
4. Enter: `Bearer <accessToken>` (include the word `Bearer` and a space)
5. Try protected routes (e.g. **GET /api/auth/me**)

Access tokens expire in **15 minutes** (configurable via `JWT_ACCESS_EXPIRES_IN`). Use **POST /api/auth/refresh** with `refreshToken` to get a new pair.

---

## Try a full flow in Swagger

1. **POST /api/auth/register** — create user  
2. **POST /api/listings** — create listing (see barter-shaped body in [API_GUIDE.md](./API_GUIDE.md))  
3. **GET /api/listings** — browse feed  
4. **POST /api/offers** — second user offers on listing (register another user first)  

For multi-user flows, use two browser profiles or curl with two tokens.

---

## WebSocket (not in Swagger)

Chat uses WebSockets — test with a WS client:

```text
ws://localhost:3001/ws/<conversationId>?token=<accessToken>
```

Send JSON text messages; see [API_GUIDE.md](./API_GUIDE.md#chat--websocket).

---

## Regenerate spec

The spec lives in `src/openapi/spec.ts`. After editing routes or schemas, update that file and restart the server.
