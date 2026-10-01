# Matterhorn chat reliability and release audit

## 1 October CodeQL follow-up

PR #1029 merged into `dev` at `5e4b5516c3683410923f5b8d789418707a448485`, and #1030 now targets `dev`. Correction: four successful security workflow jobs did **not** mean all security gates passed. The separate CodeQL scanning check reported two high-severity findings on the previous head: polynomial regex in the memory filename slug and a filesystem check/read race in the test snapshot helper. The follow-up replaces quantified trimming with single-character anchors (normalization already collapses separator runs) and uses one no-follow open handle for metadata/content reads. Added public-vault filename regressions for long separator runs, Unicode-only titles and truncation, plus a symlink-rejection test for the helper. Focused local checks passed: 19 legacy-cleanup tests, 16 memory-deletion/filename tests and memory-vault smoke. Final current-head CI remains the merge gate; no alert dismissal or bypass is authorized. Historical source and live-read results below retain their original revision scope.

This report is for the release reviewer and deployment team. It covers the five-hour reliability work beginning 30 September 2026 at 17:18 UTC. The candidate improves chat recovery, accounting, data deletion and public-chain reads. It is **not a hosted release approval**: production revision/guard drift, live Jev configuration, Mini quota, inbox delivery and backup restoration remain unresolved or unverified.

## Release identity and scope

- Branch: `codex/chat-reliability-audit-2026-09-30`.
- Published review: [PR #1030](https://github.com/matterhornso/matterhorn-work/pull/1030), stacked on #1029. Initial publication head `fe4e7381ff47f25ab7bdf162c7809cc0f2b7c1be` contains the source candidate plus this evidence. Check the PR for later documentation commits and live CI state.
- Final source candidate reviewed here: `652555e586597694be231787ec01ef5cbe13ddc2`. Later documentation/evidence commits do not change its application source.
- Base: PR #1029, `codex/jev-chat-opt-in-2026-09-30`, commit `22a696626847f139f58adfad86c6cd20f5d0e5ad`. GitHub still reported OPEN on 30 September at approximately 21:41 UTC.
- Earlier real-provider observations were collected during incremental runtime refreshes. A final five-desk pass used publication head `ff2b14679b14b3517fbd6e161d7689a84c1b76c9`, whose application source is identical to `652555e586597694be231787ec01ef5cbe13ddc2`. The separate final-pass section below preserves that distinction.
- Refreshing the disposable QA runtime preserved its existing history and usage ledger. The private plaintext recovery copy is not encrypted-backup certification. The original user preview and chats were untouched.
- No production configuration, signup activation, secret rotation, deployment, wallet signing or real-fund transaction was performed. Existing user chats were not migrated or deleted.

## Implemented corrections

1. Preserve completion reasons and display incomplete, cancelled and failed responses truthfully. Answer-only continuation is validated against the latest visible incomplete response, disables tools, and is deduplicated across tabs. Retry preserves unrelated drafts and repeats privacy preparation before dispatch.
2. Settle terminal errors even when upstream messages retain stale tool/unknown finish markers. Retain cumulative multi-step usage until acknowledged. Authenticate and rehydrate durable receipts before acknowledging completion after restart; preserve capability audit decisions on replay.
3. Hard-delete memory index entries, managed Markdown, related suggestions and content-bearing log copies. Redact historical memory content in audit summaries while preserving event identity. Apply owner-only POSIX file/directory permissions and managed-path/symlink checks. Add an explicit, fingerprint-bound offline legacy cleanup procedure rather than silently migrating user data.
4. Stop old requests and queued writes on account changes; clear known account-specific browser caches while preserving appearance preferences. Generation checks prevent late responses from repopulating a previous account's state.
5. Preserve Stop while Jev classification is pending. Cancellation retains the draft and discards late results. Disabling Jev intentionally continues ordinary chat without passing its classification receipt.
6. Route managed Bittensor public reads structurally, rather than rejecting ordinary data containing words such as “stake.” Add exact Polymarket market-ID lookup and canonical tool schemas. Require an explicit network for managed Sui reads.
7. Show authoritative Hyperliquid limitations outside collapsed tool JSON; generated prose is not trusted to convey every warning. Use 16px mobile composer input while retaining desktop sizing.
8. Pin patched Axios and Next.js versions in the shared package configuration and lockfile. Reject unexpected redirects in internal completion and managed tool transports so endpoint-bound credentials and request data are not forwarded.

## Automated evidence

The recorded commands run from the repository root unless a working directory is stated. Bun is the repository's test runner; pnpm is its package manager. Tests using local HTTP fixtures require loopback binding. Restricted-environment bind failures were rerun with that access; they are not silently counted as passes.

| Check | Latest verified result | Scope |
| --- | --- | --- |
| `pnpm --filter @matterhorn-work/app test` | 1,304 passed; 8,030 assertions | Frontend suite after source-warning UI changes |
| `pnpm --filter matterhorn-work-server test` | 1,852 passed; 12,432 assertions | Final source candidate including purge and transport fixes |
| App and server `typecheck` | Passed | App after source-warning UI; server after final transport change |
| App and server production builds | Passed | App has existing large-chunk warnings; this is not a performance benchmark |
| `node scripts/matterhorn-platform-safety-gate.mjs` | All 11 stages passed | Final source candidate; includes offline contracts, not hosted acceptance |
| Dependency bulk audit | 0 advisories, 0 blocking; 1,296 packages / 1,458 versions | Complete lockfile at audit time; not a guarantee against unknown vulnerabilities |
| Focused auth/runtime/plugin/usage/memory/legacy-cleanup audit | 168 passed; 1,340 assertions | Six test files, isolated local fixtures |
| `node --test scripts/matterhorn-memory-deletion.test.mjs` | 15 passed after purge interruption fix | Includes a real filesystem failure and successful retry |
| `node scripts/matterhorn-memory-vault.test.mjs` | Passed | Memory smoke, including large export coverage |
| Source secret-pattern scan | 1,234 files, 0 findings | Excludes docs, tests, fixtures, runtime data and generated evidence; publication review is separate |

The interrupted-purge test first failed because the index entry had already disappeared after log cleanup failed. Commit `d8e8ccf4723d5a6c2b9e83fdcb059dc0c789d4d3` preserves the persisted inventory until log cleanup succeeds. It does not make multi-file deletion transactional or erase backups.

A separate actual loopback 307 redirect test reproduced managed tool requests reaching an unexpected destination. Commit `652555e586597694be231787ec01ef5cbe13ddc2` rejects redirects; the focused managed transport suite passed 39 tests and 244 assertions. Only fake credentials and a disposable local server were used. Final server suite, typecheck, build and platform gate subsequently passed.

GitHub full test, i18n and UI-MCP workflows target PRs into `dev`, not a stacked feature branch. Security workflows accept stacked PRs. A skipped full workflow is not a pass: retarget after #1029 merges and require all final-merge checks before deployment. Remote CI status must be read from the new PR, not inferred from these local results.

At the final verification, all four jobs in [security workflow run 36782422142](https://github.com/matterhornso/matterhorn-work/actions/runs/36782422142) passed on `ff2b14679b14b3517fbd6e161d7689a84c1b76c9`: CodeQL JavaScript/TypeScript, Rust dependency security, repository security gates and dependency review. Subsequent documentation commits require their own applicable CI; this result does not describe an untested future merge.

GitHub's push notice reported five open **default-branch** advisories. Their alert records identify brace-expansion (three), engine.io and fast-uri. The candidate lockfile already contains patched versions 5.0.12, 6.6.10 and 3.1.8 respectively, inherited from #1029. Open default-branch alerts are not evidence that this candidate uses the old versions, and a clean candidate audit does not close alerts until the relevant branch receives the fixes. Do not dismiss them merely to make the repository badge green.

## Real provider and five desk evidence

These are authenticated browser requests using a disposable local account, ASI1 through the configured CUDOS provider, and public read-only services. They are **not hosted acceptance**, exhaustive desk certification, or live Jev tests. Earlier failures remain in the evidence rather than being replaced with only passing screenshots.

| Desk | Observed result | Important qualification |
| --- | --- | --- |
| Private AI | Complete conversational answer; selected ASI1; no tools; 6,686 recorded tokens | One representative request, not a quality benchmark |
| Bittensor | Subnet 12 ComputeHorde; block 9,183,202; price 0.004718881 TAO; SDK source at 20:43:11.681903 UTC | Missing metagraph fields disclosed; signing, watches and subnet service execution not exercised |
| Hyperliquid | BTC bid 83,725 / ask 83,726 / spread 1; source at 21:25:36.881 UTC; 9,160 tokens | Model still said “no warnings” despite depth limitations. UI now separately displays the authoritative limitation; existing prose was not rewritten |
| Polymarket | Exact market 4789394; AD Cali vs Alianza FC O/U 8.5; Over 0.06 / Under 0.94; Gamma at 20:59:40.902 UTC | Original numeric text search failed; typed exact lookup fixed it. Resolution-detail truncation disclosed. No order prepared |
| Sui | Requested mainnet balance for the full equivalent of `0x5`; 31.018584912 SUI; source at 21:11:54.621 UTC; 6,149 tokens | Original attempts omitted network/truncated address. Fixed contract and guidance produced the correct read. Ownership explanation in model prose was not independently supported |

At 21:27:53.839 UTC, the collected 12-session local ledger reported **130,811 used = 130,811 charged, reserved 0, pending 0**. This includes failed attempts and recovery tests, not just the five rows above. Direct provider diagnostics were outside this ledger and are not represented as application-accounted requests.

ASI1 separately reproduced an upstream `length` finish after 35 completion tokens when copying a repetitive zero-padded identifier despite a 512-token limit. Compact input completed. Safe continuation stayed tool-free and preserved the draft, but did not guarantee that the provider would finish the repetitive content. Mini returned HTTP 429 without a Retry-After header. No unchanged repeated quota probes were performed.

### Final source browser acceptance

The final pass used the same normally authenticated disposable account, ASI1 and existing QA conversations. All four chain tools retained issued/allowed read capabilities; no transaction was prepared or submitted. Responses and receipts were read back through the authenticated API at **22:05:16.340 UTC** and checked against the actual tool payloads.

| Desk | Final observation | Request tokens | Qualification |
| --- | --- | ---: | --- |
| Private AI | Two-sentence contextual follow-up completed at 22:04:42 UTC, without tools | 6,780 | A representative follow-up, not a general quality benchmark |
| Bittensor | Subnet 12, block 9,183,576, price 0.004733255 TAO; source 21:57:53.685886 UTC | 8,968 | Missing metagraph fields explicitly disclosed |
| Hyperliquid | BTC bid 83,738 / ask 83,739 / spread 1; source 21:57:23.408 UTC | 10,701 | Values match. Generated “no warnings” remains misleading; authoritative depth limitation is separately rendered |
| Polymarket | Market 4789394, Over 0.06 / Under 0.94; source 21:58:48.037 UTC | 11,527 | Exact lookup and both outcomes match; truncated rules disclosed. The prose's characterization as last-traded prices is not proven by the tool payload |
| Sui | Full supplied address correctly normalized to equivalent `0x5`, mainnet, 31.018584912 SUI; source 22:03:57.565 UTC | 6,852 | No unsupported ownership explanation in this final answer; earlier failure remains recorded |

The five requests total **44,828 tokens**, exactly matching the corresponding receipt totals and the ledger increase from 130,811 to **175,639**. Used and charged both equal 175,639; reserved and pending are both zero. This proves reconciliation for these observed requests, not guaranteed delivery through arbitrary process loss.

The receipt metadata is less complete than the underlying tool payload: the Polymarket receipt has null source/freshness despite a source-bearing market result; the Sui receipt has a source but no freshness label. Do not infer missing freshness or discard the underlying timestamp. Broader receipt provenance normalization remains a follow-up. Live Jev was not enabled or tested in this pass.

See the [final Sui browser capture](captures/final-source-sui.png). These checks establish representative local real-provider execution on the final source, not exhaustive desk coverage or hosted launch acceptance.

## Security and lifecycle coverage

- Normal two-account API tests cover organization/workspace separation and note/memory mutation isolation, including colliding memory IDs and restart. Test authentication configuration does not prove production verification email delivery.
- Mounted production UI fixtures cover continuation failure/retry/consent and Jev Stop/disable/late-result behaviour. Provider responses in these fixtures are synthetic.
- Jev off/skip paths and receipt validation have automated coverage. Real TypeSafe classification remains blocked by missing approved provider configuration. No TypeSafe credential was inferred from the CUDOS key.
- Completion replay tests cover lost acknowledgements and the 473-total/123-recorded restart defect. Pending plugin usage remains in process memory; a durable outbox and guaranteed delivery through plugin process loss are not implemented.
- Memory queues protect one server process. Deploy only one writer per filesystem vault; this is not distributed locking. Trusted storage roots and OS access controls remain prerequisites.
- Storage permissions are not encryption. Old chats, exports, browser copies, provider retention, snapshots and backups have separate deletion lifecycles. The offline cleanup was tested on fixtures only, not run on customer data.

## UI coverage and limits

Verified at 390px mobile, 768px tablet and 1280px desktop: no measured horizontal page overflow in the inspected chat; 16px mobile input; light/system and dark appearance; navigation drawer keyboard wrap, visible focus and Escape return. The QA account's original System appearance was restored. The original user preview was not changed.

Screenshots show the bounded changes, not every page or state:

- [Source limitations outside tool disclosure](captures/hyperliquid-source-limitations.png)
- [Mobile composer sizing](captures/chat-mobile-16px.png)
- [Mobile dark theme](captures/chat-mobile-dark.png)
- [Jev cancelled while retaining draft](captures/jev-stopped-draft-preserved.png)

Actual Safari/Firefox, screen-reader modal semantics, 200% browser zoom and reduced-motion emulation remain unverified. Mobile settings currently leave the drawer open after navigation until Close is selected. No claim of comprehensive WCAG conformance or whole-platform performance certification is made.

## Hosted observations

The unauthenticated, read-only probe at **21:33:24.630 UTC on 30 September** used `https://desks.matterhorn.so` for both app and same-origin API. It found three failed expectations:

- Web reports `787d85bb830ff859a185d3bcd1a20c493dd008d4`, not the candidate.
- API reports the same older SHA.
- Guarded runtime reports `off`, not required `enforce`, although readiness reports true.

HTTPS, defensive headers, same-origin routing, unauthenticated JSON 401 responses and CORS challenge checks passed. Public configuration reports signup open with verification/recovery/legal/Turnstile dependencies and launch readiness. Those flags do not prove inbox delivery, password-reset completion, correct backup restoration or authenticated desk execution. See [content-free hosted probe](hosted-diagnostic.json).

## Release decision

**Do not treat this candidate as fully accepted for public beta yet.** It is suitable for code review and controlled staging after final CI. Required owner actions and post-deployment checks are in [the deployment handoff](../../../docs/handoffs/chat-reliability-deployment-2026-10-01.md).

Keep Jev disabled until real configuration/policy/acceptance exists. Resolve Mini throttling or explicitly leave it unavailable. Require exact deployed revision, enforced runtime, authenticated five-desk reads, inbox/recovery tests and verified backup restoration before an unrestricted launch decision. The security review is an engineering audit with the stated coverage, not an independent penetration test.
