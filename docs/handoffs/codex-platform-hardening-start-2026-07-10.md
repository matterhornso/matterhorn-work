# Matterhorn Work Platform Hardening Start

Date: 2026-07-10
Branch: `codex/platform-soft-divider-ui`
Workspace: `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest`

> **Continuation:** This is the long July 10 hardening ledger. For the latest July 11 UI/backend continuation, Notes concurrency repair, MCP wording, receipt readability, documentation refresh, live URL, and most recent verification, read [`next-session-context-2026-07-11.md`](next-session-context-2026-07-11.md). For evergreen behavior, start at [`../README.md`](../README.md).

## Source Feedback

Team assessment says Matterhorn has the right architecture and product promise, but the risk surfaces need stricter enforcement:

- approval UI must be a control surface, not only a display;
- QA must prove behavior under degraded/adversarial cases;
- billing and entitlements need replay/lifecycle/payment-state protection;
- local router, daemon, and Electron perimeter must be loopback/token/trusted-only;
- inherited OpenWork/OpenCode seams must not leak into customer-facing Matterhorn UI;
- observability and error boundaries must prevent white-screen failures;
- desks need depth and consistent launch behavior before more surface-area expansion.

## What This Slice Started

### 1. Platform Safety Gate

Added/updated `scripts/matterhorn-platform-safety-gate.mjs` so one command covers the platform hardening categories:

```bash
pnpm test:matterhorn-platform-safety
```

The gate now has ten stages:

1. `wallet.approval.behavior`
2. `money.path.security`
3. `desk.depth`
4. `billing.integrity`
5. `local.router.perimeter`
6. `daemon.electron.perimeter`
7. `observability.error_boundaries`
8. `design.contract`
9. `browser.smoke.contracts`
10. `product.readiness`

Each stage now declares assessment-theme coverage in `--dry-run --json`, so reviewers can confirm the gate protects the actual platform risks, not just a loose set of tests.

```bash
node scripts/matterhorn-platform-safety-gate.mjs --dry-run --json
```

### 2. Desk Depth Gate

Added a `desk.depth` stage to keep Bittensor, Hyperliquid, Polymarket, Sui, Longevity, and task-launch UI from drifting separately.

This stage runs:

```bash
node scripts/matterhorn-desk-agent-contract.test.mjs
node scripts/customer-ready-crypto-smoke.test.mjs
bun test apps/app/tests/workflow-stage-card.test.ts apps/app/tests/customer-workflow-templates.test.ts
node scripts/wellness-creator-workflow.test.mjs
```

### 3. Design Seam Guard

Updated `scripts/matterhorn-design-system.test.mjs` and English copy so customer-facing settings do not regress to generic inherited wording:

- `Services` is now `Local runtime`;
- `Matterhorn Work engine` remains the user-facing runtime label;
- customer copy rejects `OpenWork worker/server/cache/workspace` seams;
- the design gate continues to reject harsh dividers, oversized radii, and raw shader imports in key surfaces.

### 4. Wallet Safety Policy Spine

Started moving wallet approval policy from scattered UI values into one versioned policy object:

- `WalletSafetyPolicy`
- `walletSafetyPolicyFromSnapshot`
- `approvalPolicyFromSafetyPolicy`
- `evaluateWalletApprovalAgainstPolicy`

The current behavior stays the same: chain mismatch, forced-testnet mainnet blocks, per-transaction limits, daily limits, ERC-20 decoded value, and swap-rate limits still block before wallet submission. The difference is that the approval modal, session wallet hook, and send path now share a policy contract that can later be backed by workspace/server storage.

### 5. Workspace-Backed Wallet Safety Policy

Added the first server-backed wallet safety policy contract:

- shared type: `packages/types/src/wallet-safety-policy.ts`;
- package export: `@matterhorn-work/types/wallet-safety-policy`;
- server store: `.matterhorn-work/wallet/safety-policy.json`;
- server routes:
  - `GET /workspace/:id/wallet/safety-policy`;
  - `PATCH /workspace/:id/wallet/safety-policy`;
- app client methods:
  - `getWalletSafetyPolicy(workspaceId)`;
  - `updateWalletSafetyPolicy(workspaceId, policy)`.

The write route now enforces the same platform safety rules as the rest of the money path:

- `ensureWritable(config)`;
- `requireClientScope(ctx, "collaborator")`;
- secret-shaped field/value rejection;
- audit entry: `workspace.wallet.safety_policy.update`;
- project data ledger title: `Wallet safety policy updated`.

New focused E2E coverage lives in `apps/server/src/wallet-safety-policy-routes.e2e.test.ts` and is now part of the `money.path.security` platform gate stage.

### 6. Wallet Settings Policy UI

Connected the settings wallet page to the workspace policy endpoint:

- `WalletSafetyPolicyControls` loads `getWalletSafetyPolicy`;
- server policy hydrates the local wallet approval store;
- edits update local runtime protection immediately;
- workspace saves call `updateWalletSafetyPolicy`;
- failed/offline server states fall back to local protection with explicit toast copy;
- mainnet enablement now lives in one policy control instead of a separate Network toggle.

This keeps the user-facing approval controls aligned with the backend policy spine: per-transaction limit, daily limit, max slippage, preferred network, and mainnet enablement are visible and persisted when a workspace server is available.

### 7. Reviewed Wallet Receipt Trail

Extended wallet safety events so the safety ledger can show a compact reviewed-vs-sent receipt:

- local wallet security log entries now support a `WalletSafetyReviewTrail`;
- approved sends record:
  - reviewed chain, recipient, value, normalized USD value, optional calldata selector, display value, proposer;
  - submitted chain, recipient, normalized wei value, optional calldata selector, and transaction hash;
- blocked sends record the reviewed side only, with `submitted: null`;
- the app client reports `txHash` and the sanitized review trail to `/workspace/:id/wallet/safety-events`;
- the server response keeps the structured trail for immediate callers;
- the project data ledger stores only flat, export-safe review fields such as `reviewedChainId`, `reviewedDataSelector`, and `submittedTxHash`;
- Wallet Settings reconstructs those flat fields into a compact `Reviewed` / `Sent` display in the Safety ledger.

The contract deliberately does not store raw calldata, raw signatures, signed payloads, private keys, seed phrases, or wallet exports.

### 8. Chat-Native Image Prompt Bridge and Divider Guard

Started the next frontend polish slice from the team assessment: image generation now feels attached to chat instead of a separate tool.

- `ImageGenerationComposer` accepts a `suggestedPrompt` from the active chat composer.
- `SessionImageGenerationPanel` passes that suggestion into the composer when image generation is available.
- `SessionSurface` wires the current chat draft into the image panel with `suggestedPrompt={draft}`.
- The image panel shows a small `Use chat draft` row, and the user must still explicitly click `Use draft` and then `Create image`.
- No draft text is auto-generated, auto-sent, or saved.

Also tightened the smooth-ui contract in response to repeated screenshot feedback:

- converted the Bittensor preview-action tab strip from a hard divider line into a soft segmented control;
- replaced MCP setup left-rule blocks with soft inset surfaces;
- expanded `scripts/matterhorn-design-system.test.mjs` so `border-b border-dls-border/50` and `border-l border-dls-border/30` are now blocked in covered Matterhorn surfaces.

## Verification Run

Passed in this slice:

```bash
node scripts/matterhorn-platform-safety-gate.mjs --only desk.depth
node scripts/matterhorn-platform-safety-gate.test.mjs
node scripts/matterhorn-design-system.test.mjs
bun test apps/server/src/backend-security.e2e.test.ts apps/server/src/transaction-simulation-safety.test.ts apps/server/src/billing-routes.e2e.test.ts
node scripts/matterhorn-platform-safety-gate.mjs --only desk.depth,design.contract,observability.error_boundaries
pnpm --filter @matterhorn-work/app typecheck
node scripts/matterhorn-platform-safety-gate.mjs
```

Latest targeted verification after adding theme coverage:

```bash
node scripts/matterhorn-platform-safety-gate.test.mjs
node scripts/matterhorn-platform-safety-gate.mjs --dry-run --json
bun test apps/app/src/react-app/domains/wallet/state/wallet-store-security.test.ts apps/app/tests/wallet-send-behavior.test.ts apps/app/tests/wallet-approval-render-behavior.test.tsx apps/app/tests/wallet-approval-security-contract.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Latest targeted verification after adding workspace-backed wallet safety policy:

```bash
bun test apps/server/src/wallet-safety-policy-routes.e2e.test.ts
bun test apps/app/tests/wallet-approval-security-contract.test.ts
node scripts/matterhorn-platform-safety-gate.test.mjs
node scripts/matterhorn-platform-safety-gate.mjs --only money.path.security,wallet.approval.behavior
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app typecheck
bun test apps/server/src/wallet-safety-policy-routes.e2e.test.ts apps/app/tests/wallet-approval-security-contract.test.ts
node scripts/matterhorn-platform-safety-gate.mjs --only wallet.approval.behavior
```

Latest full platform verification:

```bash
bun test apps/app/tests/notes-integration-contract.test.ts apps/app/tests/quick-jot-sheet.test.ts
node scripts/matterhorn-platform-safety-gate.mjs --only billing.integrity
node scripts/matterhorn-platform-safety-gate.mjs --only local.router.perimeter
node scripts/matterhorn-platform-safety-gate.mjs --only daemon.electron.perimeter
node scripts/matterhorn-platform-safety-gate.mjs --only observability.error_boundaries
node scripts/matterhorn-platform-safety-gate.mjs --only design.contract
node scripts/matterhorn-platform-safety-gate.mjs --only desk.depth
node scripts/matterhorn-platform-safety-gate.mjs --only browser.smoke.contracts
node scripts/matterhorn-platform-safety-gate.mjs --only product.readiness
node scripts/matterhorn-platform-safety-gate.mjs
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app typecheck
```

Result: all commands passed. The full `matterhorn-platform-safety-gate` now covers wallet approval behavior, money-path backend security, desk depth, billing integrity, local router perimeter, daemon/Electron perimeter, observability/error boundaries, design contract, browser smoke contracts, and product readiness in one run.

Workspace note gating was also re-verified:

- `/notes` redirects back to `/session`;
- `/workspace/:id/notes` opens as the session-side notes panel;
- Quick Jot only renders when the route workspace matches the remembered active workspace;
- command-palette notes actions are hidden until a workspace is ready;
- settings notes actions warn and open project creation when no workspace is available.

Latest verification after reviewed wallet receipt trail:

```bash
bun test apps/app/tests/wallet-send-behavior.test.ts apps/app/tests/wallet-approval-security-contract.test.ts apps/app/tests/wallet-security-log-reporter.test.ts
bun test apps/server/src/backend-control-plane.e2e.test.ts
node scripts/matterhorn-platform-safety-gate.mjs --only wallet.approval.behavior,money.path.security
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app typecheck
```

Result: all commands passed.

Latest verification after chat-native image prompt bridge and divider guard:

```bash
bun test apps/app/tests/image-generation-ui-contract.test.ts
node scripts/matterhorn-design-system.test.mjs
bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts apps/app/tests/settings-general-hub-contract.test.ts
pnpm --filter @matterhorn-work/app typecheck
node scripts/matterhorn-platform-safety-gate.mjs --only wallet.approval.behavior,money.path.security,design.contract
node scripts/matterhorn-platform-safety-gate.mjs --only billing.integrity
```

Result: all commands passed.

Latest assessment-response pass after the team platform review:

```bash
bun test apps/app/tests/shared-primitives-ui-contract.test.ts apps/app/tests/wallet-approval-security-contract.test.ts apps/app/tests/wallet-approval-render-behavior.test.tsx apps/app/tests/wallet-send-behavior.test.ts
node scripts/matterhorn-design-system.test.mjs
bun test apps/opencode-router/test/health-send.test.js scripts/orchestrator-daemon-security.test.mjs apps/server/src/wallet-safety-policy-routes.e2e.test.ts apps/server/src/billing-routes.e2e.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Result: all commands passed.

What changed in this pass:

- `StatusToast` now uses an isolated, opaque `bg-dls-canvas` surface with a modest ring and 4px/8px shadow so warnings and success messages remain readable over settings and desk content.
- `ReloadWorkspaceToast` now uses the same notification surface, so engine-reload warnings no longer use the older boxed border treatment.
- `shared-primitives-ui-contract.test.ts` now locks this down with `status toasts use an opaque isolated surface` and `reload toast uses the same opaque notification surface` contracts.
- Wallet transaction analysis now includes a compact `assetChanges` array for human-readable asset-diff previews.
- The approval modal now shows an `Asset changes` row for known ETH sends and decoded token actions, so users see the direct effect before approving.
- `wallet-send-behavior.test.ts` and `wallet-approval-render-behavior.test.tsx` cover ETH and USDC asset-change summaries.

Latest targeted verification after aligning reload notifications:

```bash
bun test apps/app/tests/shared-primitives-ui-contract.test.ts
node scripts/matterhorn-design-system.test.mjs
pnpm --filter @matterhorn-work/app typecheck
```

Result: all commands passed.

Latest targeted verification after adding the asset-change approval preview:

```bash
bun test apps/app/tests/wallet-send-behavior.test.ts apps/app/tests/wallet-approval-render-behavior.test.tsx apps/app/tests/wallet-approval-security-contract.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Result: all commands passed.

Assessment mapping from current code:

- Wallet approval is now covered by behavioral tests for reviewed-chain submission, chain mismatch blocking, mainnet forced-testnet blocking, normalized ETH display, decoded USDC policy value, spend limits, swap quota, sanitized gas errors, transaction simulation blocking, dialog semantics, and explicit reject/audit logging.
- Billing integrity now has test-mode checkout/webhook coverage for workspace binding, unpaid checkout rejection, pending checkout matching, subscription update/cancel lifecycle, stale event handling, duplicate Stripe event idempotency, stale/mutated signatures, read-only blocking, viewer-token blocking, and live-mode rejection.
- Local router perimeter now keeps `/health` public while requiring a token for write/control routes, rejects non-loopback CORS/private-network preflights, validates direct peer IDs, and rejects file sends outside the active workspace.
- Orchestrator daemon security has a source-level gate for generated daemon tokens, token-required non-health routes, public-safe daemon state, non-wildcard CORS defaults, and authenticated daemon calls.
- App robustness now has route and surface error boundaries, redacted debug logging, fetch-stall observability, route reset behavior, and session-side-panel crash containment.

Important note: the team assessment appears to have been written against an earlier snapshot for several items. The current branch already includes fixes/tests for many of the cited issues. Future work should focus on the remaining implementation depth below rather than re-adding already-passing contracts.

## What Still Needs Real Build Work

The gate protects current contracts, but these are still the next real implementation priorities:

1. **Approval surface depth**
   - Continue turning simulation from availability/sanitization plus local `assetChanges` into richer provider-backed asset-diff previews.
   - Expand token decoding beyond the current guarded set.
   - Add visible receipt comparison: reviewed request vs wallet-submitted request vs resulting ledger event.

2. **Safety policy engine**
   - Workspace policy storage, settings UI, collaborator/write guards, secret rejection, and policy-update audit entries are now in place.
   - Continue expanding the policy from transaction/daily/slippage/network boundaries into token-specific and recipient-specific rules.
   - Add a visible reviewed-vs-submitted-vs-ledger receipt comparison for completed wallet actions.

3. **Production billing provider**
   - Replace mock/provider scaffolding with real Stripe customer/subscription persistence.
   - Reconcile server entitlement state from Stripe, not from the latest webhook alone.
   - Add usage counters for generated media/NFT flows and Max-tier limits.

4. **Perimeter hardening follow-up**
   - Keep expanding route-level tests around router file access, desktop IPC `__fetch`, and daemon controls.
   - Add packaged-app smoke to prove remote debugging and unsafe IPC are unavailable outside dev.

5. **UI/UX polish with enforceable contracts**
   - Add browser screenshots to the safety gate once the current dirty integration branch is stable enough.
   - Continue replacing boxy panel-specific CSS with shared shadcn/Matterhorn primitives.
   - Add accessibility checks for focus-visible, aria-current, dialog labels, and keyboard-only flows.

6. **Depth-first desk reference implementation**
   - Pick one desk, likely Bittensor, and make it the reference for launch, context, evidence, safety ledger, outputs, and recovery states.
   - Let Hyperliquid, Polymarket, Sui, and Longevity inherit the same shape.

## Dirty Tree Notes

This checkout is shared with parallel-agent work and contains unrelated untracked/scratch files. Do not delete scratch files or bulk-stage the tree. Stage only files intentionally changed for the current PR.

## 2026-07-10 Assessment Response Pass: Shared Client + Dev Log Hardening

Trigger: team platform assessment called out reliability, local observability, graceful degraded states, and local-control perimeter concerns. Current branch already had most wallet, billing, router, daemon, and UI seam fixes in place, so this pass focused on two remaining shared failure points.

What changed:

- `apps/app/src/app/lib/matterhorn-server.ts`
  - `requestJson` now parses responses through a typed/sanitized helper.
  - HTML/proxy/malformed JSON responses are converted to `MatterhornServerError` with code `invalid_response`.
  - Raw response bodies, tokens, private-key-looking text, and proxy HTML are not surfaced to callers.
- `apps/app/src/react-app/domains/shell/error-state.tsx`
  - Shared error classification now treats `unreadable response` as a server failure so panels show the calmer server-failure copy rather than a generic load failure.
- `apps/app/tests/matterhorn-server-client-error-contract.test.ts`
  - New app contract covering malformed 5xx proxy HTML and malformed 2xx engine responses.
- `apps/app/tests/shared-primitives-ui-contract.test.ts`
  - Added a source contract for the shared unreadable-response classification.
- `apps/server/src/server.ts`
  - `/dev/log` now reads payloads through a bounded stream reader before JSON parsing.
  - Payloads over `128_000` bytes are rejected with `413 payload_too_large`.
  - Existing redaction remains intact for accepted payloads.
- `apps/server/src/backend-security.e2e.test.ts`
  - Added an E2E regression that verifies oversized unauthenticated dev-log payloads are rejected before parsing.

Verification:

```bash
bun test apps/app/tests/matterhorn-server-client-error-contract.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts
bun test apps/server/src/backend-security.e2e.test.ts
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
node scripts/electron-packaging-sources.test.mjs
bun test apps/app/tests/matterhorn-server-client-error-contract.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts apps/server/src/backend-security.e2e.test.ts
```

Result: all commands passed. Note: `pnpm --filter @matterhorn-work/server typecheck` was attempted first but no package matched that filter; the correct server package is `matterhorn-work-server`.

Next recommended slice:

- Continue platform hardening with a visible safety-ledger/receipt comparison: reviewed request vs submitted wallet request vs recorded safety event.
- Add a packaged Electron smoke/source gate for shorthand/internal hostname variants around external-open and desktop-fetch allowlists.
- Add backend route body limits to other unauthenticated or broadly reachable JSON routes after checking each route's expected payload size.

## 2026-07-10 Assessment Response Pass: Wallet Safety Receipt Integrity

Trigger: the assessment emphasized that approval modals must be real security controls, not visual theater. The current branch already logs wallet safety events and renders Reviewed/Sent rows in Settings > Wallet, but the backend route accepted mismatched review/submission receipts after normalization.

What changed:

- `apps/server/src/server.ts`
  - Added `assertWalletSafetyReviewConsistency` for `/workspace/:id/wallet/safety-events`.
  - If a safety event includes a review, the reviewed chain and recipient must match the event being recorded.
  - Non-approved events cannot include submitted transaction details.
  - Approved events must include submitted transaction details.
  - Approved submitted details must match the reviewed chain, recipient, value, and calldata selector.
  - Top-level and submitted transaction hashes must match when both are present.
  - Mismatch failures return `400 wallet_safety_review_mismatch`.
- `apps/server/src/backend-control-plane.e2e.test.ts`
  - Added regression coverage for approved events without submitted details, submitted recipient mismatches, and blocked events that try to include submitted details.

Verification:

```bash
bun test apps/server/src/backend-control-plane.e2e.test.ts
bun test apps/app/tests/wallet-send-behavior.test.ts apps/app/tests/wallet-security-log-reporter.test.ts apps/app/tests/wallet-approval-render-behavior.test.tsx
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
bun test apps/app/tests/matterhorn-server-client-error-contract.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts
```

Result: all commands passed. Combined hardening run: 85 tests, 0 failures.

Next recommended slice:

- Add the UI-side compact receipt comparison inside the approval or post-approval wallet surface only if it can reuse the existing Safety ledger styling without adding another boxy panel.
- Expand wallet simulation from route availability to richer provider-backed asset diffs.
- Continue route body-limit review for other broad JSON endpoints.

## 2026-07-10 Assessment Response Pass: Desktop URL Perimeter Tightening

Trigger: the assessment called out perimeter hardening for desktop IPC, external URL handling, and desktop fetch. The existing Electron source gate already required trusted IPC handlers, default loopback-only desktop fetch, bounded desktop fetch bodies/responses, no packaged remote debugging, and no wildcard desktop-managed CORS. This pass fixed a remaining manual URL-prefix check.

What changed:

- `apps/desktop/electron/main.mjs`
  - Added `normalizeHostnameForPolicy` so URL host policy trims brackets and trailing dots before comparison.
  - Expanded loopback recognition to cover normalized IPv6 loopback and IPv4-mapped loopback forms.
  - Added `isAllowedMainWindowUrl`, allowing only `file:` and parsed loopback `http:`/`https:` URLs in the main Matterhorn window.
  - `isLocalRendererOrigin` now delegates to `isAllowedMainWindowUrl` and no longer treats an empty origin as trusted.
  - `mainWindow.webContents.setWindowOpenHandler` now uses parsed URL policy instead of `startsWith("http://localhost")` / `startsWith("http://127.0.0.1")`.
  - Non-local popup URLs are still denied in-app and opened externally only after `isAllowedExternalUrl`.
- `scripts/electron-packaging-sources.test.mjs`
  - Added source-gate assertions for the new main-window URL policy.
  - Added explicit assertions that the old localhost/127 prefix checks do not return.

Verification:

```bash
node scripts/electron-packaging-sources.test.mjs
bun test apps/server/src/backend-security.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts
```

Result: all commands passed. Backend/security run: 66 tests, 0 failures.

Next recommended slice:

- Add executable unit coverage for Electron URL policy helpers if/when those helpers are split into an importable module.
- Continue backend body-limit review for remaining broad JSON routes.
- Continue depth-first desk hardening, using Bittensor as the reference workflow from launch to evidence to recovery.

## 2026-07-10 Assessment Response Pass: Generated Media Payload Bounds

Trigger: the assessment called out robustness, graceful failures, billing integrity, and generated-media/NFT readiness. Generated-media routes already reject secrets and enforce entitlements, but JSON request parsing was unbounded.

What changed:

- `apps/server/src/generated-media-routes.ts`
  - Added `GENERATED_MEDIA_JSON_BODY_MAX_BYTES = 256_000`.
  - Added a streaming bounded body reader for generated-media JSON routes.
  - Rejects oversized generated-media payloads before JSON parsing with `413 payload_too_large`.
  - `readJsonBody` and `readOptionalJsonBody` now share the bounded reader.
- `apps/server/src/generated-media-routes.e2e.test.ts`
  - Added regression coverage proving `/workspace/:id/images/generate` rejects a 300KB JSON prompt before provider work.

Verification:

```bash
bun test apps/server/src/generated-media-routes.e2e.test.ts
pnpm --filter matterhorn-work-server typecheck
```

Result: all commands passed. Generated-media E2E run: 50 tests, 0 failures.

Next recommended slice:

- Decide route-specific body limits for billing webhooks and smaller control-plane POST/PATCH routes without globally capping file/session write routes.
- Split reusable bounded body readers into a small server utility once enough route families converge on the same behavior.

## 2026-07-10 Assessment Response Pass: Desk Task Launch Observability

Trigger: the assessment and live UI feedback both called out a trust-breaking launch seam: users could click `Start task` and not have an obvious proof that a real agent session was created, sent, blocked, or safely preserved for review.

What changed:

- `apps/app/src/react-app/shell/session-route.tsx`
  - Added explicit inspector lifecycle events around route-level desk task launch:
    - `desk.task_launch.requested`
    - `desk.task_launch.session_created`
    - `desk.task_launch.draft_saved`
    - `desk.task_launch.prompt_send_started`
    - `desk.task_launch.prompt_sent`
    - `desk.task_launch.fallback_saved`
    - `desk.task_launch.failed`
  - Event payloads deliberately avoid raw prompt text. They include only workspace id, session id when available, task title, agent id, `sendImmediately`, prompt length, and sanitized failure reason.
  - The existing user-facing behavior remains intact: task launch opens a real session, sends immediately when allowed, shows success/error toasts, and saves the prompt visibly in the composer only when send fails.
- `apps/app/tests/workflow-stage-card.test.ts`
  - Added route-level source contracts proving the desk launcher records every lifecycle phase.
  - Added a regression guard that the inspector event object uses `promptLength` and does not store raw prompt text.

Verification:

```bash
bun test apps/app/tests/workflow-stage-card.test.ts apps/app/tests/app-observability-contract.test.ts
node scripts/matterhorn-platform-safety-gate.mjs --only desk.depth,observability.error_boundaries
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
node scripts/matterhorn-platform-safety-gate.mjs
```

Result: all commands passed. The full platform safety gate passed all 10 stages: wallet approval behavior, money-path backend security, desk depth, billing integrity, local router perimeter, daemon/Electron perimeter, observability/error boundaries, design contract, browser smoke contracts, and product readiness.

Next recommended slice:

- Continue depth-first Bittensor reference work: verify one real Bittensor public-read task from launch through activity, output receipt, and recovery state.
- Continue backend body-limit review for billing webhook and smaller control-plane POST/PATCH routes.

## 2026-07-10 Assessment Response Pass: Browser Smoke Desk Launch Proof

Trigger: after adding desk task launch inspector events, the browser smoke still proved only that a desk click navigated into a session and showed the composer. It did not assert that the prompt was actually sent to the agent.

What changed:

- `scripts/matterhorn-product-browser-smoke.mjs`
  - Added `waitForDeskPromptSentEvent`.
  - Each primary desk smoke now waits for `desk.task_launch.prompt_sent` with the clicked task title and a concrete session id.
  - The smoke report now stores `startedDeskTaskEvents` alongside `startedDeskTaskSessions`.
- `scripts/matterhorn-product-browser-smoke.test.mjs`
  - Added contract assertions so the product smoke keeps proving real prompt send, not just route navigation.

Verification:

```bash
node scripts/matterhorn-product-browser-smoke.test.mjs
node scripts/matterhorn-platform-safety-gate.mjs --only browser.smoke.contracts
```

Result: all commands passed.

Next recommended slice:

- Continue depth-first Bittensor reference work: verify one real Bittensor public-read task from launch through activity, output receipt, and recovery state.
- Continue backend body-limit review for billing webhook and smaller control-plane POST/PATCH routes.
- Add one live browser smoke run when the local dev stack is available, using `pnpm dev:generated-media-smoke` followed by `pnpm smoke:matterhorn-product-browser`.

## 2026-07-10 Assessment Response Pass: Bittensor Evidence Reference Lane

Trigger: the assessment recommended depth-first desk hardening rather than adding more shallow protocol surface. Bittensor is the best reference lane, but Bittensor public-read results and external-signer receipts needed to flow through the same project evidence story as Sui previews, generated media, outputs, and recent activity.

What changed:

- `apps/server/src/server.ts`
  - Added a shared Bittensor workspace evidence writer that:
    - writes artifacts under `outputs/bittensor/<session>/...`;
    - records `artifact_saved` and `completed` task events;
    - records audit entries with display-safe metadata;
    - marks outputs as non-custodial, not signed by Matterhorn, and safe for project evidence.
  - Added `POST /workspace/:id/bittensor/evidence/public-read`.
    - Requires writable server mode and collaborator scope.
    - Accepts only public-read evidence kinds such as `wallet_snapshot`, `subnet_context`, `validator_comparison`, `watch_digest`, `chat_result`, and `readiness_report`.
    - Rejects seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, and secret-shaped fields before storage.
  - Added `POST /workspace/:id/bittensor/extrinsics/receipt`.
    - Requires writable server mode and collaborator scope.
    - Builds a public external-signer receipt from preview, public hashes, signer address, and optional public result metadata.
    - Refuses raw signatures and signed payload fields; stores only public receipt metadata and hashes.
- `apps/server/src/project-evidence-routes.e2e.test.ts`
  - Added Bittensor public-read evidence coverage.
  - Added Bittensor external-signer receipt evidence coverage.
  - Added negative coverage proving signing secrets are rejected before storage.
  - Verifies Bittensor artifacts appear in `/workspace/:id/evidence?desk=bittensor` and `/workspace/:id/data-ledger?kind=output&desk=bittensor`.
- `apps/app/src/app/lib/matterhorn-server.ts`
  - Added typed frontend client methods:
    - `workspaceBittensorPublicReadEvidence`;
    - `workspaceBittensorReceiptEvidence`.
  - Added small Bittensor workspace evidence response/input types so UI code can call these routes without raw URL strings.
- `apps/app/tests/backend-capability-ui-contract.test.ts`
  - Added app-client route assertions for the two Bittensor workspace evidence methods.
  - Updated a stale wallet-settings copy assertion to the current concise wallet support wording.
- `scripts/matterhorn-platform-safety-gate.mjs`
  - Added `apps/server/src/project-evidence-routes.e2e.test.ts` to the `desk.depth` stage so Bittensor desk depth now includes evidence/output persistence, not only launch-card contracts.
- `scripts/matterhorn-platform-safety-gate.test.mjs`
  - Updated safety-gate contract assertions for the new desk-depth coverage.

Verification:

```bash
bun test apps/server/src/project-evidence-routes.e2e.test.ts
bun test apps/app/tests/backend-capability-ui-contract.test.ts
node scripts/matterhorn-platform-safety-gate.test.mjs
node scripts/matterhorn-platform-safety-gate.mjs --only desk.depth
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app typecheck
node scripts/matterhorn-platform-safety-gate.mjs --only desk.depth,product.readiness
```

Result: all commands passed.

Next recommended slice:

- Wire Bittensor desk task completion UI to call `workspaceBittensorPublicReadEvidence` when a public-read task produces a user-visible result.
- Add a compact run-history page/drawer that defaults Home to the last 2-3 meaningful events but keeps the full evidence timeline expandable.
- Continue route-specific bounded-body parsing for billing webhook and small control-plane POST/PATCH routes.
- Run a live browser smoke once the local dev stack is available, checking Start task -> prompt sent -> Bittensor output saved -> Project Activity/Outputs row appears.

## 2026-07-10 Assessment Response Pass: Compact Project Activity + Run History

Trigger: product testing showed Home still felt like a raw run log. The desired behavior is a compact Home summary with an expandable/full run-history surface, not a continuous list of every desk run.

What changed:

- `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`
  - Kept the Home/Settings placement in collapsed "latest activity + Run history" mode when a full history route is available.
  - Removed the visible bounded "N recent" count from the compact summary. The Home surface now reads as a latest-event preview, while `/workspace/:id/history` remains the full ledger surface.
  - Preserved the existing detail sheet, output-opening bridge, error state, loading state, and no-raw-prompt guarantees.
- `apps/app/tests/recent-activity-contract.test.ts`
  - Added a regression assertion that the compact summary does not show a bounded event count.
  - Preserved contracts for the full run-history route, filtered project ledger page, detail sheet, and raw-prompt redaction.

Verification:

```bash
bun test apps/app/tests/recent-activity-contract.test.ts apps/app/tests/recent-activity-normalize.test.ts
pnpm --filter @matterhorn-work/app typecheck
```

Result: all commands passed.

Next recommended slice:

- Continue route-specific bounded-body parsing for billing webhook and small control-plane POST/PATCH routes.
- Wire Bittensor public-read completion UI into `workspaceBittensorPublicReadEvidence` when a visible result is produced.
- Run live browser smoke when the local dev stack is available, checking that Home shows only latest activity and Run history opens the full ledger.

## 2026-07-10 Assessment Response Pass: Bounded Billing + Control-Plane Bodies

Trigger: the platform assessment called out local-router/daemon/backend perimeter hardening. The money path and control-plane mutation routes should not rely on unbounded `request.json()`/`request.text()` parsing.

What changed:

- `apps/server/src/server.ts`
  - Replaced the generic `request.json()` helper with a streaming bounded JSON reader.
  - Added a generous default JSON ceiling for existing API compatibility.
  - Added explicit smaller ceilings for local control-plane mutations:
    - runtime upgrade;
    - workspace model selection;
    - team-access token creation;
    - host token creation;
    - wallet safety policy updates;
    - wallet safety event logging;
    - wallet simulation;
    - workspace data policy updates;
    - workspace feedback.
  - Oversized bodies now fail before JSON parsing with `413 payload_too_large`.
- `apps/server/src/billing-routes.ts`
  - Added a bounded billing JSON parser for checkout/portal routes.
  - Added a separate bounded raw-body reader for Stripe webhooks.
  - Stripe webhook signature verification still uses the exact raw payload after the size check.
  - Oversized billing mutations and webhooks return structured `payload_too_large` responses.
- `apps/server/src/billing-routes.e2e.test.ts`
  - Added coverage for overlarge checkout payload rejection.
  - Added coverage for overlarge Stripe webhook payload rejection before signature handling.
- `apps/server/src/backend-security.e2e.test.ts`
  - Added coverage proving a control-plane mutation rejects an overlarge JSON body.

Verification:

```bash
bun test apps/server/src/billing-routes.e2e.test.ts apps/server/src/backend-security.e2e.test.ts
pnpm --filter matterhorn-work-server typecheck
```

Result: all commands passed. The focused integration run covered 72 tests with 0 failures.

Next recommended slice:

- Wire Bittensor public-read completion UI into `workspaceBittensorPublicReadEvidence` when a visible task result is produced.
- Add live browser smoke for Start task -> prompt sent -> evidence/output row appears.
- Continue reviewing other high-risk body routes, especially extension/action and workflow execution paths, without breaking legitimate larger prompt/config payloads.

## 2026-07-10 Assessment Response Pass: Bittensor Visible Result -> Outputs Evidence

Trigger: the Bittensor reference lane had backend routes for public-read evidence, but the app did not expose a user-controlled way to save a visible Bittensor result into Outputs and Project Activity.

What changed:

- `apps/app/src/react-app/domains/session/surface/message-list.tsx`
  - Exported `BittensorPublicEvidenceCard`.
  - Added a `Save output` action on rendered Bittensor tool cards when the parent session surface can write workspace evidence.
  - The action is explicit and user-controlled; it is not an automatic save.
  - Threaded an optional `onSaveBittensorEvidence` callback through `SessionTranscript -> MessageBlockRow -> StepsContainer -> StepRow -> BittensorToolCards`.
- `apps/app/src/react-app/domains/session/surface/session-surface.tsx`
  - Added `handleSaveBittensorEvidence`.
  - Calls `workspaceBittensorPublicReadEvidence` with the active workspace/session.
  - Persists only display-safe public card fields plus public Bittensor context. It deliberately does not persist raw `card.data` or `card.source` wholesale.
  - On success, refreshes `matterhorn:project-evidence-updated` and `matterhorn:task-log-updated`, shows a success notice, and records inspector event `bittensor.evidence.saved`.
  - On failure, shows a warning notice and records `bittensor.evidence.save_failed`.
- `apps/app/tests/bittensor-session-context.test.ts`
  - Added source contracts proving visible Bittensor cards can be explicitly saved as public project evidence.
  - Added safety contract proving raw tool internals are not persisted wholesale.

Verification:

```bash
bun test apps/app/tests/bittensor-session-context.test.ts apps/app/tests/workflow-stage-card.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
pnpm --filter @matterhorn-work/app typecheck
bun test apps/server/src/project-evidence-routes.e2e.test.ts
```

Result: all commands passed.

Next recommended slice:

- Run a live browser smoke with a Bittensor card result and click `Save output`, then verify the output row appears in Project Activity, Run history, and Outputs.
- Extend the same explicit evidence-save pattern to Hyperliquid and Polymarket preview/handoff cards after their public-card data contracts are confirmed.

## 2026-07-10 Assessment Response Pass: Orchestrator Daemon Body Limit

Trigger: the platform assessment called out local control surfaces as a drive-by-page risk. The orchestrator daemon already had token and loopback-CORS guards in this branch, but its daemon JSON body reader was still unbounded.

What changed:

- `apps/orchestrator/src/cli.ts`
  - Added `ROUTER_DAEMON_MAX_BODY_BYTES = 64 * 1024`.
  - The daemon request body reader now counts bytes while streaming and rejects oversized bodies before JSON parsing.
  - Oversized daemon mutation requests return structured `413` responses with `payload_too_large`.
- `scripts/orchestrator-daemon-security.test.mjs`
  - Extended the source gate to require the daemon body ceiling, byte counting, 413 path, and structured payload-too-large response.

Verification:

```bash
node scripts/orchestrator-daemon-security.test.mjs
node scripts/matterhorn-platform-safety-gate.mjs --only daemon.electron.perimeter
pnpm --filter matterhorn-work-orchestrator typecheck
```

Result: all commands passed. Note: an earlier attempted filter `@matterhorn-work/orchestrator` matched no packages; the actual package name is `matterhorn-work-orchestrator`.

Next recommended slice:

- Run `wallet.approval.behavior` and `money.path.security` safety-gate stages together, then run the live wallet browser smoke if the local app stack is up.
- Continue high-risk body-size review for extension/action and workflow execution routes.
- Add behavioral daemon tests if a future pass exposes the daemon HTTP server in a testable helper rather than relying on source-contract checks.

## 2026-07-10 Assessment Response Pass: Small Control-Route Body Limits

Trigger: after adding bounded readers for billing, wallet policy, feedback, and core control-plane routes, many server mutations still used the broad default parser. This pass tightens routes whose payloads should always be small while leaving prompts, notes, workflow execution, and file payloads on the broader default pending explicit product limits.

What changed:

- `apps/server/src/server.ts`
  - Applied the 65 KB control-plane JSON ceiling to:
    - `POST /tokens`;
    - `PUT /env`;
    - `POST /voice/realtime/session`;
    - `POST /workspaces/local`;
    - `PATCH /workspaces/:id/display-name`;
    - `POST /workspace/:id/sessions`;
    - `POST /workspace/:id/artifacts/resolve`;
    - `POST /workspace/:id/files/sessions`;
    - `POST /files/sessions/:sessionId/renew`.
  - Kept larger/default parsing for user content and prompt-like paths to avoid breaking legitimate chat/file/workflow use.
- `apps/server/src/backend-security.e2e.test.ts`
  - Added host-control regression coverage for oversized `POST /tokens` and `POST /workspaces/local` payloads.
- `apps/server/src/wallet-safety-policy-routes.e2e.test.ts`
  - Split the combined viewer-token/secret-payload/read-only rejection test into two smaller tests so the money-path gate no longer races Bun's default 5s timeout while booting multiple in-process servers.

Verification:

```bash
bun test apps/server/src/backend-security.e2e.test.ts
bun test apps/server/src/wallet-safety-policy-routes.e2e.test.ts
pnpm --filter matterhorn-work-server typecheck
node scripts/matterhorn-platform-safety-gate.mjs --only money.path.security,product.readiness
```

Result: all commands passed. The focused backend security suite now has 37 passing tests, and the combined money-path/product-readiness gate passed with 47 money-path tests.

Next recommended slice:

- Re-run `money.path.security` and `product.readiness` safety-gate stages.
- Continue explicit sizing for generated-media and extension/action routes after documenting their legitimate max payloads.
- Run live browser smoke for wallet approval and Bittensor evidence save if a stable local app URL is available.

## 2026-07-10 Assessment Response Pass: Live Wallet Smoke and Browser RPC Cleanup

Trigger: strict wallet browser smoke passed the approval behavior but failed on console noise from viem's default `eth.merkle.io` public RPC, which is blocked by browser CORS. This was a real frontend reliability issue because the wallet flow could succeed while still polluting the console and confusing QA.

What changed:

- `apps/app/src/react-app/domains/wallet/lib/gas-estimate.ts`
  - Pinned app-side viem gas estimation to explicit CORS-safe Base RPC endpoints:
    - Base: `https://mainnet.base.org`;
    - Base Sepolia: `https://sepolia.base.org`.
- `apps/app/src/react-app/infra/wagmi-config.ts`
  - Pinned Wagmi transports to the same explicit Base RPC endpoints instead of relying on default chain RPCs.
- `apps/app/src/react-app/domains/wallet/lib/ens.ts`
  - Pinned client-side ENS lookups to `https://ethereum-rpc.publicnode.com`.
- `apps/server/src/tools/ens-resolver.ts`
  - Matched the ENS resolver's Ethereum mainnet endpoint to the same explicit publicnode RPC for consistency.
- `scripts/wallet-approval-browser-smoke.mjs`
  - Made strict smoke selectors resilient to repeated address/value text while preserving the real behavioral assertions.
- `scripts/wallet-approval-browser-smoke.test.mjs`
  - Added source-contract coverage for the selector hardening.
- `apps/app/tests/wallet-approval-security-contract.test.ts`
  - Added source contracts proving gas estimation and ENS helpers do not use implicit browser-hostile RPC defaults.
- `apps/app/tests/wallet-runtime-connectors-contract.test.ts`
  - Added source contract proving Wagmi config uses explicit transports for Base and Base Sepolia.

Verification:

```bash
bun test apps/app/tests/wallet-approval-security-contract.test.ts apps/app/tests/wallet-runtime-connectors-contract.test.ts
node scripts/wallet-approval-browser-smoke.test.mjs
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
node scripts/wallet-approval-browser-smoke.mjs --strict --url http://127.0.0.1:5175/workspace/ws_d6a5b5572860/session --output-dir qa-reports/wallet-approval-browser-smoke-current-hardening
node scripts/matterhorn-platform-safety-gate.mjs
```

Result: all commands passed. The live strict wallet smoke passed all steps with no console errors:

- open wallet settings;
- connect mock wallet;
- open session;
- block failed simulation;
- approve reviewed Base Sepolia transaction;
- block mainnet transaction.

Artifacts:

- `qa-reports/wallet-approval-browser-smoke-current-hardening/summary.json`
- `qa-reports/wallet-approval-browser-smoke-current-hardening/wallet-approval-browser-smoke.png`

Full platform safety gate result: passed all 10 stages:

1. Wallet approval behavior
2. Money-path backend security
3. Desk depth
4. Billing integrity
5. Local router perimeter
6. Daemon and Electron perimeter
7. Observability and error boundaries
8. Matterhorn design contract
9. Browser smoke contracts
10. Product readiness

Next recommended slice:

- Add the same live smoke pattern for Bittensor visible result -> `Save output` -> Project Activity/Outputs evidence refresh.
- Define explicit payload ceilings for generated-media and extension/action routes after documenting legitimate large request sizes.
- Convert the orchestrator daemon source contract into a behavioral HTTP test if/when the daemon server is exposed via a testable helper.

## 2026-07-10 Assessment Response Pass: MCP Control Payload Ceiling

Trigger: generated-media already had a dedicated 256 KB bounded body reader and the experimental extension action route was already on the 65 KB control-plane parser. Workspace MCP add/toggle routes were still using the broad 1 MB default parser, even though they are small config mutations.

What changed:

- `apps/server/src/server.ts`
  - `POST /workspace/:id/mcp` now uses `CONTROL_PLANE_JSON_BODY_MAX_BYTES` with label `MCP config`.
  - `POST /workspace/:id/mcp/:name/enabled` now uses `CONTROL_PLANE_JSON_BODY_MAX_BYTES` with label `MCP toggle`.
  - Rejection happens before approval prompts or workspace config writes.
- `apps/server/src/backend-security.e2e.test.ts`
  - Added coverage proving overlarge MCP add and toggle requests return `413 payload_too_large`.

Verification:

```bash
bun test apps/server/src/backend-security.e2e.test.ts
pnpm --filter matterhorn-work-server typecheck
node scripts/matterhorn-platform-safety-gate.mjs --only money.path.security
```

Result: all commands passed. The money-path safety-gate slice now covers 48 passing tests.

Next recommended slice:

- Continue route-specific body-size review for commands, workspace import, workflow execution, and protocol preview routes, choosing explicit ceilings only after confirming legitimate maximum payloads.
- Add Bittensor visible-result save smoke only after the local fake engine can deterministically emit a Bittensor card in chat.

## 2026-07-10 Assessment Response Pass: Billing Mutation Truth and Chat Image Seam

Trigger: the platform assessment called out billing webhook lifecycle fragility and the two-codebase/product seam. Billing replay/stale events were already guarded, but the response still made ignored duplicates/stale events look like fresh workspace syncs. The chat image composer also still felt like a separate mini tool rather than a native composer accessory.

What changed:

- `packages/types/src/billing.ts`
  - Added `webhookMutation` to `MatterhornBillingWebhookStripeResponse`.
  - Values: `synced`, `duplicate_event`, `stale_event`, `checkout_mismatch`, `subscription_mismatch`, `not_handled`.
- `apps/server/src/billing-routes.ts`
  - `persistStripeWebhookBilling` now returns an explicit mutation result.
  - Duplicate Stripe event IDs return `workspaceSynced: false` and `webhookMutation: "duplicate_event"`.
  - Stale subscription lifecycle events return `workspaceSynced: false` and `webhookMutation: "stale_event"`.
  - Mismatched checkout/subscription events continue to be rejected instead of silently syncing.
- `apps/server/src/billing-routes.e2e.test.ts`
  - Locked the duplicate and stale-event response semantics.
- `apps/app/src/react-app/domains/session/media/session-image-generation-panel.tsx`
  - Tightened the image generation trigger into one compact composer accessory row.
  - Added `aria-controls` to the expanded content.
  - Moved capability hint inline so the composer no longer creates an extra status column.
- `apps/app/src/react-app/domains/session/media/image-generation-composer.tsx`
  - Replaced the boxed chat-draft prompt with a subtle inline `Use chat draft` action.
  - Kept the explicit user sequence: click `Use draft`, then click `Create image`.
  - Replaced the boxy input area with a softer composer row while preserving shadcn/Base UI primitives.
- `apps/app/tests/image-generation-ui-contract.test.ts`
  - Updated the UI contract for `Use chat draft`, disclosure semantics, and the non-auto-send behavior.

Verification:

```bash
bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts
bun test apps/server/src/billing-routes.e2e.test.ts
bun test apps/app/tests/wallet-approval-security-contract.test.ts apps/app/tests/wallet-approval-render-behavior.test.tsx apps/app/tests/wallet-send-behavior.test.ts apps/server/src/wallet-safety-policy-routes.e2e.test.ts apps/server/src/transaction-simulation-safety.test.ts
bun test apps/server/src/backend-security.e2e.test.ts apps/server/src/memory-routes.e2e.test.ts
bun test apps/opencode-router/test/health-send.test.js scripts/orchestrator-daemon-security.test.mjs
node scripts/electron-packaging-sources.test.mjs
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
```

Result: all commands passed.

Notes:

- `bun test apps/opencode-router/test/health-send.test.js` is the correct router test command in this repo. A plain `node --test` attempt cannot load the router test's `bun:` imports.
- This pass did not stage or commit. The worktree remains shared/dirty; do not delete untracked scratch, QA, or `.matterhorn-work/` files during consolidation.

Next recommended slice:

- Add a deterministic Bittensor result -> Save output -> Outputs/Project Activity browser smoke once the fake local engine can emit a stable Bittensor card.
- Continue explicit body-size ceilings for high-risk control routes after confirming legitimate payload sizes.
- Start a durable observability view for safety events, billing webhook mutations, and generated-media/NFT evidence instead of burying these in disconnected panels.

## 2026-07-10 Assessment Response Pass: Memory Vault Durability and Full Gate Rerun

Trigger: the engineering directive called out memory-vault path traversal risk, corrupt index handling, capped export behavior, and non-atomic metadata writes.

What changed:

- `packages/matterhorn-memory-vault/src/index.ts`
  - Added a local safe-ID guard for memory record IDs before records are written or used in markdown filenames.
  - Rejected `.` / `..` / slash-shaped IDs by allowing only letters, numbers, periods, underscores, and dashes.
  - Added `listAllRecords` for trusted export/internal paths while keeping normal UI search/list capped.
  - Changed `exportBundle` to read all non-deleted records directly from the vault index instead of going through the capped `listRecords` UI path.
  - Changed corrupt `memory-index.json` and `memory-suggestions.json` handling to fail closed with an explicit error instead of silently replacing the vault with an empty index.
  - Kept `ENOENT` as the only empty-vault fallback.
  - Switched index and suggestion-inbox writes to temp-file-plus-rename atomic JSON writes.
- `apps/server/src/server.ts`
  - Workspace memory export now uses the unbounded trusted memory-vault listing path, so exports cannot omit records beyond the UI list cap.
  - Corrupt memory index/inbox errors are converted to a safe `503 memory_store_unavailable` response instead of leaking raw parser text.
  - Invalid record IDs are converted to `400 invalid_memory_id`.
- `apps/server/src/memory-routes.e2e.test.ts`
  - Added route coverage proving workspace memory export includes 205 matching records beyond the UI list cap.
  - Added route coverage proving corrupt workspace memory metadata returns a safe user-facing error.
- `scripts/matterhorn-memory-vault.test.mjs`
  - Added regression coverage for traversal-shaped record IDs.
  - Added regression coverage proving exports include 505 records, beyond the public list cap.
  - Added regression coverage proving a corrupt index throws and preserves the corrupt file instead of wiping it.
- `apps/server/src/backend-security.e2e.test.ts`
  - Added explicit connection-close/timeout behavior in security tests so token and direct-fetch checks do not leave long-lived handles.
- `apps/server/src/billing-routes.e2e.test.ts`
  - Added connection-close handling and force-stop cleanup around helper/fake servers.
  - This keeps billing integrity coverage from looking like a product hang when helper sockets linger.

Verification:

```bash
pnpm --filter @matterhorn-work/memory-vault build
node scripts/matterhorn-memory-vault.test.mjs
bun test apps/server/src/memory-routes.e2e.test.ts apps/server/src/billing-routes.e2e.test.ts
pnpm --filter matterhorn-work-server typecheck
node scripts/matterhorn-platform-safety-gate.mjs
```

Result:

- Memory-vault package build passed.
- Memory-vault smoke gate passed.
- Memory and billing route suites passed: 48 tests, 0 fail.
- Server typecheck passed.
- Full platform safety gate passed all 10 stages after the memory-vault patch:
  1. Wallet approval behavior
  2. Money-path backend security
  3. Desk depth
  4. Billing integrity
  5. Local router perimeter
  6. Daemon and Electron perimeter
  7. Observability and error boundaries
  8. Matterhorn design contract
  9. Browser smoke contracts
  10. Product readiness

Notes:

- This pass did not stage, commit, or delete untracked scratch files.
- `packages/matterhorn-memory-vault/dist/` was rebuilt for the smoke test but remains clean in git status.
- The worktree remains shared and very dirty from parallel Codex/Kimi/Minimax work; consolidate intentionally before PR.

Next recommended slice:

- Add route-level tests around corrupted memory vault metadata so API responses are friendly and do not surface raw package errors.
- Continue explicit body-size review for remaining high-risk mutation routes.
- Add a browser smoke that proves a desk result can be saved to Outputs and then appears in Project Activity/Run History.
