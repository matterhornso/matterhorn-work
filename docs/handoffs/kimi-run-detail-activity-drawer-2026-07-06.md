# Kimi — Run Detail Drawer & Project Activity Cleanup

**Branch:** `kimi/run-detail-activity-drawer`
**Date:** 2026-07-06
**Base:** Existing platform/evidence integration work already on the branch.

## Scope

Build the Run Detail Drawer and clean Project Activity interactions so users can understand whether activity rows represent real tasks, when they started, whether they completed, and whether outputs exist.

## What Changed

### `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`

- Activity rows remain clickable and open the existing shadcn `Sheet` drawer.
- Drawer shows:
  - Event title
  - Desk (normalized via `deskLabel`)
  - Session id / slug and task id (run id)
  - Source type
  - Absolute timestamp and relative timestamp
  - Status line
  - Output receipts when available (with `onOpenOutputPath` bridge on Home)
  - Failure detail section for `task.failed` events
- Start-only task copy now follows the honest pattern requested by product:
  - Row title: `"Run started"` / `"Stage started"`
  - Status: `"No output recorded yet."`
  - Explanation: `"This may still be running or may have ended without a saved receipt."`
- Activity list styling cleaned:
  - No bordered cards per row.
  - No decorative badges.
  - Compact rows with subtle hover.
  - No giant explanatory panels; start-only note is plain text.
- Raw prompts are not exposed anywhere in the drawer.
- States are not invented: start-only logic is based solely on `task.started` / `task.stage_started` with no related output receipts.

### `apps/app/tests/recent-activity-contract.test.ts`

- Updated the drawer contract test to expect:
  - `"Run started"`
  - `"No output recorded yet."`
  - `"This may still be running or may have ended without a saved receipt."`
  - `"Failure detail"`
- Added focused tests:
  - `ActivityDetailSheet does not expose raw prompt fields`
  - `ActivityDetailSheet labels failed runs with failure detail section`

## Files Changed

- `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`
- `apps/app/tests/recent-activity-contract.test.ts`

## Tests Run

```bash
bun test apps/app/tests/recent-activity-contract.test.ts apps/app/tests/recent-activity-normalize.test.ts
```

Result: **38 pass, 0 fail**.

```bash
pnpm typecheck
```

Result: **passed**.

```bash
pnpm build:ui
```

Result: **passed**.

```bash
pnpm dev:ui
```

Result: Vite dev server starts on `http://localhost:5173/`.

## Browser Smoke

- Build and dev server start cleanly.
- Live browser smoke with real Project Activity rows requires a running Matterhorn Work server; no screenshots were captured in this environment because the local backend was not started.
- Existing wiring keeps Project Activity inside:
  - Home: `apps/app/src/react-app/domains/session/chat/session-page.tsx`
  - Settings Overview: `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`

## Unresolved API Limitations

- The Project Evidence API does not expose a dedicated error field; failure detail is rendered from the event `summary` ( surfaced as `item.detail` ).
- Start-only honesty is limited by what the server returns: if only `task.started` exists, the UI cannot know whether the run is still in flight or ended silently.
- The drawer does not invent `completed`, `failed`, or `output_saved` states; it only reflects available evidence.
