# Project Data Ledger v1 Handoff

Date: 2026-07-06
Branch: `codex/project-data-ledger-v1`
Base: stacked on `codex/backend-control-plane-integration` / draft PR #654

## What Changed

- Added the shared project data ledger contract:
  - `packages/types/src/project-data-ledger.ts`
  - exported via `@matterhorn-work/types/project-data-ledger`
- Added server-side ledger aggregation:
  - `GET /workspace/:id/data-ledger`
  - Sources: project evidence, audit log, structured feedback
  - Kinds: note, memory_suggestion, task, output, audit, feedback
  - Filters: `source`, `kind`, `limit`
- Added structured local feedback capture:
  - `POST /workspace/:id/feedback`
  - Requires writable server and collaborator-or-owner token
  - Stores JSONL at `OPENWORK_DATA_DIR/feedback/<workspaceId>.jsonl`
  - Writes an audit event after successful capture
  - Marks feedback use as `eval_routing_product_quality_only`
  - Does not opt into RL or model training
- Added redaction for ledger text fields:
  - bearer-token-shaped strings
  - 64-character hex secrets
  - common wallet/API/signature secret phrases
- Updated backend capability/data-map truth:
  - feedback is now a working local JSONL store, not only a link
  - data-map includes feedback path and redacted/append-only policy
- Added app client methods:
  - `client.listProjectDataLedger(workspaceId, options)`
  - `client.submitProjectFeedback(workspaceId, feedback)`
- Added a compact Settings > Overview backend row:
  - total ledger event count
  - feedback count
  - redacted event count
  - visible `No training by default` policy copy
- Added local feedback UI wiring:
  - Status-bar feedback now opens an in-app structured feedback dialog
  - Settings feedback now uses the same local dialog with settings context
  - Dialog posts to `POST /workspace/:id/feedback`
  - User-facing copy says feedback is local and not used for training by default
- Added project ledger export UI:
  - Settings > Overview can download a redacted ledger JSON snapshot
  - Export calls `client.listProjectDataLedger(workspaceId, { limit: 300 })`
- Added Data policy controls in Settings > Overview:
  - Reads `GET /workspace/:id/backend/data-map`
  - Shows each store's location, retention, exportability, deletability, and secret handling
  - Keeps append-only audit/task/feedback rows explicit rather than hiding them
- Added Feedback review in Settings > Overview:
  - Reads the project ledger with `source=feedback`
  - Filters by structured feedback kind
  - Shows feedback target, rating when present, relative time, and redacted comment summary
- Added model routing policy to backend capabilities:
  - Reports that answers flow through OpenCode session prompt calls
  - Reports that model lists come from OpenCode provider discovery
  - Reports that users can choose models via the model picker/local preferences
- Added a truthful Sui wallet capability plan:
  - Sui remains `unsupported` in this build
  - Backend capability details point to the current Mysten dApp Kit React packages
  - No custody, no pasted keys, explicit client wallet signing only

## Files Added

- `apps/server/src/project-data-ledger.ts`
- `apps/server/src/project-feedback.ts`
- `apps/server/src/project-data-ledger-routes.e2e.test.ts`
- `apps/app/src/react-app/domains/feedback/project-feedback-dialog.tsx`
- `apps/app/tests/project-feedback-ui-contract.test.ts`
- `packages/types/src/project-data-ledger.ts`

## Files Modified

- `apps/server/src/server.ts`
- `apps/server/src/backend-control-plane.e2e.test.ts`
- `apps/app/src/app/lib/matterhorn-server.ts`
- `apps/app/src/react-app/shell/session-route.tsx`
- `apps/app/src/react-app/shell/settings-route.tsx`
- `apps/app/src/react-app/domains/settings/backend-capability-status.ts`
- `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`
- `apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-fixtures.ts`
- `apps/app/tests/backend-capability-ui.test.ts`
- `apps/app/tests/backend-capability-ui-contract.test.ts`
- `apps/app/tests/settings-overview-ui.test.ts`
- `packages/types/src/index.ts`
- `packages/types/src/backend-capabilities.ts`
- `packages/types/package.json`

## Verification

Focused tests:

```bash
bun test apps/server/src/project-data-ledger-routes.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/app/tests/backend-capability-ui.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
```

Result: 42 pass, 0 fail.

After adding the Settings row:

```bash
bun test apps/app/tests/backend-capability-ui.test.ts apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/settings-overview-ui.test.ts
```

Result: 43 pass, 0 fail.

Broader app test sweep:

```bash
bun test apps/app/tests/
```

Result: 231 pass, 0 fail.

After adding local feedback UI and ledger export:

```bash
bun test apps/app/tests/project-feedback-ui-contract.test.ts apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/settings-overview-ui.test.ts
```

Result: 21 pass, 0 fail.

```bash
bun test apps/server/src/project-data-ledger-routes.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/backend-security.e2e.test.ts
```

Result: 41 pass, 0 fail.

```bash
bun test apps/app/tests/
```

Result: 235 pass, 0 fail.

After adding Data policy, Feedback review, model routing policy, and Sui capability planning:

```bash
bun test apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/backend-capability-ui.test.ts apps/app/tests/settings-overview-ui.test.ts apps/app/tests/project-feedback-ui-contract.test.ts
```

Result: 49 pass, 0 fail.

```bash
bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts
```

Result: 9 pass, 0 fail.

Typecheck:

```bash
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck
```

Result: both passed.

## Product Contract

- The ledger is a read model, not a new source of truth.
- Feedback is locally persisted for evaluation, routing, and product quality only.
- Feedback is not used for RL or model training by default.
- Chat/session history remains in the OpenCode runtime store and is not fully materialized into the v1 ledger.
- Audit/task/feedback entries are append-only in v1.
- Notes and memory deletion/export behavior remains owned by their existing surfaces.

## Next Recommended Step

Move from capability planning into real provider implementation:

1. Install and wire current Sui wallet packages: `@mysten/dapp-kit-react`, `@mysten/dapp-kit-core`, and `@mysten/sui`.
2. Add a Sui provider around the React app with testnet/mainnet network config.
3. Add Sui account/network/balance read state to Wallet settings.
4. Keep signing as explicit user wallet signing only; do not add custody, pasted keys, seed phrase fields, or silent transaction execution.
5. After Sui read/connect is verified, add transaction preview and external/user-signing handoff receipts.
