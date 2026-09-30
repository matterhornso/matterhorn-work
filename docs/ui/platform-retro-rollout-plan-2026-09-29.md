# Matterhorn Desks — platform-wide retro UI delivery plan

Date: 29 September 2026. Status: proposed implementation plan; no rollout authorized by this document.

## 1. Outcome and scope

Extend the retro UI currently visible in the signed-in local workspace across every supported Matterhorn Desks surface. Users should encounter one coherent product from sign-in, model selection and desk selection through actual work, output review, settings and recovery.

This continues the selected visual direction, not a second redesign. The audience is a non-expert using real AI and crypto tools; operational screens prioritize completing tasks, while documentation and legal pages prioritize reading. Preserve Matterhorn's logo, protocol marks, font preferences, light/dark themes and actual capabilities.

Implementation is solo. Independent design review/documentation can be used only when required by the design workflow. Owner/operator access is needed for staging accounts, release approval and hosted operational acceptance—not for ordinary local implementation.

### Starting evidence, not assumed completion

- Branch: `codex/retro-ui-2026-09-28`.
- Reviewed application implementation: `515c634319f71c0c698618f914744c00232da075`.
- Last delivery commit: `d941e234843ab0e6c5832bc34e315016e0a1d6f2`.
- Shared styling, shell, launcher and representative secondary components already exist behind `VITE_MATTERHORN_RETRO_UI`.
- Prior evidence: 1,234 frontend tests with the flag on and off, four successful build variants, three browser engines and all ten offline safety stages. These are historical baseline results, not acceptance for future changes.
- The new UI has subsequently opened against the existing disposable local account/backend. That proves a signed-in launcher renders; it does not prove every route, button, mutation, model response or deployed backend revision.
- Existing coverage: `qa-reports/retro-ui/2026-09-28/COVERAGE.md`. Do not mark partially covered rows complete merely because they inherit retro CSS.

In scope: hosted web, responsive web, shared desktop renderer, desktop-only supported screens/overlay, public trust/auth pages, modal/popover/notification states and supported feature-gated surfaces. Headless server/router/orchestrator services are regression dependencies, not UI redesign targets. A separate marketing website or external wallet/provider page is not implicitly included; inventory it and request its repository/scope if desired.

## 2. Paid Neobrutalism MCP — verified use and boundaries

Successfully connected to the supplied MCP endpoint using its normal authenticated protocol. Server identifies itself as `neobrutalism` version `1.0.0`; `whoami` returned `isPro: true`. The token is deliberately absent from this file and source control. This was a direct authenticated connection for this planning task, not a permanent Codex connector installation.

Used `tools/list`, `whoami`, `get_registry_stats`, `search_items`, `get_component` and `get_block`. The catalog reported 54 components and 158 Pro blocks in 22 categories. Component metadata supports Base UI, Radix and React Aria. Choose **Base UI** to match the existing app; do not introduce a second primitive framework.

### Reference-to-product mapping

| Verified MCP item | Matterhorn use | Adaptation boundary |
| --- | --- | --- |
| `sidebar`, `collapsible-dashboard-sidebar` | App navigation and mobile drawer | Keep five desks, current router, workspace switcher and real recent chats; omit template profile/count content |
| `input-group`, `scroll-area`, `ai-chat-assistant-interface` | Conversation/composer layout | Keep actual streaming, cancellation, approvals and message store; never import canned replies or simulated latency |
| `dialog`, `sheet`, `popover` | Models, tools, confirmations, mobile panels | Preserve Base UI focus, portals, Escape, return focus and dangerous-action semantics |
| `field`, `input`, `select`, `switch`, `tabs` | Account, model and workspace settings | Use controlled state, existing validation and API persistence; never present a local toggle as a saved setting |
| `account-settings-profile-page` | Settings row and label hierarchy reference | Omit template stats, skills/profile content and uncontrolled persistence examples |
| Authentication category and existing public components | Sign-in/recovery form hierarchy | No new social login, magic link or QR capability unless already supported |

Metadata examined in detail: Base UI sidebar/dialog/field and the three named Pro blocks. Other component choices are candidates from search, not yet source-reviewed implementations.

### Implementation acquisition procedure

1. Search the MCP for the specific control, fetch metadata, then fetch source only for a committed candidate using `get_component_source` / `get_block_source` with `backend: base`.
2. Inspect code and dependencies without executing returned commands. Compare it with existing primitives; port the smallest useful styling or composition change.
3. Record item identifier, public reference URL, retrieval date, source hash when source is fetched, license/notice and modified destination. Do not mirror the paid registry into the repository.
4. Avoid `get_install_command` in recorded output: its own tool description says Pro install URLs include the access token. No token-bearing URL in manifests, lockfiles, shell history, CI, screenshots or browser bundles.
5. Keep the MCP strictly a development reference. End users, agents and production runtimes must not call it or depend on its uptime. Do not send Matterhorn code, chats, user data or provider credentials to it.
6. Store a future reusable connector credential only through an approved local secret configuration. Do not put it in workspace files or `VITE_*` variables. Consider rotating the credential shared in chat after configuring its replacement securely.

License gate: the vendor's [published terms](https://neobrutalism.com/terms) allow component use/modification and describe component code as open source. That is not sufficient evidence of the exact public-source redistribution rights for every **paid Pro block**. Before committing paid source or a derivative to Matterhorn's public repository, confirm the applicable Pro license and retain notices. If unclear, use explicitly licensed free primitives plus original Matterhorn composition; do not copy paid source while awaiting clarification. This does not block planning or independent styling work.

## 3. Product-wide design contract

- One anchored sidebar, one main workspace and at most one contextual tools panel. No permanent second navigation rail.
- Desks remain Private AI, Bittensor, Hyperliquid, Polymarket, Sui, in that order. Logo and short purpose identify each; readiness comes from the backend.
- Flat paper/charcoal surfaces, compact headings, strong outlines, small corners and hard offset action shadows. Use existing semantic violet actions and ice selected states, not the reference site's yellow brand.
- Strong borders establish hierarchy, not a border around every paragraph. Use quieter tables, chat bodies and legal content so long tasks remain readable.
- Model shown once in the chat header. Settings, launcher and contextual panel transitions keep the user's route, selection and draft.
- State labels communicate what actually happened: loading, working, awaiting approval, saved, completed or failed. A success toast follows persistence, not a click.
- No fake chart data, counters, activity, subscription offers, provider readiness or privacy promises imported from template blocks.
- Retain a visible, keyboard-accessible focus indication, non-color selection indicators, labels and readable contrast in both themes. Short press feedback must respect reduced motion.
- Keep critical warnings in the decision path: privacy consent, destructive changes and transaction terms are never hidden solely to simplify the layout.

Technical ownership: `apps/app/src/styles/retro.css` owns scoped retro tokens; `apps/app/src/components/ui/` and the existing React design-system wrappers own controls; domain components own product behavior. Reuse existing React/Base UI components and data stores. Do not copy the same component separately into each desk or broadly restyle all HTML elements. Consolidate duplicate styles only after checking both flag states.

## 4. Route, panel and action inventory

First deliverable: a versioned inventory with one row per route or embedded surface, then one row per visible action. Fields: entry point, implementation path, deployment/role/feature gate, themes, states, action/backend contract, evidence and outstanding defect. Classify rows as not started, implemented, fixture-tested, authenticated-local-tested, staging-tested, blocked or intentionally unavailable. Implementation and acceptance are separate columns.

Initial source-backed coverage map:

| Area | Existing implementation anchors | Work still required |
| --- | --- | --- |
| Entry, routing, errors | `react-app/shell/app-root.tsx`, `workspace-routes.ts`, authenticated/session/settings routes | Full route/history matrix, unknown-route recovery, initial loading, expired session, error boundaries; no Home flash |
| Shell and launcher | `react-app/shell/`, existing sidebar and PrimaryDeskLauncher | Long names, many recent chats, workspace switching, mobile drawer, collapsed state, keyboard navigation |
| Models and provider access | `domains/settings/pages/ai-view.tsx`, `domains/session/modals/model-picker-modal.tsx`, `domains/connections/provider-auth/` | Search/filter/select/persist/return, long catalogs, roles, zero models, denied save, unavailable provider, policy disclosure |
| Chat and all five desks | `domains/session/chat/`, composer, surface, workflows, tool renderers | Streaming, tool output, long conversations, attachments, cancel/retry, approvals, history and draft restoration |
| Outputs and files | `domains/session/artifacts/`, `domains/agent-files/` | Output list, supported preview/edit/download, large payloads, unavailable files, save/error state and permissions |
| Memory and Notes | `domains/memory/memory-panel.tsx`, `domains/notes/notes-page.tsx` | Saved/review/add/edit/delete/export/provenance, search, empty/error states, explicit confirmation and failed-save retention |
| Wallet and transactions | `domains/wallet/WalletPanel.tsx`, `TransactionApproval.tsx`, pages and `components/TransactionBatch.tsx` | Every supported network/action, address overflow, simulation/expiry/denial, receipts, signing boundary, batch details |
| Integrations | `domains/connections/`, settings skills/plugins/MCP/extensions pages | Available/connected/setup/unavailable, safe add/remove/auth, error recovery, hosted versus desktop permissions |
| Crypto apps/developers | `domains/crypto-apps/`, `domains/developer/`, `/coworker-access` | Catalog, evidence proofs, connection/access flows, developer forms and their unavailable states |
| Settings | `domains/settings/shell/`, all `pages/` | Four public groups, consistent save/revert/error behavior, route aliases; retain supported operator/desktop paths |
| Auth, onboarding, trust | `domains/cloud/`, `domains/onboarding/`, `domains/public/` | Sign-in/create/recovery/verification, onboarding, Security/Privacy/Terms/Support/Status and Back to app |
| Conditional features | Existing STM, generated media, voice, browser, coworkers, Cloud/billing, marketplace and messaging surfaces | Inventory gates; theme supported enabled paths without enabling unfinished features or adding promotions |
| Desktop-specific | `apps/desktop`, shared renderer and overlay entry points | Window drag/no-drag zones, menus, native dialogs, updates/recovery, offline/runtime connection; packaged verification |

Paths in the table are relative to `apps/app/src/` unless a different root is given. Presence of a file does not establish that the feature is shipped. Use routing and capability gates to resolve visibility before changing it. Native OS dialogs and external wallet/provider pages retain their platform UI; style only the Matterhorn-owned wrapper and handoff.

## 5. Ordered delivery slices

The following are effort estimates, not a promise of unattended completion. Budget roughly **40–60 focused engineering hours**, plus access/review wait time; revise after the inventory. Deliver the core journey first rather than waiting for every low-traffic screen.

### Slice A — baseline and reference map (3–4 hours)

- Preserve the reviewed branch and unrelated changes; inspect current `dev` before choosing the new branch base.
- Complete route/action/gate inventory, reference map and license register. Confirm source fidelity and browser fonts against the actual app.
- Capture a new, explicitly bounded baseline of the authenticated core and high-risk secondary screens. Do not reuse the old fixture signoff as full-shell signoff.
- Compare existing retro controls with the MCP's Base UI versions. List specific gaps, not a proposal to reinstall the library wholesale.
- Exit: every reachable surface has a disposition; no silent exclusions under “entire platform.”

### Slice B — shared controls and app shell (5–7 hours)

- Finish semantic variants for buttons, fields, selects, tabs, menus, dialogs, sheets, tables, alerts, toasts, skeletons and empty states.
- Audit portals, theme inheritance, selected/disabled/busy/destructive states and long content.
- Complete sidebar/mobile navigation, headers, workspace switcher, launcher and contextual panel frame; retain router/state behavior.
- Use the sidebar Pro reference for behavior/layout comparison, not its hardcoded navigation or user data.
- Exit: all primitive states are demonstrated in both themes; shell routes have no flash, hidden focus targets or duplicated navigation.

### Slice C — models, five desks and real conversation (8–11 hours)

- Finish first-time model choice → desk launcher and later model choice → previous conversation with unchanged draft.
- Apply chat visual hierarchy to actual user/assistant messages, code, tables, citations, sources/freshness, tool progress, errors and long output.
- Use the chat Pro block as a composition reference only. Preserve server requests, streaming, permission flow, request IDs, accounting, Stop and safe retry.
- Preserve editable suggestions: selection fills a draft and never sends automatically. Opening a desk is one action and does not overwrite drafts.
- Test real provider responses on every desk; read-only crypto prompts must trigger the corresponding live tools, not merely describe what the tools could do.
- Exit: five desk evidence records include environment, exact revisions, selected model, request ID, tool/source/freshness where relevant, response outcome and usage settlement. Any blocked backend is a separate explicit blocker.

### Slice D — workspace tools and outputs (6–9 hours)

- Finish Memory, Notes, artifacts/files and integration catalog/details, including all visible action menus.
- Finish skills/extensions/MCP forms and authentication handoffs under current deployment/role gates; no arbitrary installation privilege added to hosted accounts.
- Cover dirty editor navigation, failed writes, retry, delete confirmation, export/download, large lists, revoked access and unavailable connections.
- Theme default-off STM in an isolated synthetic mode only; keep secrets out of screenshots/logs and do not activate/migrate it.
- Exit: supported CRUD actions persist through reload, failures preserve input, permission-denied states disclose no other account data, one contextual panel at a time.

### Slice E — wallet, approvals and protocol-specific tools (5–8 hours)

- Complete all reachable wallet pages and transaction/approval/detail/receipt overlays, including Sui/Bittensor workflows and supported EVM actions.
- Render network, signer, recipient, amount, asset, fees/slippage where applicable, expiry and approval scope legibly in both themes and on mobile.
- Differentiate support, connection, chain-read readiness, simulation and execution. No generic “Working” label stands in for all of them.
- Test deny/cancel/expired/stale/insufficient-data states and duplicate-click protection. Re-run safety contracts without loosening assertions.
- Exit: no UI path bypasses review or silently signs/submits. Use fixtures for dangerous branches and read-only live data; real-fund actions are excluded.

### Slice F — settings, auth and public pages (5–7 hours)

- Account, Models, Workspace, Privacy & appearance are the ordinary-user groups; maintain aliases and supported advanced/operator pages.
- Complete real settings persistence, invalid data, permission errors, reset/recovery and sign-out states without restyling away explanations.
- Make sign-in, registration, verification, password recovery, account outage and expired links coherent with actual service availability.
- Complete public legal/support/status navigation and Back to app with browser history intact. Preserve factual/legal text.
- Exit: each visible control acts or identifies its genuine blocker; no unimplemented social login, billing or Cloud CTA is introduced by a template.

### Slice G — desktop and feature-gated completion (3–5 hours)

- Validate the shared theme in desktop renderer/overlay; inspect native window behavior, updates, local/remote connections and desktop-only settings.
- Finish supported conditional surfaces identified in Slice A; keep intentionally unavailable ones gated with existing data accessible through supported paths.
- Keep native host controls native. Do not replace OS affordances with web imitations.
- Exit: desktop-supported routes have evidence or an explicit environment blocker; web success does not stand in for packaged-app acceptance.

### Slice H — integrated QA and review package (5–9 hours)

- Execute the acceptance matrix below against the exact final candidate, not a mixture of revisions.
- Inspect one batched set of desktop/mobile and light/dark captures, fix material findings together, then use at most one confirmation round for that delivery slice.
- Independent finish review scores named findings; documentation records implemented tokens and any remaining gaps. Old review budgets/verdicts are not silently extended.
- Package focused PRs with before/after evidence, tested revisions, known limitations and rollback steps when publishing is authorized.
- Exit: zero unresolved release-blocking defects; explicitly list any non-blocking deferral and the affected role/platform.

## 6. Proposed PR sequence and controls

1. Existing reviewed retro baseline: review/publish its current commits first, or use an explicitly documented stack. Do not duplicate them in unrelated PRs.
2. `codex/retro-platform-foundation`: inventory, source/license manifest, shared primitives and complete shell.
3. `codex/retro-platform-desks`: models, all desk/composer/tool-result states and real-response evidence.
4. `codex/retro-platform-tools`: memory/notes/artifacts/integrations plus wallet/approval surfaces, split wallet into its own PR if review size warrants it.
5. `codex/retro-platform-settings`: account/settings/public/desktop and remaining gated surfaces.
6. Final acceptance/handoff on the integrated candidate; prefer a small evidence-only PR if no correction is necessary.

These are proposed branch names, not created branches. Target `dev` after checking its current state and CI policy. Keep each UI diff reviewable and behavioral fixes narrowly scoped with regression tests. No automatic push, merge, deployment or production feature activation is part of this planning request.

## 7. Acceptance matrix and proof

### Core journeys

1. Normal sign-in → available models → persisted selection → all five desk choices.
2. Each desk opens without Home flash; a suggestion remains editable and unsent.
3. Submit → preparing/working → applicable approval → real result; Stop/retry/error states preserve input and do not double-submit.
4. Switch model/desk/workspace, open/close tools, use Back/Forward and reload. Confirm correct selection, conversation and draft isolation.
5. Save/read/update/delete permitted sample Notes/Memory, inspect outputs and integration status. Verify provenance/consent and no cross-account access.
6. Review a transaction proposal safely. Required terms stay visible; cancellation and rejection produce no signing or submission.
7. Sign-out/expired session, provider outage, missing agent, denied permission, network failure and unavailable feature all offer accurate recovery.

### Layout and accessibility

- Light/dark/system plus existing user preferences; 390px phone, 768px tablet, 1280/1440px desktop and actual Codex preview width.
- Actual 200% browser zoom, not just enlarged root font; narrow-width reflow, on-screen keyboard/composer behavior and long addresses/code/tables.
- Keyboard-only navigation, visible focus, Escape/dismiss/return focus, labelled icon controls, heading structure, selected/busy announcements and reduced motion.
- WCAG 2.2 AA target: verify text/UI contrast, non-color status, target sizing and manual VoiceOver or equivalent screen-reader output. Automated results are not certification.
- Chromium, Firefox, Playwright WebKit plus installed Safari; native desktop separately. Mark unavailable environments unverified.
- No horizontal page overflow, trapped drawer focus, hidden send control or obscured transaction terms. Intentionally scrollable data/code regions are labelled and usable.

### Data, performance and security

- Two disposable accounts, distinct workspaces; verify history/search/memory/files/integrations cannot cross the authorization boundary.
- Reload proves persistence. Record usage/hold settlement after send/cancel/failure; this plan does not authorize changing quota or approval policy.
- Compare initial route payload, route-switch responsiveness, long-chat scrolling and layout shift against baseline on the same setup. No unexplained material regression or whole-site icon/library import. Establish numerical budgets from baseline measurements, not invented scores.
- Inspect the built bundle and changed files for credentials/token-bearing registry URLs, new remote calls and mocked runtime state. Verify no paid-source license ambiguity remains in committed code.
- Verify build-time flag on/off, public initial HTML, public route lazy loading and portal theme inheritance. STM remains independently off.

### Existing regression entry points

Use pinned pnpm/Bun and the isolated runner described in `qa-reports/retro-ui/2026-09-28/PREVIEW.md`. Run build/prebuild stages sequentially because generated packages are shared. Preserve local operator env files; use a clean QA checkout when the isolation guard refuses them.

```sh
# RETRO_QA_PNPM and RETRO_QA_BUN must resolve to installed absolute runtime paths.
node qa-reports/retro-ui/2026-09-28/run-check.mjs tests 0
node qa-reports/retro-ui/2026-09-28/run-check.mjs tests 1
node qa-reports/retro-ui/2026-09-28/run-check.mjs typecheck 1
node qa-reports/retro-ui/2026-09-28/run-check.mjs build 0
node qa-reports/retro-ui/2026-09-28/run-check.mjs build 1
node qa-reports/retro-ui/2026-09-28/run-check.mjs build-web 0
node qa-reports/retro-ui/2026-09-28/run-check.mjs build-web 1
node qa-reports/retro-ui/2026-09-28/run-check.mjs safety-full 1
pnpm exec bun test apps/app/scripts/retro-controls.browser.test.ts
RETRO_QA_BROWSER=firefox pnpm exec bun test apps/app/scripts/retro-controls.browser.test.ts
RETRO_QA_BROWSER=webkit pnpm exec bun test apps/app/scripts/retro-controls.browser.test.ts
RETRO_QA_FLAG=1 pnpm exec bun test apps/app/scripts/composer-submit.browser.test.ts
RETRO_QA_FLAG=0 pnpm exec bun test apps/app/scripts/composer-submit.browser.test.ts
RETRO_QA_FLAG=1 pnpm exec bun test apps/app/scripts/stm-settings.browser.test.ts
```

Expand browser coverage for newly completed routes/actions. Run changed backend tests if a reproduced integration defect requires a backend fix. These commands alone do not prove hosted auth/email, real inference, native packaging or backup restoration.

Every evidence record needs commit, build flags, frontend/backend identity, environment class (fixture / local real backend / hosted), browser/viewport/theme, scenario, expected/actual result and sanitized screenshot/log. Keep secrets and private account data out of public PR evidence.

## 8. Rollout and rollback

Use the **existing single** `VITE_MATTERHORN_RETRO_UI` build flag; do not create one UI flag per desk or a parallel data store. Exact `1`/`true` enables retro and the existing minimal layout. Unset/`0` disables retro; preserve the independently configured minimal-layout flag on rollback.

Sequence: local evidence → reviewed integrated candidate → approved authenticated staging → user visual approval → required CI → explicit merge/deploy approval → hosted smoke test. Record exact deployed frontend/backend SHAs and run the five-desk journey on the deployed candidate before claiming release acceptance.

Because this is a build flag, gradual exposure requires separate approved artifacts/routes or an existing rollout mechanism; there is no assumed runtime percentage toggle. A stale frontend artifact cannot be fixed by merely changing an environment variable.

Rollback: restore the previous tested artifact or rebuild the same approved revision with retro off. No data migration, auth reset, chat deletion, draft clearing or provider reconfiguration. Confirm portal/public entry consistency and retained preferences after rollback.

## 9. Dependencies, blockers and next decision

- Local implementation can begin with current code and the verified MCP connection. Do not re-request design direction, typography or desk order already settled.
- Confirm Pro source redistribution rights before incorporating licensed Pro code into the public repository. Otherwise use original composition and approved free components.
- Real five-desk acceptance needs a compatible running backend, authorized provider budget, normal test accounts and read-only chain services. Record exact missing capability if blocked; do not replace it with fixtures and label it passed.
- Hosted email, password reset, backup restore, release drift and account isolation remain operational launch gates. Styling cannot certify them.
- Native installed-app and Safari/accessibility acceptance require those environments; report absence instead of claiming equivalence with WebKit/build success.
- Next implementation step, on approval: **Slice A followed by Slice B**, then the model-to-desk-to-real-response journey. Keep the existing preview available for feedback while working on isolated candidates.

## 10. Completion definition

“Applied across the platform” means every supported route, embedded panel, popup, state and visible action is either implemented and verified at its required environment or explicitly blocked/deferred with an owner and reason. No core user journey may be deferred while calling the rollout complete. A styled button, passing snapshot or successful login is not proof that its backend operation works.

Planning methods: Impeccable shape structured the existing-direction brief, delivery gates and bounded visual review; Uncodixfy constrained decorative UI and redundant copy. The user's explicit neobrutalist reference takes precedence over generic thin-border/subtle-shadow preferences. No UI code, paid source, dependency, persistent MCP configuration or deployment was changed while preparing this plan.
