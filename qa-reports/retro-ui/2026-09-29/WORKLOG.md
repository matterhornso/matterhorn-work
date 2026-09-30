# Retro platform delivery — foundation and core journey

Started 29 September 2026. User approved inventory/shared components followed immediately by model → desk → successful conversation. Work stays local on `codex/retro-ui-2026-09-28`, starting at `d941e234843ab0e6c5832bc34e315016e0a1d6f2`. Existing unrelated untracked handoffs are preserved. No merge, push or deployment is implied.

## Direction contract

THESIS: extend the approved Matterhorn workbench; the product is a functioning conversation, not a template dashboard.

OWN-WORLD: retain paper/charcoal, violet actions, ice selection, small corners and hard offset shadows from DESIGN.md. One shared Base UI control family.

STORY: select a persisted workspace model, see all five desks, open one, edit a prompt and receive a real answer. Changing models must preserve the current draft.

FIRST VIEWPORT: anchored navigation when space permits; labelled drawer at narrow widths; compact title/model/tools header; five desk rows on entry; conversation and composer once opened. Working and failure states belong to the real request.

FORM: code-led extension of the user-approved retro UI; no new world or concept roll. Existing reference: `.impeccable/review/retro-2026-09-28/` and the authenticated 650px-wide preview inspected at start. Two batched visual inspection rounds maximum for this delivery.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Evidence classes

- Component fixtures: isolated synthetic network, no model/chain/account acceptance.
- Authenticated local: normal disposable-account session on frontend 58437, backend proxy 50368. Never claim hosted deployment from this evidence.
- Hosted/native: not tested by this delivery unless separately recorded.

## Progress

- Read repository and design instructions, approved rollout plan and existing controls.
- Paid MCP read-only metadata compared for Base UI input-group, command and alert. No paid source copied, dependency installed or token persisted.
- Inventory: `docs/ui/retro-platform-inventory-2026-09-29.md`.
- Fixed model display-name search mismatch (including trimmed query), unlabelled compact search, missing selected-model check, unavailable/loading/retry copy, and compound-field retro treatment. Shared Input replaces hand-stamped input slots.
- Model dialog expands the current/first provider after async catalog arrival. Removed unused visibility mutation state/functions, retaining the shared hidden-model reader and initial seeding.
- Added a stable shared Button marker because Base UI composition replaces `data-slot`; DialogClose/Trigger and other composed buttons now retain the same retro variants. Flag-off styling is unchanged.
- Two bounded visual rounds completed: 12 light/dark captures of models, picker, controls and compact header picker (390, 650, 1280px). The compact dark capture initially caught a theme transition rather than a stable surface; settled computed colors and animation-disabled captures confirm the correct dark panel. No product CSS was added to paper over a capture artifact.

## Authenticated local journey — blocked at real response

Environment: frontend `http://127.0.0.1:58437`, backend `127.0.0.1:50368`, existing disposable workspace `ws_web_ab0e21b9e6783de0`. No hosted acceptance is implied.

1. Opened Models under the authenticated account in a separate background tab.
2. Selected **ASI1 Mini**. Observed the disabled Saving state before successful navigation.
3. Returned to the launcher with all five desks visible.
4. Opened Private AI in one action. Created session `ses_f1459cb04ffepzdQmlkOujeMZ6`; header and selected-model check showed ASI1 Mini.
5. Sent a bounded no-tools/no-files prompt asking for one sentence about public addresses versus private keys.
6. UI showed Thinking, then **Unexpected server error**. Retry response and Dismiss error were available; the draft remained. No completed model response was obtained.

Read-only diagnosis: backend PID 69297 retains open descriptors for `model-usage.db` and `model-usage.db-wal` with link count zero under the disposable `/private/tmp/matterhorn-account-demo-4tRbjS/matterhorn/usage` directory. Only the SHM file remains on disk. Auth and guarded-runtime stores remain linked. This confirms an invalid local storage environment and is a likely cause of the failure; the exact server exception was not captured. It is not evidence that the hosted deployment has the same fault.

Do **not** recreate the usage store in place or restart over it: that risks discarding accounting history. Asked the user to authorize a fresh isolated test runtime/account using the existing server-side provider configuration, leaving their current preview/chats untouched. Awaiting that answer. No credentials printed, accounting reset, auth bypass, real wallet transaction, push, merge or deployment occurred.

| Desk | Current evidence | Acceptance |
| --- | --- | --- |
| Private AI | Normal authenticated model → launcher → chat; real send failed | Blocked; NOT complete |
| Bittensor | Existing production launcher button keyboard/callback fixture | Real response/live-chain read unverified this delivery |
| Hyperliquid | Same fixture-level navigation coverage | Real response/live read unverified this delivery |
| Polymarket | Existing preview inspected; fixture navigation coverage | Real response/live read unverified this delivery |
| Sui | Existing production launcher button keyboard/callback fixture | Real response/live read unverified this delivery |

## Regression evidence

Commands use pinned pnpm 10.27.0 and Bun 1.3.11. `run-check.mjs` isolates environment/home/data and refuses repository env files; browser fixtures abort non-loopback requests. Run browser files **separately**: combining them in one Bun process caused timeout failures after the first suite (suite-global fixture/mock interaction suspected, not diagnosed). Independent reruns pass; do not report the combined invocation as passing.

| Check | Result / log |
| --- | --- |
| Frontend, retro on | 1,234 passed after reviewer correction; `/private/tmp/matterhorn-retro-qa-XSCTkd/tests-1.log` |
| Frontend, retro off | 1,234 passed; `/private/tmp/matterhorn-retro-qa-lYulqA/tests-0.log` |
| Typecheck | Pass after reviewer correction; `/private/tmp/matterhorn-retro-qa-l38ssz/typecheck-1.log` |
| Public-web build, retro on | Pass after reviewer correction; `/private/tmp/matterhorn-retro-qa-VWOUZs/build-web-1.log`; existing large-chunk warnings remain |
| Targeted platform safety | Pass (approval behavior, error boundaries/operational probes, design contract); `/private/tmp/matterhorn-retro-qa-TtO8hf/safety-ui-1.log` |
| Shared controls Chromium | 18 passed, 1 optional capture skipped, 138 assertions after reviewer correction |
| Shared controls Firefox | 16 passed, 2 optional captures skipped, 124 assertions; subsequent new provider-reopen test 1 passed / 2 assertions |
| Shared controls WebKit | 16 passed, 2 optional captures skipped, 124 assertions; subsequent new provider-reopen test 1 passed / 2 assertions; engine, not native Safari |
| Composer/header picker retro on | 9 passed, 1 optional capture skipped, 42 assertions; captures separately verified |
| Composer/header picker retro off | 8 passed, 2 skipped (retro drawer/captures), 38 assertions |
| Detector | Zero primary findings; 10 existing model-dialog off-ramp font-size advisories, handed to independent reviewer |
| Whitespace | `git diff --check` passed |

Browser checks cover model search, selected state, denied/mismatched/slow persistence, embedding exclusion, retained drafts, grouped fields/focus/invalid state, portals, 200% text reflow, consent/single-flight send/stop/retry, five desk buttons, mobile drawer focus and sampled secondary failure states. Fixture network responses are synthetic. Full platform button coverage, native desktop/Safari, hosted account/provider acceptance, live accounting settlement and all-five-desk real responses remain unverified.

## Finish handoffs

Independent Impeccable review found one P2: the model dialog could preserve an old expanded provider when reopened after the selected provider changed elsewhere. Fixed by clearing disclosure state while closed; regression proves provider A → close → external provider B selection → reopen exposes B's selected model and retains the draft. Full Chromium controls and targeted Firefox/WebKit regression pass. The same 12 captures were refreshed for the reviewer-requested verdict round, all opened and checked; no additional visual redesign or detector rerun. Review and documentation reports live beside this worklog. Scope remains component-level, with the live response requirement blocked.

Reviewer verdict: **ship — sole P2 resolved**, limited to that scored correction; not a release or completed-journey approval. No commit, PR or deployment has been created by this delivery.

Independent documentation check: ordinary extension, existing DESIGN.md and token sidecar preserved unchanged. See `design-documentation-check.md` for checked files and pre-existing context drift, which was not repaired outside scope.

## Next task

Finish the skill-required independent review/documentation. Then, once a fresh isolated runtime is approved, complete normal-account model persistence/reload/back navigation, a successful Private AI response, and each crypto desk's read-only live request with source/freshness and settled usage evidence. Do not move the core journey to accepted until those results are recorded. Keep the retro release flag default-off.

## Follow-up: isolated runtime and conversation states

User explicitly approved a fresh configured-provider runtime, leaving the old preview and chats untouched. New disposable account/storage at `/private/tmp/matterhorn-account-demo-OZHUW2`, browser origin `http://localhost:60894` (separate cookies), retro enabled locally only. Old frontend 58437/backend 50368 remain running; their unlinked accounting files were not recreated or reset. Credentials stay outside the repository.

Scoped UI extension contract: preserve the approved retro workbench, typography and semantic tokens; make the pending request state truthful and keep successful conversations free of premature read-timeout errors. No new palette, layout family or backend approval bypass. Existing shared models/desk/composer work stays intact. Inspect actual conversation and its narrow layout; independent finish review/documentation remain required for this extension.

Initial real-provider checks reproduced a 12-second **read** timeout on prompt **dispatch**, which can legitimately wait for manual host approval. Real completed answers appeared below a timeout banner. Dispatch now has its own bounded 120-second deadline; ordinary reads keep 12 seconds and idempotent request IDs remain unchanged. Pending dispatch says “Preparing request”, not “Thinking”. This does not implement a host-approval inbox for ordinary hosted users.

Bittensor's old read service is degraded because its temporary Python environment no longer contains the SDK. A new separate virtualenv uses the checked-in pinned requirements; direct public Finney health succeeds (block 9171770). A separate loopback sidecar on 9877 will serve only this new QA runtime. No old process/configuration is changed.

### Follow-up completed — isolated five-desk evidence

The earlier blocked table is historical and superseded by `real-response-acceptance.md`. All five desks now have real configured-provider responses; all four crypto desks have real source reads. Final Bittensor result: SDK block 9171947, fetched 2026-09-29T07:12:05.783137Z, freshness live after sidecar warm-up. The initial degraded/stale runs remain recorded honestly. Eleven completed usage operations total 164,490 raw/charged tokens with zero active holds. This is operator-assisted local acceptance, not hosted release certification.

Bounded additional fixes: do not cache Bittensor fallback/stale results in a second 60-second layer; select only the newest final run receipt; format six known tool labels without changing raw IDs; 44px tool disclosures and semantic retry/error styling. Real source timestamps exposed numeric emoji substitution; a failing regression reproduced the corruption and the renderer now preserves numeric aliases. Browser DOM confirms the exact timestamp in all five table rows. Model changes and reload retained the QA draft and selected model; restored ASI1 Mini, removed only that unsent test draft.

Final frontend suites each passed 1,240 tests with retro on and off, including the timestamp correction. Retro-off final log: `/private/tmp/matterhorn-retro-qa-N7aSZS/tests-0.log`. App and server typecheck passed. Bittensor 146 passed; targeted safety passed. Chromium/Firefox/WebKit chat component checks passed; actual mobile browser capture unavailable and native Safari unverified. Final post-timestamp web build passed: `/private/tmp/matterhorn-retro-qa-QNdhdV/build-web-1.log` (existing chunk-size warnings). Original runtime PIDs 69297/69240 confirmed still running at handoff.

Impeccable finish reviewer: **ship**, scoped ordinary chat extension; separate addendum approves timestamp parsing. Independent documenter rechecked after that correction; DESIGN.md and sidecar unchanged. No second detector or additional visual polish loop. Reports: `chat-finish-review.md`, `chat-design-documentation-check.md`.

Remaining runtime/acceptance gaps are explicit in `real-response-acceptance.md`: normal hosted approvals/enforcement, off-mode run-receipt settlement, hard tool budgets, cold-cache behavior, Sui read-only consent classification and authenticated mobile acceptance. Next UI slice: shared-component migration of secondary operational pages. Changes remain local; no new commit, PR, merge or deployment.

### Follow-up: runtime reliability and ordinary-user journey completed locally

User approved steps 1–2. See `runtime-reliability-worklog.md` and `runtime-acceptance/RESULTS.md` for the superseding evidence. A third isolated origin (IPv6 loopback) preserves both previous previews. Real configured-provider ASI1 answers now complete on all five desks with guarded enforcement and authoritative gateway enabled, without host approval helpers. Receipts finalize, read capabilities are consumed, and 39,548 provider tokens reconcile exactly with no pending hold. ASI1 Mini rate limiting is explicitly not resolved by changing app authorization.

New bounded repairs: retry context revalidation after provider rate limits; strict standalone read-only disclaimer classification; Bittensor bounded coalesced cold refresh/stale preservation; cache-inclusive response-detail token totals. Existing read-budget enforcement is proved by regression rather than weakened. Authenticated 390px/1280px captures, mobile navigation/model search, draft/model-change/back-navigation retention, cancellation and expired-session sign-in recovery passed. Platform safety, 1,241 frontend tests, focused server/auth/accounting suites, typechecks and frontend build pass. Broad hosted/live release acceptance and production operator configuration remain separate; no push/merge/deployment was performed.
