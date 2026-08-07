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

No local P0 or P1 product blocker remains. The exact hosted account, production headers/origin, real engine completion, and deployed responsive visual gates still require the release URL and credentials.

## Acceptance matrix

| Milestone | Result | Evidence |
|---|---|---|
| Shell and location model | PASS | One canonical header location; Home/desk/Settings names are accurate; chat and Settings each expose one `main` landmark. |
| Home activation | PASS | Exactly one context-aware primary action; recent task timestamps accept engine seconds or milliseconds; recommendations open a desk without sending. |
| Protocol desks | PASS | Bittensor, Hyperliquid, Polymarket, and Sui show three recommended safe starts, with the remaining catalog behind `More tasks`. Public Beta hides all reviewed wallet-action starters. |
| Longevity workflow | PASS | Route-backed `desk=wellness`, deterministic reload/Back/Forward, current stage plus next-stage sequence, and non-medical boundaries. |
| MCP information architecture | PASS | Compact rail contains status, count, explanation, and `Manage MCPs`; the full catalog and configuration remain in Settings. |
| Settings hierarchy | PASS | Overview is the single page `h1`; Profile and Workspace health are subordinate sections; active navigation exposes `aria-current`. |
| Agent progress lifecycle | PASS | A desk task immediately renders `Working on <task>` with an activity orb, polls through an initially idle engine snapshot, then clears the activity state when assistant output arrives. |
| Responsive and accessibility contracts | PASS WITH VISUAL GAP | Focused responsive/a11y tests pass: first-render scroll position, two-line mobile task descriptions, 44px primary mobile controls, 24px compact target minimums, landmarks, and active-page semantics. Exact-candidate mobile screenshots were unavailable because the selected in-app Browser does not expose viewport resizing. |
| Public Beta safety | PASS | Reviewed desk actions fail closed; no wallet-action group or preparation CTA appears in the web public-Beta fixture. Ten-stage platform safety gate passes. |
| Production build | PASS WITH WARNINGS | Minified public-Beta web build succeeds. Existing large chunks remain: wallet 1.80MB, Shiki 1.85MB, translations 946KB, Settings 814KB, Session 784KB. These are a post-canary performance track, not a new regression in this redesign. |
| Hosted release | PENDING | Requires exact deployed URL/account, strict hosted task completion, production HTTPS/CORS/security headers, two-account isolation, mobile/tablet visual capture, and rollback/monitoring evidence. |

## Automated evidence

- App suite: **805 passed, 0 failed**, 109 files, 5,204 expectations.
- App typecheck: **PASS**.
- Matterhorn platform safety gate: **10/10 stages PASS**.
- Focused activity lifecycle suite: **56 passed, 0 failed**.
- Public-Beta production web build: **PASS**.
- Live delayed-response fixture:
  - active: `Working on Review subnet emissions` and `Thinking Review subnet emissions` present;
  - completed: synthetic assistant response present and activity label absent.
- Live compact MCP landmark check: one `main`, zero nested `main` elements.
- Live Settings hierarchy check: one `h1` (`Overview`), expected `h2` sections, one `main`.

## Visual evidence

- [Project Home](screenshots/01-home-desktop.png)
- [Bittensor task workspace](screenshots/02-bittensor-desktop.png)
- [Longevity guided sequence](screenshots/03-longevity-desktop.png)
- [Compact MCP rail](screenshots/04-mcp-rail-desktop.png)
- [Full MCP Settings](screenshots/05-mcp-settings-desktop.png)
- [Settings Overview](screenshots/06-settings-overview-desktop.png)
- [Completed agent task](screenshots/07-agent-task-desktop.png)
- [Active Matterhorn thinking state](screenshots/08-agent-thinking-desktop.png)

## Third-party design primitive

The activity visualization uses `thinking-orbs@0.2.0`, based on the user-approved reference at <https://orbs.jakubantalik.com/>. The package's MIT license is included at `docs/third-party/thinking-orbs-LICENSE.txt`. Matterhorn owns status semantics and accessibility announcements; the orb is decorative within the surrounding live status.

## Hosted release gates

Run these against the exact deployment before GO:

1. Strict authenticated product smoke with real desk results and explicit production workspace/chat URLs.
2. Two-account session/workspace isolation on the managed engine.
3. Production HTTPS, exact-origin CORS, CSP/security headers, monitoring, backup/restore, and rollback checks.
4. Mobile (375px), tablet (768px), and desktop visual captures of Home, every desk, active/completed agent states, MCP rail, Settings, and public entry.
5. A production Lighthouse run on the deployed minified artifact. Do not use the Vite development fixture as performance evidence.
6. Real supported wallet-provider acceptance only if reviewed actions are enabled for that release; they remain hidden in the current public-Beta candidate.

## Non-blocking follow-up

- Split wallet families, Shiki languages/themes, experimental translations, Settings, Session, and editor/spreadsheet code at their actual feature boundaries.
- Replace remaining persistent destination buttons with links where browser-native open/copy/bookmark behavior is valuable.
- Continue the public-entry trust redesign and exact mobile visual acceptance on the hosted candidate.
