# Matterhorn Memory Extension QA - 2026-06-30

## Result

PASS after one focused fix.

## Scope Tested

- Memory type contract and forbidden-secret rejection.
- Memory vault build, capture, search, update, export, and forget smoke path.
- Server API routes and CLI flow.
- App memory suggestion producers.
- Memory production UI gate and Minimax lifecycle/spec gates.
- Market execution safety invariant.
- Types package build.

## Gap Found And Fixed

The app-side Memory producers already covered Bittensor, Hyperliquid, Polymarket, and Wellness, but the server-side suggestion planner behind `/api/memory/suggestions/plan` only produced explicit-review suggestions for Bittensor and Wellness.

Fix:

- Added Hyperliquid suggestion planning for read-only watched market context.
- Added Polymarket suggestion planning for read-only watched market/topic context.
- Added route-level assertions proving both market desks return review-only suggestions without hidden writes.
- Preserved market safety: no `canSubmit`, `liveSubmissionEnabled`, API key, private key, raw signature, or signed payload fields are emitted.

## Current Behavior

- Memory is explicit review-only. Nothing is saved unless the user confirms or edits to save.
- An empty inbox with `0` suggestions is expected when there are no candidates.
- Suggestions preserve source, why-suggested copy, sensitivity, confidence, and lifecycle.
- Market memories remain read/preview-only and external-signer only.
- Wellness memories stay opt-in/restricted and do not carry hidden clinical or medical records.
- Forbidden secrets are rejected before writing.

## Verification Commands

```bash
pnpm --config.verify-deps-before-run=false test:matterhorn-memory-api-cli
pnpm --config.verify-deps-before-run=false test:matterhorn-memory-contract
pnpm --config.verify-deps-before-run=false test:matterhorn-memory-vault
pnpm --config.verify-deps-before-run=false test:matterhorn-memory-producers
pnpm --config.verify-deps-before-run=false test:matterhorn-memory-ui
pnpm --config.verify-deps-before-run=false test:minimax-memory-ui
pnpm --config.verify-deps-before-run=false test:minimax-memory-producer
pnpm --config.verify-deps-before-run=false test:market-execution-safety-gate
pnpm --config.verify-deps-before-run=false --dir packages/types build
```

All commands passed.

## Beta Notes

- The Memory drawer is functional, but it only shows suggestions after a planner/producer generates candidates. Seeing `0` suggestions in a fresh session is not a failure.
- The next product polish step is to surface a visible "Create a test suggestion" or "Try Memory with this prompt" helper in dev/beta mode, so testers can verify the inbox without needing to know which chat input creates a candidate.
