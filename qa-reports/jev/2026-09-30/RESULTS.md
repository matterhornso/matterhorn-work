# Jev chat opt-in — local validation

Date: 2026-09-30. Delivery branch: `codex/jev-chat-opt-in-2026-09-30`. Parent: `239632e8d85a03f92ab6add75020efc5f713f7e9` (pending security/retro release stack). Prepared for a PR to `dev`, not deployment approval. No production enablement, real TypeSafe call or customer-data test. Existing preview processes/chats were not restarted or modified.

## Final chat QA and corrections

- **1,508 tests passed**, 0 failed, 9,441 assertions across 191 files: full frontend tests plus server session-read-model, Jev, usage-store, privacy, guarded-runtime and backend-security suites.
- Jev browser fixtures: **5 tests / 25 assertions passed in each of Chromium, Firefox and WebKit**. These cover consent, remembered choice, account separation, private skip, fallback, Stop, disabling in flight, keyboard/focus and responsive light/dark controls.
- **15/15 pinned-runtime cases passed with guarded mode `enforce`**: all five desks × Jev off/on/unavailable. Synthetic inference and synthetic TypeSafe responses, but actual Matterhorn gateway, OpenCode 1.18.31 and guard plugin. Exactly 15 model calls, 15,000 tokens used and charged, zero pending holds; secret and raw-runtime negative controls blocked before inference. See `runtime-matrix.jsonl`.
- Frontend/backend typechecks, frontend build, full platform safety gate, strict release secret scan and `git diff --check` passed. Existing build chunk-size warnings remain.
- Patched dependency smoke: **4/4 passed** in the existing isolated patched-package install; running preview dependencies were not replaced. Commit-aware elliptic patch proof and full lock audit passed: **1,457 versions, no low-or-higher advisories**. Plain pnpm audit reports the old version label of the pinned elliptic Git artifact; the repository's existing proof verifies the upstream security fix at `04cb6f54ce552b3ebde6be06d6050419e1c7333e`. No audit threshold or suppression was changed. Fresh-install CI remains required.

The real enforcing runtime exposed `agent_provider_system_unclassified` for Jev-assisted messages. Fixed by classifying the exact compiled system bytes after adding the bounded advisory, retaining all existing privacy labels. The matrix passes without weakening enforcement. Review also found that a renewed/removed Jev receipt changed retry identity: client and server now exclude the ephemeral receipt from logical message identity, so a lost-ack retry cannot dispatch or charge twice. New regression tests cover the accepted replay and pending-client request ID.

Real-provider testing uses a separate normal local test account and CUDOS ASI1, with enforcing guards. The final browser run **passed all five desks**, checking conceptual chat responses, selected model, persisted desk routes, a Private AI draft across reload, visible completion and reconciled usage. Those five answers report 18,747 total tokens including cache; the isolated account's cumulative ledger across diagnostic attempts and the final run is **63,892 used = 63,892 charged, zero pending**. Results and screenshots are in `real-chat-results.json` and `real-chat-captures/`. No tools/live-chain reads, wallet signing or real TypeSafe calls were performed. Local signup uses a disposable test configuration, not production email/verification acceptance. Jev is truthfully unavailable in that runtime because no separate TypeSafe key/policy was configured.

Probe development initially hit asynchronous route/model hydration and an incorrect crypto-composer label selector. The final probe waits for model hydration and reloads each newly opened desk deep link before typing; fast successive navigation without reload is **not** certified by this real-provider run. A Sui dispatch timeout in an earlier sequential probe did not recur in its isolated run; retain navigation/dispatch timing in hosted acceptance rather than claiming that one rerun proves it cannot recur. Subset diagnostic runs intentionally did not satisfy the full-five assertion. They are not counted as full-matrix passes.

The final response polling finished ahead of transcript rendering on four desks, so the initial captures showed loading. A separate **read-only five-session browser pass** (`verify-real-transcripts.mjs`) reopened all final session URLs, waited for each actual answer to appear, and refreshed all five captures successfully, with no new model requests. The main probe now also waits for rendered answer text before capture. This distinction avoids treating an API completion alone as visible UI acceptance.

Reproduce the synthetic runtime matrix with `MATTERHORN_QA_OPENCODE_BIN=/absolute/path/to/pinned/opencode bun scripts/matterhorn-runtime-regression-probe.ts --jev --guarded-enforce`. The local binary's verified SHA-256 was `16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198` (platform-specific). Real browser probe: `MATTERHORN_JEV_QA_ACCOUNT_DIR=/private/tmp/matterhorn-account-demo-EXACT_ID node qa-reports/jev/2026-09-30/real-desk-chat.ts`; it requires the disposable local launcher's private `test-login.json` and `local-diagnostics.json`, never committed. Do not supply production credentials. Use the normal staging account process for hosted acceptance.

## Earlier implementation validation (before real-provider QA)

## Behavior delivered

Explicit opt-in from the composer; on/off mid-chat; consent-versioned remembered choice per account/workspace/browser and across new chats. Jev classifies topic/task from eligible current text, then the selected model answers through the existing canonical gateway. No Jev-derived tool/model/agent selection or authorization. Disabled/unconfigured/unsafe input has no provider egress. Private or unverified-history chats skip classification server-side. Failures fall back to normal chat; Stop prevents late model submission and preserves the draft.

## Commands and results

Commands run from repository root unless a directory is named. `pnpm` used the installed Corepack pnpm 10.27.0; Bun 1.3.11. Local HTTP/browser fixtures required elevated localhost-binding permission. No live credentials were accessed.

| Check | Result |
| --- | --- |
| `bun test apps/app/tests` | **1,252 passed**, 0 failed, 7,866 assertions across 185 files. Initial sandbox run could not bind the two HTTP fixtures; both passed when rerun with localhost permission, then the entire suite passed. |
| `bun test apps/server/src/session-read-model.e2e.test.ts apps/server/src/jev.test.ts apps/server/src/model-usage-store.test.ts` | **127 passed**, 0 failed, 1,019 assertions. Final run includes Jev auth/read-only/manual-approval rejection. |
| `bun test apps/server/src/agent-privacy.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/backend-security.e2e.test.ts` | **128 passed**, 0 failed, 542 assertions. |
| `bun test apps/app/scripts/jev-chat.browser.test.ts` with default Chromium, `JEV_QA_BROWSER=firefox`, and `JEV_QA_BROWSER=webkit` | **5 passed per engine**, 0 failed, 25 assertions per engine. All classification/model endpoints are isolated mocks. |
| `pnpm exec tsc -p tsconfig.json --noEmit` in `apps/app` and `apps/server` | Passed both. Root invocation initially found no root `tsc`; correct package invocations passed. |
| `pnpm exec vite build` in `apps/app` | Passed; Rollup reported large chunks, circular `index -> den -> index`, annotation and Node deprecation warnings. No build failure. |
| `pnpm exec tsc -p tsconfig.json` in `apps/server` | Passed, including final server changes. |
| `git diff --check` | Passed. |
| Impeccable detector on `jev-chat-control.tsx` | `[]`, one pass. |

Canonical gateway fixtures cover all five managed agents with an explicit selected model: one classification is reused identically through preflight/send; changed text is rejected; no classifier receipt is passed upstream; ordinary agent/model selection stays unchanged. Service tests cover zero-egress defaults and consent, sensitive/local/transaction/length exclusions, current-text-only payload, bounded schema/distribution validation, tamper/expiry/account/workspace/session/model binding, same-key replica verification, key rotation and sanitized failure/usage reporting. The usage store suite and existing guarded-runtime tests cover chat accounting, independently of classification usage.

Browser tests cover consent/cancel, off by default, remembered new-chat/reload preference, disabling, account separation, selected model preservation, private skip, provider failure, stopping and disabling while classification is pending, keyboard-open/Escape/focus, and overflow at 390/650/1280 × light/dark. They exposed a real DialogTrigger toggle-off bug during development; it was fixed using a separate plain button for the enabled state. A later Escape assertion was corrected to wait for dialog exit rather than race unmount.

## Design evidence

Twelve validated full-page fixture captures: `.impeccable/review/jev/{composer,consent}-{light,dark}-{390,650,1280}.png`. Captures use shared production controls and reduced-motion preference, not the full session layout. Every capture was opened by the builder and independently reviewed. [Finish review](finish-review.md): **ship within the local control/consent scope**. [Design documentation](design-documentation.md): preserve incumbent DESIGN.md/sidecar; no new system tokens or raster assets. Known metadata drift was not repaired.

## Not yet verified / release prerequisites

- Real Jev API compatibility, latency, classification quality, usage reconciliation and provider spend limits. Mocked labels cannot demonstrate model accuracy.
- Hosted authentication/tenant acceptance, actual matched deployment, full live desk responses with Jev on/off, and full-session UI/200% zoom/screen-reader acceptance. Engine fixture checks are not installed Safari certification or a whole-app accessibility audit.
- Provider policy approval and securely provisioned TypeSafe key. No CUDOS credential reuse. Single-store caps are not aggregate enforcement across separate replicas.
- Browser-local preference does not synchronize across devices; historical-message replay remains ordinary chat. Current consent includes this limitation.

See [activation and rollback handoff](../../../../docs/handoffs/jev-chat-opt-in-2026-09-30.md). Review the stacked security/retro base along with Jev. Do not present these local results as deployment approval.
