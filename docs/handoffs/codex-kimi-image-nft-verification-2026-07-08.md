# Codex Verification: Kimi Image Generation + Sui NFT Lane

Date: 2026-07-08
Branch: `codex/kimi-image-nft-thorough-verification`
Base: `origin/dev` at `33216811`

## What Was Verified

Kimi's generated-media lane is present on latest `origin/dev`:

- Chat image generation with mock/OpenAI provider boundary.
- Generated images saved as workspace outputs.
- NFT draft creation from generated images.
- Walrus public media upload boundary.
- Sui mint preview and public receipt import.
- Sui Kiosk listing preview and public receipt import.
- Generated media history, settings readiness, project evidence, and data ledger links.
- Non-custodial wallet boundary: Matterhorn prepares plans and records public receipts, but does not sign or submit transactions.

## Issue Found and Fixed

The live `product-readiness-smoke` caught a support-report redaction bug:

- `/workspace/:id/backend/support-report` included generated-media setup text containing the literal secret setup marker `OPENAI_API_KEY`.
- The report did not leak a secret value, but support reports are exported artifacts and the readiness gate intentionally rejects sensitive secret-marker strings.

Fix:

- `apps/server/src/backend-support-report.ts` now redacts generated-media diagnostics before embedding them in support reports.
- Sensitive setup markers such as `OPENAI_API_KEY`, `MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN`, `Authorization`, and `X-Matterhorn-Host-Token` are removed from exported generated-media setup requirements and descriptions.
- Direct diagnostics endpoints still retain actionable setup detail for the app UI.

## Verification Results

Focused generated-media/server:

- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-generation-provider.test.ts apps/server/src/image-nft-capabilities.test.ts apps/server/src/tools/sui.test.ts` -> 52 pass, 0 fail.

Focused generated-media/app:

- `bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-generation-backend-capability-contract.test.ts apps/app/tests/generated-media-settings-contract.test.ts apps/app/tests/sui-workflow-state.test.ts apps/app/tests/sui-desk-contract.test.ts` -> 50 pass, 0 fail.

Smoke contract gates:

- `node scripts/generated-media-flow-smoke.test.mjs` -> pass.
- `node scripts/generated-media-browser-smoke.test.mjs` -> pass.
- `node scripts/generated-media-production-readiness.test.mjs` -> pass.
- `node scripts/dev-generated-media-smoke.test.mjs` -> pass.

Full suites after fix:

- `apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit` -> pass.
- `apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit` -> pass.
- `bun test apps/app/tests/` -> 356 pass, 0 fail.
- `bun test apps/server/src/` -> 589 pass, 0 fail.
- `git diff --check` -> pass.

Runtime smoke against `scripts/dev-generated-media-smoke.mjs`:

- `node scripts/generated-media-flow-smoke.mjs --strict` -> pass.
- `node scripts/product-readiness-smoke.mjs --strict --include-generated-media-flow` -> 13 pass, 0 fail after the support-report redaction fix.
- `node scripts/generated-media-browser-smoke.mjs --strict` -> pass.

Browser smoke evidence:

- Screenshot: `/tmp/matterhorn-kimi-generated-media-browser-smoke/generated-media-browser-smoke.png`
- Report: `/tmp/matterhorn-kimi-generated-media-browser-smoke/summary.json`

## Remaining Product/Environment Work

- Production image generation still needs real OpenAI provider configuration. Local smoke uses the mock provider by design.
- `generated-media-production-readiness --require-production` correctly remains not ready without production image-provider setup.
- Real Sui mainnet/testnet mint/listing requires environment-specific package, Kiosk, TransferPolicy, and wallet setup. Current app flow is non-custodial preview plus user-wallet signing/receipt import.
