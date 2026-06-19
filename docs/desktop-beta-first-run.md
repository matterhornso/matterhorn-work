# Matterhorn Work Desktop Beta First-Run

This guide is for installing and testing an unsigned local macOS beta build of
Matterhorn Work before sharing it with a test customer. It is written for
Codex, Claude Code, Kimi, Hermes, and human reviewers.

The desktop beta is a customer-readiness surface, not a custody surface. Do not
enter or request seed phrases, private keys, API secrets, raw signatures, signed
payloads, wallet exports, or real customer funds during this QA pass.

## 1. Build A Local Tester Artifact

From a clean `dev` checkout:

```bash
pnpm install --frozen-lockfile
pnpm electron:tester-artifact -- \
  --output-dir "$HOME/Desktop/matterhorn-work-build-$(git rev-parse --short=8 HEAD)" \
  --json
```

Expected files:

- `Matterhorn-Work-<sha>-arm64-unsigned.dmg`
- `Matterhorn-Work-<sha>-arm64-unsigned.zip`
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
BUILD_DIR="$HOME/Desktop/matterhorn-work-build-$(git rev-parse --short=8 HEAD)"
hdiutil verify "$BUILD_DIR/Matterhorn-Work-$(git rev-parse --short=8 HEAD)-arm64-unsigned.dmg"
unzip -t "$BUILD_DIR/Matterhorn-Work-$(git rev-parse --short=8 HEAD)-arm64-unsigned.zip"
pnpm desktop:beta-doctor -- --artifact-dir "$BUILD_DIR" --strict --json
```

The doctor checks:

- local Node, pnpm, and Bun visibility;
- the tester artifact command;
- this first-run guide;
- customer-facing beta boundary copy;
- DMG/ZIP/manifest/checksum presence;
- optional local server health and crypto readiness when `--server-url` is
  supplied.

For a Markdown evidence file:

```bash
pnpm desktop:beta-doctor -- \
  --artifact-dir "$BUILD_DIR" \
  --markdown-output /tmp/matterhorn-desktop-beta-first-run.md \
  --strict
```

## 3. Install On macOS

Because local tester artifacts are unsigned and not notarized, macOS Gatekeeper
may block first launch.

1. Open the DMG.
2. Drag `Matterhorn.app` into `/Applications` or a temporary testing folder.
3. Try opening the app once.
4. If macOS blocks it, open **System Settings > Privacy & Security** and allow
   the app you just attempted to open.
5. Reopen Matterhorn Work.

Do not use this unsigned build as a public release artifact. It is for internal
QA and beta tester validation only.

## 4. First-Run UI Checklist

On first launch, confirm:

- the app opens without crashing;
- the Bittensor/Crypto side panel Demo tab is visible;
- Demo tab sections are visible: `Readiness`, `Execution readiness`,
  `Try prompts`, `Evidence`, and `Safety`;
- a `Desktop beta` section explains:
  - Bittensor is beta-ready for read, preview, watches, receipts, and external
    signing handoff;
  - Hyperliquid and Polymarket are preview-only and have no live market submit;
  - Wellness and decentralized services are workflow/future-hook surfaces, not
    live payments, live email, live storage, or live access control;
- prompt buttons insert context into chat without auto-sending;
- every preview card says `Can submit: No`, `Live submission: Off`, or
  `External signer required` when relevant.

## 5. Optional Local Server Doctor

If the app exposes a local server URL and client token, run:

```bash
pnpm desktop:beta-doctor -- \
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

For the current beta:

- Bittensor: beta-ready for explain/read/preview/watch/receipt/external signer
  handoff.
- Hyperliquid and Polymarket: preview/external-signer readiness only; no live
  market submit.
- Wellness workflows: useful sample workflow pack; no medical diagnosis, no live
  payments, no live email, no live hosting, no live access control.
- Decentralized services: future contracts and provider discovery only; no live
  provider execution.

No seed phrases, private keys, API secrets, raw signatures, signed payloads,
wallet exports, custody, or live Hyperliquid/Polymarket submission are accepted
in this beta.

Service red line: no live payments, no live email, no live storage, no live
access control, and no live provider execution are enabled in this desktop beta.
