# Production CORS Readiness Handoff - 2026-07-08

Branch: `codex/production-cors-readiness`
Base: `origin/dev` at PR #775 merge (`fe586bc7`)

## Purpose

Close the remaining backend-control-plane CORS migration check. Matterhorn Work now defaults the local server to `loopback` CORS, but production readiness needed a repeatable gate proving that product/dev launchers do not rely on implicit wildcard CORS and that wildcard CORS fails a production check when explicitly configured through env.

## What Changed

- Added `scripts/production-cors-readiness.mjs`.
  - Emits `matterhorn.production-cors-readiness.v1`.
  - Performs no network requests.
  - Checks server config default CORS contract, config regression tests, local dev launchers, generated-media smoke launcher, and active Matterhorn CORS env vars.
  - Fails when `MATTERHORN_WORK_CORS_ORIGINS=*` or `OPENWORK_CORS_ORIGINS=*` is active.
- Added `scripts/production-cors-readiness.test.mjs`.
- Added package scripts:
  - `pnpm smoke:production-cors-readiness`
  - `pnpm test:production-cors-readiness`
- Wired production CORS readiness into `scripts/product-readiness-smoke.mjs`.
  - Dry-run now shows `production.cors_readiness`.
  - Strict live product smoke runs `node scripts/production-cors-readiness.mjs --require-production --json` before backend capability checks.

## Verification

Passed:

- `node scripts/production-cors-readiness.test.mjs`
- `node scripts/product-readiness-smoke.test.mjs`
- `node scripts/production-cors-readiness.mjs --require-production --json`
- `node scripts/product-readiness-smoke.mjs --dry-run --include-generated-media-flow --json`
- `MATTERHORN_WORK_CORS_ORIGINS='*' node scripts/production-cors-readiness.mjs --require-production --json`
  - Expected exit code `1`.
  - Report identifies `environment_cors` as failed.

## Notes

- This does not remove explicit wildcard CORS support. Local or test callers can still opt into `*`; production readiness simply refuses to call that safe.
- Existing tests that build server configs with `corsOrigins: ["*"]` remain valid because they are explicit test fixtures.
- Preserved scratch paths were not deleted or staged:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
  - `qa-reports/generated-media-browser-smoke/`
