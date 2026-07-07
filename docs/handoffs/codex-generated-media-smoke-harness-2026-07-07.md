# Codex Handoff: Generated Media Smoke Harness

Date: 2026-07-07
Branch: `codex/generated-media-smoke-harness`
Base: `origin/dev` after PR #745 (`fa3b96be`)

## What Changed

- Added `scripts/dev-generated-media-smoke.mjs`.
- Added `pnpm dev:generated-media-smoke`.
- Added `scripts/dev-generated-media-smoke.test.mjs`.
- Added `pnpm test:dev-generated-media-smoke`.

The launcher starts a local app/server stack wired to:

- Mock image generation.
- A fake loopback Walrus publisher and relay.
- Preview-only Sui NFT package, Kiosk, and TransferPolicy ids.
- No OpenAI key, wallet secret, seed phrase, private key, or server-side signing.

## Why

The image/NFT feature previously had route tests and setup UI, but browser smoke still required external OpenAI/Walrus/Sui configuration. This harness gives operators and agents a deterministic local flow to test:

1. Generate image.
2. Make NFT draft.
3. Upload public media to fake Walrus.
4. Prepare Sui mint preview.
5. Record receipt.
6. Prepare Sui Kiosk listing preview.

## Verification

- `node scripts/dev-generated-media-smoke.test.mjs` -> pass.
- `node scripts/dev-generated-media-smoke.mjs --help` -> pass.
- `git diff --check` -> pass.
- Live launcher smoke:
  - Server: `http://127.0.0.1:4125`
  - App: `http://127.0.0.1:5182`
  - Fake Walrus: loopback dynamic port.
- End-to-end HTTP smoke passed:
  - Generated mock image with output id and hash.
  - Created NFT draft.
  - Uploaded image bytes to fake Walrus.
  - Prepared Sui mint transaction plan.
  - Recorded mint receipt.
  - Prepared Sui Kiosk listing transaction plan.
- Browser smoke passed:
  - Settings overview rendered without console errors.
  - Image generation and Walrus showed `Working`.
  - Sui NFT minting and marketplace listing showed `Preview`.

## Remaining Work

- Add a Playwright/browser automation script for the full click path if needed.
- Add real staging smoke once real OpenAI, Walrus, Sui package, Kiosk, and TransferPolicy values exist.
- Keep this launcher dev-only; it uses fake ids and fake Walrus storage for local verification.
