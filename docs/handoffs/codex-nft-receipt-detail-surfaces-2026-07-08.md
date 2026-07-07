# Codex Handoff: NFT Receipt Detail Surfaces

Date: 2026-07-08
Branch: `codex/nft-receipt-detail-surfaces`
Base: `origin/dev` at `39c2bde3` (`Harden Sui NFT wallet receipt parsing`)

## What Changed

- Added a public metadata map to project evidence and task events.
- Mint and listing receipt routes now write public receipt JSON files under:
  - `.matterhorn-work/outputs/nft-receipts/<draftId>/mint-receipt.json`
  - `.matterhorn-work/outputs/nft-receipts/<draftId>/listing-receipt.json`
- NFT mint/listing task events now include:
  - `artifactPath` pointing at the receipt JSON.
  - Public receipt metadata: action, network, transaction digest, object id, package id, kiosk id, transfer policy id, custody flag, and signature-material flag.
- Project Data Ledger now carries scrubbed evidence metadata into exportable ledger rows.
- Project Activity details now show an `NFT receipt` section with compact public digest/object/network details.
- Outputs rows and the output preview header now show compact NFT receipt details.

## Safety Contract

- No raw signatures, signed payloads, private keys, seed phrases, or wallet exports are stored.
- Receipt routes still reject secret-shaped or signature-shaped request fields before writing.
- Receipt JSON files explicitly mark:
  - `custody: false`
  - `containsSignatureMaterial: false`

## Verification

- `bun test apps/app/tests/output-receipts.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/recent-activity-contract.test.ts`
  - 72 pass, 0 fail.
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/project-evidence-routes.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts`
  - 40 pass, 0 fail.
- `bun test apps/server/src/image-nft-capabilities.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/tools/sui.test.ts apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-generation-backend-capability-contract.test.ts`
  - 68 pass, 0 fail.
- `npx -y pnpm@10.27.0 --filter @matterhorn-work/app typecheck`
  - Pass.
- `npx -y pnpm@10.27.0 --filter matterhorn-work-server typecheck`
  - Pass.
- `bun test apps/app/tests/`
  - 341 pass, 0 fail.
- `bun test apps/server/src/`
  - 575 pass, 0 fail.
- `git diff --check`
  - Pass.

## Browser Smoke

- Local app URL checked: `http://127.0.0.1:5175/workspace/ws_d52295617e23/session`.
- Home/workspace shell loaded as Matterhorn Work with no console errors.
- Project Activity rendered recent workspace evidence.
- Creating a fresh chat reached an engine-unavailable state because the local Matterhorn agent engine was not connected. No console errors were observed. Live chat-native image generation still needs the local agent engine running for end-to-end browser testing.

## Scratch Files Left Untouched

- `.matterhorn-work/`
- `.opencode/agents/matterhorn-sui.md`

## Recommended Next Step

Run one browser smoke with the local agent engine connected:

1. Start/open Matterhorn Work so the session engine is connected.
2. Open a new chat.
3. Verify the image generation composer renders.
4. Generate a mock image or OpenAI image depending on local env.
5. Create an NFT draft.
6. Prepare mint preview, sign externally/in wallet, and record mint receipt.
7. Confirm the receipt appears in Project Activity and Outputs with digest/object/network but no signature material.
