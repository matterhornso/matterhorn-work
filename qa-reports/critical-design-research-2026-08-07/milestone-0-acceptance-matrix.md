# Milestone 0 acceptance matrix

Date: 2026-08-07
Baseline: `d4318e9f` plus preserved local audit/hardening changes
Status: Baseline locked; approved A+B+C implementation underway

## Invariants

| Requirement | Authoritative evidence | Baseline | Completion evidence |
|---|---|---|---|
| Public-beta web never advertises reviewed wallet/market actions | `launch-feature-policy.test.ts`, `desk-task-starters.test.ts`, hosted public-beta desk assertions | Pass in focused tests | Focused tests, production web build, and live hosted assertions all pass |
| Optional production services fail closed | Launch feature policy and route policy contracts | Pass | Tests plus deployed route probes pass |
| Every transaction/signing path retains explicit review and non-custodial language | Wallet approval contracts and browser journey | Existing coverage; must be rerun | Mock and real-provider review journeys pass; copy visually accepted |
| Workspace/session boundaries are not weakened | Session isolation, permissions, switch, filesystem-engine, two-account hosted acceptance | Some local live-engine paths currently skip | No skips in the release evidence used for completion; hosted two-account acceptance passes |
| Existing user work remains recoverable during route changes | Route tests, Back/Forward/reload tests, browser acceptance | Side panels covered; Longevity is component state | Canonical desk route matrix passes for all supported states |

## Experience requirements

| Surface | Current evidence | Required end state | Verification |
|---|---|---|---|
| Public entry | Sign-in form is semantically strong but visually subordinate to marketing content | Sign-in-first trust composition; errors, status, Security, Privacy, and account creation remain adjacent and accessible | 375/768/1440 screenshots, keyboard and password-manager checks, public-route Lighthouse |
| Shell | Four competing navigation layers and repeated location copy | One canonical location label; project navigation, work surface, and contextual tools have distinct roles | Source contract plus live Back/Forward, reload, copy-link, new-tab, and keyboard paths |
| Home | Three creation actions, history, readiness, and desks compete equally; internal identifier visible | Exactly one adaptive primary action in every state; secondary creation group; friendly identity only | State fixtures for first-time, returning, setup-required, empty, offline, loading, and error |
| Protocol desks | Safe/reviewed grouping is strong; task rows remain catalog-first | Maximum three recommended starts before `More tasks`; selection becomes an input/readiness/source/output task workspace | Contract tests for all desks plus responsive browser journeys |
| Longevity | `activeWorkflowDeskId` is local component state | Canonical route, current/completed/next sequence, reload and history stability | Unit route matrix and live reload/Back/Forward/cross-workspace tests |
| MCP contextual surface | Full management/catalog UI is embedded in a narrow rail | Connected count, sync, active client, recovery, and one `Manage MCPs` destination only | Compact-state fixtures and full-management reachability journey |
| Settings | Visually calm; ownership and landing semantics are ambiguous | Account, Workspace, and App ownership explicit; Profile & Settings opens Overview/Profile; Models is distilled | Route/source contracts and desktop/mobile visual acceptance |
| AI work state | Safety evidence exists, but ordinary progress/provenance is fragmented | Context, sources, specific progress, result destination, and supported correction actions visible beside work | Task fixtures for loading, streaming, partial, success, error, retry, revert, and saved output |
| Mobile | No horizontal overflow; hero/warnings/card walls delay first action | First safe action prioritized, warnings stack, workspace identity retained, primary actions are ergonomic | 320/375/768 acceptance, zoom/reflow, touch, safe-area, and virtual-keyboard checks |

## Route and state contract

The URL is the source of truth for persistent work surfaces. Transient overlays may remain in local/store state only when they are not meaningful destinations.

| State | Canonical representation | History behavior |
|---|---|---|
| Project Home | Workspace session route with no `panel` or `desk` query | Back returns to prior external/persistent destination |
| Contextual tool | `panel=<supported-panel>` | First open pushes; switch/explicit close replace without reopen loops |
| Protocol desk | `panel=bittensor|hyperliquid|polymarket|sui` during Milestone 1 compatibility; migration may introduce canonical `desk` only with explicit test coverage | Back closes desk; Forward restores it |
| Longevity desk | `desk=wellness` | Open pushes; close replaces or returns; reload and Forward restore |
| Settings | Existing `/settings/<tab>` route | Persistent destination: link semantics and standard browser history |
| Task session | Existing workspace/session route plus server-backed session identity | Desk launcher must not replace the newly created task URL |

Panel and desk parameters must be mutually exclusive after migration. Unknown, unavailable, or disabled values recover visibly and are removed without loops.

## State coverage

Each redesigned surface must deliberately cover applicable states:

- first-time and returning
- loading and skeleton
- empty
- ready/default
- disconnected/offline
- partial capability
- unavailable/disabled by policy
- validation error
- runtime/server error
- success/saved
- long content and localization expansion
- reduced motion
- light and dark theme where supported

## Responsive and accessibility gates

- Viewports: 320×568, 375×812, 768×1024, 1024×768, and 1440×900.
- No horizontal document or surface overflow at any acceptance viewport.
- Primary mobile controls target at least 44×44px; compact controls meet WCAG 2.2 target-size rules or a documented spacing/text exception.
- Focus is visible and not obscured by composer, sticky chrome, panels, or virtual keyboard.
- Landmarks, headings, current-page state, accessible names, errors, progress, and live updates are programmatically exposed.
- All behavior is keyboard reachable; hover is never the only disclosure mechanism.
- Motion communicates state, stays within the product timing system, and has a reduced-motion alternative.
- Active agent motion follows the approved Thinking Orbs integration brief: verb-specific motion supplements precise text, stops on terminal states, and remains static under reduced motion.
- Automated accessibility must be clean, but manual keyboard and screen-reader-oriented inspection remains required.

## Performance baseline and budgets

Current minified raw chunk sizes:

| Artifact | Baseline |
|---|---:|
| Shiki vendor | 1,853,681 B |
| Wallet vendor | 1,795,984 B |
| Experimental translations | 946,207 B |
| Settings route | 811,525 B |
| Session route | 761,125 B |
| Spreadsheet runtime | 499,671 B |
| Artifact text editor | 496,208 B |
| Authenticated app | 391,822 B |

Candidate budgets:

- Signed-out public entry must not request authenticated shell, Session, Settings, wallet, MCP, editor, or spreadsheet chunks.
- No eagerly requested signed-out JavaScript entry chunk may exceed 300KB raw; the signed-out initial JS graph must remain under 650KB raw before compression.
- Session and Settings route entry chunks must each be below 600KB raw, with heavy subsections loaded on intent.
- Wallet must be split by family/runtime so an initial non-wallet workspace requests zero wallet code and no single wallet-family chunk exceeds 900KB raw.
- Shiki languages/themes must load on demand; no initial workspace route requests the full 1.85MB vendor chunk.
- Experimental translations, spreadsheet, and artifact editor code must load only when their owning feature is opened.
- Hosted candidate: accessibility 1.00; desktop and mobile performance at least 0.90; LCP ≤2.5s, CLS ≤0.10, and TBT ≤200ms under the agreed Lighthouse harness.
- A development-server Lighthouse score is diagnostic only and cannot satisfy the release gate.

## Verification ladder

1. Focused source and unit contracts after each state/routing change.
2. App typecheck and affected package builds.
3. Component/fixture screenshots at all acceptance widths.
4. Keyboard, focus, reduced-motion, and semantic browser inspection.
5. Strict local product journeys with fixture and real engine where required.
6. Full app and server suites plus platform safety gate.
7. Minified production build and bundle graph comparison against this baseline.
8. Hosted authenticated account, two-account isolation, real desk output, and exact-origin security acceptance.
9. Hosted production Lighthouse/Core Web Vitals evidence.
10. Final requirement-by-requirement completion audit.

## Current evidence status

- Focused baseline: 45 tests passed, 0 failed.
- Application typecheck: passed.
- Existing production artifact: measured above; performance budgets are not yet met or proven.
- Visual direction: palette and composed A+B+C system approved; Milestone 1 is implemented and Milestone 2 is in progress.
- Hosted release evidence: intentionally pending until the redesign candidate exists.
