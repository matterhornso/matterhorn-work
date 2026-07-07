# Generated Media Listing Receipt Smoke - Codex Handoff

Date: 2026-07-08
Branch: `codex/generated-media-listing-receipt-smoke`
Base: `origin/dev` at `a26a4f5a` (`Add generated media history`)

## Purpose

Kimi's image generation and Sui NFT lane already covered generated images, NFT drafts, Walrus upload, mint previews, mint receipts, and Kiosk listing previews. This pass closes the remaining automated smoke gap: the strict generated-media flow now records a Sui Kiosk listing receipt too, so the smoke path proves the same evidence story users see in activity, output receipts, and generated media history.

## What Changed

- `scripts/generated-media-flow-smoke.mjs`
  - Adds a `sui.listing_receipt` stage after `sui.listing_preview`.
  - Calls `POST /workspace/:id/nft-drafts/:draftId/listing/receipt`.
  - Records listing status, marketplace, and Kiosk id in the JSON smoke artifact.

- `scripts/generated-media-flow-smoke.test.mjs`
  - Adds static contract coverage for `/listing/receipt`.
  - Requires the `sui.listing_receipt` stage to stay in the smoke flow.

## Verification

Passed:

- `node scripts/generated-media-flow-smoke.test.mjs`
- `MATTERHORN_MEDIA_SMOKE_SERVER_URL=http://127.0.0.1:4145 MATTERHORN_MEDIA_SMOKE_CLIENT_TOKEN=matterhorn-media-smoke-client-token node scripts/generated-media-flow-smoke.mjs --strict --json-output /tmp/matterhorn-generated-media-flow-smoke-listing-receipt.json`
  - `workspace`
  - `capabilities`
  - `image.generate`
  - `nft.draft`
  - `walrus.upload`
  - `sui.mint_preview`
  - `sui.mint_receipt`
  - `sui.listing_preview`
  - `sui.listing_receipt`
- `bun test apps/server/src/generated-media-routes.e2e.test.ts`
  - 26 pass, 0 fail
- `bun test apps/app/tests/image-generation-ui-contract.test.ts`
  - 22 pass, 0 fail
- `git diff --check`
- Browser smoke against `http://127.0.0.1:5197/workspace/ws_d6a5b5572860/session`
  - Opened a new chat session.
  - Opened the chat-native `Generate image` panel.
  - Generated an image and confirmed `Image saved to outputs`.
  - Opened `Make NFT`.
  - Verified generated image, Walrus storage, Sui NFT minting, and NFT marketplace listing readiness rows.
  - Created a local NFT draft.
  - Browser console errors: none.

JSON smoke artifact confirmed:

- `ready: true`
- `safety.nonCustodial: true`
- `safety.liveSubmissionEnabled: false`
- `safety.asksForSecrets: false`
- `listingReceipt.status: listed`

## Notes

- No product routes changed. This is smoke coverage only.
- Real Walrus and live Sui submission remain scaffolding/preview integrations; this smoke stack uses the local fake Walrus/Sui IDs configured by `scripts/dev-generated-media-smoke.mjs`.
- Protected scratch paths were not deleted or staged:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
