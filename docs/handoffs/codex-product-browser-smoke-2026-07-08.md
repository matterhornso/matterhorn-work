# Codex Handoff: Product Browser Smoke

Date: 2026-07-08
Branch: `codex/next-backend-product-phase`
Base: `origin/dev` at `0da26c39` (`Redact generated media support report setup secrets`)

## What Changed

Added a broader Matterhorn product browser smoke harness:

- `scripts/matterhorn-product-browser-smoke.mjs`
- `scripts/matterhorn-product-browser-smoke.test.mjs`
- `package.json` scripts:
  - `smoke:matterhorn-product-browser`
  - `test:matterhorn-product-browser-smoke`

The existing generated-media browser smoke proves the image-to-NFT lane. This new smoke proves the surrounding product shell and project evidence layer:

1. Workspace home shell renders.
2. Compact wallet readiness renders Sui/EVM/Bittensor status.
3. Bittensor desk task can be launched from Home.
4. Compact Project Activity appears after work exists.
5. Full Project history route renders.
6. Notes opens inside the session shell as a side panel.
7. Memory opens inside the session shell as a side panel.
8. Wallet opens inside the session shell and shows Sui workflow copy.
9. Settings Overview renders backend status, Project Activity, image/NFT readiness, and support report controls.
10. Support report download path works.
11. Wallet Settings shows Sui wallet preview copy.
12. Generated media settings renders readiness, diagnostics, recent media, and data controls.

## Verification

Fast/static:

- `node --check scripts/matterhorn-product-browser-smoke.mjs` -> pass
- `node scripts/matterhorn-product-browser-smoke.test.mjs` -> pass
- `node scripts/generated-media-browser-smoke.test.mjs` -> pass
- `node scripts/product-readiness-smoke.test.mjs` -> pass

Runtime stack:

- Started `node scripts/dev-generated-media-smoke.mjs`
- App URL: `http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session`

Runtime smokes:

- `node scripts/matterhorn-product-browser-smoke.mjs --url http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session --strict --json --output-dir /tmp/matterhorn-product-browser-smoke-current` -> pass
- `node scripts/product-readiness-smoke.mjs --strict --include-generated-media-flow` -> pass
- `node scripts/generated-media-browser-smoke.mjs --url http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session --strict --json --output-dir /tmp/matterhorn-generated-media-browser-smoke-after-product` -> pass

Focused app contracts:

- `bun test apps/app/tests/recent-activity-contract.test.ts apps/app/tests/workflow-stage-card.test.ts apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/generated-media-settings-contract.test.ts apps/app/tests/output-receipts.test.ts` -> 84 pass, 0 fail

Hygiene:

- `git diff --check` -> pass

## Evidence

- Product browser screenshot: `/tmp/matterhorn-product-browser-smoke-current/matterhorn-product-browser-smoke.png`
- Product browser report: `/tmp/matterhorn-product-browser-smoke-current/summary.json`
- Generated-media compatibility screenshot: `/tmp/matterhorn-generated-media-browser-smoke-after-product/generated-media-browser-smoke.png`
- Generated-media compatibility report: `/tmp/matterhorn-generated-media-browser-smoke-after-product/summary.json`

## Notes

- The browser smokes still treat these dev-stack 404s as non-fatal warnings:
  - `/workspace/:id/opencode/mcp`
  - `/workspace/:id/files/content?path=.opencode/agents/opencode-router.md`
- Reports were written to `/tmp` during verification so existing untracked `qa-reports/generated-media-browser-smoke/` stayed untouched.
- No production OpenAI/Walrus/Sui credentials were used. The runtime stack uses mock image generation, fake Walrus, and preview-only Sui/Kiosk ids.
