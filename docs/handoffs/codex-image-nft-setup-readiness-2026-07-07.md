# Codex Handoff: Image/NFT Setup Readiness

Date: 2026-07-07
Branch: `codex/backend-product-next`
Base: `origin/dev` at `d6155781`

## What Changed

- Added backend-owned setup requirements for generated media:
  - OpenAI image generation setup.
  - Walrus publisher and relay setup.
  - Sui NFT package/module setup.
  - Sui Kiosk and TransferPolicy setup.
- Surfaced those requirements in:
  - Settings overview.
  - Backend capability overview.
  - Chat NFT draft panel.
- Kept the UI compact: a small `Required setup` section instead of a generic warning panel.
- Fixed a browser-only runtime issue by explicitly exporting NFT readiness helpers from the session media barrel.

## Verification

- `bun test apps/app/tests/` -> 333 pass, 0 fail.
- `bun test apps/server/src/` -> 575 pass, 0 fail.
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-nft-capabilities.test.ts apps/server/src/backend-control-plane.e2e.test.ts` -> 56 pass, 0 fail.
- `apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit` -> pass.
- `apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit` -> pass.
- `packages/types/node_modules/.bin/tsc -p packages/types/tsconfig.json --noEmit` -> pass.
- `git diff --check` -> pass.

## Browser Smoke

Fresh current-code local stack:

- Server: `http://127.0.0.1:4125`
- App: `http://127.0.0.1:5182`
- Workspace: `ws_d6a5b5572860`

Smoke results:

- Settings overview rendered without console errors.
- Image and NFT publishing section rendered from backend capabilities.
- Setup rows showed `MATTERHORN_WALRUS_PUBLISHER_URL`, `MATTERHORN_WALRUS_RELAY_URL`, `MATTERHORN_SUI_NFT_PACKAGE_ID`, `MATTERHORN_SUI_KIOSK_PACKAGE_ID`, and `MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID`.
- Active chat session rendered `Generate image`, `Ask`, and model picker without console errors.

## Live Data Observed

The fresh local server reported:

- Image generation: working in mock mode.
- Generated images: 12 local mock image records with output ids and hashes.
- NFT drafts: 9 local drafts.
- Walrus/Sui minting/listing: needs setup until real environment values are configured.

## Remaining Work

- Real OpenAI image generation smoke with `OPENAI_API_KEY`.
- Real Walrus upload smoke with publisher/relay values.
- Real Sui package/Kiosk/TransferPolicy environment smoke.
- Decide whether to keep mock generated images and NFT drafts in the local scratch workspace or clear them manually. Do not delete `.matterhorn-work/` unless explicitly asked.
