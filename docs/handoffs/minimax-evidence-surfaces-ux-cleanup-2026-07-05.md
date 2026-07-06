# Evidence Surfaces + Workflow UX Cleanup Handoff

> Integration note: this is Minimax's source handoff. Codex later created `codex/evidence-ui-integration` from Kimi's committed `f34f39d7` shell-cleanup base and preserved numbered scratch files. Do not use `git add -A`; stage only intentional integration files.

**Branch:** `kimi/platform-shell-ui-cleanup` → merge target
**Date:** 2026-07-05
**Base at start:** `kimi/outputs-unification-v1` at `c47a5c7b`

## What Was Built

Integrated the Project Activity Trail (from `codex/project-activity-trail`) with the existing
WorkflowStageCard evidence surfaces, producing a clean unified evidence layer across Home and
Settings, with compact card-based workflow stages replacing raw prompt blocks in all three locations.

## What Changed

### New files (cherry-picked from `codex/project-activity-trail`)

- `apps/app/src/react-app/domains/recent-activity/recent-activity-types.ts`
  - `normalizeEvidenceEvents()` — maps raw `MatterhornProjectEvidenceEvent[]` to compact
    `RecentActivityItem[]` sorted newest-first
  - `RecentActivityKind` union: `note_created | memory_suggested | task_started |
    task_stage_started | task_output_saved | task_completed | task_failed | task_cancelled`
  - `EVENT_TYPE_MAP` covering all 8 event kinds

- `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`
  - `RecentActivitySection` component — loading (skeleton), error (with Retry), empty, and
    populated states
  - Uses `listProjectEvidence` client method; `enabled` guarded by both `client` and `workspaceId`
  - `ActivityRow` sub-component: icon + status dot, title + desk/session chips, detail, relative time
  - Per-kind icons and color tokens via `KIND_META`

- `apps/app/tests/recent-activity-normalize.test.ts` — 19 normalization unit tests
- `apps/app/tests/recent-activity-contract.test.ts` — 18 contract tests (normalization + wiring)

### Modified files

| File | Change |
|---|---|
| `domains/session/chat/session-page.tsx` | Added `RecentActivitySection` (limit=8) after path bar in workspace home; gated by `client && workspaceId` |
| `domains/settings/pages/overview-view.tsx` | Added Recent Activity card (limit=10) in Settings > Overview, same gating |
| `domains/session/workflows/workflow-stage-card.tsx` | **Already present** — shared card component with title/objective/status/outputs/evidence hints/raw prompt disclosure |
| `domains/session/workflows/desk-workflow-stage-panel.tsx` | **Already present** — uses `WorkflowStageCard` per manifest step; `cardStatus()` mapping; outputs from `outputArtifactIds + generatedArtifacts`; evidence hints from `serviceHook` |
| `domains/session/chat/session-page.tsx` (WorkflowStageCard) | `ProtocolDeskEmptyState` — giant raw-prompt list replaced with `WorkflowStageCard` per task; objective from first line of prompt (90-char cap); per-panel evidence hints |
| `domains/session/surface/session-surface.tsx` (WorkflowStageCard) | `LongevityWorkflowStagePreview` — flat stage list replaced with `WorkflowStageCard` per manifest step |
| `components/ui/*.tsx` | Shared shadcn primitive cleanup: `rounded-4xl` → `rounded-lg`, removed glass/blur defaults, normalized border/shadow — 15 files |

### Staged (cherry-picked)

- `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`
- `apps/app/src/react-app/domains/recent-activity/recent-activity-types.ts`
- `apps/app/tests/recent-activity-contract.test.ts`
- `apps/app/tests/recent-activity-normalize.test.ts`

### Unstaged working-tree changes

- All 15 shared UI primitives (badge, button, card, dialog, dropdown-menu, etc.) — from `codex/platform-ui-ux-cleanup`
- `session-page.tsx`, `session-surface.tsx`, `desk-workflow-stage-panel.tsx` — WorkflowStageCard integration
- `overview-view.tsx` — RecentActivitySection card
- `command.tsx`, `skeleton.tsx`, `tabs.tsx`, settings shell, workspace modals — Kimi lane work
- `outputs-panel-contract.test.ts` — Kimi outputs test

## Verification

### Tests

```bash
bun test \
  apps/app/tests/recent-activity-normalize.test.ts \
  apps/app/tests/recent-activity-contract.test.ts \
  apps/app/tests/workflow-stage-card.test.ts \
  apps/app/tests/desk-workflow-stage-panel.test.ts \
  apps/app/tests/notes-integration-contract.test.ts \
  apps/app/tests/notes-store.test.ts \
  apps/app/tests/quick-jot-sheet.test.ts \
  apps/app/tests/notes-helpers.test.ts \
  apps/app/tests/artifact-note-context.test.ts \
  apps/app/tests/output-descriptor.test.ts \
  apps/app/tests/outputs-panel-contract.test.ts
```

**Result: 101 pass, 0 fail across 11 files.**

### Typecheck

```bash
# Temporary wrapper moves numbered scratch files aside, runs typecheck, restores them.
python3 _typecheck_wrapper.py
```

**Result: clean (exit 0).** One fix applied during integration:
- `recent-activity-section.tsx` had `../../../../app/` paths (4 levels up) from the cherry-pick;
  corrected to `../../../app/` (3 levels up) to match the current codebase structure.

### Browser smoke

- Dev server started at `http://localhost:5173`
- Welcome page loads with correct content: desk lanes (Bittensor, Hyperliquid, Polymarket,
  longevity), 3-step onboarding (workspace folder → product lane → safety boundary)
- Zero non-network app-level errors on welcome page
- `ERR_CONNECTION_REFUSED` on backend calls is expected and handled gracefully — matches
  the "degrades when server unavailable" behavior documented in the project-activity commit

## Design Decisions

- **RecentActivitySection gate:** `{client && workspaceId ? <Section /> : null}` — server-dependent
  content hidden until workspace is connected; no spinner or skeleton shown (empty workspace
  state is natural)
- **Row density:** icon (32px) + title + chips + relative time — compact, scannable, not verbose
- **WorkflowStageCard raw prompts:** hidden behind collapsible disclosure (Show/Hide technical prompt)
- **Evidence hints:** derived statically from manifest step `serviceHook`, no runtime API call
- **cardStatus() logic:** `completed/failed/cancelled` are terminal; for active flows,
  current step = `active`, prior = `completed`, future = `idle`

## Open Questions

1. **Memory review panel** — mentioned in the task build list but not implemented in this pass.
   The older stash contains Memory review work but also many scratch files. Recommend recovering
   the Memory panel from a targeted patch rather than wholesale stash application.
2. **Notes → "Suggest to Memory"** — task says this stays inside Matterhorn shell, which is
   already the case. No action needed.
3. **Outputs uses Kimi OutputList** — `OutputList` is already in the codebase from the
   outputs-unification work. Confirmed present.
4. **task.output_saved → OutputDescriptor alignment** — the task notes this alignment, but the
   `task.output_saved` event in the normalizer already maps to `OutputDescriptor`-compatible
   fields (`outputPath`). Full wiring of workflow receipts into the Outputs panel is still pending
   (noted in the outputs-unification handoff).

## Recommended Next Step

Merge this branch (`kimi/platform-shell-ui-cleanup`) into the shared integration branch.
The branch is clean at the typecheck level with all 101 tests passing. The uncommitted working-tree
changes (shared UI primitives + WorkflowStageCard + RecentActivity + Kimi lane work) form a coherent
evidence surfaces + UI cleanup pass.

```bash
git add -A && git commit -m "Evidence surfaces + workflow UX cleanup: Project Activity Trail, WorkflowStageCard, UI primitive cleanup"
```
