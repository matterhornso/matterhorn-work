# Post-#1036 five-desk QA — results and continuation handoff

Historical partial run. The [16 October combined candidate verification](../../launch-candidate/2026-10-16/RESULTS.md) closes the three budget-blocked local response checks and records six retained unknown-usage holds, the final source and current checks. Do not treat the continuation actions below as current unresolved local tasks.

Checked 15 October 2026 UTC (16 October locally). **Local acceptance remains partial; do not use this report as hosted or all-five-desk release sign-off.**

## Candidate and access

- Local preview: http://cudos-restored.localhost:58334
- Logged-in QA result: http://cudos-restored.localhost:58334/workspace/ws_web_3b2e50a56ee080fb/session/ses_ebf3a0794ffeGQAH7406u0OvpR
- Checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-permanent-restored-ui-2026-10-13`
- Branch: `codex/post1036-five-desk-qa-2026-10-15`
- Merged baseline: `c5f326b2a38ecc49817adcce5922ba5ad95991eb` (#1036).
- Running candidate: baseline plus local patch `f40ff2e81e014b6f109e97bcdb1b1d8ebe80656f0619fa0a3099737de70743aa` (display identity suffix `-local-f40ff2e81e01`). This patch is not committed, pushed or deployed.
- These links rely on this machine's running preview and existing authenticated browser. They contain no login credential and do not grant access from another browser.

## Live browser coverage

All tests used fresh named QA conversations, public synthetic prompts, existing configured CUDOS and read-only tools. No existing conversation was used for sending/retrying; no private files/memories, transactions or wallet signing.

| Desk | Actual response / read | Stop and Retry | Remaining acceptance |
| --- | --- | --- | --- |
| Private AI | GPT OSS 20B answered; first response 4,731 tokens, completed retry 4,756, post-Stop retry 9,536. In-flight model stayed unchanged when the workspace default changed. | Visible streaming Stop, partial answer preserved, successful Retry. | None for the exercised chat flow. |
| Bittensor | ASI1 + real live-chain SDK tool returned subnet 27 on testnet, block 8,228,812, observation time 18:13:18Z, source and truncated-validator limitation; total 7,350 tokens. | Early Stop confirmed, session idle; empty stopped row now has Retry. Attempted Retry hit the allowance guard without altering history or dispatching a request. | Successful post-Stop Retry remains budget-blocked. Initial live read is not a substitute for this check. |
| Hyperliquid | ASI1 + real public orderbook and funding reads, `hyperliquid.info`, observed 18:21:40Z; total 8,254 tokens. | Early Stop followed by successful Retry. One replacement user turn, no duplicate dispatch. | None for the exercised public market flow. |
| Polymarket | Retry completed honestly with no usable market after oversized / empty search results; total 16,533 tokens. Found and fixed the discovery defects below. | Early Stop and completed Retry mechanics passed. | Post-fix real model/browser discovery remains budget-blocked. Direct public API evidence is not equivalent. |
| Sui | ASI1 response completed in 2,729 tokens, accurately explaining the requested checkpoint/network-overview tool was unavailable. | Early Stop and successful Retry; unsent draft retained. | Supported public-address balance read still needed. The tested unsupported prompt does **not** prove live chain access. |

Model setup/search and persistence passed: 12 catalog entries / 10 chat-compatible models; embedding entries excluded; no-match search recovery; GPT OSS 20B selected and saved across reload; switching to/from ASI1 retained the unsent draft. Original ASI1 workspace default restored. This does not verify every listed model or resolve ASI1 Mini throttling.

## Defects fixed locally

1. **Unknown stopped usage presented as zero.** Completion metadata and run receipts now show unavailable for unreported zero placeholders. Known positive usage and explicitly verified zero usage stay accurate; legacy zero cost is not treated as verified free execution. Accounting logic and reservations were not relaxed.
2. **Early Stop hid all recovery actions.** Empty interrupted/failed assistant rows now display a clear state and labelled Retry using the existing guarded retry path. Empty answers do not expose Copy/Save/rating; Retry is not offered during active execution or after a newer user turn. Regression tests include tool-only interruption and draft behavior.
3. **Polymarket discovery returned unusable results.** Search requests active events and excludes closed markets upstream. Bounded result projection retains complete market probabilities, identifiers and provenance for fewer results, with explicit omission warnings. Secret filtering, quarantine and the existing context bound remain intact. API-level test retained two candidates from five within 1,574 characters. Parameter reference: [official Polymarket search API](https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles).

The UI hardening followed Impeccable/Uncodixfy guidance to preserve the restored interface and make failure/recovery states truthful; no redesign or new visual system was introduced.

## Regression and build evidence

Independent review found no blocking findings in these local changes. Counts below overlap; do not sum them as unique tests.

| Check | Result | Evidence |
| --- | --- | --- |
| Full frontend suite | 1,379 tests, 192 files, 8,382 assertions; zero failures | `/private/tmp/matterhorn-frontend-final.HJFrxf/frontend-full.log` |
| App TypeScript | Passed | Same directory, `frontend-typecheck.log` |
| Polymarket / MCP focused server tests | 116 tests, 664 assertions; passed | Focused tool, projection and contract tests |
| Server TypeScript | Passed | Focused backend verification |
| Final platform safety gate | 11/11 stages, 52 offline desk sub-gates; visible 696 Bun + 38 Node tests, 5,500 Bun assertions; exit 0 | `/private/tmp/matterhorn-final-backend-regressions.vGrMGg/platform-safety-final.log` |
| Final Stop/accounting | 147 tests, 1,205 assertions; zero failures | Same directory, `stop-accounting-final.log` |
| Production frontend build | Passed; existing large-chunk warning remains | Local candidate manifest `post1036-build.json` in preview harness |
| Whitespace / diff validation | `git diff --check` passed | Local checkout |

Toolchain: Node 24.20.0, Bun 1.3.11, pnpm 10.27.0. Runs used `env -i`, fresh temporary application/data/token/cache directories, and a Bun wrapper enforcing `--no-env-file` for nested invocations. Loopback was permitted for local fixtures; production provider credentials were not loaded. The commands below identify the suites, not a complete reproduction of that isolation setup:

```sh
pnpm test:matterhorn-platform-safety
bun --no-env-file test apps/server/src/session-read-model.e2e.test.ts apps/server/src/model-usage-store.test.ts --timeout 15000
```

Exact safety stages are in `/private/tmp/matterhorn-final-backend-regressions.vGrMGg/gate-plan.json`. These are local synthetic/fixture checks, not hosted acceptance or proof of every provider/integration.

## Browser and preservation evidence

- Authenticated reload succeeded on the final candidate; no captured browser console errors/warnings.
- Checked 390×844 mobile, 768×1024 tablet and 1280×720 desktop: no horizontal page overflow; mobile navigation exposes all five desks and profile/account, wallet, memory, notes and tools.
- Checked Light and System/dark appearance, then restored original System preference; temporary viewport overrides reset.
- Keyboard input replacement and visible focus worked; model picker closes with Escape. Draft survived model changes, retry, reload and navigation. Sui's explicit preservation-test draft remains unsent.
- Original eight chats and pre-existing row hashes were unchanged. Final preview has thirteen chats: eight original plus five QA conversations.
- Restart integrity comparison passed for all 35 checked tables and 43 saved files (only engine project access timestamp normalized). Five unresolved usage holds preserved.
- Owner-only stopped-state complete snapshot, including SQLite WAL/SHM: `/private/tmp/matterhorn-cudos-restored-4ZgYPr/backup-pre-post1036-polymarket-fix/stopped-state-complete.tar.gz`, SHA256 `5da52bb93d770cadfe19e591546f9cb91f7eefd5568250c690ba02340cc32284`. Contains private local state; do not publish. This is not verified encryption or production backup/restore evidence.

Screenshots:

- [Completed live Hyperliquid response on final preview](hyperliquid-final-preview.jpg)
- [Bittensor early-Stop recovery after final restart](bittensor-retry-fixed-final.jpg)
- [Mobile controls](sui-mobile-390.jpg)
- [Light theme](sui-light-1280.jpg)

Safari, Firefox, physical-device keyboards and 200% zoom are unverified this run. Jev remains unavailable/off; STM off. No new claim about their live execution is made. Hosted site, signup/email, recovery, encryption, external integrations and signing flows were not exercised by this scoped chat test.

## Exact blocker and next actions

At 18:33 UTC:

- Daily: **95,891 used + 50,000 held = 145,891 / 150,000**; **4,109** available.
- Monthly: **180,559 used + 50,000 held = 230,559 / 300,000**; **69,441** available.
- Five stopped streams omitted final token totals, so five 10,000-token reservations remain pending reconciliation as the user requested. They are not five active runs. All sessions were idle before restart.
- Each further request needs its normal 10,000-token reservation. Do not reset usage, clear holds, bypass enforcement, shrink reservations artificially or create another account to evade the limit.
- User approved daily 150,000 / monthly 300,000. A request for daily **180,000 only** is pending; it has **not** been applied. Daily window resets at **2026-10-16 00:00 UTC** (05:30 India time).

After explicit cap approval, or after the daily window resets:

1. Complete Bittensor's stopped-row Retry in QA session `ses_ebf3e4feeffeqOecoqMfoG595g`; verify real testnet receipt, completed answer, no duplicate dispatch and accounting settlement for the new request without releasing the old unknown hold.
2. In Sui QA session `ses_ebf394ae0ffeaDXR7819LOytzO`, preserve its unsent draft before replacing it intentionally. Ask the supported balance tool for a public synthetic address such as `0x1` on **testnet**, read-only. Require returned source/network/time/limitations; no transaction preparation or signing. Do not claim a zero balance until the actual RPC result confirms it.
3. Retry Polymarket QA session `ses_ebf3993c6ffecrN08RtW3P2M68` on the final code. Require one active market with complete returned probabilities and provenance; disclose freshness/omissions. Confirm the result survives bounded MCP projection.
4. Re-read all three final tool receipts and allowance ledger; capture browser evidence. Keep raw authenticated evidence private. Update this matrix only from actual results.
5. Review/package the local patch separately if requested. No deployment, merge or push was performed by this QA task.

The local preview remains running with existing authentication/data. Production is unchanged. Public-beta readiness cannot be inferred from this partial local chat matrix.
