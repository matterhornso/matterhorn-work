# Outputs unification v1 handoff

**Branch:** `kimi/outputs-unification-v1`
**Date:** 2026-07-04
**Goal:** Make Outputs feel like first-class project evidence across the Artifact/Outputs panel, workflow output receipts, and note attachments.

## What changed

### New files

- `apps/app/src/react-app/domains/session/artifacts/output-descriptor.ts`
  - Unified `OutputDescriptor` type for file outputs, workflow receipts, and note attachments.
  - Helpers: `outputDescriptorFromOpenTarget`, `outputDescriptorFromNoteAttachment`, `outputDescriptorFromNoteAttachmentAny`, `deskLabel`, `formatOutputPath`.
- `apps/app/src/react-app/domains/session/artifacts/output-list.tsx`
  - Flat, restrained list of output descriptors. Each row shows title, path, desk/session chips, origin badge, relative time, size, and actions (copy path, add note, reveal, open).
- `apps/app/tests/output-descriptor.test.ts`
  - Unit tests for descriptor construction, outputs/ metadata extraction, and legacy flagging.
- `apps/app/tests/outputs-panel-contract.test.ts`
  - Source-level contract tests locking Outputs terminology, row metadata, actions, and legacy handling.

### Modified files

- `apps/app/src/react-app/domains/session/artifacts/artifact-note-context.ts`
  - Added `isLegacy` and `legacyKind` detection for `.opencode/`, `openwork/`, and `outbox/` paths.
- `apps/app/src/react-app/domains/session/artifacts/artifact-panel.tsx`
  - User-facing labels changed from "Artifacts" to "Outputs".
  - Empty state now says "No outputs yet" and points to `outputs/<desk>/<session-slug>/`.
  - Toolbar actions: copy path, add note, download, reveal in folder, open externally.
  - Path row shows desk/session chips and a "Legacy location" badge for imported paths.
  - Replaces the old tab bar with `OutputList` when there are multiple outputs.
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`
  - Rail label/title changed from "Artifacts" to "Outputs".
  - Forwards `props.onRevealPath` to `ArtifactPanel` (required for reveal-in-folder).
- `apps/app/tests/artifact-note-context.test.ts`
  - Updated expectations for new `isLegacy`/`legacyKind` fields and added legacy-path tests.

## Verification

### Tests

```bash
bun test apps/app/tests/artifact-note-context.test.ts \
  apps/app/tests/output-descriptor.test.ts \
  apps/app/tests/outputs-panel-contract.test.ts \
  apps/app/tests/notes-integration-contract.test.ts
```

**Result:** 19 pass, 0 fail.

### Typecheck

Scratch files (`* 2.tsx`, `* 3.tsx`, etc.) were temporarily moved aside, then restored:

```bash
# wrapper hides numbered scratch files, runs typecheck, restores them
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

**Result:** clean on `kimi/outputs-unification-v1`.

### Browser smoke

- Started `pnpm dev` on `http://localhost:5173`.
- App loads and renders the welcome page.
- Screenshot: `docs/handoffs/screenshots/outputs-smoke-session.png`.
- The Outputs panel empty state was not exercised in-browser because no workspace was connected; it is covered by the contract tests and the updated empty-state JSX.

## Caveats / open questions

1. **Reveal action** uses `revealDesktopItemInDir` via `onRevealPath` in the desktop runtime. In web/remote contexts it falls back to `openDesktopPath` or download.
2. **Workflow output receipts** are not yet fed into the panel. The `output-descriptor.ts` layer is ready to consume `TaskLogEntry` data, but `ArtifactPanel` still receives only `OpenTarget[]`. Passing workflow-run receipts will require a small prop expansion in `session-page.tsx`.
3. **Internal naming** still uses `artifact` for state keys, query keys, and filenames to keep the change surface small.
4. **Command palette** still says "Accessible items" and "servers and artifacts" in a few hidden search synonyms; visible labels could be tightened in a follow-up.

## Next steps

- Wire workflow-run receipts from `useWorkflowTaskLog` into the Outputs panel.
- Add an explicit "Outputs" filter/search bar to the panel when the list grows.
- Consider renaming internal `artifacts` side-panel state to `outputs` if the team wants full consistency.
