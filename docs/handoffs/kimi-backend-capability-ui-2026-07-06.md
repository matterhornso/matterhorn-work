# Backend Capability UI Consumption Handoff

Date: 2026-07-06
Branch: `kimi/backend-capability-ui`
Base: `codex/backend-control-plane` (commit `3b01ad43`)

## Lane objective

Own the Settings/Profile UI consumption layer for the Matterhorn Backend Control Plane without implementing server routes. Reuse the backend contract in `packages/types/src/backend-capabilities.ts` and the existing status helpers where they already exist.

## Files changed

### New UI rendering layer / fixtures

- `apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-helpers.ts`
  - Status label/tone helpers, capability summary, wallet-family copy, memory-scope copy, feedback copy.
- `apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-fixtures.ts`
  - `working`, `needsSetup`, `preview`, `unsupported`, `error` fixture responses.
- `apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-status.tsx`
  - `BackendCapabilityStatusBadge`, `BackendCapabilityStatusRow`.
- `apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-section.tsx`
  - `BackendCapabilitiesSection` renders a full capability response.
- `apps/app/src/react-app/domains/settings/backend-capabilities/use-backend-capabilities.ts`
  - `getBackendCapabilitiesResult` (pure) and `useBackendCapabilities` hook.
  - Defaults to `source: "mock"` for fixture-driven tests.
  - `source: "fetch"` now requires a real `MatterhornServerClient` and calls `client.backendCapabilities()`.
- `apps/app/src/react-app/domains/settings/backend-capabilities/index.ts`
  - Public exports for the domain.
- `apps/app/src/react-app/domains/profile/profile-capability-status.tsx`
  - `ProfileCapabilityStatus` component for profile-side capability state.

### Tests

- `apps/app/tests/backend-capability-ui.test.ts`
  - 26 tests covering helpers, fixtures, badge rendering, section states, profile states, and the result resolver.
- `apps/app/tests/settings-overview-ui.test.ts`
  - Contract tests for Settings overview backend capability integration and rendering-layer file existence.

### Updated Settings overview integration

- `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`
  - Imports existing helpers from `../backend-capability-status`.
  - Adds `useQuery` hooks for `client.backendCapabilities()` and `client.workspaceDataMap(workspaceId)`.
  - Adds a **Backend status** card (model routing, notes/memory, evidence, wallet families, teams, write guards).
  - Updates **Privacy & Data** to render workspace data-map rows (chat, notes, memory, outputs, training use) when available, falling back to local-first copy.
  - Keeps existing Profile, Task History, Project Activity, Memory, Notes, Appearance, Safety & Wallets, Protocols, MCPs, Workspaces, Beta Diagnostics, and About sections untouched except for the StatusBadge tone type update.

## Product-truth copy preserved

- Default model is `opencode/big-pickle`.
- Memory is labeled **Machine / global** unless the backend reports `workspace` scope.
- EVM wallet is **Direct connect**; Bittensor is **Public read / external signer** with no custody.
- Sui wallet is **Not supported yet**.
- Feedback is **Feedback link** / **Not supported here** unless the backend reports structured feedback.
- Privacy & Data falls back to local-first copy when no data-map is available.

## Verification

```bash
bun test apps/app/tests
# 231 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
# success
```

## Codex reconciliation update

After Codex wired the real backend route and app client:

- `backend-capabilities/backend-capability-helpers.ts` now delegates status labels, tones, and summaries to the shared `domains/settings/backend-capability-status.ts` helper so the Settings overview, Wallet page, and Kimi rendering layer use one vocabulary.
- Error status renders as user-facing `Unavailable`, matching the live Settings surface.
- `use-backend-capabilities.ts` no longer says backend fetch is not wired; `source: "fetch"` calls `client.backendCapabilities()` when a client is supplied.
- `apps/app/tests/backend-capability-ui.test.ts` was updated to assert the reconciled behavior.

Verification after reconciliation:

```bash
bun test apps/app/tests/backend-capability-ui.test.ts apps/app/tests/settings-overview-ui.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
# 43 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
# pass
```

## Overlap / parallel-lane notes

The branch already contained work from other lanes:

- `apps/app/src/app/lib/matterhorn-server.ts` — adds `backendCapabilities()` and `workspaceDataMap()`.
- `apps/app/src/react-app/domains/settings/backend-capability-status.ts` — existing status helpers (`backendCapabilityLabel`, `backendCapabilityTone`, `walletFamilySummary`, `storageLocationLabel`, `workspaceDataPolicySummary`, etc.).
- `apps/app/tests/backend-capability-ui-contract.test.ts` — existing contract tests.
- `apps/app/src/react-app/domains/settings/pages/wallet-view.tsx`, `apps/app/src/react-app/shell/settings-route.tsx`, `packages/types/src/profile-readiness.ts` — related modifications from other lanes.

This handoff's new files live in `backend-capabilities/` (plural) and `profile/` to avoid overwriting the existing helper file. The overview integration consumes the existing helpers, so both layers coexist cleanly.

## Next steps / risks

- The `useBackendCapabilities` hook still defaults to mock fixtures for isolated UI tests. Production callers should pass `source: "fetch"` with a real Matterhorn server client.
- Consider consolidating the two helper layers (`backend-capability-status.ts` and `backend-capabilities/backend-capability-helpers.ts`) after the backend contract stabilizes.
- No server routes, auth, memory-write hardening, or data-map implementation were changed.
