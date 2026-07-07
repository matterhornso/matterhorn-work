# Generated Media Browser Receipt Smoke Handoff - 2026-07-08

## Branch

- `codex/generated-media-browser-receipts`
- Base: `origin/dev` after PR #762 (`4f0a7fda`)

## What Changed

This pass extends the generated-media browser smoke so the web UI proves the full public receipt loop, not only previews.

- `scripts/generated-media-browser-smoke.mjs` now records a public mint receipt through the NFT sheet after the mint preview.
- The smoke then prepares the Sui Kiosk listing preview and records a public listing receipt through the NFT sheet.
- The final assertion checks the generated media history row for the current prompt reaches `Listed`.
- `scripts/generated-media-browser-smoke.test.mjs` now guards the new receipt stages, visible UI text, and no-custody boundary copy.

## Verified Flow

The live Playwright smoke ran against `scripts/dev-generated-media-smoke.mjs`:

1. Open Matterhorn Work web app.
2. Confirm Home wallet readiness renders.
3. Open/create a chat session through the fake OpenCode engine.
4. Open the chat image-generation panel.
5. Generate a mock image and save it to Outputs.
6. Create an NFT draft from the generated image.
7. Prepare/upload image media to fake Walrus.
8. Prepare Sui mint preview.
9. Record public mint receipt metadata.
10. Prepare Sui Kiosk listing preview.
11. Record public listing receipt metadata.
12. Confirm generated media history shows the current image as `Listed`.

The smoke still does not sign wallet transactions or submit anything on-chain.

## Verification

Commands run from `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest`:

```bash
node scripts/generated-media-browser-smoke.test.mjs
node scripts/dev-generated-media-smoke.test.mjs
node scripts/generated-media-flow-smoke.test.mjs
node scripts/dev-generated-media-smoke.mjs
node scripts/generated-media-browser-smoke.mjs --strict --json --url http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session
bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-nft-capabilities.test.ts apps/app/tests/image-generation-ui-contract.test.ts
git diff --check
```

Results:

- Generated-media browser smoke contract: pass.
- Generated-media smoke launcher contract: pass.
- Generated-media API smoke contract: pass.
- Live browser smoke: pass, 12/12 stages.
- Focused generated-media route/UI tests: 60 pass, 0 fail.
- Diff whitespace check: pass.

## Notes

- The live browser smoke reported one existing non-fatal 404 resource warning from a session fallback probe:
  `/workspace/<id>/opencode/session/<sessionId>?directory=...`
- The smoke report still marked `ready: true` because there were no browser console errors after filtering stale resource warnings and no page errors.
- Screenshots and JSON evidence were written under `qa-reports/generated-media-browser-smoke/`, which remains untracked scratch output.

## Boundaries

- No production route, transaction, custody, wallet, Walrus, or marketplace behavior changed.
- The smoke uses fake public digests/object ids and fake Sui/Kiosk ids.
- Existing untracked scratch files were left untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
  - `qa-reports/generated-media-browser-smoke/`
