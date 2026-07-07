# Generated Media Chat Smoke - Codex Handoff

Date: 2026-07-08
Branch: `codex/generated-media-chat-smoke`
Base: `origin/dev` at `c216a3fa` (`Add generated media flow smoke`)

## Purpose

Kimi's generated image + Sui NFT lane had strong route and contract coverage, but the local smoke launcher could not exercise the chat-native UI because it did not provide an OpenCode session engine. This pass makes the generated-media smoke stack usable for browser testing through the normal Matterhorn session shell.

## What Changed

- `scripts/dev-generated-media-smoke.mjs`
  - Added a fake loopback OpenCode-compatible engine.
  - Implements minimal `/provider`, `/session`, `/session/status`, `/session/:id`, `/session/:id/message`, `/session/:id/todo`, `/session/:id/prompt_async`, and `/session/:id/command` routes.
  - Wires the fake engine into the Matterhorn server with `--opencode-base-url`.
  - Keeps the existing mock image provider, fake Walrus publisher/relay, and fake Sui package/Kiosk/TransferPolicy ids.

- `scripts/dev-generated-media-smoke.test.mjs`
  - Adds static contract coverage so the launcher keeps the fake OpenCode engine, provider catalog, and chat-session smoke instructions.

## Verification

Passed:

- `node scripts/dev-generated-media-smoke.test.mjs`
- `node scripts/generated-media-flow-smoke.test.mjs`
- `bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-generation-backend-capability-contract.test.ts`
  - 23 pass, 0 fail
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-generation-provider.test.ts apps/server/src/image-nft-capabilities.test.ts`
  - 32 pass, 0 fail
- `npx -y pnpm@10.27.0 --filter @matterhorn-work/app typecheck`
  - pass
- `npx -y pnpm@10.27.0 --filter matterhorn-work-server typecheck`
  - pass
- `bun test apps/app/tests/`
  - 333 pass, 0 fail
- Live backend smoke against `node scripts/dev-generated-media-smoke.mjs`:
  - Workspace discovery passed.
  - Backend model catalog resolved from fake OpenCode `/provider`.
  - Workspace session create/read/snapshot passed through Matterhorn server.
  - `node scripts/generated-media-flow-smoke.mjs --server-url http://127.0.0.1:4125 --workspace-id ws_d6a5b5572860 --token matterhorn-media-smoke-client-token --strict` passed.
- Browser smoke in the in-app browser:
  - Opened `http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session`.
  - Created `ses_generated_media_smoke_002` through the New chat button.
  - Verified chat-native `Generate image` control rendered.
  - Verified generated image card rendered with `Image saved to outputs`, `Generate variant`, and `Make NFT`.
  - Opened the NFT draft panel from chat and verified Walrus upload, mint preview, wallet-signing disabled state, listing preview, and receipt controls rendered.
  - Browser console errors: none.

Install note:

- The bare `pnpm` binary in this environment resolved to pnpm 11 and hit `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` before typecheck. Re-running with the repo-pinned `pnpm@10.27.0` restored dependencies without changing the lockfile and both typechecks passed.

## Caveats

- Fake OpenCode is intentionally tiny and dev-only. It exists only to make the generated-media browser smoke stack representative enough to open a session and render the image/NFT UI.
- Real Walrus upload and real Sui Move transaction construction remain product/backend follow-ups. This stack uses local fake IDs and wallet handoff preview states only.
- Existing untracked scratch paths were not deleted or staged:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
