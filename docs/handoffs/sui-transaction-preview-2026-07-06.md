# Sui Transaction Preview Handoff — 2026-07-06

## Branch

- `codex/sui-transaction-preview`
- Stacked on `codex/sui-backend-read-ui`.

## What Changed

- Added a non-submittable Sui transfer preview builder in `apps/server/src/tools/sui.ts`.
- Added `POST /api/sui/transactions/preview`.
- Added preview capability details under the Sui wallet family.
- Added `MatterhornServerClient.suiTransactionPreview()`.
- Added tests for:
  - preview hashing and safety fields
  - invalid amount/action/secret rejection
  - route-level non-submittable preview response
  - app client exposure

## Safety Contract

- This PR does not add signing or transaction submission.
- The preview accepts public metadata only: sender, recipient, network, amount, optional memo.
- Secret-shaped inputs are rejected before any preview is returned.
- The preview explicitly returns:
  - `custody: false`
  - `canSubmit: false`
  - `liveSubmissionEnabled: false`
  - `signerPolicy: client_wallet_required`
- The handoff is an unsigned wallet intent, not raw signature material.

## Verification

Run from repo root:

```bash
bun test apps/app/tests/backend-capability-ui-contract.test.ts apps/server/src/tools/sui.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/backend-security.e2e.test.ts
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck
git diff --check
```

Latest local result:

- Focused app/server tests: `53 pass, 0 fail`
- App typecheck: pass
- Server typecheck: pass
- `git diff --check`: pass

## Next Work

- Add a small Sui transfer preview UI only after the product chooses the first Sui workflow.
- Convert the unsigned intent into a wallet-standard transaction request in the client wallet layer.
- Add receipt import after wallet signing/execution is handled outside Matterhorn.
