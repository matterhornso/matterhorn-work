# Engine Task Flow Polish — Handoff

**Branch:** `minimax/engine-task-flow-polish`
**Base:** `codex/evidence-ui-integration`
**Date:** 2026-07-06

---

## What changed

### Scope A: Local Engine Reliability

#### New shared component

**`domains/shell/error-state.tsx`** — `ErrorState` + `EmptyState`

Replaces inconsistent error banners across all server-dependent panels with a single, classified component.

- Classifies errors automatically as `connection` / `server` / `unknown`
- Shows canonical copy per class:
  - **connection** → "Matterhorn Work engine is offline" + "Check that Matterhorn Work is running..."
  - **server** → "Workspace server did not respond" + "The server returned an error..."
  - **unknown** → "Could not load" + "Something went wrong. Try again."
- Icon-only refresh button (no heavy Retry box)
- Supports `tone="memory"` variant (amber palette) for memory panel sections
- Handles both `Error` objects and plain string error messages

#### Updated domains

| File | Change |
|---|---|
| `domains/notes/notes-page.tsx` | Error banner replaced with `ErrorState`; `refresh` destructured from store; loading bar kept separate |
| `domains/notes/notes-store.ts` | "Matterhorn server is not connected." → "Matterhorn Work engine is offline. Check that Matterhorn Work is running..." |
| `domains/memory/memory-panel.tsx` | Two amber error boxes replaced with `ErrorState tone="memory"`; copy trimmed to "Could not load memory" / "Could not load memory review" |
| `domains/recent-activity/recent-activity-section.tsx` | Verbose red error box replaced with `ErrorState`; title "No activity recorded yet"; raw error message as detail |
| `domains/session/artifacts/preview.tsx` | `PreviewError` refactored to wrap `ErrorState` with title "Could not load outputs" |
| `domains/wallet/hooks/useTokenPrices.ts` | "Failed to fetch prices" → "Could not load token prices." |
| `domains/settings/state/extensions-store.ts` | "Failed to fetch hub catalog" → "Could not load extensions catalog" |

**Already good (no changes needed):**
- `session-route.tsx` — already shows "Matterhorn Work engine unavailable" as toast title; `describeTaskCreateError` already converts generic "failed to fetch" to user-friendly copy
- `session-page.tsx` — already shows "Matterhorn Work engine is unavailable..." in the workflow launch error state

### Scope B: Task Start Flow Polish

#### Desk task cards (`ProtocolDeskEmptyState` in `session-page.tsx`)

- **Removed** `requiresExternalSigner` and `requiresCustomerConfirmation` props from `WorkflowStageCard` — safety badges were redundant with the prominent boundary notice at the top of the section
- Evidence hints (e.g. "reads: public SS58 and subnet context") kept — they describe what the agent reads, not technical scaffolding

#### Desk workflow stage panel (`desk-workflow-stage-panel.tsx`)

- **Removed** verbose "Standardized workflow" header + explanatory sentence ("The agent runs these stages. The composer only carries your public context.")
- Replaced with a single muted stage count label (e.g. "4 stages") — less framing, same information

#### `WorkflowStageCard` (shared component)

- Already does not show "Ready" badge for idle status (returns `null`)
- No numbered markers (01/02/03) present — already clean
- No "Dedicated agent" or "External review" labels present — already clean
- Giant prompt disclosures not rendered in the card — already clean
- "Start task" is already the primary action label

---

## Files changed

| File | Change |
|---|---|
| `domains/shell/error-state.tsx` | **NEW** — `ErrorState` + `EmptyState` shared component |
| `domains/notes/notes-page.tsx` | Uses `ErrorState` for error banner |
| `domains/notes/notes-store.ts` | Updated "not connected" error copy |
| `domains/memory/memory-panel.tsx` | Two error boxes → `ErrorState`; trimmed copy |
| `domains/recent-activity/recent-activity-section.tsx` | Error box → `ErrorState`; removed unused `Button` + `RefreshCw` imports |
| `domains/session/artifacts/preview.tsx` | `PreviewError` uses `ErrorState` |
| `domains/wallet/hooks/useTokenPrices.ts` | "Failed to fetch prices" → "Could not load token prices." |
| `domains/settings/state/extensions-store.ts` | Hub catalog error copy improved |
| `domains/session/chat/session-page.tsx` | Removed safety badges from task cards |
| `domains/session/workflows/desk-workflow-stage-panel.tsx` | Trimmed verbose "Standardized workflow" section header |

---

## Tests

```bash
# Focused
bun test \
  apps/app/tests/workflow-stage-card.test.ts \
  apps/app/tests/notes-integration-contract.test.ts \
  apps/app/tests/memory-panel-ui-contract.test.ts

# Full suite
bun test apps/app/tests/

# Typecheck
npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

**Results:**
- 186 tests pass, 0 fail (full suite)
- Typecheck: PASS

---

## Browser smoke checklist

- [ ] Task cards show "Start task" as primary action — no "Ready" badge visible
- [ ] Notes error state shows "Matterhorn Work engine is offline" (not raw fetch error)
- [ ] Memory panel error states use consistent amber-toned `ErrorState`
- [ ] Recent activity error shows "No activity recorded yet" + retry icon
- [ ] Outputs panel error shows "Could not load outputs" (not raw "Failed to load")
- [ ] Refresh controls are icon-only (no heavy boxed Retry button) in normal panels

---

## Remaining reliability gaps (lower priority)

1. **`useTokenPrices`** — the catch block at line 38 sets "Network error" as a plain string. The `ErrorState` won't classify this as connection (it doesn't match patterns). Acceptable for now since wallet prices are non-critical.
2. **MCP status banner** (`mcp-view.tsx`) — already has specific copy; no generic "Failed to fetch" found.
3. **Extension catalog** — the `extensions-store.ts` catch block may return other error messages not covered by the updated throw. Low risk since this is settings-only.
4. **Session shell scratch files** (`session-route [0-9]+.tsx`) — contain "failed to fetch" pattern detection; these are backup copies and should eventually be reconciled with the real `session-route.tsx`.
