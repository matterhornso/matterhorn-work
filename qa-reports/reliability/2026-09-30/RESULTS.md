# Matterhorn chat reliability and release audit

This report is for the release reviewer and deployment team. It covers the five-hour reliability work beginning 30 September 2026 at 17:18 UTC. The candidate improves chat recovery, accounting, data deletion and public-chain reads. It is **not a hosted release approval**: production revision/guard drift, live Jev configuration, Mini quota, inbox delivery and backup restoration remain unresolved or unverified.

## Release identity and scope

- Branch: `codex/chat-reliability-audit-2026-09-30`.
- Final source candidate reviewed here: `652555e586597694be231787ec01ef5cbe13ddc2`. Later documentation/evidence commits do not change its application source.
- Base: PR #1029, `codex/jev-chat-opt-in-2026-09-30`, commit `22a696626847f139f58adfad86c6cd20f5d0e5ad`. GitHub still reported OPEN on 30 September at approximately 21:41 UTC.
- The real-provider runtime was incrementally refreshed through `1923df5bf5ec8433154e55b337e8190f5e429775` plus the identical agent guidance subsequently committed as `1914b3e544b278583f84b3b66eb1c7282cbca11b`. Browser verification additionally covered UI commits `35cde3740923e28d8da92cb802f4366f4c182f07` and `aa5f5b62f6f333b8c4715b664ac62add13d2ec15` through Vite.
- Later memory-only fixes require their recorded regression results; the real-provider observations below are not relabelled as tests of a later exact full-tree SHA.
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
