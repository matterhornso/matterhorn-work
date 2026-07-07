# Codex Handoff: Generated Media History

Date: 2026-07-08
Branch: `codex/generated-media-history`
Base: `origin/dev` at `9cb21648` (`Surface NFT receipt details in evidence UI (#752)`)

## What Changed

- Added a generated media history contract in `packages/types/src/generated-media.ts`.
- Added `GET /workspace/:workspaceId/generated-media/history` in `apps/server/src/generated-media-routes.ts`.
- Joined generated images with Sui NFT draft state so the app can show one project media trail instead of separate image and NFT fragments.
- Added `MatterhornServerClient.listGeneratedMediaHistory(...)`.
- Added `GeneratedMediaHistory` and wired it into the session image generation panel.
- The image panel now invalidates and refreshes the unified history after image generation, NFT draft creation, storage preparation/upload, mint preview/receipt, and listing preview/receipt.

## Verification

- `bun test apps/app/tests/image-generation-ui-contract.test.ts apps/server/src/generated-media-routes.e2e.test.ts`
  - Pass: 46 tests.
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-nft-capabilities.test.ts`
  - Pass: 31 tests.
- `bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-generation-backend-capability-contract.test.ts apps/app/tests/output-receipts.test.ts apps/app/tests/outputs-panel-contract.test.ts`
  - Pass: 43 tests.
- `bun test apps/app/tests/`
  - Pass: 342 tests.
- `npx -y pnpm@10.27.0 --filter @matterhorn-work/app typecheck`
  - Pass.
- `npx -y pnpm@10.27.0 --filter matterhorn-work-server typecheck`
  - Pass.
- `git diff --check`
  - Pass.

## Full Server Suite Note

`bun test apps/server/src/` produced one timeout in:

- `backend control plane routes > workspace model selection persists, clears, audits, and enforces write guards`

The exact failing test was rerun by name and passed:

- `bun test apps/server/src/backend-control-plane.e2e.test.ts -t "workspace model selection persists"`
  - Pass: 1 test.

Treat this as a server-suite timing flake unless it recurs in CI.

## Browser Smoke

The app loaded at `http://127.0.0.1:5175/workspace/ws_d6a5b5572860/session`.

- Home/session shell rendered.
- No app-level console errors were captured after reload.
- Project activity/output surface rendered.
- The chat path could not be fully exercised because the local Matterhorn Work agent engine was disconnected in the live app. The browser showed the expected engine-unavailable state instead of the chat composer.

## Scratch Files

Left untouched:

- `.matterhorn-work/`
- `.opencode/agents/matterhorn-sui.md`

## Open Follow-Up

- Once the managed/local agent engine is connected, run a browser smoke that opens the chat composer, generates an image with the mock or OpenAI provider, opens the NFT draft panel, and confirms the `Recent images` list updates after each receipt step.
