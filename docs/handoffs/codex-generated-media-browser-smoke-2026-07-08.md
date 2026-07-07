# Generated Media Browser Smoke - Codex Handoff

Date: 2026-07-08
Branch: `codex/generated-media-browser-smoke`
Base: `origin/dev` at `c99aa6f6` (`Cover generated media listing receipts in smoke`)

## Purpose

Generated media already had strong backend route coverage and a strict API smoke path through image generation, NFT drafts, Walrus upload, mint receipts, listing previews, and listing receipts. This pass adds browser-level coverage for the chat-native UI path so future agents can verify the product surface, not just the API.

## What Changed

- `scripts/generated-media-browser-smoke.mjs`
  - New Playwright smoke script for a running generated-media local stack.
  - Opens the Matterhorn app, creates or opens a chat session, opens the chat image panel, generates an image, opens `Make NFT`, creates a local draft, prepares/uploads to fake Walrus, prepares mint preview, and prepares Kiosk listing preview.
  - Writes `summary.json` and a screenshot under the configured output directory.
  - Fails strict runs on real browser/page errors while reporting stale resource 404s as warnings.

- `scripts/generated-media-browser-smoke.test.mjs`
  - Static contract gate for the new browser smoke script, stage coverage, no-custody boundary copy, Playwright usage, evidence output, and package scripts.

- `scripts/dev-generated-media-smoke.mjs`
  - Fake OpenCode now handles normal browser side channels used by the app: `/global/health`, `/config`, `/config/providers`, `/event`, `/permission`, and `/question`.
  - Fake OpenCode can materialize a synthetic session on read so a smoke browser can recover from route/session boot order.

- `scripts/dev-generated-media-smoke.test.mjs`
  - Contract gate updated for the fake OpenCode side channels and synthetic session reads.

- `package.json`
  - Adds:
    - `smoke:generated-media-browser`
    - `test:generated-media-browser-smoke`

## Verification

Passed:

- `node scripts/dev-generated-media-smoke.test.mjs`
- `node scripts/generated-media-browser-smoke.test.mjs`
- `node scripts/generated-media-flow-smoke.test.mjs`
- `node scripts/generated-media-browser-smoke.mjs --url http://127.0.0.1:5205/workspace/ws_d6a5b5572860/session --strict --output-dir /tmp/matterhorn-generated-media-browser-smoke --json`
  - `open_app`
  - `open_chat`
  - `open_image_panel`
  - `generate_image`
  - `open_nft_panel`
  - `create_nft_draft`
  - `upload_storage`
  - `preview_mint`
  - `preview_listing`
- `MATTERHORN_MEDIA_SMOKE_SERVER_URL=http://127.0.0.1:4165 MATTERHORN_MEDIA_SMOKE_CLIENT_TOKEN=matterhorn-media-smoke-client-token node scripts/generated-media-flow-smoke.mjs --strict --json-output /tmp/matterhorn-generated-media-flow-smoke-browser-pr.json`
  - included `sui.listing_receipt`
- `bun test apps/server/src/generated-media-routes.e2e.test.ts`
  - 26 pass, 0 fail
- `bun test apps/app/tests/image-generation-ui-contract.test.ts`
  - 22 pass, 0 fail
- `git diff --check`

Browser smoke artifact:

- `/tmp/matterhorn-generated-media-browser-smoke/summary.json`
- `/tmp/matterhorn-generated-media-browser-smoke/generated-media-browser-smoke.png`

## Known Caveat

The strict browser smoke completed with `ready: true`, `errors: []`, and one non-fatal 404 resource warning for a fake OpenCode session read. The smoke treats this as a warning rather than a JS/page error because the UI recovered and completed all generated-media/NFT preview stages. The fake engine already stubs the normal side channels; this remaining warning appears to be a route/session boot-order probe.

## Boundaries

- Browser smoke does not sign wallet transactions or record receipts.
- Backend `scripts/generated-media-flow-smoke.mjs` covers synthetic mint and listing receipts.
- No OpenAI key, wallet secret, seed phrase, raw signature, or server-side signing is used.
- Protected local scratch paths were not staged:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
