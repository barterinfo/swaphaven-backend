#!/bin/sh
set -e

echo "[start] Running database migrations…"
node dist/db/migrate.js

echo "[start] Starting API (PORT=${PORT:-3001}, NODE_ENV=${NODE_ENV:-unknown})…"
echo "[start] Required: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET"
exec node dist/index.js
