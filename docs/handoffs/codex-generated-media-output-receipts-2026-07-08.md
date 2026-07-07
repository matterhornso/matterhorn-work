# Generated Media Output Receipts Handoff - 2026-07-08

Branch: `codex/generated-media-output-receipts`
Base: `origin/dev` at `a44235bc` (`Add chat-capable generated media smoke (#748)`)

## What Changed

This pass verified Kimi's generated image + Sui NFT lane on the current merged code and fixed the remaining evidence-story gap in the Outputs surface.

Generated images and NFT evidence already flowed into chat, Project Activity, Project Evidence, and the data ledger. The Outputs panel receipt normalizer only understood workflow task receipts. This meant generated image evidence could be present in the project but not reliably appear as an Outputs receipt with the right labels.

The fix extends output receipts to cover:

- `image.generated`
- `nft.minted`
- `nft.listed`

Receipts now carry a `kind`:

- `workflow`
- `image`
- `nft`

The Outputs panel uses that kind to show `Image receipt`, `NFT receipt`, or `Workflow receipt`, and generated image outputs get the origin label `Generated image` plus status `Generated`.

## Files Changed

- `apps/app/src/react-app/domains/session/artifacts/output-receipts.ts`
- `apps/app/src/react-app/domains/session/artifacts/output-descriptor.ts`
- `apps/app/src/react-app/domains/session/artifacts/output-list.tsx`
- `apps/app/src/react-app/domains/session/artifacts/artifact-panel.tsx`
- `apps/app/tests/output-receipts.test.ts`
- `apps/app/tests/output-descriptor.test.ts`
- `apps/app/tests/outputs-panel-contract.test.ts`

## Verification

Focused output/evidence tests:

```bash
bun test apps/app/tests/output-receipts.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts apps/app/tests/recent-activity-normalize.test.ts
```

Result: 45 pass, 0 fail.

Focused generated-media backend tests:

```bash
bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-generation-provider.test.ts apps/server/src/image-nft-capabilities.test.ts apps/server/src/project-evidence-routes.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts apps/server/src/tools/sui.test.ts
```

Result: 57 pass, 0 fail.

Focused generated-media app tests:

```bash
bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-generation-backend-capability-contract.test.ts apps/app/tests/backend-capability-ui.test.ts apps/app/tests/wallet-runtime-contract.test.ts apps/app/tests/sui-workflow-state.test.ts apps/app/tests/sui-desk-contract.test.ts
```

Result: 67 pass, 0 fail.

Full suites:

```bash
npx -y pnpm@10.27.0 --filter @matterhorn-work/app typecheck
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
bun test apps/app/tests/
bun test apps/server/src/
git diff --check
```

Results:

- App typecheck: pass.
- Server typecheck: pass.
- Full app tests: 336 pass, 0 fail.
- Full server tests: 575 pass, 0 fail.
- `git diff --check`: pass.

Smoke-script contracts:

```bash
node scripts/generated-media-flow-smoke.test.mjs
node scripts/dev-generated-media-smoke.test.mjs
```

Results:

- Generated-media flow smoke contract passed.
- Generated-media smoke launcher gate passed.

Live smoke stack:

```bash
node scripts/dev-generated-media-smoke.mjs
node scripts/generated-media-flow-smoke.mjs --server-url http://127.0.0.1:4125 --workspace-id ws_d6a5b5572860 --token matterhorn-media-smoke-client-token --strict --json-output /tmp/matterhorn-generated-media-flow-smoke-latest.json
```

Result: PASS.

Stages passed:

- Resolve active workspace.
- Read generated-media capabilities.
- Generate image.
- Create NFT draft.
- Upload media to Walrus.
- Prepare Sui mint preview.
- Record Sui mint receipt.
- Prepare Sui Kiosk listing preview.

Browser smoke against `http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session`:

- New chat opened.
- `Generate image` panel rendered in the chat composer.
- Fresh mock image generated from the UI and rendered as an image with `Image saved to outputs`, `Generate variant`, and `Make NFT`.
- `Make NFT` opened the draft panel.
- Local NFT draft created.
- Storage `Prepare upload` and `Upload` worked against fake Walrus and returned a local blob URL.
- Sui mint preview reached `preview ready` and showed `Mint plan ready`.
- Wallet signing remained disabled because no Sui wallet was connected.
- Mint receipt was recorded with public digest/object metadata.
- Sui Kiosk listing preview reached `preview ready` and showed `Listing plan ready`.
- Browser console warnings/errors: none.

Live negative security check:

```bash
curl -i -H 'Authorization: Bearer matterhorn-media-smoke-client-token' \
  -H 'Content-Type: application/json' \
  -X POST 'http://127.0.0.1:4125/workspace/ws_d6a5b5572860/images/generate' \
  --data '{"prompt":"seed phrase alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu"}'
```

Result: `400 image_prompt_secret_rejected`.

## Remaining Notes

- The smoke stack uses mock image generation, fake Walrus, and fake Sui package/Kiosk/TransferPolicy ids. It proves Matterhorn's local flow and wallet-handoff boundaries, not real chain settlement.
- Real environment smoke still needs actual `OPENAI_API_KEY`, Walrus publisher/relay, Sui package id, Kiosk package id, and TransferPolicy package id.
- The NFT panel readiness rows currently show configured requirements as labels such as `Publisher/relay needed` and `Package needed` even when the smoke capability status is `Working` or `Preview`. Functionally the buttons behave correctly, but that copy is a small UX polish follow-up.
- `.matterhorn-work/` and `.opencode/agents/matterhorn-sui.md` remain untracked scratch/parallel-agent paths and were not staged.
