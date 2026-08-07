# Matterhorn high-impact product improvement plan

Date: 2026-08-07
Status: Approved — implementation in progress
Delivery level: Production-ready, responsive, accessible, and release-gated

Approval: Approved on 2026-08-07; Goal mode active

Visual direction status: Palette confirmed. Thinking Orbs approved for real agent-activity states. Composed A+B+C system approved and in implementation.

## Milestone 0 baseline snapshot

- Baseline commit: `d4318e9f` (`dev`, tracking `origin/dev`)
- Existing audit and hardening work is present in the working tree and must be preserved while the redesign proceeds.
- Focused route, launch-policy, desk-starter, responsive-accessibility, Settings, and MCP contracts: 45 passed, 0 failed.
- Application TypeScript validation: passed.
- Public-beta invariant currently locked by focused tests: reviewed desk actions remain hidden and optional production services fail closed unless explicitly enabled.
- Current routing contract covers supported side panels and focused protocol desk headers; canonical Longevity desk routing remains a planned Milestone 3 addition.
- Current acceptance gap: the redesign visual direction must complete its palette and north-star approval gates before React/CSS implementation begins.

## Proposed goal

Transform Matterhorn from a collection of capable surfaces into one coherent, task-first workspace: a beta user should always understand where they are, see one recommended safe next action, complete or resume a desk workflow without losing context, inspect the sources and evidence used, and reach advanced configuration only when needed.

The goal is achieved when the redesigned entry, Home, shell, desks, workflow states, MCPs, Settings, and mobile experience meet the acceptance criteria below without weakening public-beta action gating, approval boundaries, or existing functional coverage.

## Product principles

1. One location model across the application.
2. One primary next action per state.
3. Tasks before catalogs; outcomes before configuration.
4. Progressive disclosure that preserves context.
5. Provenance, progress, and correction beside the work.
6. Restrained visual language; color and motion communicate state only.
7. Desktop and mobile are equal acceptance targets.
8. Safety and non-custodial approval boundaries are invariants.

## Success measures

- A new or returning user can identify the current workspace, current surface, and recommended next action from the initial viewport.
- Home exposes exactly one adaptive primary action; create actions remain available but secondary.
- No internal organization/workspace identifier appears in default customer-facing UI.
- Every desk shows at most three recommended starts before `More tasks` and turns a selected start into an input-to-output task workspace.
- Longevity has stable URL, reload, Back, Forward, close, and cross-workspace behavior.
- The contextual MCP surface contains status and a route to management—not the full MCP catalog.
- Account, Workspace, and App settings ownership is explicit; `Profile & Settings` opens Overview/Profile.
- Active AI work identifies context, source/evidence, specific progress, save destination, and correction actions where supported.
- At 375px, the first safe desk task is reachable in the initial viewport, primary controls are at least 44px, and no audited surface overflows horizontally.
- WCAG 2.2 AA-focused automated tests, keyboard journeys, reduced-motion behavior, typecheck, builds, and existing product/safety suites pass.
- Public entry ships a sign-in-first trust composition and preserves accessible form semantics and errors.
- No initial-route regression from deferred feature bundles; production performance is measured against an agreed candidate, not a development build.

## Delivery plan

### Milestone 0 — Lock the experience contract and baseline

Purpose: make the redesign measurable before changing the shell.

Work:

- Convert the approved brief into route, state, and component acceptance matrices.
- Capture baseline desktop/mobile screenshots and keyboard paths for entry, Home, each desk, MCPs, Settings, and Security.
- Inventory shell navigation ownership, URL state, workflow state, evidence state, and current lazy-load boundaries.
- Define performance budgets for initial public entry, authenticated shell, Session, Settings, wallet, and editor paths.
- Add focused tests for the current public-beta policy so later UI changes cannot re-advertise reviewed actions.

Exit criteria:

- Baseline artifacts are reproducible.
- Every subsequent milestone has explicit UI, routing, accessibility, and regression tests.
- Safety invariants and deferred non-goals are documented.

### Milestone 1 — Unify the shell and location model

Purpose: remove repeated orientation and give every surface the same navigation grammar.

Work:

- Define three responsibilities: project/context navigation, current work surface, and contextual tools.
- Replace repeated `Home → workspace → Project home` labels with one canonical location presentation.
- Standardize route-backed navigation as links and transient state changes as buttons.
- Make current workspace and current surface visible at desktop and compact mobile widths.
- Normalize active, focus, loading, unavailable, and error states across shell navigation.
- Preserve project history, notes, output, wallet, and desk routes while migrating their presentation.

Exit criteria:

- One canonical location label exists per state.
- Back/Forward, new-tab, copy-link, refresh, and keyboard navigation behave correctly.
- No shell regression across desktop, tablet, or mobile.

### Milestone 2 — Make Home an activation and continuation surface

Purpose: answer “what should I do now?” instead of presenting an equal-weight capability catalog.

Work:

- Add one adaptive primary action chosen from: continue recent work, complete required setup, or begin a recommended safe task.
- Move New chat, New project, and New note into a secondary creation group.
- Replace raw organization/workspace identifiers with friendly identity and optional technical details.
- Consolidate duplicate activity/history affordances.
- Reduce desk cards to compact identity rows or launches using color only as a small signal.
- Specify first-time, returning, no-history, disconnected, unavailable, loading, and error states.

Exit criteria:

- Exactly one visually dominant action exists in every Home state.
- The action explains why it is recommended and where it leads.
- Internal identifiers are absent from the default presentation.
- Home remains useful with 0, 1, and many recent items.

### Milestone 3 — Replace desk catalogs with task workspaces

Purpose: move from choosing prompt cards to completing an outcome.

Work:

- Show no more than three recommended safe starts per desk; place the remainder behind `More tasks` and search when warranted.
- Rewrite task labels as user outcomes, not prerequisites or internal operations.
- Convert a selected task into a structured workspace containing required public inputs, readiness, sources, expected output, and one primary action.
- Preserve the separation between research/evidence and reviewed wallet actions; public beta continues to fail closed.
- Surface specific task progress, source/evidence, output destination, and supported Edit, Retry, Revert, or feedback actions.
- Turn Longevity into a current/completed/next sequence, remove duplicate descriptions, and add canonical `desk=wellness` routing.
- Test stale route values, workspace switching, reload, close, and browser history.

Exit criteria:

- A user can move from desk entry to a configured task without navigating a card wall.
- Public-beta builds show no reviewed-action starter or wallet-action group.
- All five desks share a consistent task grammar while retaining protocol-specific content.
- Longevity is stable under reload and navigation history.

### Milestone 4 — Distill MCPs and Settings

Purpose: keep active work in context while moving configuration to the place that owns it.

Work:

- Replace the embedded MCP manager with connected count, sync state, active client, compact recovery state, and `Manage MCPs`.
- Keep client setup, built-in products, custom MCPs, search, filters, and catalog in full Settings.
- Introduce Account, Workspace, and App settings ownership.
- Make `Profile & Settings` land on Overview/Profile.
- Reduce Models to current model, provider status, choose/change model, and progressively disclosed advanced details.
- Add specific skeleton, empty, syncing, offline, partial, error, and success states.

Exit criteria:

- MCP status can be understood without leaving work.
- MCP configuration opens a full route and preserves the originating context for return.
- Settings labels and copy agree on ownership.
- Existing connection, copy-config, custom MCP, and model-selection capabilities remain reachable.

### Milestone 5 — Rebuild public entry and mobile priority

Purpose: make first contact direct and trustworthy, then preserve that clarity on small screens.

Work:

- Replace the campaign-style entry with a sign-in-first composition: short product statement, form, service state, and Security/Privacy paths.
- Keep validation, errors, password-manager behavior, accessible authentication, and account creation adjacent to the form.
- Compress desk hero spacing and stack warnings into icon, title, and supporting line on mobile.
- Ensure the first safe desk task appears within the initial 375px viewport where content permits.
- Give compact navigation a visible workspace affordance and labels when expanded.
- Verify touch targets, focus visibility, safe areas, virtual keyboard behavior, long text, and localization expansion.

Exit criteria:

- The access form is the page’s primary visual and semantic action.
- Entry and authenticated mobile flows work at 320, 375, 768, 1024, and 1440 widths.
- No horizontal overflow, clipped warnings, obscured focus, or composer overlap appears.

### Milestone 6 — Performance, hardening, and release acceptance

Purpose: ship the redesign as a faster and safer production candidate.

Work:

- Split wallet families, syntax languages/themes, Settings sections, editors/spreadsheets, and experimental translations behind exact feature boundaries.
- Prevent public entry and Home from paying for desk, wallet, editor, or advanced Settings code before interaction.
- Add or update visual-regression, route, accessibility, keyboard, reduced-motion, and responsive tests.
- Run complete app/server suites, typechecks, production builds, safety gates, strict browser journeys, and hosted candidate tests.
- Run production Lighthouse/Core Web Vitals and inspect errors, CORS/security headers, monitoring, rollback, and two-account isolation.
- Compare final screenshots against the approved design contract and Security reference surface.

Exit criteria:

- All automated and hosted acceptance gates pass with no P0/P1 regression.
- Candidate performance meets the budgets established in Milestone 0.
- Product owner approves desktop and mobile visual acceptance.
- Rollback and deferred-backlog notes are documented before merge/deploy.

## Cross-cutting acceptance matrix

Every milestone must cover:

- Default, first-time, returning, loading, empty, unavailable, partial, error, success, and long-content states where applicable.
- Mouse, keyboard, screen-reader semantics, touch, reduced motion, and zoom/reflow.
- Light and dark themes when the surface supports both.
- Public-beta web, hosted authenticated web, and desktop behavior where relevant.
- Route refresh, Back/Forward, deep links, stale parameters, and workspace switching.
- No weakening of authentication, approvals, reviewed-action gating, evidence logging, or non-custodial language.

## Merge strategy

- Use one implementation branch and a sequence of small, reviewable commits grouped by milestone.
- Keep route/state foundation separate from visual restructuring.
- Put new Home and desk models behind internal compatibility boundaries until their tests are green; do not add a customer-visible feature flag unless rollback risk justifies it.
- Complete focused verification after each milestone and the full release matrix after Milestone 6.
- Do not mix unrelated backend features or expand public-beta transaction scope during this goal.

## Explicit non-goals

- No wholesale rebrand, glassmorphism, new display typeface, or decorative animation system.
- No change to protocol economics, wallet custody, transaction authorization, or public-beta reviewed-action policy.
- No new desk or connector catalog expansion during the redesign.
- No replacement of proven infrastructure solely to support a visual preference.
- No promise of a production launch until hosted acceptance evidence is green.

## Proposed Goal mode objective

Implement and verify the approved Matterhorn task-first product redesign across the public entry, authenticated shell, Home, protocol and Longevity desks, MCPs, Settings, AI progress/provenance states, responsive behavior, and performance boundaries. Preserve the restrained design system, Security-quality trust language, public-beta fail-closed action policy, non-custodial approval model, route integrity, and existing functional behavior. Finish only when all milestone acceptance criteria, automated suites, visual checks, and hosted release gates are satisfied, with remaining non-blocking work documented.
