# Codex Evidence Run Detail Integration - 2026-07-06

## Branch / State

- Current checkout branch during this slice: `minimax/engine-task-flow-polish`.
- This was intentionally kept as a narrow integration patch on top of the live dirty tree.
- Untracked scratch / parallel-agent files were not deleted or cleaned.

## What Changed

- `RecentActivitySection` rows are now clickable and open a shadcn `Sheet` with event detail.
- The detail sheet shows:
  - user-facing activity title,
  - absolute recorded time,
  - relative time,
  - desk,
  - session id / slug,
  - task id,
  - event id,
  - source,
  - related output paths when available.
- Start-only task rows now use clearer copy:
  - row: `Bittensor run started`, `Longevity run started`, etc.
  - detail: `No output recorded yet.`
  - explanation: the event is real, but no completion or output receipt was found in the current activity window.
- Home Project Activity can now open matching output paths in the existing Outputs rail via `onOpenOutputPath`.
- `RecentActivityItem` now preserves source/session/output metadata from the server event.
- Output descriptors now prefer workflow receipt desk/session/task/timestamp metadata over path-only inference.

## Files Touched In This Slice

- `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`
- `apps/app/src/react-app/domains/recent-activity/recent-activity-types.ts`
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`
- `apps/app/src/react-app/domains/session/artifacts/output-descriptor.ts`
- `apps/app/tests/recent-activity-contract.test.ts`
- `apps/app/tests/recent-activity-normalize.test.ts`
- `apps/app/tests/output-descriptor.test.ts`

## Verification

- `bun test apps/app/tests/recent-activity-contract.test.ts apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/output-receipts.test.ts apps/app/tests/outputs-panel-contract.test.ts`
  - Result: 51 pass, 0 fail.
- Scratch-safe app typecheck:
  - `CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck`
  - Result: passed.
- Browser smoke on `http://127.0.0.1:5175/workspace/ws_d52295617e23/session`
  - Project Activity rendered 7 rows.
  - Old `Task Started` copy was no longer visible.
  - `run started` copy was visible.
  - Clicking the first activity row opened the detail sheet.
  - The sheet showed absolute time, relative time, source, task id, event id, and the start-only explanation.

## Remaining Merge Notes

- Kimi's run-detail/activity branch may overlap with `RecentActivitySection`; prefer the current metadata-preserving normalization and output bridge if merging.
- MiniMax's reliability branch is already partially present here via `ErrorState`; keep that shared error surface.
- Next useful refinement: group duplicate start-only rows and mark old start-only runs as stale without inventing completion.
