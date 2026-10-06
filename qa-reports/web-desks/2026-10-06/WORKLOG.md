# Web desk acceptance progress

## Scope and environment

Verify the five web desks through normal-account browser chat, actual configured CUDOS ASI1 responses, and public read tools. Review shared Notes, Memory, model selection, account isolation, cancellation and integration states. Wallet signing, trades, real funds, external OAuth and production configuration are outside this run. Jev and STM remain off. Local email verification uses a console fixture, not a real inbox.

Implementation checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-model-workspace-usability-2026-10-06`, branch `codex/model-workspace-usability-2026-10-06`, base `a5dba9649975f33e6eda614cdf88a81767e20a66`. Earlier model/workspace fixes in this dirty branch are preserved. No push, merge or deployment.

The original user preview was not restarted, navigated or overwritten. Earlier model QA data and processes were also preserved; source-linked QA previews may receive normal hot-module updates. This run uses its own `desks-qa.localhost` origin and disposable data roots. Generated credentials and operator tokens stay in owner-only temporary files outside the repository. Normal-account requests never use operator credentials; exact host approvals are manually reviewed and bound to the displayed public prompt/session.

## Verified results before final candidate

- Hosted public probes: canonical `https://desks.matterhorn.so/` returns 200; auth config reports signup open, verification required, recovery and email infrastructure ready; launch/ready health return ready. These signals do not verify hosted inference, inbox delivery, backups or deployment revision.
- First local normal chat reproduced `Guarded runtime workspace not found` after manual approval. `/var` and `/private/var` aliases were compared inconsistently at the guarded callback boundary. Fixed by applying the same canonicalizer in both directions. Regression failed before the fix and passed afterward; 944 runtime tests passed with exact secret/workspace/session negative checks.
- Fresh fixed runtime `matterhorn-pr1032-functional-BXkBXi`, frontend `http://desks-qa.localhost:60573`, backend `http://127.0.0.1:60572`, PID 14698: normal signup/verification/sign-in and ASI1 selection succeeded.
- Private AI: real public-only response completed; 6,852 tokens, no stuck hold.
- Hyperliquid: real model used orderbook and funding tools; live exchange source and timestamps shown. 8,388 tokens; cumulative usage matched 15,240.
- Polymarket: actual chat exposed oversized discovery results even for limits 10 and 5. Model responded honestly without invented records. Fixed bounded model-facing market projection in source without increasing the 2,000-character read cap; real browser rerun pending.
- Sui: real balance tool returned public testnet data from `sui.grpc`; 6,070 tokens for that turn. Earlier object request completed with an honest unsupported-capability explanation (3,000 tokens), not an object-read pass. A bounded object-read implementation is in progress to match existing UI claims.
- Completed inference total for this runtime: 36,376 tokens, pending requests 0, reserved tokens 0. Failed research still incurred inference cost; it is not counted as functional acceptance.
- Stop before operator approval: idle session with no messages, tools or run receipts, unchanged usage and no holds; draft retained.
- Notes: browser create/edit/back/reload persisted the synthetic note. Memory: explicit confirmation saved a synthetic preference and search found it. Workspace policy promoted public selection to private and blocked export/MCP sharing; this is conservative policy, not encryption evidence.
- Two-account live local isolation: 19 observations passed, including 10 cross-account 404s. See `account-isolation-results.json`.
- Integration catalog correctly states additional connections are not enabled. External AI access is not open. No external connector was authorized.
- Browser logout returned to sign-in; Back did not reveal the previous authenticated page.
- Independent review found no authorization/data-flow regression in runtime canonicalization, privacy/error copy or Polymarket projection. Full frontend plus MCP suite: 1,598 passed; app/server typechecks passed. See `shared-regression-results.md` for earlier build and shared-fixture evidence; overlapping counts must not be added.

## Fixes and limitations

The composer now distinguishes unverified provider terms from an unconditional sending block: public-only account research still goes through authoritative privacy checks, while private context needs review. Legacy and unverified Venice paths retain block messages. Keyword classification remains conservative; phrasing such as “do not place a bet and do not access a wallet” can request unnecessary consent. The consent text now states uncertainty. No consent was bypassed to get a green result.

Polymarket research is separate from execution: the current compliance check reports jurisdiction blocked. No workaround or order was attempted. Crypto writes remain release-gated off. A model response, a tool status of completed, an HTTP 200, or a wallet-support badge is not sufficient proof of requested work succeeding.

## Next task

Fresh candidate `matterhorn-pr1032-functional-oQ384K` at `http://desks-qa.localhost:51585` uses the bounded Polymarket and Sui object implementations. Normal browser login and ASI1 selection passed. Polymarket now returned three real Bitcoin markets with exact IDs, odds, source and fetched time: 8,572 tokens, completed receipt, zero pending requests/holds. See `polymarket-fixed-chat-receipt.json` and screenshot.

Bittensor's real browser request exposed a separate contract defect: `readOperation: subnet` without `netuid` was interpreted only as a singular lookup, rejected before reaching the healthy sidecar. Fixed omitted-ID semantics to a bounded list; explicitly malformed IDs remain rejected and validators still require an ID. Exact MCP-to-backend reproduction and negative cases passed (64 tests); schema remains below the unchanged 11,000-character ceiling. The running candidate still needs this backend change loaded before reacceptance.

Sui object 0x2 testnet successfully invoked the new read tool and returned metadata from `sui.grpc`. ASI1 truncated its prose twice at the repeated-zero object-ID prefix, including a safe tools-disabled continuation. Both partial receipts are retained, correctly marked partial rather than complete; total 7,021 tokens, one tool call only, no holds. Investigating the provider finish reason and presentation before a final browser retry.

The full safety gate passed stages 1–10 and initially failed three final-stage assertions after adding Sui object reads. Fixed exact permission inventories without broadening other access and reduced redundant schema prose without raising the budget. Independent full `desk.depth,product.readiness` rerun passed, including all downstream checks. Initial failure evidence remains alongside the successful rerun. Final Bittensor-change regression/review is pending.

Final candidate `matterhorn-pr1032-functional-3fKlOL`, browser `http://desks-qa.localhost:54727`, backend port 54726, PID 29160: normal signup/console verification/sign-in, persisted ASI1 selection, Bittensor and Sui browser requests passed. Bittensor returned live SDK subnet 0/1/2 at block 9,220,062 in 6,792 tokens; Sui returned object-0x2 metadata from live testnet grpc in 4,858 tokens without truncation. Total 11,650 tokens exactly matches receipts, zero pending requests/holds. No browser error logs. Final logged-in tab is retained as a deliverable. Sidecar remains loopback-only at `http://127.0.0.1:60914`, PID 14803, root `/private/tmp/matterhorn-bittensor-qa.XPfoE0`; pinned Python SDK 10.5.0. Submit remains disabled. The intermediate oQ384K runtime and unused ohnoLN candidate were stopped; all files/chat evidence retained. Original previews remain running.

Sui truncation investigation found no demonstrated local low-output cap. A short-ID controlled summary completed, but model prose also confused the tool's canSubmit flag with an object restriction. Final Sui-only projection losslessly shortens validated public IDs and removes tool capability flags from object facts, preserving backend/API records, exact digest/version/source and raw secret scans. Independent affected safety set passed 176 tests / 1,106 assertions and server typecheck. Final preceding full frontend/MCP/BT suite passed 1,623 tests / 9,566 assertions, both typechecks, offline Bittensor gate 16/16 and isolated web build + 7 noindex guides. Counts overlap. Initial failure evidence is retained.

Answer-quality caveats remain: Bittensor's “snapshot artifact” explanation of emission=0 is unsupported; independent same-block SDK reads prove real zero in that specific field, while separate emission fields are nonzero. Sui's extra “shared” phrasing is not its actual immutable owner kind. Report source metadata as authoritative; do not call the model's prose universally accurate.

Next action is release review and authorized hosted acceptance, not another unchanged local probe. See RESULTS.md for exact coverage and owner actions. No push, merge, deployment or secrets changes were performed.

Remaining external acceptance: candidate deployment at canonical domain; hosted normal-account responses on all desks; real email/recovery; actual encrypted backup restore evidence; authorized connector and wallet acceptance where the release enables them; live Jev if enabled; additional models, responsive/accessibility and cross-browser acceptance. Do not describe this run as exhaustive or production launch approval.
