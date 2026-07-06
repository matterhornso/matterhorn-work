# Platform UI/UX Cleanup Handoff

**Current integration branch:** `codex/evidence-ui-integration`
**Date:** 2026-07-05
**Base at start:** `kimi/outputs-unification-v1` at `c47a5c7b` plus uncommitted WorkflowStageCard integration work.
**Current base commit:** `f34f39d7` (`kimi/platform-shell-ui-cleanup`) with Kimi's platform shell + shared shadcn cleanup committed.

## Goal

Start a broad UI/UX cleanup across Matterhorn Work while preserving the active parallel-agent work:

- Kimi Outputs unification.
- Minimax WorkflowStageCard work.
- Existing untracked scratch and parallel-agent files.

The design direction is restrained product UI: familiar shadcn/Base primitives, compact task surfaces, modest radii, simple borders, readable hierarchy, and no decorative glass/gradient/default AI dashboard styling.

## Prompts Handed To Parallel Agents

- Kimi lane: platform shell, navigation, and shared shadcn primitives.
- Minimax lane: evidence surfaces, Project Activity, Memory review, Outputs, Notes, and workflow stage cards.

Codex took the integration and first primitive cleanup lane.

## Codex Changes In This Pass

### Branching

- Created `codex/platform-ui-ux-cleanup` from the dirty `kimi/outputs-unification-v1` checkout.
- Kimi later moved the active shared checkout to `kimi/platform-shell-ui-cleanup` and committed the platform shell cleanup at `f34f39d7`.
- Created `codex/evidence-ui-integration` from `f34f39d7` so the remaining Project Activity + WorkflowStageCard integration can be finalized on a Codex-owned branch.
- Did not delete or clean untracked scratch files.

### Shared UI Primitive Cleanup

Updated shared shadcn/Base primitives to reduce over-rounded/glass defaults and make the system feel more product-native:

- `apps/app/src/components/ui/button.tsx`
  - Replaced `rounded-4xl`, pseudo-shadow decoration, and translate active effects with simple shadcn-style button states.
  - Standardized default, outline, secondary, ghost, destructive variants.
- `apps/app/src/components/ui/card.tsx`
  - Replaced `rounded-4xl` cards with `rounded-lg`.
  - Replaced default ring/shadow styling with a simple border.
- `apps/app/src/components/ui/badge.tsx`
  - Replaced full-pill badges with modest rounded badges.
- `apps/app/src/components/ui/dropdown-menu.tsx`
  - Removed forced `dark`, glass blur, decorative pseudo-elements, and `rounded-3xl`.
  - Normalized menu content and item radii.
- `apps/app/src/components/ui/context-menu.tsx`
  - Same cleanup as dropdown menu.
- `apps/app/src/components/ui/select.tsx`
  - Removed over-rounded/glass select trigger/content defaults.
  - Normalized option rows.
- `apps/app/src/components/ui/dialog.tsx`
  - Removed blur overlay and `rounded-4xl`.
  - Standardized dialog content to bordered `rounded-lg` with simple shadow.
- `apps/app/src/components/ui/sheet.tsx`
  - Removed blur overlay and simplified motion distances/shadow.
- `apps/app/src/components/ui/input.tsx`
  - Removed pseudo-element shadow decoration.
  - Standardized border, focus ring, invalid, disabled states.
- `apps/app/src/components/ui/textarea.tsx`
  - Same cleanup as input.
- `apps/app/src/components/ui/toggle.tsx`
  - Replaced `rounded-3xl` and ring-3 with simpler states.
- `apps/app/src/components/ui/toggle-group.tsx`
  - Replaced outline group `rounded-3xl` with `rounded-md`.

### Project Activity Integration

The Project Activity branch is now integrated in the live working tree:

- `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`
- `apps/app/src/react-app/domains/recent-activity/recent-activity-types.ts`
- `apps/app/tests/recent-activity-contract.test.ts`
- `apps/app/tests/recent-activity-normalize.test.ts`
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`
- `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`

Codex fixed integration bugs and UI issues after typecheck/browser smoke:

- `recent-activity-section.tsx` now imports `MatterhornServerClient` and `formatRelativeTime` from `../../../app/...` instead of `../../../../app/...`.
- Home/Settings visible copy now says `Project Activity` instead of `Recent Activity`.
- Project Activity ISO timestamps now pass milliseconds to `formatRelativeTime`; the previous `/ 1000` conversion rendered dates as `1970`.
- Settings Task History now passes `run.updatedAt` milliseconds directly to `formatRelativeTime`.
- `RecentActivitySection` uses the shared `Badge` primitive and a quieter row treatment.

The current live `session-page.tsx` preserves Kimi Outputs behavior:

- User-facing rail label remains `Outputs`.
- `ArtifactPanel` still receives `onRevealPath={props.onRevealPath}`.
- `RecentActivitySection` is rendered on workspace Home.
- `WorkflowStageCard` replaces raw prompt task lists.

### Workflow Stage UX Integration

Codex tightened the WorkflowStageCard integration:

- `workflow-stage-card.tsx`
  - Uses shared `Button` and `Badge` primitives.
  - Uses modest `rounded-lg` / `rounded-md` shapes.
  - Keeps raw prompts collapsed behind `Show technical prompt`.
  - Reflows status/actions below the title on narrow screens, preventing skinny title/objective wrapping.
- `desk-workflow-stage-panel.tsx`
  - Uses shared `Button` for Quick Jot and next action controls.
  - Removes uppercase/tracked mini-label styling from required inputs, optional context, and expected outputs.
  - Reduces large rounded boxes in the workflow support panels.
- `session-page.tsx`
  - Flattens the protocol desk intro.
  - Removes the floating `Choose a task, then review it with the agent` helper pill.
  - Keeps Matterhorn shell navigation visible while desks are open.

### Memory Review Simplification

Started the next recommended work item and simplified the Memory surface into a review-first queue:

- `apps/app/src/react-app/domains/memory/memory-panel.tsx`
  - Header now reads `Memory` with one compact line: `Review suggestions before saving.`
  - Removed repeated `No hidden memory`, `No hidden save`, lifecycle state, confidence-meter, and available-action explanation boxes from the main card flow.
  - Default filter is now `Needs review`; filters are `Needs review`, `Saved`, `Not saved`, and `All` with counts.
  - Suggestion cards now show text-only badges, title/summary, source/scope/dismissal-window metadata, and text actions: `Remember`, `Edit`, `Dismiss`.
  - `Why suggested` and desk-boundary details moved into a collapsed details block.
  - Blocked suggestions render only `Blocked by policy` plus a short safe reason; proposed content stays hidden.
  - Manual capture moved into a collapsed `Add memory manually` disclosure below `Saved memories`.
  - Empty saved-memory state now says `No saved memories yet` and does not point to manual capture unless the disclosure is open.
- `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`
  - Added a compact `Memory` settings card with pending suggestion count, saved-memory count, `Open Memory review`, and `Export memory`.
  - `Open Memory review` writes the session side-panel state and returns to the workspace session with the Memory panel open.
- `apps/app/src/react-app/shell/ui-state-store.ts`
  - Exports `GLOBAL_HOME_SIDE_PANEL_KEY` so Settings and Session share the same Memory rail target.
- `apps/app/tests/memory-panel-ui-contract.test.ts`
  - Locks the new review-first Memory surface and Settings Memory wiring.

### Workflow Output Receipts In Outputs

Started the next recommended Outputs unification item and connected workflow evidence to the Outputs rail:

- `apps/app/src/react-app/domains/session/artifacts/output-receipts.ts`
  - New receipt normalization helper.
  - Converts `task.output_saved`, `task.completed`, `task.failed`, and `task.cancelled` Project Activity evidence into per-output workflow receipts.
  - Creates previewable `OpenTarget` rows from receipt paths without adding a backend schema.
  - De-duplicates by output path and prefers direct `task.output_saved` receipts over broader completion events.
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`
  - Fetches `listProjectEvidence(outputReceiptWorkspaceId, { limit: 200 })`.
  - Merges receipt-derived output targets with message-discovered output targets.
  - Exposes the merged output targets to the Outputs rail and command palette so both surfaces count the same files.
- `apps/app/src/react-app/domains/session/artifacts/artifact-panel.tsx`
  - Accepts `outputReceipts` and annotates listed outputs with receipt metadata.
  - Adds a compact `Workflow receipt` metadata row for the selected output when evidence exists.
  - Fixes row actions so `Open output` and `Reveal in folder` act on the clicked row, not only the currently selected preview.
- `apps/app/src/react-app/domains/session/artifacts/output-list.tsx`
  - Shows a quiet `Receipt: Saved/Completed/Failed/Cancelled` marker and receipt title on output rows.
- `apps/app/src/react-app/domains/session/artifacts/output-descriptor.ts`
  - Carries receipt status, title, summary, task id, and artifact count.
- `apps/app/src/react-app/domains/session/artifacts/open-target.ts`
  - Treats text-like files as collectible outputs, which lets JSON/text receipts appear in Outputs.
- Tests:
  - `apps/app/tests/output-receipts.test.ts`
  - `apps/app/tests/output-descriptor.test.ts`
  - `apps/app/tests/outputs-panel-contract.test.ts`

## Verification

```bash
bun test apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/recent-activity-contract.test.ts
```

Result: 33 pass, 0 fail.

```bash
bun test apps/app/tests/workflow-stage-card.test.ts apps/app/tests/desk-workflow-stage-panel.test.ts
```

Result: 30 pass, 0 fail.

```bash
bun test apps/app/tests/artifact-note-context.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts
```

Result: 11 pass, 0 fail.

```bash
bun test apps/app/tests/notes-integration-contract.test.ts apps/app/tests/notes-store.test.ts apps/app/tests/quick-jot-sheet.test.ts apps/app/tests/notes-helpers.test.ts
```

Result: 27 pass, 0 fail.

Combined evidence/workflow/output pass:

```bash
bun test apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/recent-activity-contract.test.ts apps/app/tests/workflow-stage-card.test.ts apps/app/tests/desk-workflow-stage-panel.test.ts apps/app/tests/artifact-note-context.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts
```

Result: 74 pass, 0 fail.

```bash
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

Result: passed.

Latest combined focused run after the Project Activity timestamp and workflow card responsive fixes:

```bash
bun test apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/recent-activity-contract.test.ts apps/app/tests/workflow-stage-card.test.ts apps/app/tests/desk-workflow-stage-panel.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts apps/app/tests/outputs-panel-contract.test.ts apps/app/tests/artifact-note-context.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/notes-integration-contract.test.ts apps/app/tests/notes-store.test.ts apps/app/tests/quick-jot-sheet.test.ts apps/app/tests/notes-helpers.test.ts
```

Result: 111 pass, 0 fail.

Latest typecheck after all integration fixes:

```bash
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

Result: passed when the preserved numbered scratch files were temporarily hidden, then restored.

Latest Outputs receipt focused run:

```bash
bun test apps/app/tests/output-receipts.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts
```

Result: 15 pass, 0 fail.

Latest combined evidence/workflow/memory/output/notes run:

```bash
bun test apps/app/tests/output-receipts.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts apps/app/tests/artifact-note-context.test.ts apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/recent-activity-contract.test.ts apps/app/tests/workflow-stage-card.test.ts apps/app/tests/desk-workflow-stage-panel.test.ts apps/app/tests/memory-panel-ui-contract.test.ts apps/app/tests/notes-integration-contract.test.ts apps/app/tests/notes-store.test.ts apps/app/tests/quick-jot-sheet.test.ts apps/app/tests/notes-helpers.test.ts
```

Result: 117 pass, 0 fail.

Latest typecheck after workflow output receipts:

```bash
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

Result: passed when the preserved numbered scratch files were temporarily hidden, then restored.

Latest Playwright browser smoke against the running local app:

- UI: `http://127.0.0.1:5175`
- Local server: `http://127.0.0.1:4105`
- Workspace route: `http://127.0.0.1:5175/workspace/ws_d52295617e23/session`
- Home desktop:
  - `Project Activity` visible.
  - No `1970` timestamps.
  - No `Artifacts and files` regression.
  - No horizontal overflow.
- Bittensor desk desktop/mobile:
  - Workflow stage cards render.
  - `Show technical prompt` appears 4 times and prompts remain collapsed.
  - Floating helper pill removed.
  - No horizontal overflow.
  - Mobile title/objective wrapping fixed.
- Screenshots:
  - `/tmp/matterhorn-evidence-integration-smoke/home.png`
  - `/tmp/matterhorn-evidence-integration-smoke/bittensor.png`
  - `/tmp/matterhorn-memory-review-smoke/memory-panel.png`
  - `/tmp/matterhorn-memory-review-smoke/settings-open-memory.png`
  - `/tmp/matterhorn-ui-cleanup-smoke/home-desktop-final.png`
  - `/tmp/matterhorn-ui-cleanup-smoke/bittensor-desktop-final.png`
  - `/tmp/matterhorn-ui-cleanup-smoke/bittensor-mobile-final.png`

Memory review smoke:

- Session Memory rail opens with the new `Memory` header, `Memory review` filters, `Saved memories`, and collapsed `Add memory manually`.
- Old `No hidden memory` / `No hidden save` visible badges and lifecycle/action explanation copy are gone.
- Settings Overview shows the Memory card, and `Open Memory review` returns to the workspace session with Memory open.
- No horizontal overflow in the Memory panel or Settings-opened Memory view.

Outputs receipt smoke:

- Session route opens at `http://127.0.0.1:5175/workspace/ws_d52295617e23/session`.
- Outputs rail button is visible and opens the Outputs panel.
- No horizontal overflow.
- The local workspace used for smoke did not currently have visible workflow receipt rows, so receipt-specific behavior is covered by unit/contract tests rather than this live smoke.
- Screenshots:
  - `/tmp/matterhorn-output-receipts-smoke/session-shell.png`
  - `/tmp/matterhorn-output-receipts-smoke/outputs-panel.png`

## Current Open Work

- Project Activity, WorkflowStageCard, and Memory review simplification are integrated on `codex/evidence-ui-integration`.
- Kimi's shell lane is committed; re-run `git status --short --branch` before committing because this checkout still contains preserved numbered scratch files.
- More cleanup remains in feature surfaces:
  - Composer card and action buttons still use large rounded/full-pill styling.
  - Settings pages still contain many uppercase tracked labels and pill tags.
  - Some session/home surfaces still use gradient or glass treatments.
  - Workflow output receipts are now wired into Outputs from Project Activity evidence; a later pass can add richer task-level filtering if product wants it.

## Recommended Next Step

Re-run status, reconcile any latest Kimi/Minimax edits, then continue the platform cleanup from the next product gap:

- Add fuller Project Activity drill-throughs from activity rows to Notes, Memory review, or Outputs.
- Or continue the broad UI cleanup in composer/settings surfaces where the older rounded/pill treatment is still visible.

Keep using the current tests:

```bash
bun test apps/app/tests/memory-panel-ui-contract.test.ts apps/app/tests/memory-suggestion-producers.test.ts
bun test apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/recent-activity-contract.test.ts
bun test apps/app/tests/workflow-stage-card.test.ts apps/app/tests/desk-workflow-stage-panel.test.ts
bun test apps/app/tests/output-receipts.test.ts
bun test apps/app/tests/artifact-note-context.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/outputs-panel-contract.test.ts
bun test apps/app/tests/notes-integration-contract.test.ts apps/app/tests/notes-store.test.ts apps/app/tests/quick-jot-sheet.test.ts apps/app/tests/notes-helpers.test.ts
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```
