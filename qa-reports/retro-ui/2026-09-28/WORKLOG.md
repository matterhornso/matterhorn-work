# Retro UI worklog

## Request / bounds

Four-hour build through 2026-09-28 22:29 UTC (03:59 IST). User requested retro
neobrutalism across the product; implementation local only. See detailed plan at
`docs/ui/retro-ui-plan-2026-09-28.md`. Branch `codex/retro-ui-2026-09-28` from
`ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`. Preserve unrelated untracked files.

## 18:29–18:41 UTC — setup and foundation

- Read AGENTS.md, Impeccable and Uncodixfy instructions, new-work/shape/operate
  and craft-floor references. Context command ran once, target app shell.
- Existing design/product metadata has legacy schema warnings; do not run an
  unrelated context migration. Context falsely reports STM target orphaned due
  to project-relative path resolution; actual target exists. Do not delete it.
- Reference GitHub and its live documentation viewed. Existing committed STM
  light screenshot inspected against current token/component code.
- Optional direction/build-path questions sent; user explicitly asked to proceed
  while asleep. Code-first assumption, no answer/comp approval fabricated.
- Concept seed e987a9c1, assigned index 4; network retry succeeded. Pinned retro
  brief overrides alternate imagery. Contract records direction and evaluation.
- Existing heartbeat updated in place, every 20 minutes; final deadline above.
- Branch created. Scoped foundation and core styling hooks implemented below.

## 18:41–18:49 UTC — foundation verification

- Added strict default-off `VITE_MATTERHORN_RETRO_UI` flag, entrypoint marker
  (including overlay), and first-paint public HTML styling. Retro opts into the
  existing minimal/desk-first layout without another data store.
- Shared light/dark semantic tokens, outlined controls, hard action shadows,
  selected states, focus and reduced-motion behavior. Preserved danger/error
  states and normal Base UI behavior. Added explicit core shell/launcher/model/
  composer hooks. Full screen-by-screen migration remains pending.
- Five flag/style/contrast unit tests passed (40 assertions). Earlier full
  frontend suite: 1,232 pass, zero failures before contrast test was added.
- Current production edits passed typecheck:
  `/private/tmp/matterhorn-retro-qa-fmgxvi/typecheck-1.log`.
- Full production builds passed with flag on and off:
  `/private/tmp/matterhorn-retro-qa-NKzrMi/build-1.log` and
  `/private/tmp/matterhorn-retro-qa-HBxuvO/build-0.log`.
  Verified built HTML includes root marker/critical retro styles only when on.
  Existing large-chunk warnings remain; no new dependency added.
- Three Chromium browser regressions passed, 26 assertions: real shared controls
  in both themes at 390px, draft preservation, tabs, modal Escape/focus return,
  keyboard focus, save status, disabled styles, no overflow, flag-off rollback.
  Initial test timed out because exact label-text matching included textarea
  content; accessibility snapshot confirmed textbox name/draft intact. Switched
  to accessible textbox role/name, retained all assertions. No runtime fix needed.
- QA runner initially lacked nested pnpm executable; fixed with pinned wrapper.
  Runner isolates HOME/XDG/temp and does not forward ambient credentials.
- All evidence above is local build/unit/synthetic component testing, NOT hosted
  acceptance or a whole-product visual review. No new screenshots inspected yet.
- Full frontend flag-OFF rerun: **1,233 pass, zero failures, 7,772 assertions**;
  `/private/tmp/matterhorn-retro-qa-s256XI/tests-0.log`.
- Full frontend flag-ON rerun: **1,227 pass, six failures**, log
  `/private/tmp/matterhorn-retro-qa-rTiSwZ/tests-1.log`. These tests render AI
  settings and privacy notices with legacy-layout expectations. Minimal settings
  need actual catalog props (the fixture only supplies old summary counts), and
  compact privacy puts expanded copy behind details. Do not delete assertions or
  call the enabled suite green: add explicit coverage for both layouts next,
  including real model choices, unavailable recovery and privacy disclosure.

## 18:51–19:04 UTC — model flow, core details and regression repair

- Foundation checkpoint: `edbec86b67` (local only).
- Re-read repository/skill instructions; reused existing direction/context rather
  than rerunning concept selection. No screenshot inspection rounds used.
- Corrected six enabled-suite failures with explicit legacy/compact expectations
  and an authoritative catalog fixture (summary counts are not model IDs).
  Existing legacy assertions remain. Embedding models excluded from picker.
- Found and repaired a real compact-layout omission: pending desk setup now
  retains its title, unsent status and Return to desk action when a callback is
  provided. No automatic submit or new route/store introduced.
- Added browser tests using real MinimalModels and the real HTTP client against
  loopback synthetic responses: search/provider filters, embedding/disconnected
  exclusion, pending save disables duplicate action, no navigation before save,
  server mismatch, permission denial, retry, first/later selection callbacks,
  privacy disclosure/callback, loading and managed/local recovery.
- Extended styles to user messages, protocol result boundaries (tone preserved),
  long starter labels, sheets/command panels, mobile sidebar, settings section
  rhythm, checkboxes and switches. Changes are scoped to the retro marker.
- Five browser regressions pass / 55 assertions; both themes and reduced motion.
  Existing global reduced-motion rules set a tiny duration, so test asserts the
  switch's transition-property is none, not a string-specific duration value.
- Full frontend tests passed on and off, 1,233 each. Latest enabled run after
  all core edits: `/private/tmp/matterhorn-retro-qa-ADUlRo/tests-1.log`, 7,773
  assertions. Off run: `/private/tmp/matterhorn-retro-qa-SKQwON/tests-0.log`.
- Latest typecheck passes:
  `/private/tmp/matterhorn-retro-qa-8Eirdy/typecheck-1.log`.
- Latest enabled production build passes:
  `/private/tmp/matterhorn-retro-qa-UMUMas/build-1.log`.
  Existing bundle size warnings remain. `apps/app/dist` is now FLAG ON.
- One concurrent test/build run failed because package prebuild cleaned the
  crypto-app-sdk artifact while tests imported it. Sequential rerun passed.
  **Run package builds/typechecks/tests sequentially from now on**, since their
  prebuild steps share generated package output.
- Added `COVERAGE.md`: source/fixture coverage clearly separated from pending
  actual full-shell visual, hosted/runtime and native evidence. All current
  tests are local/synthetic, no provider or signing actions.

## 19:11–19:23 UTC — secondary surfaces and local public preview

- Previous core checkpoint: `9516afd67d` (local only).
- Continued Impeccable/Uncodixfy on the established pinned direction. No context
  rerun or visual polish loop. Screenshot rounds remain 0/2.
- Added model-dialog search label/control styling and selected `aria-pressed`;
  public trust page chrome and active links; Notes labels/title/body/tags,
  responsive search/filter; Memory record boundaries, select/checkbox treatment,
  wrapping view actions, and theme-safe policy/error text; catalog row boundaries;
  custom approval overlays inherit the same border/panel system. No financial
  logic, consent, routes, claims or remote configuration changed.
- Expanded the existing synthetic browser fixture to real PublicTrustRoute,
  NotesPage and MemoryPanel with the actual client and loopback responses.
  **8 tests pass / 67 assertions**. New coverage: Security → Privacy active nav
  and app href, Notes failed save retains draft then retry persists before return,
  Memory Saved/Review/Add and explicit confirmation before any capture; failed
  memory capture retains fields. 390px no-overflow checks included.
- Initial Notes fixture omitted the real toast viewport; mounted it. Memory
  exposed that Vite whole-object env replacement didn't enable compact layout.
  Fixed fixture to define the exact retro env key and disable env-file loading.
  All tests then passed against the actual compact layout. These were fixture
  defects, not justification to remove assertions or weaken UI protections.
- Extended palette contrast coverage to warning text in both themes.
- Latest frontend: **1,233 pass / zero failures / 7,775 assertions**, log
  `/private/tmp/matterhorn-retro-qa-gepkmB/tests-1.log`.
- Typecheck passes: `/private/tmp/matterhorn-retro-qa-I4JudG/typecheck-1.log`.
- Public-web production build passes:
  `/private/tmp/matterhorn-retro-qa-yhuaGC/build-web-1.log`.
  Dist now has retro + explicit web/public-beta flags. No deployment performed.
- Added isolated `build-web` runner stage and `PREVIEW.md`. Read-only preview
  running at **http://127.0.0.1:62530/**, exec session **62341**.
  Server `apps/app/scripts/retro-public-preview.ts` serves only dist, no backend
  proxy, rejects writes, uses CSP to block remote connections. HTTP checks: root
  and Security 200 with retro marker; account POST returns503. Do not enter real
  credentials. This is signed-out visual preview, not a functional account.
- Public preview has not been visually inspected yet. Reserve the bounded first
  review round for a batch of public and core/secondary captures.

## 19:31–19:44 UTC — transaction review, integrations and auth failure path

- Previous checkpoint `fbc4135f8e`. Implementation solo; reused design direction.
- Added scoped batch-review outlines/status colors and responsive actions;
  close button now labelled and blockers/failures announced. Existing execution,
  guards and retry semantics unchanged. Hosted integration select/heading hooks
  use the same visual system; server access gating unchanged.
- Real-component synthetic browser tests verify blocked execution, explicit
  failed execution, retry without auto-submit, dismissal; managed connection
  states, external access off/error/retry and failed key creation without exposure.
- Actual read-only public preview exposed an existing UI defect: Forgot password
  remained clickable while account service was unavailable and mode switching
  cleared the outage. Recovery now disables while checking/unavailable and the
  status fallback preserves the outage. Added browser regression for recovery
  becoming usable only when synthetic service returns. No auth bypass/account.
- **12 Chromium tests pass / 127 assertions**, including the capture test.
  42 synthetic PNGs saved in `/private/tmp/matterhorn-retro-captures-2026-09-28`:
  auth/models/Notes/Memory/wallet batch/integrations/Security × light/dark ×
  390/768/1440. No horizontal overflow. Captures NOT inspected yet: rounds0/2.
  Initial capture wait matched hidden policy text; changed readiness wait to
  mounted root and network-idle. Re-run passed; product assertions unchanged.
- Latest full frontend **1,233 pass / zero fail / 7,775 assertions**:
  `/private/tmp/matterhorn-retro-qa-LyRbrY/tests-1.log`.
  Initial sandbox run had two loopback-bind failures (not product failures);
  approved loopback rerun passed. Browser fixture similarly needs listener access.
- Typecheck passes: `/private/tmp/matterhorn-retro-qa-8BDHNA/typecheck-1.log`.
- Public-web production build passes:
  `/private/tmp/matterhorn-retro-qa-UXbyxm/build-web-1.log`; existing chunk warnings.
- Focused `safety-ui` runner stage added and passes: 54 wallet approval tests,
  102 observability/error-boundary tests, design gate. Log:
  `/private/tmp/matterhorn-retro-qa-Fh4QDq/safety-ui-1.log`.
  This is three safety stages, not a claim the entire gate ran.
- Restarted read-only preview after rebuild to avoid stale HTML asset hashes:
  **http://127.0.0.1:63773/**, exec session **25610**. Old session62341 stopped.
  Actual Codex browser tab13 confirms disabled recovery, Security loads, Back to
  app returns to signed-out auth gate. Marked tab for handoff. No screenshot
  inspection yet, no signed-in shell or model/chain traffic.

## 19:51–20:07 UTC — core interaction evidence and first visual review

- Previous checkpoint `6f10bd7a8d`. Extracted the existing five-desk launcher
  unchanged into a shared component so the fixture exercises production markup.
  Extended the existing real composer fixture, not a parallel implementation.
- Captured 18 additional launcher/composer/sidebar images across both themes and
  390/768/1440px. Total 60 synthetic captures. Inspected 16 representative images
  in one batch; see `VISUAL-REVIEW.md`. Inspection rounds now **1/2**.
- One correction batch: visible 44px mobile drawer close action; theme-safe
  integration Ready/Needs setup colors; readable transaction step numbers and
  44px review close target. No readiness, approval or execution logic changed.
- Composer browser regressions: flag on **8 pass / 1 optional capture skipped /
  36 assertions**; flag off **7 pass / 2 skipped / 33 assertions**. All five desk
  callbacks, unsent draft, mobile selection/Close/Escape and focus return covered.
  Initial status locator ambiguity was a fixture issue; retained assertions and
  reran successfully. Drawer close test is intentionally retro-only.
- Secondary/control regressions after corrections: **11 pass / 1 capture skipped /
  88 assertions**, including actual rendered light-theme status colors.
- Full frontend: **1,233 pass / zero failures / 7,779 assertions**:
  `/private/tmp/matterhorn-retro-qa-ghUevI/tests-1.log`.
- Typecheck passes: `/private/tmp/matterhorn-retro-qa-senvrm/typecheck-1.log`.
  Public-web build passes: `/private/tmp/matterhorn-retro-qa-DTRiqN/build-web-1.log`.
  Existing large-chunk warnings only. `git diff --check` passes.
- Restarted read-only preview after rebuild: **http://127.0.0.1:65364/**,
  exec session **84421**; old session25610 stopped. HTTP200 verified. Codex tab13
  still points to the old port until navigated. Preview remains signed-out with
  remote traffic blocked; no real credentials, providers or chain calls used.
- These are local component/fixture results. Settings/zoom coverage and final
  visual confirmation remain pending; no whole-platform/live readiness claim.

## Coverage queue

1. Foundation flag, semantic tokens and primitives with tests.
2. Core shell/model/desk/chat surfaces.
3. Settings/account/public/workspace tools and transaction reviews.
4. Batched screenshots, accessibility/functional regressions, review/docs.

Next task: remaining settings/default-off STM, zoom and accessibility/failure-path
evidence from COVERAGE.md. Use real components with isolated disposable fixtures;
record unavailable browsers and authenticated whole-shell/runtime as unverified.
Combine the remaining evidence and corrected captures in the single final visual
confirmation round; do not start another polish loop. Don't repeat tested wallet/
integration implementation. Public preview session84421 on65364; Codex tab13 still
needs navigation from old63773. Current dist is retro PUBLIC WEB. Do not read
operator secrets or bypass auth.
Then run relevant safety/functional browser checks, capture evidence, and at the
finish stage invoke the skill-required independent reviewer/documenter. Do not
run the final detector yet; it is a once-at-finish batched check. No pushes.
Do not claim hosted acceptance from synthetic fixtures. Screenshot inspection rounds used: 1/2
(reference/incumbent inspection is not inspection of the new build).
