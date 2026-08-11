# Prediction markets Phase 2 + platform QA

Date: 2026-08-11

Branch: `codex/prediction-markets-phase-2`

Base/deployed commit: `83665443e2879dcd7f626df4e638b4ce2a1ca2d3`

## Outcome

Phase 2 is implemented and locally verified. Matterhorn can now list venue coverage and run one normalized, fail-soft public search across Polymarket, Kalshi, and Manifold. Kalshi and Manifold are explicitly research-only. The existing compliance-gated Polymarket wallet-review path is the only transaction path exposed by this change.

The exact deployed base is healthy, but public launch remains blocked because the hosted CUDOS / ASI:Cloud provider privacy policy is not verified. The live Models page offers seven models and allows selection, then correctly blocks prompt sending. This must be resolved before launch; it is not a Phase 2 code failure.

## Audit health

| # | Dimension | Score | Key finding |
|---|---|---:|---|
| 1 | Accessibility | 3/4 | Core routes have one main landmark, one visible H1, no duplicate IDs, and named controls; a full assistive-technology hardware pass remains outstanding. |
| 2 | Performance | 3/4 | Task-first bundle gate passes; large deferred Shiki and wallet chunks remain intent-only. |
| 3 | Responsive design | 4/4 | Home, Models, Privacy, MCP, Wallet, and public trust pages had no horizontal overflow at the live 455px viewport. |
| 4 | Theming | 4/4 | The new UI uses existing DLS tokens and the scoped desk color; no new hard-coded palette was introduced. |
| 5 | Anti-patterns | 4/4 | The product remains restrained and task-first. No gradient text, decorative glass, oversized radii, arbitrary z-index, or motion-only content was added. |
| **Total** | | **18/20** | **Excellent — one operational launch blocker and one hosted MCP UX issue remain.** |

## Anti-pattern verdict

Pass. The new Phase 2 surface is a compact capability list rather than another nested card grid, and it reuses the platform's established typography, spacing, icon, focus, and responsive vocabulary. The hosted MCP page is the exception: its full catalog is too dense for a surface that begins by saying configuration is unavailable.

## Findings

### [P0] Hosted model provider is policy-blocked

- Location: live Models and Privacy routes; `apps/server/src/provider-privacy.ts`
- Category: Functional / privacy / launch readiness
- Impact: users can sign in, see seven CUDOS / ASI:Cloud models, choose one, and consume no model output because sending is blocked. This prevents the primary task.
- Evidence: live Models DOM reports `Provider policy not verified` and `Sending is blocked in this deployment`; live Privacy reports CUDOS / ASI:Cloud as `Blocked`.
- Recommendation: add current operator verification for no-training, retention, reviewed policy URL, and review date; redeploy; then run one real prompt on every selectable model family and verify usage accounting.
- Suggested command: `$impeccable harden`

### [P1] Hosted MCP screen advertises actions that cannot complete

- Location: `apps/app/src/react-app/domains/settings/pages/mcp-view.tsx:1582`; `apps/app/src/react-app/domains/connections/store.ts:386`
- Category: UX / information architecture
- Impact: hosted users are told MCP configuration is local-only, but still see `Add Custom MCP`, a client-config generator, marketplace search, and setup cards. This looks broken rather than intentionally unavailable.
- Evidence: the live route exposes 29 controls, `Add Custom MCP`, and the full catalog while reporting `MCP configuration is only available for local workspaces.`
- Recommendation: create a hosted summary mode that shows managed desk tools, status, and supported connections only; hide custom config/catalog controls until hosted MCP installation exists.
- Suggested command: `$impeccable distill`

### [P2] Cross-venue capability is still branded as the Polymarket desk

- Location: `apps/app/src/react-app/domains/session/chat/session-page.tsx`; `apps/app/src/react-app/domains/session/workflows/protocol-desk-ui.ts`
- Category: Discoverability / information architecture
- Impact: Phase 2 adds Kalshi and Manifold discovery, but users may assume the desk remains Polymarket-only. The new `Compare venues` task and venue-coverage strip mitigate this but do not fully resolve the mental model.
- Recommendation: after this safe first slice ships, rename the research surface to `Prediction markets` while preserving an explicit `Polymarket wallet actions` subsection.
- Suggested command: `$impeccable clarify`

### [P2] Hosted Privacy copy calls production a local build

- Location: `apps/server/src/backend-data-policy.ts:33`; `apps/server/src/server.ts:4896`
- Category: UX copy / trust
- Impact: `No automatic purge window in this local build..` is both environment-inaccurate and has duplicate punctuation, which weakens a high-trust surface.
- Recommendation: return deployment-neutral retention copy from the backend and let the UI own sentence punctuation.
- Suggested command: `$impeccable clarify`

### [P3] Large deferred specialist chunks remain

- Location: production build output
- Category: Performance
- Impact: no initial-load regression, but opening syntax highlighting or specialist wallet runtimes incurs a larger deferred transfer.
- Evidence: Shiki 1.85 MB, Bittensor wallet 896 KB, translations 946 KB; the public entry graph is 431,765 bytes and the session page is 581,689 bytes, both within gates.
- Recommendation: keep monitoring real route timings and split only if field data shows interaction delay.
- Suggested command: `$impeccable optimize`

## Phase 2 verification

- Polymarket, Kalshi, and Manifold venue registry is typed and client-visible.
- Live public search normalizes venue, market type, probability, liquidity, source time, status, and close time.
- Kalshi and Manifold are research-only at the type, agent-prompt, MCP, starter-task, documentation, and UI layers.
- Provider calls use fixed allowlisted HTTPS endpoints, bounded response bodies, timeouts, retries, query length/limit clamps, and per-venue failure isolation.
- Live smoke: `bitcoin` returned healthy Kalshi and Manifold results; other queries returned Polymarket, Kalshi, and Manifold together. A failed venue does not discard healthy results.
- The checked-in managed Polymarket agent and generated workspace agent remain synchronized and deny tools by default.

## Platform verification

- App: 885 tests passed.
- Server: 831 tests passed after the final exact-tree rerun.
- App and server typecheck: passed.
- App web production build and server build: passed.
- Platform safety gate: all 10 stages passed.
- Design-system gate: passed.
- Desk-agent contract: passed.
- Task-first bundle budget: passed.
- Secret scan: 990 source files, zero findings.
- Dependency audit: 1,406 locked versions, zero low-or-higher advisories.
- Production CORS contract, model prompt-path audit, backend/frontend linkage, market safety, and Polymarket read/preview QA: passed.
- Hosted strict deployment probe: READY for exact commit `83665443e2879dcd7f626df4e638b4ce2a1ca2d3`, including same-origin proxy, health, build provenance, security headers, exact-origin CORS, and untrusted-origin rejection.

## Browser coverage

Signed-in live routes checked: Home, Bittensor, Hyperliquid, Polymarket, Sui, Models, Privacy, MCPs & Tools, Wallet, Notes, Memory, and Outputs.

Public routes checked: Privacy, Security, Terms, Support, and Status.

At 455px, all checked routes matched document width to viewport width. Core routes had one `main`, one visible H1, no duplicate IDs, and no unnamed visible controls in the DOM checks. Wallet numeric inputs were correctly named through associated labels; the extra settings H1 is zero-sized responsive markup and not visible.

Current-run screenshot: `screenshots/01-live-polymarket-455.jpg`. Additional in-app screenshots timed out at the browser capture layer, so subsequent route verification used live DOM and geometry checks rather than claiming visual evidence that was not captured.

## Positive findings

- The deployed proxy and control plane are now healthy and provenance-verified.
- Privacy fails closed rather than silently sending prompts to an unverified provider.
- Every financial desk offers a blank-chat path plus bounded task starters.
- Wallet copy consistently says keys stay in the user's wallet and separates review from submission.
- Notes, Memory, and Outputs clearly explain persistence and user control.
- Public trust pages are responsive, semantically structured, and available without sign-in.
- Phase 2 does not broaden transaction authority.

## Recommended actions

1. **[P0] `$impeccable harden`**: verify CUDOS / ASI:Cloud provider privacy evidence, redeploy, and run real model prompts.
2. **[P1] `$impeccable distill`**: replace the hosted MCP catalog with a truthful managed-tools summary.
3. **[P2] `$impeccable clarify`**: fix hosted retention copy and plan the Prediction markets naming transition.
4. **[P3] `$impeccable optimize`**: monitor deferred specialist chunk interaction timing.
5. **[Final] `$impeccable polish`**: rerun the route matrix and visual pass after the blockers are resolved.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see the score improve.
