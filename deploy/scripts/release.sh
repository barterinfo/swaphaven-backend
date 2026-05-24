#!/usr/bin/env bash
# Local CI-style check before pushing to Railway (deploys via git push).
# Usage: ./deploy/scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> Typecheck"
npm run typecheck

echo "==> Test"
npm test

echo "==> Build"
npm run build

echo "==> Done. Push to GitHub to deploy on Railway."
