# Matterhorn deep product sweep — 2026-08-07

## Outcome

The current task-first redesign is locally release-candidate quality. No open P0 or confirmed source-level P1 issue remains after this sweep. Three issues were found and fixed: a high-severity `js-yaml` denial-of-service advisory, billing webhook fixtures whose subscription period expired on the audit date, and skipped heading levels in Settings/MCP surfaces.

The hosted canary is not yet a complete go-live candidate because it has no configured API backend or hosted acceptance accounts. The public entry correctly reports that the account service is unreachable; authenticated workspace, two-account isolation, managed-engine output, exact-origin production CORS, monitoring, backup/restore, and rollback behavior therefore cannot be certified against the live host yet.

## Flow coverage

1. Public entry: desktop and 375 px mobile, sign-in/create-account affordances, failure copy, Security/Privacy adjacency, focus and target sizing.
2. Authenticated shell and Home: navigation, active location, task-first hierarchy, recent evidence and recovery states.
3. Protocol and Longevity desks: starters, read-only public-Beta policy, routing, history, task handoff, evidence, and approval boundaries.
4. AI work states: loading, streaming, partial result, success, error/recovery, revert, feedback, and saved outputs.
5. MCPs: compact rail, syncing/offline/partial/error/success states, connected servers, full Settings catalog, and semantic structure.
6. Settings: navigation semantics, landmarks, section hierarchy, theme contrast, touch targets, and failure isolation.
7. Responsive/accessibility: 320/375/768/1024/1440 contracts, overflow, safe areas, virtual-keyboard resize simulation, reduced motion, keyboard focus, and touch targets.
8. Frontend/backend/security: route and bundle boundaries, auth, scopes, workspace isolation, body/rate limits, CORS, redaction, secret scanning, signed Stripe webhooks, read-only enforcement, wallet review, audit logs, health/metrics, and dependency advisories.

## Findings

### P0

None.

### P1 — fixed

- Dependency security: the lockfile resolved `js-yaml` 4.3.0, which was reported by the dependency gate for a high-severity quadratic-complexity denial-of-service issue. The override and lockfile now use 4.3.1; the dependency audit reports 1,406 locked versions and no low-or-higher advisories.
- Backend release evidence: three Stripe subscription tests depended on a fixed period ending 2026-08-07 13:23 UTC. Once that time passed, the production billing projection correctly treated the fixture as expired, making the release gate fail. Fixtures now use rolling, ordered timestamps while retaining stale-event and cancellation assertions.

### P2 — fixed

- Settings semantics: Models and MCP Settings skipped from the route `h1` to `h3`; MCP catalog items then used `h4`. Shared section titles now use `h2`, MCP sections select `h2`/`h3` by embedding context, and catalog items select `h3`/`h4`. Live MCP DOM proof is `H1 → H2 → H3`; visual styling is unchanged.

### Remaining release evidence gaps

- Hosted canary backend and acceptance users are not configured.
- Live engine/session suites skip without `MATTERHORN_WORK_ENGINE_BIN` or `OPENCODE_BIN`; the local managed-supervisor contract passes, but deployed real-model output and two-account isolation remain unproven.
- Wallet acceptance used mock EIP-1193/Sui boundaries; real MetaMask, Coinbase, Phantom, and provider-network behavior still needs hosted acceptance.
- Playwright resize simulation passed, but physical iOS/Android keyboard, non-zero device safe-area insets, VoiceOver, and TalkBack remain hardware checks.
- Exact current hosted Lighthouse was not rerun after this source-only sweep; current production bundle budgets pass and heavy wallet/Shiki/editor runtimes remain intent-loaded.

## Impeccable score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Accessibility | 3/4 | Sequential headings, landmarks, current-page state, focus, reduced motion, and target contracts pass; physical screen-reader traversal remains. |
| Performance | 3/4 | Public/session/settings and wallet bundle gates pass; exact hosted Core Web Vitals need the configured candidate. |
| Responsive | 4/4 | No document overflow at tested breakpoints; mobile entry and shell/composer contracts pass. |
| Theming | 4/4 | Light/dark launch-critical readability and shared token contracts pass. |
| Anti-patterns | 4/4 | Design-system gate passes: no glass-heavy, oversized-radius, harsh-divider, raw-shader, or generic AI UI regression. |
| **Total** | **18/20** | Source and local runtime are strong; the two missing points are live-environment evidence. |

## Verification

- App suite: 825 passed, 0 failed; app typecheck and production web build passed.
- Server suite: 793 passed, 0 failed; server typecheck and build passed.
- Post-clean focused regressions: 55 UI/accessibility tests and 36 billing tests passed.
- Platform safety: all 10 stages passed.
- Dependency audit: 1,406 locked versions, no low+ advisories.
- Auth, production CORS, production environment, release secret-scan, and task-first bundle gates passed.
- Bundle bytes: public 431,194; session route 150,842; session page 568,635; settings 255,811; EVM wallet 480,855; Sui wallet 411,655; Bittensor wallet 896,388.

## Accepted visual evidence

- `ui-ux/10-public-entry-current-desktop.png`
- `ui-ux/11-public-entry-current-mobile-375.png`
- `ui-ux/12-mcp-settings-heading-fixed.png`
- Earlier accepted authenticated-flow captures in `ui-ux/01-authenticated-home.png` through `ui-ux/05-mcp-settings.png` and `ui-ux/08-ai-work-state.png`.

Rejected/black or stale-browser captures are intentionally excluded from the accepted list.
