# One hour desk chat and visibility results

This addendum covers the user-authorized 6 October 2026, 00:21:27–01:21:27 UTC work block. It supplements, and does not replace, [the earlier five-desk acceptance](RESULTS.md). All five desks had already completed their tested core public-read chat flow locally; this block corrected additional navigation, approval visibility, starter-contract and cross-venue evidence defects. It is not exhaustive functionality certification or hosted launch approval.

## Changes

- Narrow screens now retain labelled Desks, Model, Workspace tools and Profile controls. The model picker is bounded, settings navigation closes after selection, and Profile opens the intended profile view. Wallet and Memory provide explicit Back navigation.
- Chat now displays **Waiting for operator approval** only when its authenticated server status reports a matching pending approval for the exact subject, workspace and session. No privileged approval identifier, request contents or authority is exposed to the account.
- Watch starters say **Plan a watch** and explicitly explain that chat cannot save or schedule one. Receipt starters explain metadata or the separate verification workflow without claiming chat import/verification. Controls remain visible; absent capabilities are not relabelled as working.
- Sui fee review uses the existing `transfer_sui` reviewed-action gate. The beta recommendation is a public testnet balance read, not an unavailable transaction preview. Sui's prompt/evidence budget is two, with instructions defaulting to one read and using one mainnet plus one testnet balance read for the same public address only on an explicit comparison request. Preview remains once with stop-on-failure. This is model guidance, not a new runtime exact-pair enforcement mechanism; permissions are unchanged.
- Cross-venue prediction-market search now projects bounded public evidence before compaction. Venue, market identity, public probability, source/time and real-money versus play-money classification survive alongside provider statuses and omission counts. The read-result cap remains 2,000 characters, the schema remains 10,982/11,000 characters, and raw-secret rejection and untrusted-content quarantine still run.

The [complete action matrix](DESK-ACTION-MATRIX.md) traces actual click handlers and all 48 crypto starters plus Private AI. It distinguishes live browser evidence, real API reads, fixture-backed functionality, setup gates and absent chat operations.

## Additional real local acceptance

| Flow | Actual result | Evidence |
| --- | --- | --- |
| Operator waiting and Stop | Waiting label appeared; Stop preserved the draft, cleared the queue and left zero model messages, tools, receipts, used tokens and reserved tokens | [Cancelled receipt](operator-approval-cancelled-receipt.json), [waiting screenshot](operator-approval-waiting.png), [cancelled draft](operator-approval-cancelled-draft.png) |
| Explicitly approved Private AI retry | ASI1 completed normally, charged 984 tokens, with zero pending requests or holds | [Completed receipt](operator-approval-completed-receipt.json), [response screenshot](operator-approval-completed.png) |
| Cross-venue public market chat | One actual prediction-market search tool completed and ASI1 answered; 8,667 tokens. Account total was 9,651 including the 984-token Private AI retry, with zero pending/reserved tokens | [Sanitized receipt](cross-venue-sanitized-receipt.json), [response screenshot](cross-venue-real-response.png) |
| Small-screen navigation | 390×568 model picker had no horizontal overflow and Escape restored trigger focus; mobile Wallet/Memory Back and Profile were visible. Tablet Account and desktop dark chat were checked | [Model picker](visibility-after-mobile-model-picker.png), [Wallet](visibility-after-mobile-wallet.png), [Memory](visibility-after-mobile-memory.png), [Profile](visibility-final-mobile-profile.png), [tablet Account](visibility-after-tablet-account.png), [desktop chat](visibility-after-desktop-dark-chat.png) |

The cross-venue API returned three Polymarket and three Manifold records, with zero Kalshi matches. The bounded output retained two from each populated venue and explicitly omitted two overall. Its model answer incorrectly attributed both omissions to Polymarket; the actual selection omitted one per populated venue. Tool execution and accounting passed, but that sentence is an answer-quality defect, not perfect semantic accuracy. Kalshi's empty bounded search does not establish that the venue has no relevant markets.

The final Sui mainnet/testnet comparison remains **unverified**. Its operator-approval request timed out under local host load; the UI retained the draft and reported the timeout. The subsequent browser retry was interrupted when the Mac locked and browser automation became unavailable. No successful comparison receipt was captured. Earlier Sui testnet balance/object acceptance remains valid for the exact earlier tests only. The last compact Profile-to-Account link and settings-drawer close behavior have source/render regression coverage, but their final browser clicks were also not completed after the lock.

## Manual approval is still an operational requirement

Hosted production configuration explicitly uses manual operator approval. A normal account cannot approve itself: `/approvals` and `/approvals/:id` require host or separate owner authority, and the public proxy neither exposes those roots nor forwards host credentials. A secure, staffed operator-review process is therefore required before a hosted user prompt can reach inference under this contract.

The new waiting label fixes visibility, not this operational dependency. It does not remove approval, alter timeout behavior, relax provider consent or grant a browser access to operator credentials. Unattended hosted chat is not established. See [the exact deployment boundary and regression evidence](operator-approval-deployment-limit.md).

## Verification

| Check | Result |
| --- | --- |
| New cross-venue MCP projection, prediction-market adapter and token budgets | 53 passed, 522 assertions |
| Starter copy, inputs, public beta surface, transaction chat and Sui contract | 36 passed, 371 assertions |
| Sui comparison contract, runtime budgets and capability denials | 48 passed, 398 assertions |
| Approval queue, session-read and normal-account client regression | 871 passed, 6,313 assertions; independent [result](final-verification-approval-status-result.json) |
| Approval display helper/client checks | 6 passed, 19 assertions; real browser waiting/Stop checked separately above |
| Server typecheck after final Sui guidance; whitespace check | Passed |
| Broad final frontend/MCP/Bittensor regression | 1,646 passed across 208 files, 9,824 assertions; [result](final-verification-result.json) |
| SDK/UI builds, app/server typechecks, offline Bittensor gate, isolated production web build | Passed in the same final verification run; seven generated public guides remained noindex |
| Last compact Account-link adjustment, after the broad build | 42 focused tests / 148 assertions and app typecheck passed; browser click remained unverified |
| Final selected platform-safety stages `desk.depth,product.readiness` | Passed at 01:03:52 UTC; [result](platform-safety-desk.depth-product.readiness-result.json) |

Counts overlap and are not additive unique coverage. Exact focused commands are in [DESK-ACTION-MATRIX.md](DESK-ACTION-MATRIX.md) and [VISIBILITY-INVENTORY.md](VISIBILITY-INVENTORY.md); the independent verification report records the broader build/typecheck commands and source stage. The final Account-link adjustment was checked separately, not included retroactively in the broad build.

The latest full platform-safety run is **not a clean all-stage pass**. Three stale onboarding tooltip assertions were corrected without weakening behavior checks; the next attempt passed onboarding and smoke/authority checks, then encountered Bun import/read `EINTR` errors rather than a failing assertion. Its logs are retained. The unchanged isolated 26-test bundle and the complete selected `desk.depth,product.readiness` stages subsequently passed. Earlier stages 5–10 passed on the prior source stage, not on a fresh full run. Existing build chunk-size and circular-chunk warnings remain advisory.

## Remaining limits

No hosted deployment, real wallet signing, orders, transfers, stake changes, geoblock bypass or connector OAuth was performed. Hyperliquid/Bittensor/Polymarket watch APIs exist separately, but chat has no persisted watch scheduler. Chat has no receipt-import tool; the actual Sui receipt-verification form is in the separately gated Sui tools panel. Sui custom-coin, object and batch transfer chat preparation is not established by its native-SUI-only managed preview schema.

Model wording still requires source checks. Bittensor's earlier “snapshot artifact” explanation for zero emission was unsupported; an independent SDK read verified the zero field while other distinct emission metrics were nonzero. Sui owner kind `immutable` must not be described as the distinct `shared` owner type. The cross-venue omission attribution above is a third bounded interpretation caveat. None is a reason to invent source values or provide financial conclusions.

The local ASI1 provider was exercised; other models, provider-policy verification, hosted authenticated isolation, real inbox recovery, production backup restoration and a complete cross-browser/accessibility matrix remain separate acceptance work. No merge or deployment is implied by publishing source changes to the PR.

Safari, Firefox, 200% zoom and the complete accessibility matrix were not completed. Original user preview processes, chats and data were left untouched; QA used separate origins. The deadline has passed: no new implementation or acceptance runs are being started. Closeout is limited to packaging the tested candidate, recording its evidence and safely updating draft PR #1032. Exact published commits and CI status belong in its closeout comment; old-head CI passes must not be attributed to the new candidate.

## Candidate evidence scan

At 00:50:20 UTC, the authorized scan covered only `qa-reports/web-desks/2026-10-06` and `qa-reports/model-workspace/2026-10-06`: 101 files, including 68 text files and 33 binary images. No private runtime root was scanned. Seven credential-pattern classes found no provider key, GitHub token, AWS access key, JWT, bearer literal or private-key block. Two credential-literal matches were explicit synthetic sentinels in `review-approval.test.mjs` and `inspect-chat.test.mjs`; no real credential was identified. No values were printed.

This is a text-pattern check, not a guarantee of absence of secrets. Binary screenshots were counted but not OCR-scanned; the root's controlled browser captures remain the visual-review evidence. The index was empty at this scan; the scope was the explicitly authorized candidate directories, not a claim that staged bytes had already been scanned. Final staging should retain only the intended sanitized evidence and repeat a staged-byte check if files change.
