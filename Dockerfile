# ─── Build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

RUN npm run build

# ─── Production (Railway: listen on $PORT, no custom entrypoint) ───────────────
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Do NOT set PORT here — Railway injects PORT at runtime (often not 3001).

RUN apk add --no-cache wget

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

USER node

# Migrate then start API in one shell (Railway startCommand overrides this if set).
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/index.js"]
