# Matterhorn Work Next Session Context

Date: 2026-07-11
Branch: `codex/platform-soft-divider-ui`
Repo: `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest`
Current local app URL: `http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session?panel=notes`

## Read This First

Start the next session here, then read the long hardening ledger:

- `docs/handoffs/next-session-context-2026-07-11.md`
- `docs/handoffs/codex-platform-hardening-start-2026-07-10.md`

The July 10 file is large but important. It records the platform hardening work, safety gate, wallet policy, billing integrity, local router/daemon perimeter, memory-vault hardening, generated-media/NFT work, and many verification commands. This file is the shorter current-state router.

## Current Git State

Current HEAD:

```text
a6dcfe10 (HEAD -> codex/platform-soft-divider-ui, origin/codex/platform-soft-divider-ui) Harden markdown and wallet approval flows
```

Recent commits:

```text
a6dcfe10 Harden markdown and wallet approval flows
23a614a1 Soften shared UI secondary controls
e21e44f1 Fix settings hub drawer layout
b025cecb Polish Sui workflow panel layout
f77e4e31 Guard notes behind workspace and clarify Sui status
fd8194a6 Polish desk info affordances
8d821955 Polish composer accessory panels
0bc45ff1 Polish session composer controls
```

Worktree state at handoff:

- `175` modified/indexed tracked paths at the latest documentation audit.
- `94` untracked paths at the latest documentation audit.
- Nothing was staged or committed in the last UI-fix turn.
- Do not run cleanup commands.
- Do not delete `.matterhorn-work/`, `qa-reports/`, duplicate scratch smoke scripts, temporary Kimi/Minimax docs, or other untracked files unless the user explicitly asks.
- Treat this as a shared integration tree with Codex/Kimi/Minimax work interleaved.

## Product Direction To Preserve

The user wants Matterhorn Work to feel like a sleek, useful product, not a boxy internal admin console.

Strong user preferences from live UI testing:

- Smooth, low-divider UI. Avoid bright horizontal lines, heavy borders, and nested cards.
- Healthy states should be silent. Do not show `Working` badges/labels when something is functioning normally.
- Show setup, early-access, unsupported, warning, and error states only when they help the user act.
- Use info icons for explanatory/safety details instead of always-visible wall-of-copy.
- Notes must not be creatable without a workspace.
- Notes, Memory, Outputs, Activity, and desk work must feel integrated inside Matterhorn Work, not separate apps.
- Desk task launch should feel direct. Users should not have to see giant raw prompts or redundant safety prose.
- The chat composer and transcript should feel native and smooth; avoid chunky borders and dangling action icons.
- Use the original Matterhorn logo asset when branding appears.
- Sui is a desk/workflow, not a random home button.

For UI work, use these skills/instructions if available:

- `impeccable`
- `uncodixfy`

The platform is an app UI, so prefer calm product UI: restrained colors, predictable controls, modest radii, high readability, and no decorative gradient/glass/card scaffolding.

## July 11 Afternoon Continuation

The session continued through a broad live UI/backend cleanup after the earlier handoff was written.

### Right-rail visual system

- Profile, Wallet, MCPs, Memory, Notes, and Outputs now share the workspace canvas instead of rendering as a stack of boxed cards.
- Compact Settings rails use open sections, softer spacing, and a subtle header edge.
- Profile opens the account/cloud readiness page instead of the generic Settings index.
- Memory uses the lucide Brain icon instead of an archive/bin-shaped icon.
- URL `?panel=` synchronization now updates when users switch right-rail destinations.
- The right-rail design contract now requires container-aware single-pane layouts and readable structured data before raw payloads.

### Response perspectives

- Chat exposes Cautious, Balanced, and Optimistic framing in the composer.
- The `Perspective` label is visually distinct from the three options.
- Selection is stored per workspace/session and injected into system context.
- Perspective changes framing only; safety constraints remain identical.
- Historical three-card comparison prototypes are not the current production behavior.

### Outputs and receipt readability

- JSON output files no longer default to a full raw payload view.
- NFT/Sui receipts render aligned customer-facing fields such as Status, Network, Object ID, Transaction digest, Custody, Signing data, and Recorded time.
- Long identifiers are compacted, null fields are omitted, and full JSON is collapsed under `Raw receipt data`.

### MCP status truthfulness

- The live MCP count comes from configured entries whose OpenCode status is exactly `connected`.
- In the current local smoke workspace, `wallet` and `crypto` were both live and initialized over local stdio JSON-RPC.
- This does not imply a connected browser wallet, OAuth account, or healthy upstream API.
- English UI copy now says `MCP server active` / `MCP servers active`, not `app(s) connected`.

### Notes backend and frontend repair

- Notes rail was rebuilt from a broken viewport-breakpoint master/detail layout into list -> editor -> back navigation.
- Search and eight wrapping filter buttons became search plus one compact filter control.
- The editor now uses 650ms buffered autosave, active-only saving feedback, deletion confirmation, progressive tags, and explicit Memory suggestion.
- Quick Jot is a contained 420px side composer rather than a full-width bottom sheet.
- Backend note mutations are serialized per workspace to prevent concurrent PATCH field loss.
- `.matterhorn-work/notes/index.json` now writes through a temporary file and atomic rename.
- A concurrent PATCH E2E regression test verifies title and body updates are both preserved.
- Live QA created, edited, searched, API-verified, and deleted a temporary note; the QA note was removed afterward.

### Documentation refresh

- `README.md` now describes the current desk-first product instead of the obsolete dark-only violet/Web3-marketplace positioning.
- `docs/README.md` is the canonical documentation index and precedence guide.
- Added evergreen guides for platform architecture, product surfaces, Notes, and the 10-stage platform safety gate.
- Updated Settings, MCP install/catalog semantics, response-perspective status, readiness contracts, and right-rail design rules.

### Verification after the continuation

Focused verification passed:

```bash
pnpm --filter matterhorn-work-server exec bun test src/notes-routes.e2e.test.ts
pnpm --filter @matterhorn-work/app exec bun test tests/notes-integration-contract.test.ts tests/shared-primitives-ui-contract.test.ts tests/settings-general-hub-contract.test.ts
pnpm --filter matterhorn-work-server exec tsc -p tsconfig.json --noEmit
pnpm --filter @matterhorn-work/app exec tsc -p tsconfig.json --noEmit
```

The full gate also passed after the Notes repair:

```bash
pnpm test:matterhorn-platform-safety
```

All 10 stages passed. Rerun after any further changes; this record is evidence, not a substitute for current verification.

## Most Recent User-Facing Fixes

### 1. Settings healthy status labels

The user pointed out visible `Working` labels next to Settings items such as Memory review and AI Providers.

Changed:

- `apps/app/src/react-app/domains/settings/pages/general-view.tsx`
- `apps/app/src/react-app/domains/settings/shell/settings-page.tsx`
- `apps/app/tests/settings-general-hub-contract.test.ts`

Behavior now:

- `Working` is hidden in the General hub cards.
- `Working` is hidden in the Settings sidebar/tab readiness badge.
- The hide guard is case-insensitive: `String(status).toLowerCase() !== "working"`.
- Non-healthy statuses still render: `Needs setup`, `Early access`, `Desktop only`, `Cloud only`, `Developer`, `Workspace needed`, etc.

Verification run:

```bash
bun test apps/app/tests/settings-general-hub-contract.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Both passed.

### 2. Settings AI Providers icon

The user disliked the sparkle icon beside `AI Providers`.

Changed:

- `apps/app/src/react-app/domains/settings/pages/general-view.tsx`

Behavior now:

- `AI Providers` uses the lucide `Bot` icon instead of `Sparkles`.

Verification run:

```bash
bun test apps/app/tests/settings-general-hub-contract.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Both passed.

### 3. Chat transcript user message bubble/actions

The user flagged the chat interface as messed up, especially the user prompt box and the three icons below it.

Changed:

- `apps/app/src/react-app/domains/session/surface/message-list.tsx`
- `apps/app/tests/shared-primitives-ui-contract.test.ts`

Behavior now:

- User message bubble uses a softer `bg-dls-surface-muted/[0.14]` surface and `ring-white/[0.08]` instead of a harsh bright border.
- Revert, fork, and copy actions use a local `MessageActionIconButton` rather than shadcn button chrome.
- For user messages, the action toolbar is anchored inside the top-right of the message bubble.
- The old absolute bottom action row is removed so icons no longer dangle underneath the message.
- The same soft user bubble treatment was applied to the steps-cluster user-message path.

Verification run:

```bash
bun test apps/app/tests/shared-primitives-ui-contract.test.ts apps/app/tests/reasoning-display.test.ts apps/app/tests/crypto-shared-card-render.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Both passed.

Playwright sanity check was also run against:

```text
http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session/ses_generated_media_smoke_033
```

Result:

- Found the user message.
- Found the softened bubble.
- Found the action toolbar.
- Confirmed `toolbarInsideBubble: true`.

## Broader Platform Work Already In The Tree

The dirty tree contains much more than the last small UI fixes. Important areas include:

- Backend control plane and capabilities.
- Project data ledger/evidence.
- Generated media and image generation.
- Sui wallet/workflow and NFT draft scaffolding.
- Matterhorn Plus/Max billing foundation.
- Billing webhook integrity and bounded body parsing.
- Wallet safety policy and approval behavior hardening.
- Memory-vault safe IDs, fail-closed corrupt metadata, and complete exports beyond UI list caps.
- Local router/daemon/Electron perimeter hardening.
- Error boundaries and local observability.
- Notes/workspace guard behavior.
- Many product UI sweeps across Settings, Memory, Wallet, Sui workflow, desks, Project Activity, Outputs, and chat.

The large handoff at `docs/handoffs/codex-platform-hardening-start-2026-07-10.md` says the full platform safety gate passed after the memory-vault patch:

```bash
node scripts/matterhorn-platform-safety-gate.mjs
```

with all 10 stages passing:

1. wallet approval behavior
2. money-path backend security
3. desk depth
4. billing integrity
5. local router perimeter
6. daemon/Electron perimeter
7. observability/error boundaries
8. design contract
9. browser smoke contracts
10. product readiness

Important: rerun the relevant gates after any new edits. Do not assume the dirty tree is still globally green after subsequent UI work.

## Current App URL And Testing Notes

The browser tab at handoff was on:

```text
http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session/ses_generated_media_smoke_033
```

If UI looks stale:

- Refresh the browser first.
- If HMR is stale or the dev server changed ports, locate the active Vite/server process before restarting.
- The user is actively testing in web, not only desktop.

Useful focused checks:

```bash
bun test apps/app/tests/settings-general-hub-contract.test.ts
bun test apps/app/tests/shared-primitives-ui-contract.test.ts apps/app/tests/reasoning-display.test.ts apps/app/tests/crypto-shared-card-render.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Heavier checks before PR/consolidation:

```bash
node scripts/matterhorn-platform-safety-gate.mjs
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app typecheck
```

## Files Most Relevant To The Latest UI Feedback

Settings General hub:

- `apps/app/src/react-app/domains/settings/pages/general-view.tsx`
- `apps/app/src/react-app/domains/settings/shell/settings-page.tsx`
- `apps/app/tests/settings-general-hub-contract.test.ts`

Chat transcript/message actions:

- `apps/app/src/react-app/domains/session/surface/message-list.tsx`
- `apps/app/tests/shared-primitives-ui-contract.test.ts`
- `apps/app/tests/reasoning-display.test.ts`
- `apps/app/tests/crypto-shared-card-render.test.ts`

Session composer and accessory panels if the user continues chat UI review:

- `apps/app/src/react-app/domains/session/surface/composer/composer.tsx`
- `apps/app/src/react-app/domains/session/surface/session-surface.tsx`
- `apps/app/src/react-app/domains/session/media/session-image-generation-panel.tsx`

Memory/Notes side panels if the user continues evidence UI review:

- `apps/app/src/react-app/domains/memory/memory-panel.tsx`
- `apps/app/src/react-app/domains/notes/quick-jot-sheet.tsx`
- `apps/app/src/react-app/domains/notes/quick-jot-global.tsx`

Wallet/Sui if the user continues Sui UI review:

- `apps/app/src/react-app/domains/settings/pages/wallet-view.tsx`
- `apps/app/src/react-app/domains/wallet/sui-workflow-panel.tsx`
- `apps/app/src/react-app/domains/wallet/sui-workflow-state.ts`

## Known Open Product/Engineering Work

Recommended next steps:

1. **Consolidate the dirty integration branch intentionally**
   - The current tree is too broad to reason about as one small patch.
   - Before a PR, split or at least group changes by lane: platform hardening, billing, generated media/NFT, wallet/Sui, UI sweep.
   - Do not delete untracked files casually; inspect them first.

2. **Rerun full safety and type gates**
   - Especially after the latest chat UI changes.
   - The focused tests passed, but the full safety gate should be the PR bar.

3. **Browser-smoke the latest UI**
   - Home
   - Settings General
   - Chat transcript/composer
   - Memory panel
   - Notes panel
   - Wallet/Sui
   - Bittensor desk
   - Generated media/image panel
   - Billing settings

4. **Build a durable observability/activity view**
   - Surface safety events, billing webhook mutations, generated-media/NFT evidence, memory review actions, and wallet approvals in one coherent project evidence story.

5. **Production billing provider**
   - Current billing foundation is safe mock/test-mode scaffolding.
   - Still needs real Stripe provider persistence, customer/account linkage, usage counters, lifecycle reconciliation, and entitlement enforcement for generated media/NFT flows.

6. **Generated media/NFT productionization**
   - Mock/OpenAI provider path and app UI exist.
   - Real Walrus upload and Move transaction building remain scaffolding.
   - Need marketplace publish flow and entitlement integration.

7. **Team/collaboration model**
   - Local token/team scaffolding exists in pieces.
   - Still needs clear product decisions around workspace membership, shared memory/notes/evidence, audit retention, and cloud account linkage.

## Warnings For The Next Agent

- The repo is dirty by design. Do not reset.
- Do not run `git checkout --`, `git reset --hard`, or broad cleanups.
- Do not delete untracked scratch/parallel-agent files unless the user explicitly asks.
- Use `rg` first for search.
- Use `apply_patch` for manual edits.
- For UI work, inspect the real component and verify with browser or focused tests.
- Preserve the "healthy state is silent" rule.
- Preserve the "less boxy, fewer visible lines" direction.
- Avoid adding explanatory text where an info icon or progressive disclosure is enough.
- If asked to PR/merge, first inventory dirty files and decide what belongs in the PR.

## Paste-Ready Startup Prompt For The Next Session

```text
You are continuing the Matterhorn Work build.

Start by reading:
/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest/docs/handoffs/next-session-context-2026-07-11.md

Then read the detailed hardening ledger:
/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest/docs/handoffs/codex-platform-hardening-start-2026-07-10.md

Repo:
/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest

Current branch:
codex/platform-soft-divider-ui

Important:
- The tree is intentionally very dirty from Codex/Kimi/Minimax integration work.
- Do not delete untracked scratch, qa-reports, .matterhorn-work, duplicate smoke scripts, or parallel-agent handoff files unless I explicitly ask.
- Do not reset or revert user/agent changes.
- Preserve the UI direction: sleek, smooth, fewer divider lines, no boxy controls, healthy states silent, explanations behind info icons or progressive disclosure.
- The latest local app URL was:
  http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session/ses_generated_media_smoke_033

Latest small fixes before handoff:
- Settings no longer shows visible "Working" labels for healthy items.
- AI Providers uses a Bot icon instead of sparkle.
- Chat user-message bubble is softer and the revert/fork/copy toolbar is inside the bubble.

First steps:
1. Verify current git status and active local dev URL.
2. Refresh/browser-smoke the chat page above.
3. If continuing UI polish, use the impeccable and uncodixfy skills.
4. If preparing PR/consolidation, inventory dirty files and group changes before staging anything.
5. Rerun focused tests and then the full Matterhorn platform safety gate before any PR.
```
