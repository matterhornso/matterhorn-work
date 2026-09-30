# Isolated real-provider acceptance — 29 September 2026

## Result

All five desks completed real CUDOS / ASI:Cloud model responses through the local browser app. All four crypto desks returned real read-only source data. This is **operator-assisted local evidence**, not hosted public-beta approval or full desk-capability coverage.

Preview: http://localhost:60894/workspace/ws_web_b47ec6c29d79e3a8/session

Branch: `codex/retro-ui-2026-09-28`; starting commit `d941e234843ab0e6c5832bc34e315016e0a1d6f2`. Changes remain local and uncommitted. No push, merge or deployment.

## Isolation and configuration

- New disposable storage/account: `/private/tmp/matterhorn-account-demo-OZHUW2`. Credentials are private mode-0600 files outside the repository; do not attach them to a PR.
- Browser origin `localhost:60894` isolates cookies from the original `127.0.0.1:58437` preview. The original backend, accounting files, chats and sidecar were not reset, restarted or replaced. Shared source HMR can update styles; the old persisted data remains untouched.
- Existing configured provider loaded server-side; no key printed or placed in the browser. Actual response model: ASI1 Mini.
- Separate Bittensor read sidecar on loopback 9877, using the checked-in pinned Python requirements in `/private/tmp/matterhorn-fresh-bittensor.up7u9X/venv`. The older sidecar on 9876 remains unchanged. Finney reads only; transaction submission disabled.
- This disposable launcher uses its local-development auth settings and guarded-runtime-off mode. Each prompt required an exact, one-request host approval. No global approval switch or hosted registration/verification policy was changed. These conditions do not prove the production enforcement/approval journey.

## Desk evidence

| Desk | Browser session | Verified result |
| --- | --- | --- |
| Private AI | `ses_f142997eaffeDEBjKZP9KqXUgc` | Real answer explaining public addresses vs private keys; no tools. Privacy remained truthfully off for the configured external provider. |
| Hyperliquid | `ses_f1423755cffer9Sj0cHFtc1wwD` | Real BTC orderbook and funding, source `hyperliquid.info`, fetched `2026-09-29T06:32:16Z`. |
| Polymarket | `ses_f1421eca6ffeqO31G5Rsb9vNH0` | Real market discovery including Bitcoin ETF flows, source Gamma API, fetched `2026-09-29T06:34:06Z`. |
| Sui | `ses_f142033f9ffeNg2aREYlJD7bWd` | Mainnet balance read for public system address `0x5`, source `sui.grpc`, fetched `2026-09-29T06:36:06.668Z`. |
| Bittensor | `ses_f1405f2eeffeRdE6BeGaoziTsc` | Final subnet discovery returned live SDK data, including Desearch netuid 22; block **9171947**, fetched **2026-09-29T07:12:05.783137Z**, `freshness: live`, source `bittensor-python-sdk`. |

Evidence files beside this report: `private-ai-real.json`, `hyperliquid-real.json`, `polymarket-real.json`, `sui-real.json`, `bittensor-chain-live.json`. Earlier Bittensor degraded/warming/stale snapshots are retained as failure-path evidence, not relabelled successful. A targeted credential-pattern scan found no matches; this is not a general-purpose secret-scanner certification.

Bittensor initially lacked the SDK in the old temporary environment. The isolated pinned installation restored actual chain reads. A reproducible second-cache defect then pinned stale/warming results for an extra minute; the backend now caches only non-stale, non-fallback subnet lists. The final live acceptance used an explicitly warmed sidecar before dispatch. Cold/stale requests still use truthful stale-while-revalidate behavior and may need a retry; zero-warm-up fresh results are **not** established.

## Accounting and journey checks

- Final SQLite audit: **11 completed operations, 164,490 raw tokens, 164,490 charged tokens, zero active reserved-token holds**. These counts include bounded diagnosis/retries and provider tool-loop turns. No remaining pending usage operation.
- New-session model selection and five-desk navigation were exercised through the signed-in browser. Later ASI1 Mini → ASI1 selection preserved the unsent draft; reload preserved both that draft and the selected model. Restored ASI1 Mini and cleared only the disposable QA draft without sending it.
- Completed responses persisted across the isolated runtime's own restarts and browser reload. The original preview was not restarted.
- No wallet signing, transaction submission, private-key input or real-fund activity.

## Fixes delivered locally

1. Separate 120-second prompt-dispatch deadline from 12-second ordinary reads. Manual approval no longer predictably produces a premature read-timeout banner. Approval policy and idempotent message IDs remain intact.
2. Show **Preparing request** while dispatch is unresolved; readable allowlisted tool names, with original tool IDs and payloads retained.
3. Never attach an older cancelled/completed run receipt to a newer pending request.
4. Retro chat tool controls have 44px targets; recovery panel uses existing semantic colors and shared Retry button, with keyboard disclosure coverage.
5. Bittensor retries can observe recovered chain data without a second stale-result cache delay.
6. Preserve numeric Markdown values. `:12:` inside an ISO timestamp previously became a clock emoji. Numeric aliases are now excluded, named emoji aliases retained. Regression failed before the fix and passed after; the browser rendered the exact source timestamp in all five result rows.

## Validation

| Check | Result |
| --- | --- |
| Frontend tests, retro on, including timestamp fix | 1,240 passed / 0 failed; `/private/tmp/matterhorn-retro-qa-dBqYFQ/tests-1.log` |
| Frontend tests, retro off, including timestamp fix | 1,240 passed / 0 failed; `/private/tmp/matterhorn-retro-qa-N7aSZS/tests-0.log` |
| Timestamp security/formatting regression | 3 passed / 14 assertions, including raw-HTML safety |
| Bittensor tests | 146 passed / 1,042 assertions, including stale/warming recovery |
| App typecheck | Passed; `/private/tmp/matterhorn-retro-qa-P8mAUC/typecheck-1.log` |
| Server typecheck | Passed after correcting the new test's Bun fetch mock typing |
| Chat controls Chromium | Passed at 390/650/1280, light/dark; 42 assertions with capture validation |
| Chat controls Firefox / WebKit | Each passed / 36 assertions; WebKit is not native Safari |
| Targeted platform safety | Passed; `/private/tmp/matterhorn-retro-qa-pX1H6F/safety-ui-1.log` |
| Public-web build | Passed after timestamp fix; `/private/tmp/matterhorn-retro-qa-QNdhdV/build-web-1.log`; existing chunk-size warnings remain |
| Design detector | Zero primary findings; existing font-size advisories passed to reviewer |
| Whitespace | `git diff --check` passed |

Two bounded fixture screenshot rounds covered light/dark and 390/650/1280 widths. The actual authenticated desktop was also inspected. The in-app browser ignored the attempted background mobile viewport override; the duplicate desktop capture was renamed, not reported as mobile evidence. Native Safari and authenticated narrow-screen acceptance remain unverified.

Impeccable independent finish review: **ship**, scoped to this conversation extension, plus a bounded timestamp-parser addendum. Documentation check confirms an ordinary extension: DESIGN.md and token sidecar preserved. Neither review certifies production readiness.

## Remaining work / release limits

1. **Hosted normal-user acceptance:** repeat the five-desk checks on the intended release with its real auth, consent, runtime-enforcement and approval path. The local tests required operator approvals; no ordinary-user approval inbox was implemented here.
2. **Guarded-runtime-off receipt settlement:** model usage settles correctly, but run receipts can remain pending until later cancellation even after an answer. The UI no longer substitutes an old receipt; underlying off-mode receipt completion is still a separate defect.
3. **Tool-call limits:** Polymarket made nine tool calls despite a one-call prompt request. A prompt is not a hard budget; validate production enforcement and bound aggregation before claiming predictable task cost. Bittensor also needed clarification/retry calls on earlier attempts.
4. **Bittensor cold-cache UX:** final fresh evidence follows a warm-up. Keep stale disclosures and test automatic recovery/startup readiness before promising immediately fresh first requests.
5. **Sui consent classification:** a read-only public balance request triggered language about a proposed wallet action. Consent was retained and granted for that public-address request only; classification/copy needs a dedicated correction.
6. **Broader UI rollout:** apply shared components next to Settings, wallet, memory, notes and integrations, then public/account flows. The whole platform has not been redesigned or signed off by this scoped delivery.
7. **Release:** retro remains default-off. Hosted email/recovery/backups, native browsers, all button-level paths, transaction execution and production isolation were not certified here. Existing bundle-size warnings remain.
