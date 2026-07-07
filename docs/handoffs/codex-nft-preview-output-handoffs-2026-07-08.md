# NFT Preview Output Handoffs

Date: 2026-07-08
Branch: `codex/nft-preview-output-handoffs`
Base: `origin/dev` at `8c694cf9` (`Cover wallet readiness in media browser smoke (#759)`)

## What changed

- Sui NFT mint and listing preview routes now write durable public preview handoff files:
  - `.matterhorn-work/outputs/nft-previews/<draftId>/mint-preview.json`
  - `.matterhorn-work/outputs/nft-previews/<draftId>/listing-preview.json`
- Each preview handoff records:
  - `custody: false`
  - `canSubmit: false`
  - `containsSignatureMaterial: false`
  - transaction plan, setup requirements, draft/image ids, and public NFT metadata
- Mint/listing preview routes now record `task.output_saved` evidence events with `metadata.nftOutputKind`.
- Project Data Ledger classifies those preview handoff events as `kind: "nft"` instead of generic outputs.
- Outputs UI maps preview handoffs to NFT receipts and labels them as `Preview`.
- Generated-media flow smoke now verifies that preview handoffs appear in both Project Evidence and the NFT Data Ledger.

## Verification

- `bun test apps/app/tests/output-receipts.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts`
  - 23 pass, 0 fail
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-generation-provider.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts apps/server/src/project-evidence-routes.e2e.test.ts`
  - 46 pass, 0 fail
- `bun test apps/app/tests/`
  - 344 pass, 0 fail
- `apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit`
  - pass
- `apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit`
  - pass
- Static smoke contracts:
  - `node scripts/generated-media-flow-smoke.test.mjs`
  - `node scripts/product-readiness-smoke.test.mjs`
  - `node scripts/generated-media-browser-smoke.test.mjs`
  - all pass
- Live backend smoke:
  - `node scripts/generated-media-flow-smoke.mjs --server-url http://127.0.0.1:4172 --token matterhorn-media-smoke-client-token --strict --json-output /tmp/matterhorn-nft-preview-output-flow-smoke.json`
  - pass, including `nft.preview_outputs`
- Live product readiness smoke:
  - `node scripts/product-readiness-smoke.mjs --server-url http://127.0.0.1:4172 --token matterhorn-media-smoke-client-token --strict --include-generated-media-flow --json-output /tmp/matterhorn-nft-preview-product-smoke.json`
  - pass
- Live browser smoke:
  - `node scripts/generated-media-browser-smoke.mjs --url http://127.0.0.1:5212/workspace/ws_d6a5b5572860/session --strict --json`
  - pass
  - non-fatal warning: fake OpenCode session lookup returned one 404 during smoke setup

## Notes

- Real Walrus publishing and Sui Move transaction construction remain preview/scaffolded only.
- This pass intentionally does not add custody, key handling, raw signatures, or live transaction submission.
- Untracked local scratch remains untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
  - local QA screenshots under `qa-reports/generated-media-browser-smoke/`
