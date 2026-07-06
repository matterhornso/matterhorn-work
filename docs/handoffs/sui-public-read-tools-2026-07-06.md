# Sui Public Read Tools Handoff — 2026-07-06

## Branch

- `codex/sui-public-read-tools`
- Stacked on `codex/sui-wallet-readiness`, which is stacked on `codex/project-data-ledger-v1`.

## What Changed

- Added server dependency on `@mysten/sui`.
- Added `apps/server/src/tools/sui.ts`, a read-only Sui provider backed by `SuiGrpcClient`.
- Added two client-scope public read routes:
  - `GET /api/sui/account/:address?network=testnet|mainnet`
  - `GET /api/sui/balance/:address?network=testnet|mainnet&coinType=...`
- Updated backend capabilities so the Sui wallet family reports:
  - `status: preview`
  - direct connect via client wallet
  - public read enabled
  - no custody
  - read routes in `details.publicReadRoutes`
- Removed stale Settings capability copy that said Sui was not implemented.

## Safety Contract

- Routes accept public Sui addresses only.
- Short Sui addresses such as `0x2` are normalized before validation.
- Secret-shaped inputs are rejected before any provider call.
- The provider returns `custody: false` and `canSubmit: false`.
- No signing, transaction execution, private key, seed phrase, raw signature, signed payload, or wallet export route was added.

## Verification

Run from repo root:

```bash
bun test apps/server/src/tools/sui.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/backend-security.e2e.test.ts
CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck
git diff --check
```

Latest local result:

- Sui/control-plane/security focused tests: `43 pass, 0 fail`
- Server typecheck: pass
- `git diff --check`: pass

## Remaining Work

- Add UI calls from wallet/settings or protocol desks into the new routes.
- Add Sui transaction preview and external wallet signing handoff as a separate PR.
- Add Sui to protocol desk templates only after product copy defines the first Sui use cases.
- Do not merge this stack until the draft base PRs are ready:
  - backend control plane integration
  - project data ledger
  - Sui wallet readiness
