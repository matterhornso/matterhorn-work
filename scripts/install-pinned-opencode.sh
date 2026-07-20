#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONSTANTS_FILE="${OPENCODE_CONSTANTS_FILE:-$ROOT_DIR/constants.json}"
CHECKSUM_FILE="${OPENCODE_CHECKSUM_FILE:-$ROOT_DIR/packaging/docker/opencode-release-checksums.json}"
INSTALL_DIR="${OPENCODE_INSTALL_DIR:-$HOME/.opencode/bin}"
VERSION="${OPENCODE_VERSION:-$(node -e 'const fs=require("fs"); const parsed=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(parsed.opencodeVersion || "").trim().replace(/^v/, ""));' "$CONSTANTS_FILE")}"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64|Linux:amd64)
    ASSET="opencode-linux-x64-baseline.tar.gz"
    ;;
  Linux:aarch64|Linux:arm64)
    ASSET="opencode-linux-arm64.tar.gz"
    ;;
  *)
    printf 'Unsupported OpenCode installer platform: %s/%s\n' "$(uname -s)" "$(uname -m)" >&2
    exit 1
    ;;
esac

if [ -n "${OPENCODE_DOWNLOAD_URL:-}" ]; then
  URL="$OPENCODE_DOWNLOAD_URL"
  EXPECTED_SHA256="${OPENCODE_DOWNLOAD_SHA256:-}"
  if [ -z "$EXPECTED_SHA256" ]; then
    printf 'OPENCODE_DOWNLOAD_SHA256 is required with OPENCODE_DOWNLOAD_URL.\n' >&2
    exit 1
  fi
else
  URL="https://github.com/anomalyco/opencode/releases/download/v${VERSION}/${ASSET}"
  EXPECTED_SHA256="$(node -e '
    const fs = require("fs");
    const checksums = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = checksums[process.argv[2]]?.[process.argv[3]];
    if (!value) process.exit(2);
    process.stdout.write(String(value));
  ' "$CHECKSUM_FILE" "$VERSION" "$ASSET")" || {
    printf 'No pinned SHA-256 is recorded for OpenCode %s asset %s.\n' "$VERSION" "$ASSET" >&2
    exit 1
  }
fi

if ! printf '%s' "$EXPECTED_SHA256" | grep -Eq '^[a-fA-F0-9]{64}$'; then
  printf 'The configured OpenCode SHA-256 is invalid.\n' >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

printf 'Downloading pinned OpenCode %s (%s)\n' "$VERSION" "$ASSET"
curl --proto '=https' --tlsv1.2 -fsSL --retry 3 --retry-all-errors "$URL" -o "$TMP_DIR/$ASSET"
printf '%s  %s\n' "$EXPECTED_SHA256" "$TMP_DIR/$ASSET" | sha256sum -c -
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"
BINARY="$(find "$TMP_DIR" -type f -name opencode -print -quit)"
if [ -z "$BINARY" ]; then
  printf 'The verified OpenCode archive did not contain the expected binary.\n' >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
install -m 0755 "$BINARY" "$INSTALL_DIR/opencode"
"$INSTALL_DIR/opencode" --version
