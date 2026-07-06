# Kimi platform shell + shared shadcn UI cleanup

**Branch:** `kimi/platform-shell-ui-cleanup`  
**Date:** 2026-07-05  
**Scope:** Shared shadcn/Base primitives, shell/navigation surfaces, and Outputs-language unification. Preserves Minimax WorkflowStageCard work and Kimi Outputs work.

## Goal

Continue the broad UI cleanup so Matterhorn Work feels like one restrained, dense, task-first product. Avoid decorative gradients, glass, giant rounded cards, nested cards, hero sections inside the app, oversized pills, and repeated explanatory copy.

## What changed

### Shared primitives

- `apps/app/src/components/ui/skeleton.tsx`
  - `rounded-2xl` → `rounded-md`.
- `apps/app/src/components/ui/command.tsx`
  - Removed `backdrop-blur-xl` and decorative pseudo-elements (`before:bg-muted/20`, `before:shadow`) from `CommandDialogPopup`.
  - `rounded-2xl` → `rounded-lg`; simpler `shadow-lg`.
  - Backdrop reduced from `bg-black/32 backdrop-blur-sm` to `bg-black/25`.
  - `CommandFooter` radius fixed to `rounded-b-lg`.
- `apps/app/src/components/ui/tabs.tsx`
  - Removed `group-data-vertical/tabs:rounded-2xl`.
  - Tab triggers use `rounded-md` and `focus-visible:ring-2`.

### Shell / navigation

- `apps/app/src/react-app/shell/command-palette.tsx`
  - "Accessible items" → **"Outputs & servers"**.
  - "servers and artifacts" → **"outputs and servers"**.
  - "Search servers and artifacts..." → **"Search outputs and servers..."**.
  - Target meta label: "Artifact" → **"Output"**.
- `apps/app/src/react-app/domains/workspace/create-workspace-modal.tsx`
  - Removed radial-gradient background and heavy `shadow-[0_28px_110px...]`.
  - `rounded-[20px]` error banner → `rounded-lg`.
- `apps/app/src/react-app/domains/workspace/create-workspace-local-panel.tsx`
  - `rounded-[20px]` error banner → `rounded-lg`.
- `apps/app/src/react-app/domains/workspace/modal-styles.ts`
  - `rounded-[28px]` / `rounded-[24px]` / `rounded-[20px]` / `rounded-2xl` → `rounded-xl` / `rounded-lg` / `rounded-md`.
  - Removed glassy inset shadows and hover-lift effects.
  - Pill buttons are now `rounded-md` instead of `rounded-full`.
  - Tags are `rounded-md` instead of `rounded-full`.
- `apps/app/src/react-app/domains/settings/shell/settings-shell.tsx`
  - `rounded-2xl` error surfaces → `rounded-lg`.
- `apps/app/src/react-app/domains/settings/shell/tabs.tsx`
  - `rounded-[24px]` group → `rounded-xl`.
  - Trigger `rounded-xl` → `rounded-md`; removed active shadow.
  - Removed `uppercase tracking-[0.18em]` group title.

### Tests

- `apps/app/tests/outputs-panel-contract.test.ts`
  - Added command-palette Outputs terminology assertions.
- `apps/app/tests/shared-primitives-ui-contract.test.ts` (new)
  - Source-level contract tests for skeleton, command, tabs, workspace modal styles, create-workspace-modal, settings shell, and settings tabs.

### Smoke scripts

- `apps/app/scripts/platform-shell-smoke.mjs`
- `apps/app/scripts/platform-shell-palette-smoke.mjs`

## Verification

```bash
bun test apps/app/tests/artifact-note-context.test.ts \
  apps/app/tests/output-descriptor.test.ts \
  apps/app/tests/outputs-panel-contract.test.ts \
  apps/app/tests/shared-primitives-ui-contract.test.ts
# 18 pass, 0 fail

bun test apps/app/tests/workflow-stage-card.test.ts \
  apps/app/tests/desk-workflow-stage-panel.test.ts
# 30 pass, 0 fail

bun test apps/app/tests/notes-integration-contract.test.ts \
  apps/app/tests/notes-store.test.ts \
  apps/app/tests/quick-jot-sheet.test.ts \
  apps/app/tests/notes-helpers.test.ts
# 31 pass, 0 fail

CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
# clean (scratch files temporarily hidden, then restored)
```

### Browser smoke

- Dev server started on `http://localhost:5173`.
- Welcome page renders cleanly.
- Screenshot: `docs/handoffs/screenshots/platform-shell-smoke-welcome.png`.
- Command palette could not be triggered from the no-workspace welcome state; its new labels are covered by source-level contract tests.

## What was intentionally not touched

- Memory panel internals (Minimax/Codex lane).
- Project Activity / evidence timeline internals (Minimax/Codex lane).
- Wallet desk-specific UI (Bittensor, Aave, CowSwap, etc.) — those still contain gradients, uppercase labels, and oversized radii. They should be addressed in a dedicated wallet/product-lane pass.
- Composer card styling (rounded-[24px] + glow shadow) — flagged for follow-up.
- Settings content pages still contain many uppercase labels and `rounded-[20px]` cards; the shell and shared primitives are now consistent, but individual page content needs a second pass.
- Scratch/numbered files were not deleted or merged.

## Remaining risks / open questions

1. **Command palette shortcut** did not fire on the welcome page in smoke testing. It likely requires an active session/workspace surface. The source-level test locks the new labels.
2. **Modal radius reduction** is broad (`modal-styles.ts` is shared by several workspace modals). Spot-check the create-workspace, create-remote-workspace, and share-workspace flows in a real build.
3. **Settings tabs** lost uppercase styling; confirm with design that section labels are still scannable.
4. **Workspace modal background** is now plain `bg-dls-surface` with `shadow-lg`. It may look flatter in dark mode; verify contrast.

## Recommended next steps

- Run a focused pass on composer card and action buttons.
- Normalize settings content-page cards and labels.
- Address wallet desk surfaces separately so they match the shell density.
