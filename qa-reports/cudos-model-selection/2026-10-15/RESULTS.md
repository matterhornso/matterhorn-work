# CUDOS model selection, desk reads and cancellation — 15 October 2026

## Disposition and identity

**Merge authorized after the final review fix and passing CI on the exact final head; no deployment authorized or performed.** Exact-subnet/completed-Retry and corrected Retry/Stop remain historical passes at the recorded runtime revisions. The owner-approved unknown-usage retention policy is implemented by `a220c1424560ae5c978dde05d3a3ba5802bf2371` and `12ec0a35e29ef1de539a3ce3b12b9eecabde5941`; the final frontend Retry correction below does not change that policy. Merge authorization supersedes the earlier no-merge disposition, not the historical observations or separate hosted/deployment gates. No hosted-ready or complete-provider-billing claim is made.

- Repository/branch: `matterhornso/matterhorn-work`, `codex/cudos-model-selection-2026-10-14`.
- Candidate: [PR #1036](https://github.com/matterhornso/matterhorn-work/pull/1036), targeting `dev`, based on merged #1035 (`4085d83cb23e9e2f4f4c639d3a990f9b93196771`).
- Previous remote checkpoint: `41e6829d64be5af832f94728ded983bd98d370fa`; all 11 checks passed before the final lost-acknowledgement Retry correction. Query the exact new PR head and its checks before merge.
- Current local preview: `41e6829d64be5af832f94728ded983bd98d370fa`, updated in the preceding turn with data preserved and untouched during the final-review fix. Historical exact-read/completed-Retry runtime: `59c6dac3ac1f5c289509639206ff2eca6d21b601`; its successful live replay supersedes the earlier output-limit failure on `2b242d66`, not the evidence dates or revision identities.
- Corrected Retry/Stop evidence checkpoint: `2b242d66f0cfddf062eb66db348250a396e3f367`; normal login/draft persisted through that restart.
- Earlier live Stop evidence checkpoint: `eba600e8205da06b5999e21e36cdd03de2e73c91`; do not relabel it as a repeat on the later runtime.
- Accounting implementation checkpoint: `12ec0a35e29ef1de539a3ce3b12b9eecabde5941`, following `a220c142`; that accounting-only pass left the then-running `59c6dac3` preview unchanged. Final reviewed head and merge SHAs will be recorded in the immutable final handoff after exact-head CI. Hosted artifact IDs and deployment approval remain outstanding; merge authorization does not authorize deployment.
- Operator instructions and preserved gates: [deployment handoff](../../../docs/handoffs/cudos-model-selection-and-desk-reads-2026-10-15.md).

This report supersedes the current-status conclusions of the [14 October report and earlier follow-up](../2026-10-14/RESULTS.md), not its historical observations. Earlier failures remain recorded below. It is not a new visual redesign, whole-repository rollback or production configuration change.

## Final review supplement

The final P2 finding was a lost-acknowledgement Retry race: after `message_outcome_unknown`, an accepted replacement could later appear in an ordinary snapshot while the obsolete turn remained cached because its replacement boundary had been discarded. The correction retains that boundary with all pre-retry known message IDs and the maximum captured server timestamp. Polling confirms replacement only when no revert cursor or replaced IDs remain and a previously unknown user message has a finite timestamp strictly newer than that maximum. Stale old, empty, reverted, earlier-history and assistant-only snapshots leave the boundary pending. Confirmed reconciliation removes obsolete IDs, preserves unrelated/current stream output and suppresses later stale snapshots and deltas.

An unresolved-history guard prevents another destructive Retry during recovery. Polling does not resend or restore an accepted request. Pending state is scoped to its workspace/session and cleared by explicit restoration, session deletion and account reset. Identity, consent, dispatch idempotency and the approved indefinite usage-reservation policy are unchanged.

| Final-review verification | Result |
| --- | --- |
| Five added session-sync regressions | 24 passed, zero failed, 69 assertions in the complete session-sync test file; includes missing original-turn timestamps |
| Independent focused verification | 56 passed, 161 assertions |
| Full frontend, including the additional typed-error regression | 1,346 passed, zero failed, 8,219 assertions, 191 files, 9.51 seconds; six new tests total |
| App typecheck | Passed under Node 24 and Corepack pnpm 10.27.0 |
| Complete local platform safety | All 11 stages passed, exit 0; run used shell Node 26.7/pnpm 9.15.9, not the CI toolchain |
| Strict secret scan | 1,235 files, zero findings, zero skips |
| Isolated browser verification | Full Chromium: 7 passed / 943 assertions; WebKit lost-ACK regression: 2 passed / 40 assertions. Final stricter timestamp-guard Chromium confirmation: 2 passed / 40 assertions. Both Retry controls issue only status reads; delayed ordinary polling removes old output/banner without reload and preserves the draft at 390/1280px. Synthetic data only, not new live-provider acceptance |
| Exact new-head CI and merge identity | Pending; record the full tested head and actual merge SHA in the immutable final handoff |

Final-review logs are under `/private/tmp/matterhorn-pr1036-final.4mKKHt/`, including `platform-safety.log`. They are local diagnostics, not portable release artifacts. The previous all-green `41e6829d` CI does not certify the next head; exact-head CI is the definitive CI-toolchain gate.

The preceding update of the preview to `41e6829d64be5af832f94728ded983bd98d370fa` preserved **1 account, 2 auth sessions, 8 chats, 51 messages, 143 parts and 24 usage operations**. This final-review turn did not operate or restart it. The real-provider journeys below remain historical at their recorded revisions, principally `59c6dac3`; there was no new live five-desk replay or deployment.

## Corrections and source review

| Commit | Bounded change |
| --- | --- |
| `f1f9454e6fcc936d04797cbf4fb8f5c8f617ac80` | Bittensor GET read allowance becomes 10 seconds instead of 2; POST remains 2 seconds and health remains 3 seconds |
| `985d0f73647d485564c1dcfab373987fbde5dfe7` | Network provenance is reported only when payload and configured network agree; missing or conflicting evidence produces unknown, not an invented network |
| `eba600e8205da06b5999e21e36cdd03de2e73c91` | Cancels frontend preparation and identity-scoped backend requests; includes deterministic dispatch/cancellation regressions |
| `f3e970a5dca82597479c1826e1a9d94c0aecbc6f` | Initial projection and explicit `warningsTruncated`/`omittedWarningCount` metadata; incomplete live read-only-shape coverage was subsequently corrected by `59c6dac3` |
| `2b242d66f0cfddf062eb66db348250a396e3f367` | Corrects Retry authoritative snapshot/cache/cursor reconciliation; independent source review found no blockers; corrected Retry/Stop passes without reload |
| `59c6dac3ac1f5c289509639206ff2eca6d21b601` | Typed projection for the live read-only `data.subnet` response; unchanged global ceiling is 2,000 **characters**, not bytes; independent review and final exact-read/completed-Retry replay pass |

Known-unsent cancellation releases the usage hold. An accepted `202` stopped receipt retains usage/idempotency. An unknown `409` outcome retains its hold/history until reconciliation and must not be reported as unsent or blindly retried. Identity checks, request-bound consent, provider-message binding, account isolation and hard budget enforcement remain in place. Independent source review cleared these bounded corrections; the subsequent approved unknown-usage correction is described below.

The earlier model-preference and Bittensor selector fixes remain: saving a default sends no inference prompt and does not certify provider privacy; `discovery` lists/searches, while singular subnet/validator reads require exact `netuid`. No wallet authority, submission capability, provider replacement, data reset or migration is added.

## Historical verification checkpoint

Results below preserve the implementation runner's earlier checkpoint, including its recorded commit identities and safety-log marker. Later final-review verification is listed in the supplement above. These historical results do not certify a later untested revision or hosted environment.

| Verification | Result |
| --- | --- |
| Focused cancellation | 40 passed, 136 assertions |
| Complete account gateway | 100 passed, 871 assertions |
| Bittensor/MCP/routes/registry/token budget | Final typed projection checkpoint: 212 passed, 1,791 assertions, 15.56 seconds; supersedes the earlier 211-pass/1,749-assertion and 208-pass/1,666-assertion checkpoints |
| Frontend | Final Retry commit: 1,337 passed, zero failed, 8,163 assertions, 191 files, 9.12 seconds; includes actual `MatterhornServerError` coverage |
| Focused Retry/frontend regressions | Final checkpoint: 59 passed, 169 assertions |
| App typecheck | Passed after the final Retry correction |
| Server typecheck | Passed after the final typed read-only projection fix |
| Strict secret scan | Final scan: 1,232 files, zero findings, zero skips |
| Isolated production-format web build | Newest source `59c6dac3` passed in 6.87 seconds; rebuilt runtime restarted with existing data preserved |
| Complete `pnpm test:matterhorn-platform-safety` | Newest-source full run for `59c6dac3` exited 0 with `Matterhorn platform safety gate passed` |
| Published-head CI at this historical checkpoint, including Rust audit/locked compilation | Was pending; the later `41e6829d` checkpoint passed all 11 checks, and the new final-review head still requires its own CI |

Newest-source passing safety log: `/private/tmp/matterhorn-cudos-restored-4ZgYPr/safety-gate-release-final.log`. Earlier complete passes remain at `/private/tmp/matterhorn-cudos-restored-4ZgYPr/safety-gate-final-retry.log` and `/private/tmp/matterhorn-cudos-restored-4ZgYPr/safety-gate-final.log`. These are local diagnostic evidence, not portable release artifacts. Exact reproduction/build commands and toolchain requirements remain in the handoff. Use disposable test storage, not production databases.

## Historical live acceptance and usage

| Journey | Evidence/status |
| --- | --- |
| Early accepted-run Stop before visible output | **Passed locally:** UI was Thinking, API had accepted the user request; Cancelled in 4.6 seconds with `MessageAbortedError`, no pending requests or reserved tokens and no reported tokens at readback. This was not a pre-dispatch live test |
| Bittensor app discovery | **Completed locally:** 23 seconds, 9,428 total-turn tokens, testnet block 8,224,335 at `2026-10-15T03:17:52.33Z` |
| Bittensor exact subnet `netuid 27` | **Passed on `59c6dac3`:** real CUDOS app output, testnet/SDK block 8,224,521, metagraph block 8,224,522, timestamp `2026-10-15T03:55:11.629490Z`; normal API tool result `success: true`, 1,372 characters, no limit marker |
| Corrected Retry followed by Stop | **Passed on `2b242d66` without reload:** old answer removed immediately; keyboard Enter/Stop yielded Stopped in 4.2 seconds, `MessageAbortedError`, aborted tool; normal API contained only replacement prompt/aborted assistant and zero holds/pending |
| Successful retry completion | **Passed on `59c6dac3`:** same stopped session → Retry response → Completed in 20 seconds; 7,098 tokens (3,220 tool step + 3,878 final); normal history has one replacement user prompt, tool step and final assistant, with no stale answers |
| Responsive Retry/Stop flow | Bounded visual checks at 1280×900 and 390×844 passed with controls not clipped; [mobile screenshot](screenshots/retry-stop-mobile.png). Not full accessibility/theme/browser certification |
| Stop during visible streaming | **Passed locally:** a partial numbered glossary was visible through item 13 while Responding/Stop remained active; clicked Stop, final partial retained through item 37 mid-sentence, UI Stopped/Cancelled in 23 seconds, persisted `MessageAbortedError` |
| Final authenticated account/receipt readback | At `2026-10-15T03:55:53.814Z`: 24 requests; 126,670 monthly reported used tokens of 150,000; 42,002 daily of 100,000; zero reserved/pending. Unreported-usage limitation below still applies |

The mid-text Stop was observed on runtime `eba600e8205da06b5999e21e36cdd03de2e73c91`, session `ses_ec26de7e9ffeXaJA8Gz0XRZ59r`; [screenshot evidence](screenshots/streaming-stop.png) preserves the partial answer and stopped state. Live coverage includes early accepted-run Stop before visible output (4.6 seconds), accepted Retry/Stop before the UI fix (19 seconds), mid-text Stop (23 seconds), and [corrected Retry/keyboard Stop](screenshots/retry-stop-corrected.png) on `2b242d66` (4.2 seconds). True delayed-privacy/pre-dispatch Stop is covered by deterministic fixtures, not a live latency-control experiment.

The final [exact-read/completed-Retry screenshot](screenshots/bittensor-exact-retry-completed.png) is from `59c6dac3`, session `ses_ec2575b4bffeANWJLuu6qQjZeE`: Retry on the same stopped session completed with the live exact-subnet result. API verification confirmed the bounded successful tool output and replacement-only conversation history; it is not merely a rendered answer without a successful tool receipt.

The final evidence collector is limited to usage totals and explicitly named synthetic test sessions; it does not enumerate or retrieve unrelated chats or their contents.

The local Bittensor sidecar on port 59285 was confirmed alive. An initial agent probe failed because of its sandbox boundary, not a confirmed service outage; do not use that probe as a backend availability diagnosis.

The preserved restart and bounded local acceptance are not long-running runtime-stability or hosted-availability certification.

Local harness limit: the earlier idle preview process was absent before a planned restart. Read-only review found no fatal/error log marker or code evidence connecting the exit to Stop or test cleanup; the detached launcher did not record exit code/signal, so the cause remains unknown. Data was preserved, and the replacement process remained available after the completed request. If it recurs, capture supervisor PID/exit-code/signal/timestamp metadata; do not infer a fix or erase this observation.

### Approved unknown-usage correction and evidence

The earlier provider reported zero tokens for an interrupted run despite visible partial output. That exposed a real bug: all-zero terminal usage settled the reservation at zero. The owner subsequently selected **retain the reservation until usage is reconciled**, not estimated charging. `a220c1424560ae5c978dde05d3a3ba5802bf2371` retains missing-token records and requires positive reported usage for every completed inference step before settling. Unknown intermediate/final usage keeps the full hold; known reported partial usage still settles. The change is deliberately conservative because zero-filled counters do not distinguish an unreported request from a truly free one.

Verification: five new unit cases failed before the correction; the complete store suite now passes **45 tests / 295 assertions**. Coverage includes empty/missing/all-zero/malformed totals, known earlier steps with unknown final usage, unknown earlier steps with known final usage, subject/parent isolation, quota blocking, persistence across restart/month rollover, and exactly-once late settlement. Independent review identified incomplete positive breakdowns as another unknown-usage case: `12ec0a35` requires a positive total or complete valid input/output breakdown and adds five regressions. Full gateway suite: **102 tests / 909 assertions**, with omitted/all-zero stopped receipts retaining the hold, duplicate sends not redispatching, unrelated receipt rejection and eventual exact-parent settlement. One unrelated Memory fixture returned 404 once; it passed isolated and in the complete rerun without a code change.

Allowance text now distinguishes “used or reserved” and says pending requests await totals rather than implying they are still active. Frontend: **1,340 tests / 8,174 assertions**; initial three socket-fixture failures were sandbox listen restrictions and the complete loopback-permitted rerun passed. SSR copy: **10 tests / 43 assertions**, including zero/singular/plural pending counts. Isolated Chromium browser: **1 test / 20 assertions**, Light/Dark × 390/1280px, no overflow; rendered captures inspected. These are synthetic component/gateway checks, not a new CUDOS billing or hosted acceptance run. Existing preview, chats, credentials, balances and production settings were not modified.

App and server typechecks pass. The isolated web build on `a220c142` completed in **8.41 seconds** at `/private/tmp/matterhorn-cudos-restored-4ZgYPr/dist-unknown-usage`, leaving the active preview build untouched. The full platform safety gate on `a220c142` passed (`safety-unknown-usage-final.log`); backend-only `12ec0a35` is covered by focused store/gateway/typechecks and requires exact-head remote safety CI. Final remote CI is recorded on the PR after the evidence commit, not inferred from the earlier 11-check success on `6c751936`.

A hold survives restart and allowance-period rollover and may remain indefinitely if usage never arrives or the needed transcript is removed by Retry/deletion. No estimated charge, expiry release, manual adjustment endpoint or ledger reset is introduced. Historical requests already settled at zero are not backfilled: preserve and audit their receipts against provider evidence. Reconcile runtime-reported usage, allowance reservations and provider billing separately. Normal account gateway coverage does not certify every trusted operator/raw-proxy inference path.

The user explicitly authorized a **local monthly QA cap of 150,000 tokens**. The daily cap remains **100,000**. Hard usage enforcement, `MATTERHORN_PROVIDER_PRIVACY_MODE=verified-only`, `MATTERHORN_GUARDED_RUNTIME_MODE=enforce` and `MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED=1` remain enabled. The cap change is isolated local QA authority, not a production allowance or permission to reset accounts, histories or counters.

Local automatic host approval was separately user-authorized for the isolated runtime. It does not authorize private-data consent, integration access, wallet signatures or production automatic approval. CUDOS API training/retention terms remain unverified; the owner's training opt-out declaration is not provider attestation. Jev and STM remain disabled for this scope.

## Superseded checkpoints retained for traceability

- The initial five real `asi1` concept responses and model-save/reload journey passed: 19,881 charged tokens, zero reserved/pending at that checkpoint. Concept answers do not prove live-chain reads or all-model certification.
- Earlier Sui, Hyperliquid and Polymarket public reads completed with network/source/time and reported 5,385, 8,224 and 8,739 tokens respectively. Those are local historical samples, not hosted or final-revision replay.
- Bittensor initially selected a singular subnet read without `netuid`; validation now returns `bittensor_netuid_required`. A discovery attempt and an earlier Stop were confounded by roughly 18-minute and 947-second machine suspensions. Power logs recorded Dark Wake Thermal Emergency sleeps. These are failed/inconclusive historical samples, not latency or cancellation passes; thermal protections and provider-binding expiry were not weakened.
- Before the provenance correction, app discovery completed with 7,255 reported tokens but lacked network provenance. Completion alone did not satisfy the provenance gate; corrected discovery and exact-read provenance are separately demonstrated above.
- Exact `netuid 27` reads exceeded the output limit before the typed projection and again on `2b242d66` despite `f3e970a5`. The live read-only payload used `data.subnet`, unlike the earlier intelligence shape. The reviewed `59c6dac3` correction and successful 1,372-character live tool result above supersede those failures without raising the 2,000-character global ceiling.
- The earlier preparation/dispatch race is now addressed by `eba600e8205da06b5999e21e36cdd03de2e73c91` and deterministic regressions. Its previous provider-context binding error is not retrospectively relabelled as cancellation.
- Before `2b242d66`, accepted Retry/Stop cancelled correctly at the API but left the old answer visible until reload. The corrected replay above now removes that answer immediately without reload; the earlier UI failure is retained as a superseded checkpoint.
- An initial 60-term glossary completed as a whole response in 43 seconds (11,193 tokens), without an observable partial-stream window. A subsequent wait-selector attempt missed the window; a fresh accessibility-tree observation captured the successful mid-text Stop above. Neither attempt establishes a provider-buffering defect.
- At `2026-10-14T21:34:12.162Z`, authenticated readback showed 15 settled requests, 84,668 reported used/charged tokens, zero reserved/pending and 15,332 remaining under the then-current 100,000-token limits. That is not the final 15 October balance. Failed/retried requests were included; unreported interrupted usage and provider billing remain separate concerns.
- Earlier aggregate safety attempts failed/timed out in memory-inbox, Polymarket and SDK-normalizer children. Individual/stage reruns were not a complete pass. The complete local safety run recorded above now supersedes that open local aggregate gate.
- Earlier PR CI on `ee26d8575524a77b0260498e7c5574994cc9d838` failed the managed-tool catalogue budget (11,516 over 11,000) and four genuine `rustls 0.23.45` advisories. `a0de28b9d5dac18193ee782f1be85370f15b4c49` reduces the catalogue to 10,972 without raising the limit. `f2e4174ccba4a50a84f15364263a61f8ec139e06` updates only the example lockfile's `rustls` version/checksum to 0.23.46; seven minimum-policy tests passed and no suppression was added. Final-head remote security checks remain required. The handoff preserves the original CI links.

## Remaining release gates and limits

The unknown stopped-usage policy is approved, implemented and unchanged by the final frontend fix. The user authorized merge once that fix and the required exact-head checks pass; see the final-review supplement for completed verification and pending browser/CI results. The actual final head and merge identity belong in the immutable final handoff, not an inferred SHA here. Deployment is neither authorized nor performed in this turn. Exact-subnet/completed-Retry, genuine streaming Stop and corrected Retry/Stop remain local historical passes at their recorded revisions; accounting has separate deterministic evidence. Historical zero settlements and provider receipt availability remain operator reconciliation concerns. Do not equate local browser/engine evidence with hosted acceptance or provider-billing certification.

The operator must independently verify the actual domain/branch/service binding, rebuild from the approved full release SHA, retain databases/volumes/auth/chats/keys/accounting, drain runs and reconcile holds, and prove encrypted backup plus isolated restore. No migrations or resets are required. Verify matching web/API/runtime artifact identities after deployment and replay all five real desk responses through ordinary authenticated accounts with model/agent/network/source/time receipts.

Hosted model-save/reload, mobile/Profile/Account navigation, two-account isolation, real verification/reset email delivery and reset-link reuse rejection, privacy consent/denial, safe retry/cancellation and recovery evidence remain mandatory. Safari, Firefox, light-theme and full accessibility coverage were not reverified by this bounded pass. Polymarket trade preparation remains blocked by the expired jurisdiction-policy review deadline; read-only research does not authorize trades. Bittensor needs the supervised private sidecar and approved network configuration described in the handoff; a local testnet read is not certified-app or mainnet acceptance.

Roll back only to a recorded compatible, security-reviewed restored-UI artifact set after assessing loss of these fixes. Do not automatically restore the rejected retro UI, reintroduce flags, overwrite databases or disable safeguards. Database recovery is a separate authorized procedure.

Impeccable/Uncodixfy scope note: the permanent restored layout and visual system remain unchanged. Only allowance wording changes; synthetic captures verify wrapping in both themes/sizes. The design hook reported no deterministic issue. Pre-existing design-sidecar freshness drift remains untouched; no tokens, component designs or product navigation were changed.
