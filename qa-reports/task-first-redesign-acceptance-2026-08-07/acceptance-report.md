# Matterhorn task-first redesign — local acceptance

Date: 2026-08-07

Branch: `codex/task-first-redesign`

Candidate mode: `VITE_MATTERHORN_DEPLOYMENT=web`, `VITE_MATTERHORN_PUBLIC_BETA=1`

## Decision

**Local candidate: PASS. Hosted release: PENDING.**

The approved A+B+C product system is implemented and locally accepted:

- **A — task-first product structure:** one adaptive Home action, three recommended protocol tasks, progressive task catalogs, a guided Longevity sequence, canonical desk routes, and compact contextual rails.
- **B — agent activity language:** `thinking-orbs` supplies the visual thinking primitive, mapped to Matterhorn planning, composing, and synthesizing states with specific task labels, elapsed time, reduced-motion support, and live-region ownership.
- **C — restrained Matterhorn palette and hierarchy:** the confirmed dark, ice-blue, and desk-accent system is preserved; desk color is an identity cue rather than a full-page treatment.

No local P0 or P1 product blocker remains. The exact hosted account, production headers/origin, real engine completion, and deployed authenticated visual gates still require production Cloud configuration and acceptance credentials.

## Acceptance matrix

| Milestone | Result | Evidence |
|---|---|---|
| Shell and location model | PASS | One canonical header location; Home/desk/Settings names are accurate; chat and Settings each expose one `main` landmark. |
| Home activation | PASS | Exactly one context-aware primary action; recent task timestamps accept engine seconds or milliseconds; recommendations open a desk without sending. |
| Protocol desks | PASS | Bittensor, Hyperliquid, Polymarket, and Sui show three recommended safe starts, with the remaining catalog behind `More tasks`. Public Beta hides all reviewed wallet-action starters. |
| Longevity workflow | PASS | Route-backed `desk=wellness`, deterministic reload/Back/Forward, current stage plus next-stage sequence, and non-medical boundaries. |
| MCP information architecture | PASS | Compact rail deliberately covers skeleton, empty, syncing, offline, partial, error, and success states; it contains connected names/readiness, current client, sync recency, recovery, and `Manage MCPs`. The full catalog and configuration remain in Settings. |
| Settings hierarchy | PASS | Overview is the single page `h1`; Profile and Workspace health are subordinate sections; active navigation exposes `aria-current`. |
| Agent progress lifecycle | PASS | A desk task immediately renders `Working on <task>` with an activity orb, retains partial output, exposes success/error/correction/revert/feedback/saved-output states, and clears active motion on terminal output. |
| Responsive and accessibility contracts | PASS | Live 320×568, 375×812, 768×1024, 1024×768, and 1440×900 checks show no horizontal overflow. Mobile controls, safe areas, reduced motion, virtual-keyboard resizing, landmarks, focus, and active-page semantics are covered. Physical iOS/Android keyboard, notch-inset, VoiceOver, and TalkBack checks remain release-device evidence rather than source blockers. |
| Public Beta safety | PASS | Reviewed actions fail closed in both focused desk catalogs and blank-session workflow cards. Public Beta renders read-only research/evidence copy and prompts, with no wallet-action group or preparation CTA. Ten-stage platform safety gate passes. |
| Production build and budgets | PASS | Minified public-Beta build and the executable bundle gate pass. Session is 150,842B and Settings 255,811B; signed-out JS is 431,194B; EVM/Sui/Bittensor wallet families are 480,855B/411,655B/896,388B. Initial Session and Settings graphs contain no wallet runtime, Shiki, translations, editor, or spreadsheet chunks. |
| Hosted release | PENDING | Requires exact deployed URL/account, strict hosted task completion, production HTTPS/CORS/security headers, two-account isolation, mobile/tablet visual capture, and rollback/monitoring evidence. |

## Automated evidence

- App suite: **822 passed, 0 failed**, 111 files, 5,314 expectations.
- App typecheck: **PASS**.
- Matterhorn platform safety gate: **10/10 stages PASS**.
- Bundle-budget contract and production graph gate: **PASS**.
- Focused public-Beta launch-policy and starter suite: **28 passed, 0 failed**.
- Focused responsive/accessibility suite: **60 passed, 0 failed**.
- Public-Beta production web build: **PASS**.
- Live delayed-response fixture:
  - active: `Working on Review subnet emissions` and `Thinking Review subnet emissions` present;
  - completed: synthetic assistant response present and activity label absent.
- Live compact MCP landmark check: one `main`, zero nested `main` elements.
- Live Settings hierarchy check: one `h1` (`Overview`), expected `h2` sections, one `main`.
- Live mobile checks: zero document overflow at 320×568, 375×812, and 768×1024; first 320px workflow card is fully visible; focused composer and public-auth fields remain visible after simulated viewport collapse.

## Performance budget evidence

| Artifact | Baseline | Accepted candidate | Budget |
|---|---:|---:|---:|
| Signed-out JS graph | 431,194B | 431,194B | <650,000B |
| Session route | 784,121B | 150,842B | <600,000B |
| Settings route | 814,160B | 255,811B | <600,000B |
| Wallet — EVM | part of 1,795,984B monolith | 480,855B | <900,000B |
| Wallet — Sui | part of 1,795,984B monolith | 411,655B | <900,000B |
| Wallet — Bittensor | part of 1,795,984B monolith | 896,388B | <900,000B |

The heavy wallet runtime now activates only for wallet/protocol destinations or a pending approval. Shiki remains an on-demand deferred vendor chunk and loads only when fenced code is rendered. Experimental translations, artifact editing, and spreadsheet code remain behind their owning feature boundary.

## Visual evidence

- [Project Home](screenshots/01-home-desktop.png)
- [Bittensor task workspace](screenshots/02-bittensor-desktop.png)
- [Longevity guided sequence](screenshots/03-longevity-desktop.png)
- [Compact MCP rail](screenshots/04-mcp-rail-desktop.png)
- [Full MCP Settings](screenshots/05-mcp-settings-desktop.png)
- [Settings Overview](screenshots/06-settings-overview-desktop.png)
- [Completed agent task](screenshots/07-agent-task-desktop.png)
- [Active Matterhorn thinking state](screenshots/08-agent-thinking-desktop.png)
- [320px mobile starter acceptance](../../ui-ux-audit-2026-08-07/responsive-a11y/starter-cards-mobile-320-m5-fixed.png)

## Third-party design primitive

The activity visualization uses `thinking-orbs@0.2.0`, based on the user-approved reference at <https://orbs.jakubantalik.com/>. The package's MIT license is included at `docs/third-party/thinking-orbs-LICENSE.txt`. Matterhorn owns status semantics and accessibility announcements; the orb is decorative within the surrounding live status.

## Hosted release gates

Run these against the exact deployment before GO:

1. Strict authenticated product smoke with real desk results and explicit production workspace/chat URLs.
2. Two-account session/workspace isolation on the managed engine.
3. Production HTTPS, exact-origin CORS, CSP/security headers, monitoring, backup/restore, and rollback checks.
4. Exact hosted authenticated captures of Home, every desk, active/completed agent states, MCP rail, Settings, and public entry, plus physical iOS/Android keyboard and screen-reader checks.
5. A production Lighthouse run on the deployed minified artifact. Do not use the Vite development fixture as performance evidence.
6. Real supported wallet-provider acceptance only if reviewed actions are enabled for that release; they remain hidden in the current public-Beta candidate.

## Non-blocking follow-up

- Add a dedicated one-click `Retry response` action in addition to restored-composer correction/resend.
- Make generic Save to Outputs and response-specific feedback universal rather than specialized/chat-scoped.
- Replace remaining persistent destination buttons with links where browser-native open/copy/bookmark behavior is valuable.
