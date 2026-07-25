# Matterhorn Desks Desktop Release First-Run

This guide is for validating an unsigned local macOS release candidate before
the signed and notarized Matterhorn Desks package is published. It is written
for Codex, Claude Code, Kimi, Hermes, and human release reviewers.

The desktop release candidate is not a custody surface. Do not
enter or request seed phrases, private keys, API secrets, raw signatures, signed
payloads, wallet exports, or real customer funds during this QA pass.

## 1. Build A Local Tester Artifact

From a clean `dev` checkout:

```bash
pnpm install --frozen-lockfile
pnpm electron:tester-artifact -- \
  --output-dir "$HOME/Desktop/matterhorn-desks-build-$(git rev-parse --short=8 HEAD)" \
  --json
```

Expected files:

- `Matterhorn-Desks-<sha>-arm64-unsigned.dmg`
- `Matterhorn-Desks-<sha>-arm64-unsigned.zip`
- `matterhorn-electron-local-tester-artifact.json`
- `SHA256SUMS.txt`

The manifest must say:

- `unsigned: true`
- `notarized: false`
- `publishEnabled: false`
- `privateKeysAccepted: false`
- `apiSecretsAccepted: false`
- `signingMaterialAccepted: false`

## 2. Verify The Artifact

```bash
BUILD_DIR="$HOME/Desktop/matterhorn-desks-build-$(git rev-parse --short=8 HEAD)"
hdiutil verify "$BUILD_DIR/Matterhorn-Desks-$(git rev-parse --short=8 HEAD)-arm64-unsigned.dmg"
unzip -t "$BUILD_DIR/Matterhorn-Desks-$(git rev-parse --short=8 HEAD)-arm64-unsigned.zip"
pnpm desktop:release-doctor -- --artifact-dir "$BUILD_DIR" --strict --json
```

The doctor checks:

- local Node, pnpm, and Bun visibility;
- the tester artifact command;
- this first-run guide;
- customer-facing release boundary copy;
- DMG/ZIP/manifest/checksum presence;
- optional local server health and crypto readiness when `--server-url` is
  supplied.

The doctor validates the artifact, but the packaged clean-profile smoke launches
the `.app` itself with isolated temporary user data:

```bash
pnpm smoke:desktop-packaged-clean-profile -- --strict --json
```

To test the exact hash-bound ZIP instead of the unpacked build directory:

```bash
pnpm smoke:desktop-packaged-clean-profile -- \
  --artifact-dir "$BUILD_DIR" \
  --strict \
  --json
```

It verifies the token-protected loopback control bridge, the first-run welcome
route, General, MCP, AI provider, Appearance, and Session navigation, stable
process lifetime, quiet unpublished update behavior, and temporary-profile
cleanup. It also inspects the extracted app's `Info.plist` and requires the
`matterhorn-work` URL scheme. This is still same-machine automation; retain the clean-machine install
and Gatekeeper pass below before public release.

When a live test backend is available, include it to exercise the packaged
`matterhorn-work://connect-remote` path through macOS LaunchServices and
Electron's `open-url` channel:

```bash
pnpm smoke:desktop-packaged-clean-profile -- \
  --artifact-dir "$BUILD_DIR" \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --strict \
  --json
```

The smoke must finish on `/workspace/<remote-id>/session`. It records neither
the deep-link URL nor the token and fails if the token appears in captured app
output. This proves same-machine packaged LaunchServices delivery and
authenticated remote workspace creation. A clean-machine release pass must
still verify default scheme association outside the development machine.

The authenticated packaged smoke also opens the Electron-only Browser rail,
loads the test backend's loopback `/health` page in a native tab, reads the
browser snapshot, and closes the panel. It never navigates to a public site.

For a Markdown evidence file:

```bash
pnpm desktop:release-doctor -- \
  --artifact-dir "$BUILD_DIR" \
  --markdown-output /tmp/matterhorn-desktop-release-first-run.md \
  --strict
```

## 3. Install On macOS

Because local tester artifacts are unsigned and not notarized, macOS Gatekeeper
may block first launch.

1. Open the DMG.
2. Drag `Matterhorn Desks.app` into `/Applications` or a temporary testing folder.
3. Try opening the app once.
4. If macOS blocks it, open **System Settings > Privacy & Security** and allow
   the app you just attempted to open.
5. Reopen Matterhorn Desks.

Do not use this unsigned build as a public release artifact. It is for internal
QA and release validation only.

## 4. First-Run UI Checklist

On first launch, confirm:

- the app opens without crashing;
- Bittensor, Hyperliquid, Polymarket, Sui, and Longevity open as distinct desks;
- stable builds do not show the operator-only Demo tab;
- Bittensor is labelled `Read and preview` and uses external signing handoffs;
- Hyperliquid exposes a separate manual connected-wallet order ticket when the
  deployment execution switch is enabled; Polymarket remains preview-only;
- Longevity is a standalone workflow surface with no medical diagnosis, live
  payments, live email, live storage, or live access control;
- prompt buttons insert context into chat without auto-sending;
- every chat, MCP, CLI, and watch preview says `Can submit: No`,
  `Live submission: Off`, or `External signer required` when relevant;
- the Hyperliquid order ticket defaults to testnet, requires exact order review
  and a fresh wallet approval, and never implies agent or unattended execution.

## 5. Optional Local Server Doctor

If the app exposes a local server URL and client token, run:

```bash
pnpm desktop:release-doctor -- \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --artifact-dir "$BUILD_DIR" \
  --strict \
  --json
```

The server checks are read-only:

- `GET /health`
- `GET /api/crypto/readiness`

The doctor sends `Authorization: Bearer <client-token>` only when a token is
supplied. Do not paste private keys, API secrets, seed phrases, raw signatures,
signed payloads, wallet exports, or customer funds into the doctor.

## 6. Logs And Diagnostics

When reporting a first-run issue, include:

- the doctor JSON or Markdown output;
- `matterhorn-electron-local-tester-artifact.json`;
- `SHA256SUMS.txt`;
- screenshots of the failing UI state;
- relevant logs from:
  - `~/Library/Logs/Matterhorn/`
  - `~/Library/Application Support/Matterhorn/`
  - the terminal used to launch the app, if launched manually.

## 7. Customer Boundary

For the current release:

- Bittensor: public explain/read/preview/watch/receipt flows with external-signer
  handoff.
- Hyperliquid: read/preview flows plus manual connected-wallet perpetual orders
  through a short-lived, one-time intent. Chat, MCP, CLI, watches, and agent
  prompts cannot submit.
- Polymarket: preview/external-signer readiness only; no live market submit.
- Wellness workflows: useful sample workflow pack; no medical diagnosis, no live
  payments, no live email, no live hosting, no live access control.
- Decentralized services: future contracts and provider discovery only; no live
  provider execution.

No seed phrases, private keys, API secrets, pasted raw signatures, caller-supplied
signed payloads, wallet exports, or custody are accepted in this release. The
only live market submission path is the reviewed Hyperliquid web ticket: the
connected wallet signs the exact server-issued intent, and the server relays
that one intent without persisting the signature. Polymarket cannot submit.

Service red line: no live payments, no live email, no live storage, no live
access control, and no live provider execution are enabled in this desktop release.
