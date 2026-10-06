#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${OPENCODE_INSTALL_DIR:-$HOME/.opencode/bin}"
VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).opencodeVersion.replace(/^v/, ""))' "$ROOT_DIR/constants.json")"
DIST_VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$ROOT_DIR/patches/runtime/distribution.json")"
if [ "$VERSION" != "$DIST_VERSION" ] || { [ -n "${OPENCODE_VERSION:-}" ] && [ "$OPENCODE_VERSION" != "$DIST_VERSION" ]; }; then
  printf 'The maintained runtime version must match constants.json and its source distribution.\n' >&2
  exit 1
fi
if [ -n "${OPENCODE_DOWNLOAD_URL:-}" ] || [ -n "${OPENCODE_DOWNLOAD_SHA256:-}" ]; then
  printf 'Prebuilt runtime overrides are unavailable until compatible artifacts are published and pinned.\n' >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
STAGED_DIR=
cleanup() {
  rm -rf "$TMP_DIR"
  if [ -n "$STAGED_DIR" ]; then rm -rf "$STAGED_DIR"; fi
}
trap cleanup EXIT
printf 'Building maintained OpenCode %s from pinned source, patches, and catalog\n' "$VERSION"
node "$ROOT_DIR/scripts/build-pinned-opencode.mjs" --output "$TMP_DIR/opencode"
mkdir -p "$INSTALL_DIR"
STAGED_DIR="$(mktemp -d "$INSTALL_DIR/.matterhorn-runtime-install.XXXXXX")"
install -m 0755 "$TMP_DIR/opencode" "$STAGED_DIR/opencode"
for name in opencode.provenance.json opencode.LICENSE opencode.models.dev-LICENSE; do
  install -m 0644 "$TMP_DIR/$name" "$STAGED_DIR/$name"
done
node -e '
  const fs = require("node:fs"); const crypto = require("node:crypto");
  const binary = process.argv[1]; const expected = process.argv[2];
  const receipt = JSON.parse(fs.readFileSync(binary + ".provenance.json", "utf8"));
  const hash = crypto.createHash("sha256").update(fs.readFileSync(binary)).digest("hex");
  if (receipt.version !== expected || receipt.binarySha256 !== hash) throw new Error("Built runtime/provenance integrity mismatch");
' "$STAGED_DIR/opencode" "$VERSION"
test "$("$STAGED_DIR/opencode" --version)" = "$VERSION"
# Stage on the installation filesystem, verify first, and rename the binary
# last. A failed build or integrity check never truncates the installed engine.
for name in opencode.provenance.json opencode.LICENSE opencode.models.dev-LICENSE opencode; do
  mv -f "$STAGED_DIR/$name" "$INSTALL_DIR/$name"
done
