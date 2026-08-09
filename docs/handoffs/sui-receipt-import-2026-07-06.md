# Sui Receipt Import Handoff — 2026-07-06

## Branch

- `codex/sui-receipt-import`
- Stacked on `codex/sui-transaction-preview`.

## What Changed

- Added public Sui transaction receipt validation in `apps/server/src/tools/sui.ts`.
- Added `POST /api/sui/transactions/receipt`.
- Added `MatterhornServerClient.suiTransactionReceipt()`.
- Updated backend capabilities with `details.receiptRoutes`.
- Added focused tool and route tests.

## Safety Contract

- Receipts accept public metadata only:
  - network
  - preview SHA-256
  - public transaction digest
  - status
  - optional public sender/recipient/amount/explorer URL
- Secret-shaped fields such as raw signatures or signed payloads are rejected.
- Receipt output states:
  - `custody: false`
  - `containsSignatureMaterial: false`
  - `verification.liveSubmissionByMatterhorn: false`
- No wallet signing or transaction submission path was added.

## Verification

Run from repo root:

```bash
bun test apps/app/tests/backend-capability-ui-contract.test.ts apps/server/src/tools/sui.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/backend-security.e2e.test.ts
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck
git diff --check
```

Latest local result:

- Focused app/server tests: `56 pass, 0 fail`
- App typecheck: pass
- Server typecheck: pass
- `git diff --check`: pass

## RPC Verification Upgrade — 2026-08-09

- Added `POST /api/sui/transactions/verify-receipt` and the workspace evidence equivalent.
- The product receipt flow now derives transaction status from Sui gRPC instead of a user-selected status.
- Verified evidence records the selected network, public gRPC source, verification time, and `chainVerified: true` without retaining signature material.
- The metadata-only receipt route remains available for backward compatibility, but the Sui workflow panel no longer uses it.
- A live testnet transaction was successfully verified through the installed Mysten gRPC client after the focused unit and type-check suites passed.
