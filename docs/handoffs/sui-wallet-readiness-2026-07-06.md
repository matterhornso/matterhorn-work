# Sui Wallet Readiness Handoff - 2026-07-06

## Branch

`codex/sui-wallet-readiness`

This branch is stacked on top of:

1. `codex/backend-control-plane-integration` / PR #654
2. `codex/project-data-ledger-v1` / PR #655

Do not merge this branch until the earlier stacked PRs are merged or retargeted.

## What Changed

- Added current Mysten Sui dependencies to `@matterhorn-work/app`:
  - `@mysten/dapp-kit-react`
  - `@mysten/sui`
- Added `apps/app/src/react-app/infra/sui-dapp-kit.ts`.
  - Configures dApp Kit with `SuiGrpcClient`.
  - Supports `testnet` and `mainnet`.
  - Disables auto-connect.
  - Disables Slush wallet injection for this first pass.
  - Uses a Matterhorn-specific storage key.
- Wrapped the app provider tree in `DAppKitProvider`.
- Added a Sui wallet preview section to Wallet settings.
  - Discovers wallet-standard Sui wallets.
  - Connects and disconnects through dApp Kit.
  - Shows wallet name, network, address, and SUI balance when connected.
  - Does not expose signing, transaction execution, seed phrases, private keys, or custody.
- Updated backend capabilities so Sui is reported as `preview`, not `unsupported`.
  - `directConnect: true`
  - `publicRead: true`
  - `signing: client_wallet`
  - supported chains: `sui-testnet`, `sui-mainnet`
- Updated backend capability fixtures, helpers, and tests to match the new Sui preview state.

## Product Boundary

This is not full Sui transaction support. It is the account-readiness layer:

- Users can connect a Sui wallet-standard wallet where available.
- Matterhorn can display account/network/balance.
- Signing remains in the user's wallet.
- No transaction builder, sponsored transaction flow, Move call preview, or execution route is included.
- No custody or pasted-key flow is added.

## Verification

Passed:

- `bun test apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/backend-capability-ui.test.ts apps/app/tests/settings-overview-ui.test.ts`
- `bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/backend-security.e2e.test.ts`
- `bun test apps/app/tests/`
- `CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck`
- `CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck`
- `git diff --check`

Browser smoke:

- Temporary Vite app at `http://localhost:5173/settings/wallet`
- Screenshot captured at `/tmp/matterhorn-sui-wallet-settings-polished.png`
- Confirmed:
  - Sui wallet preview section renders.
  - Copy says Matterhorn never asks for seed phrases or private keys.
  - Old `Sui not implemented` copy is gone.
- Expected local-only console warning:
  - `Failed to load resource: net::ERR_CONNECTION_REFUSED`
  - Cause: smoke used the frontend-only Vite server without starting the local Matterhorn backend engine.

## Remaining Work

Recommended next Sui phase:

1. Add a Sui wallet runtime status card on Home/Profile using backend capabilities.
2. Add Sui address read tools on the backend for public balances/objects, with no signing.
3. Add Sui transaction preview artifacts without signing or execution.
4. Add explicit wallet-sign handoff UI only after preview artifacts are stable.
5. Add desktop wallet strategy:
   - external browser handoff, WalletConnect, or deep-link bridge.

## Notes For Future Agents

- Current official Mysten direction is the newer dApp Kit split:
  - React: `@mysten/dapp-kit-react`
  - Core: `@mysten/dapp-kit-core`
  - SDK: `@mysten/sui`
- Avoid the legacy `@mysten/dapp-kit` package.
- The Sui SDK now returns `getBalance()` as `{ balance: { balance } }`, not the older `totalBalance` shape.
- Do not add seed phrase, mnemonic, private key, raw signature, wallet export, or signed payload inputs.
