#!/usr/bin/env bash
# Point ../swaphaven-infra (or $INFRA_DIR) backend/ submodule at this repo's HEAD.
# Usage: ./scripts/sync-infra.sh [--push]
#        npm run infra:sync
#        npm run infra:sync -- --push
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUSH=false

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    -h|--help)
      echo "Usage: $0 [--push]"
      echo "  Updates the sibling swaphaven-infra backend submodule to this repo HEAD."
      echo "  --push  Also push the infra repo to origin."
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

INFRA_DIR="${INFRA_DIR:-$ROOT/../swaphaven-infra}"

if [[ ! -d "$INFRA_DIR/.git" && ! -f "$INFRA_DIR/.git" ]]; then
  echo "swaphaven-infra not found at $INFRA_DIR"
  echo "Clone it next to this repo, or set INFRA_DIR. GitHub Actions will still sync on a 15-minute cron."
  exit 0
fi

if [[ ! -x "$INFRA_DIR/scripts/sync-backend.sh" ]]; then
  echo "Missing $INFRA_DIR/scripts/sync-backend.sh" >&2
  exit 1
fi

SHA="$(git -C "$ROOT" rev-parse HEAD)"
SHORT="$(git -C "$ROOT" rev-parse --short HEAD)"
echo "==> Syncing infra backend/ to $SHORT"

cd "$INFRA_DIR"
git fetch origin --prune >/dev/null 2>&1 || true

if $PUSH; then
  ./scripts/sync-backend.sh --push "$SHA"
else
  ./scripts/sync-backend.sh --commit "$SHA"
fi
