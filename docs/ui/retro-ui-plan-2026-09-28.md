# Matterhorn retro UI — four-hour implementation plan

## Goal and working agreement

Replace the visual language across Matterhorn Desks with the user's explicit
reference: https://github.com/neobrutalism/neobrutalism (its documentation now
identifies the project as NeoBrutalism, formerly RetroUI). Preserve Matterhorn's
logo, familiar type, product capabilities, accessibility and safety boundaries.
This is a visual redesign of the real app, not a static concept or a rebrand.

Window: 28 September 18:29–22:29 UTC / 29 September 00:00–03:59 IST.
Branch: `codex/retro-ui-2026-09-28`, from merged dev
`ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`.

User asked to start while they sleep. Optional questions were offered without
blocking. Assumption: code-first delivery; preserve brand/type and both themes.
No fabricated approval of visual comps. The user-pinned reference outranks the
design skill's alternate-world suggestions and thin-border preferences.

## Visual direction

**Matterhorn workbench:** flat paper-like light surfaces and charcoal dark
surfaces; ink outlines; 2px control borders; 3px hard offset action shadows;
small 2–4px corners; violet primary actions and ice selection surfaces. Existing
protocol logos remain. Body copy is normal case in the existing sans family;
strong compact headings, no pixel font for long chat or legal text.

Choose a model → choose one of five desks → compose is the first-view purpose.
One anchored sidebar and one focused conversation, with workspace tools opened
on demand. Selected states show more than color; errors, approvals and disabled
controls remain explicit. Press feedback is a short hard-shadow compression,
not wobble/tilt; reduced motion removes translation. Charts retain real data.

Do not import an entire template/library or replace Base UI behavior. Translate
the reference into shared semantic tokens and existing React primitives. No
external fonts, decorative illustrations, gradients, or invented statistics.

## Delivery stages

### 0:00–0:45 — inventory and foundation

- Inspect reference, incumbent screenshots, routes, entrypoints and CSS.
- Introduce one default-off `VITE_MATTERHORN_RETRO_UI=1` build flag. It opts into
  the existing desk-first layout; existing minimal flag remains compatible.
- Apply the root marker consistently to app/public/desktop-overlay entrypoints.
- Add scoped light/dark semantic tokens and shared buttons, forms, tabs, menus,
  dialogs, cards and status treatments. No blanket per-element CSS overrides.
- Test flag parsing, rollback, semantics and token contrast. Commit foundation.

### 0:45–1:45 — core user journey

- Sidebar, launcher, model list/selection, five desks and recent conversations.
- Chat/composer, starter suggestions, request states and readable tool results.
- Preserve model persistence, editable drafts, deep links and back navigation.
- Keep all readiness from server data; no cosmetic implication that an agent is
  working. Maintain separate wallet review and explicit approvals.

### 1:45–2:45 — secondary product surfaces

- Account/auth/recovery and public Security/Privacy/Terms/Support.
- Settings groups, provider setup, appearance/privacy and default-off STM.
- Wallet/transaction tickets, Memory saved/review, Notes and integrations.
- Inventory remaining hardcoded styles and mark migrated/partial/unverified
  surfaces. Retain operator/desktop visibility gates and unavailable actions.

### 2:45–3:40 — acceptance and corrections

- Batched captures: light/dark, 390px, 768px, 1440px and actual Codex width.
- Keyboard focus, menu/dialog escape and return, disabled/pending/error states,
  zoom, reduced motion, long text and no horizontal/composer overflow.
- Functional browser regressions for changed real components; clearly labelled
  fixtures where real authenticated infrastructure is unavailable.
- Frontend tests, typecheck, build, relevant backend/safety/packaging gates.
- At most two build-thread visual inspection rounds. One independent skill-
  required finish review; bounded corrections and documenter at completion.

### 3:40–4:00 — delivery

- Record tested commits, captures, exact test commands and remaining gaps.
- Update token-bearing DESIGN.md and design sidecar to reflect built reality;
  retain rollout distinction while the new flag is off.
- Leave reviewable local commits and a preview/handoff. Do not push, merge,
  deploy, change production config or enable STM without a new request.
- Pause the heartbeat at the deadline; do not claim whole-product completion if
  any surface or live acceptance remains unverified.

## Acceptance / rollback

- Flag off retains existing layout and styling. Flag on makes all migrated
  surfaces visibly part of one retro system, including portalled controls.
- Themes and user font preferences survive; no new user-data schema/store.
- Existing permissions, signup gating, consent, token accounting, agent routing,
  source/freshness and transaction terms remain intact.
- No secrets or real wallet actions in QA. No real credential/vault migration.
- Existing backend/frontend baseline: 1,771/1,228 passing before redesign.
- Changing the flag back is sufficient rollback; chats/drafts/models unchanged.

## Evidence

Progress, coverage and next task: `qa-reports/retro-ui/2026-09-28/WORKLOG.md`.
Reference inspected via browser at 1274px: high contrast, square controls, hard
shadow, yellow/charcoal identity. Matterhorn adopts the grammar, not its branding,
marketing claims, paid components, decorative mascots or pricing.
