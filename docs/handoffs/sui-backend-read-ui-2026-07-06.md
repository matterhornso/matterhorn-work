# Sui Backend Read UI Handoff — 2026-07-06

## Branch

- `codex/sui-backend-read-ui`
- Stacked on `codex/sui-public-read-tools`.

## What Changed

- Added `MatterhornServerClient.suiAccount()` and `MatterhornServerClient.suiBalance()`.
- Updated Wallet Settings Sui preview to prefer the Matterhorn backend account read when a local engine client is available.
- Kept the direct dApp Kit wallet read as a fallback when the engine is offline or restarting.
- Threaded `matterhornServerClient` into every Sui preview placement.
- Added contract coverage so the app keeps using the backend Sui route.

## UX Contract

- The Sui card stays compact and operational.
- No new modal, giant panel, or extra safety wall was added.
- Connected users see the wallet, network, balance, public address, and read source.
- Signing remains in the wallet; no transaction submit path was added.

## Verification

Run from repo root:

```bash
bun test apps/app/tests/backend-capability-ui-contract.test.ts
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
git diff --check
```

Latest local result:

- Backend capability UI contract: `7 pass, 0 fail`
- App typecheck: pass
- `git diff --check`: pass
