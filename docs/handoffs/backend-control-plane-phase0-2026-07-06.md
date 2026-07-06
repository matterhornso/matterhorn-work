# Backend Control Plane Phase 0 Handoff

Date: 2026-07-06

## Branch and Base

- Repo: `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability`
- Current checkout after parallel reconciliation: `kimi/backend-capability-ui`
- Original Codex backend branch: `codex/backend-control-plane`
- Base commit: `3b01ad43 Integrate evidence UI cleanup`
- Started from: `codex/evidence-ui-final-integration` / `origin/codex/evidence-ui-final-integration`

## Current Worktree

Tracked files were clean at Phase 0 start. The worktree is now intentionally dirty with Codex + MiniMax + Kimi-lane integration work.

Known untracked local artifacts to preserve:

- `.matterhorn-work/`
- `test-results/`

Do not delete untracked scratch, local app, or parallel-agent files unless the user explicitly asks.

## Phase 0 Baseline

Commands run:

```bash
bun test apps/app/tests
```

Result: 188 pass, 0 fail.

Initial typecheck attempt using default `pnpm` failed before TypeScript because the runtime used `pnpm@11.7.0`, which ignored the repo's package-level pnpm config and then hit a frozen lockfile override mismatch.

Pinned repo package manager:

```bash
npx pnpm@10.27.0 --version
```

Result: `10.27.0`.

Dependency restore:

```bash
CI=true npx pnpm@10.27.0 install --frozen-lockfile
```

Result: success.

Typecheck:

```bash
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

Result: success.

## Build Objective

Create a small backend-owned Matterhorn Control Plane before adding larger backend features like Sui wallet support, teams, durable data policy, or structured feedback.

The first PR should add:

1. Shared backend capability types.
2. `GET /api/backend/capabilities`.
3. `GET /workspace/:workspaceId/backend/data-map`.
4. Tests proving model/provider, storage, memory, notes, evidence, wallet, team, settings, and security statuses are truthful.
5. Memory write route hardening with collaborator scope, writable workspace checks, and audit entries.

## Recommended Parallel Lanes

### Codex Lane

Own the server/type contract spine:

- `packages/types/src/backend-capabilities.ts`
- server route wiring in `apps/server/src/server.ts`
- helper functions that gather server and workspace capability state
- memory write route hardening
- server/unit tests for the new backend contract

Avoid broad Settings/Profile UI work until the backend response shape is stable.

### Kimi Lane

Own UI consumption after the backend contract is available:

- Settings/Profile capability rendering
- status badge/copy system
- no server route changes unless strictly necessary
- use mocked fixture responses if backend route is not merged yet

### MiniMax Lane

Own security/data-policy tests and edge-case review:

- memory write permission tests
- data-map secret/path leakage tests
- CORS/security capability classification tests
- route guard regression tests
- no UI styling changes

## Product Truths To Preserve

- Agent answers currently flow through OpenCode/OpenWork.
- Default model is currently `opencode/big-pickle`.
- Notes are workspace-local markdown plus `.matterhorn-work/notes/index.json`.
- Memory defaults to the machine-level vault under `~/.matterhorn-work/memory`, not clearly workspace-scoped yet.
- Evidence/activity is built from task events, notes, outputs, and workflow receipts.
- Direct wallet connect is EVM-only today through wagmi/viem on Base/Base Sepolia.
- Bittensor is public-read/external-signer, no custody.
- Sui is not implemented yet.
- Feedback is currently a user-facing link, not a structured RL/training loop.

## Verification Expected Before Merge

```bash
bun test apps/app/tests
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

Add focused backend tests for the new capability/data-map routes and memory route hardening.

## Codex Backend Lane Update

Implemented on `codex/backend-control-plane` after Phase 0:

- Added shared backend capability/data-map types in `packages/types/src/backend-capabilities.ts`.
- Exported the new type contract from `packages/types/src/index.ts` and `packages/types/package.json`.
- Added `GET /api/backend/capabilities`.
- Added `GET /workspace/:id/backend/data-map`.
- Exported `taskEventsPath()` from `apps/server/src/task-events.ts` for truthful data-map path reporting.
- Hardened memory write routes:
  - `POST /api/memory/capture`
  - `POST /api/memory/suggestions`
  - `POST /api/memory/suggestions/:id/resolve`
  - `POST /api/memory/suggestions/resolve`
  - `PATCH /api/memory/entities/:id`
  - `DELETE /api/memory/entities/:id`
  - `POST /api/memory/forget`
  - `POST /api/memory/export`
- Memory writes now require a writable server and collaborator scope.
- Memory writes record audit entries when a workspace context is available.
- Added `apps/server/src/backend-control-plane.e2e.test.ts`.

The capability contract currently reports:

- Models: OpenCode/OpenWork routing, default `opencode/big-pickle`, provider list source `opencode`.
- Memory: machine-global vault by default, pending/confirmed counts when readable.
- Notes: workspace-local markdown plus `.matterhorn-work/notes/index.json`.
- Evidence: notes, memory suggestions, task events, task runs, outputs, workflow runs.
- Wallets: EVM working, Bittensor external-signer/public read, Sui unsupported.
- Teams: local token sharing working, cloud teams needs setup/preview.
- Security: loopback/token/host-token/approval/CORS/authorized-roots/logging/memory-write-guard posture.

Verification run after implementation:

```bash
bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/memory-routes.e2e.test.ts apps/server/src/project-evidence-routes.e2e.test.ts
# 12 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck
# pass

bun test apps/app/tests
# 188 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
# pass

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/types build
# pass

git diff --check
# pass
```

Parallel-agent files detected and left untouched:

- `apps/server/src/backend-security.e2e.test.ts`
- `docs/handoffs/minimax-backend-security-data-policy-2026-07-06.md`

## MiniMax Security Lane Reconciled

MiniMax's security/data-policy test lane was integrated after the memory guard and audit fixes landed.

Updates made during reconciliation:

- Converted dual-pass `expect([200, 403])` tests into strict `403` assertions.
- Viewer memory write tests now require `forbidden`.
- Read-only memory write tests now require `read_only`.
- Audit tests now require at least one matching memory audit entry.
- Capability tests now use `GET /api/backend/capabilities`.
- Data-map tests now use `GET /workspace/:id/backend/data-map`.
- Removed silent setup skips from suggestion/record setup paths.
- Updated `docs/handoffs/minimax-backend-security-data-policy-2026-07-06.md` with an integration note.

Verification after MiniMax reconciliation:

```bash
bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/memory-routes.e2e.test.ts apps/server/src/project-evidence-routes.e2e.test.ts
# 44 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck
# pass

bun test apps/app/tests
# 195 pass, 0 fail

git diff --check
# pass
```

Important branch note: during reconciliation the shared checkout was on `kimi/backend-capability-ui`, while `codex/backend-control-plane` still points at the same base commit. Do not assume the branch name reflects final ownership until Kimi's lane is consolidated.

## App Control Plane Consumption Update

Added the first app-facing consumer of the backend capability contract:

- `apps/app/src/app/lib/matterhorn-server.ts`
  - Added `backendCapabilities()` for `GET /api/backend/capabilities`.
  - Added `workspaceDataMap(workspaceId)` for `GET /workspace/:id/backend/data-map`.
- `apps/app/src/react-app/domains/settings/backend-capability-status.ts`
  - Centralized status labels and tones:
    - `working` -> `Working`
    - `needs_setup` -> `Needs setup`
    - `preview` -> `Preview`
    - `unsupported` -> `Not supported here`
    - `error` -> `Unavailable`
  - Added helpers for model source, wallet family summaries, storage locations, and data policy copy.
- `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`
  - Added a compact `Backend status` section driven by the backend contract.
  - Shows model routing, notes/memory, evidence ledger, wallet families, team support, and memory write guards.
  - Updated `Privacy & Data` to use the workspace data map when available, showing chat, notes, memory, outputs, and training-use policy.
- `apps/app/src/react-app/domains/settings/pages/wallet-view.tsx`
  - Reads backend wallet-family status when a Matterhorn server client is available.
  - Adds a `Sui wallet` row sourced from the backend capability response; current status is `Not supported here`.
- `apps/app/src/react-app/shell/settings-route.tsx`
  - Passes the Matterhorn server client into Wallet Settings.
- `packages/types/src/profile-readiness.ts`
  - Removed stale copy claiming memory syncs to the account.
  - New copy says local project memory stays on this device unless a workspace policy says otherwise.
- `apps/app/tests/backend-capability-ui-contract.test.ts`
  - Added app contract tests for endpoint wiring, Settings overview consumption, Wallet Settings Sui status, profile readiness copy, and helper output.

Verification after app consumption update:

```bash
bun test apps/app/tests/backend-capability-ui-contract.test.ts
# 7 pass, 0 fail

bun test apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/recent-activity-contract.test.ts apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/outputs-panel-contract.test.ts apps/app/tests/mcp-docs-link-contract.test.ts
# 55 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
# pass

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/types build
# pass

CI=true npx pnpm@10.27.0 --filter matterhorn-work-server typecheck
# pass

git diff --check
# pass
```

Open product decisions after this pass:

- Sui support is now visible as a backend-reported unsupported wallet family; actual implementation should be a separate wallet-family PR using Mysten dApp Kit.
- Teams are reported by the backend contract but still not a real collaborative workspace feature.
- The data map is informative only; retention/export/delete policy still needs a durable workspace ledger before it can become a full compliance surface.
- The current dirty worktree still needs consolidation into one integration branch and one PR after Kimi's lane is fully reviewed.

## Kimi Capability UI Lane Reconciled

Kimi added a reusable Settings/Profile capability rendering layer:

- `apps/app/src/react-app/domains/settings/backend-capabilities/`
- `apps/app/src/react-app/domains/profile/profile-capability-status.tsx`
- `apps/app/tests/backend-capability-ui.test.ts`
- `apps/app/tests/settings-overview-ui.test.ts`
- `docs/handoffs/kimi-backend-capability-ui-2026-07-06.md`

Codex reconciliation after reading Kimi's handoff:

- Kept Kimi's rendering layer and fixtures.
- Shared status vocabulary now delegates through `apps/app/src/react-app/domains/settings/backend-capability-status.ts`.
- `error` renders as `Unavailable` for user-facing UI consistency.
- `useBackendCapabilities({ source: "fetch", client })` now calls `client.backendCapabilities()` instead of reporting that backend fetch is not wired.
- Updated Kimi tests to enforce the reconciled behavior.

Verification after Kimi reconciliation:

```bash
bun test apps/app/tests/backend-capability-ui.test.ts apps/app/tests/settings-overview-ui.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
# 43 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
# pass

bun test apps/app/tests
# 231 pass, 0 fail

bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/memory-routes.e2e.test.ts apps/server/src/project-evidence-routes.e2e.test.ts
# 44 pass, 0 fail

git diff --check
# pass
```
