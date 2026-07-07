# Generated Media Flow Smoke Handoff

Date: 2026-07-07
Branch: `codex/generated-media-flow-smoke`
Base: `origin/dev` after PR #746 (`a6496e25`)

## What This Adds

- Added `scripts/generated-media-flow-smoke.mjs`.
- Added `scripts/generated-media-flow-smoke.test.mjs`.
- Added package scripts:
  - `smoke:generated-media-flow`
  - `test:generated-media-flow-smoke`

The smoke script runs the actual backend generated-media publishing flow against a running Matterhorn server:

1. Resolve the active workspace.
2. Read backend generated-media capabilities.
3. Generate an image.
4. Create an NFT draft.
5. Upload image bytes to Walrus.
6. Prepare a Sui mint preview.
7. Record a public mint receipt.
8. Prepare a Sui Kiosk listing preview.

The default target is the local `dev:generated-media-smoke` stack:

- Server: `http://127.0.0.1:4125`
- Token: `matterhorn-media-smoke-client-token`

## Verification Run

Commands that passed:

```bash
node scripts/generated-media-flow-smoke.test.mjs
node scripts/generated-media-flow-smoke.mjs --strict --json-output /tmp/matterhorn-generated-media-flow-smoke.json
node scripts/dev-generated-media-smoke.test.mjs
node scripts/minimax-chat-perspectives-media-nft.test.mjs
bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-generation-provider.test.ts apps/server/src/image-nft-capabilities.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/project-evidence-routes.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts apps/server/src/tools/sui.test.ts
bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-generation-backend-capability-contract.test.ts apps/app/tests/backend-capability-ui.test.ts apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/sui-workflow-state.test.ts apps/app/tests/sui-desk-contract.test.ts
bun test apps/app/tests/
bun test apps/server/src/
apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
git diff --check
```

Results:

- Generated-media live flow smoke: 8/8 stages passed.
- Focused server image/NFT/Sui/capability/evidence tests: 83 pass, 0 fail.
- Focused app image/NFT/Sui/capability tests: 72 pass, 0 fail.
- Full app tests: 333 pass, 0 fail.
- Full server tests: 575 pass, 0 fail.
- App typecheck: pass.
- Server typecheck: pass.
- Diff whitespace check: pass.

The live smoke report confirmed:

- Image generation: `working`
- Walrus storage: `working`
- Sui NFT minting: `preview`
- NFT marketplace listing: `preview`
- Custody: `false`
- Live submission: `false`
- Secret prompts required: `false`

## Browser Smoke Notes

Browser smoke against the running local stack:

- Settings overview rendered generated-media setup rows correctly:
  - Image generation mock: Working.
  - Walrus storage: Working.
  - Sui NFT minting: Preview.
  - NFT marketplace listing: Preview.
- No browser console errors on Settings or Session home.
- Session home rendered project activity with generated-media evidence (`NFT minted`).

The chat-native image composer could not be browser-smoked through the normal `New chat` flow because this local smoke stack had no OpenCode base URL configured:

```text
opencode_unconfigured
OpenCode base URL is missing for this workspace
```

That is a local agent-engine setup limitation in the smoke stack, not a generated-media backend failure. The app component contracts and backend flow smoke still prove the generated image/NFT path.

## Environment Caveat

Running the package scripts through `pnpm` in this Codex shell attempted to run an install first and aborted with:

```text
ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

I did not force dependency install or purge behavior. The underlying Node commands passed directly.

## Next Useful Follow-Up

- Extend `dev:generated-media-smoke` so it can also provide a minimal fake OpenCode session, allowing full browser smoke of the chat-native `Generate image` panel.
- Add a browser smoke that clicks through:
  - Generate image.
  - Make NFT.
  - Upload to Walrus.
  - Prepare mint preview.
  - Prepare listing preview.
- Run one staging smoke with real OpenAI, real Walrus publisher/relay, and configured Sui package/Kiosk/TransferPolicy values.
