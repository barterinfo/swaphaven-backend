#!/usr/bin/env bash
# Install Cursor Agent CLI from a pinned tarball (see .github/cursor-cli.lock.json).
set -euo pipefail

LOCK_FILE="${1:-.github/cursor-cli.lock.json}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "${OS}" in
  linux) ;;
  darwin) OS="darwin" ;;
  *)
    echo "::error::Unsupported OS: ${OS}"
    exit 1
    ;;
esac

ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64 | amd64) ARCH="x64" ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *)
    echo "::error::Unsupported architecture: ${ARCH}"
    exit 1
    ;;
esac

ARTIFACT_KEY="${OS}-${ARCH}"

read_lock() {
  python3 - "$LOCK_FILE" "$ARTIFACT_KEY" <<'PY'
import json, sys
lock_path, key = sys.argv[1], sys.argv[2]
with open(lock_path, encoding="utf-8") as f:
    lock = json.load(f)
artifact = lock["artifacts"][key]
print(lock["version"])
print(artifact["url"])
print(artifact["sha256"])
PY
}

LOCK_LINES="$(read_lock)"
VERSION="$(printf '%s\n' "${LOCK_LINES}" | sed -n '1p')"
DOWNLOAD_URL="$(printf '%s\n' "${LOCK_LINES}" | sed -n '2p')"
EXPECTED_SHA="$(printf '%s\n' "${LOCK_LINES}" | sed -n '3p')"

TMP_ARCHIVE="$(mktemp)"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -f "${TMP_ARCHIVE}"
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Installing Cursor CLI ${VERSION} (${ARTIFACT_KEY})"
curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_ARCHIVE}"

ACTUAL_SHA="$(shasum -a 256 "${TMP_ARCHIVE}" | awk '{print $1}')"
if [ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]; then
  echo "::error::Checksum mismatch for Cursor CLI tarball."
  exit 1
fi

tar --strip-components=1 -xzf "${TMP_ARCHIVE}" -C "${TMP_DIR}"

INSTALL_ROOT="${HOME}/.local/share/cursor-agent/versions/${VERSION}"
mkdir -p "${HOME}/.local/bin" "${HOME}/.local/share/cursor-agent/versions"
rm -rf "${INSTALL_ROOT}"
mv "${TMP_DIR}" "${INSTALL_ROOT}"
rm -f "${HOME}/.local/bin/agent" "${HOME}/.local/bin/cursor-agent"
ln -s "${INSTALL_ROOT}/cursor-agent" "${HOME}/.local/bin/agent"
ln -s "${INSTALL_ROOT}/cursor-agent" "${HOME}/.local/bin/cursor-agent"

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "${HOME}/.local/bin" >> "${GITHUB_PATH}"
fi
agent --version
