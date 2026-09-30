# Runtime reliability and ordinary-user acceptance

User authorized implementation of steps 1–2 on 29 September 2026. Keep the original preview/chats and the prior isolated QA account intact; do not deploy or change production configuration. Preserve existing uncommitted UI work.

## Delivery plan

1. Trace and reproduce completion receipts, budget enforcement, Bittensor cold-cache and Sui consent classification defects. Add focused regressions before changing behavior.
2. Fix the smallest responsible layer. Preserve consent, exact run/parent binding, account isolation, capability enforcement and wallet approval. Never treat a successful model response as proof of settled accounting or a transaction.
3. Start a separately configured local acceptance runtime with the existing provider and enforced runtime controls. Identify the supported normal-user approval configuration rather than bypassing approvals. Keep credentials private and all chain calls read-only.
4. Through the app, select a persisted model and request a real response on all five desks. Verify final receipt, usage settlement, safe cancellation/retry, session expiry and draft retention. Bound live prompts and record provider consumption.
5. Inspect authenticated narrow/desktop layouts and keyboard behavior. Distinguish browser/fixture/local/hosted evidence. Run regressions, typecheck and relevant safety checks; document exact remaining release gates.

## Initial findings

- The previous QA launcher explicitly used manual host approvals and disabled guarded runtime. This is not a normal hosted-user acceptance configuration.
- Privacy transaction detection uses a broad cross-clause verb/object expression; a read-only request containing a negative instruction can be misclassified.
- Sidecar subnet reads return immediately with empty/stale data while a Python refresh runs; backend retries no longer cache that fallback but first-use recovery still needs attention.
- Serena's configured project has no active language server; semantic inspection was unavailable. Proceeding with targeted repository reads, without changing tool configuration.

## Status

## Implemented and reproduced

- Privacy: reproduced Sui read-only disclaimer being classified as transaction intent, then fixed only exact standalone negative clauses. Mixed positive requests, explicit transaction mode, wallet context and secret checks remain protected. Privacy suite: 21 passed.
- Added proof of the existing 12-read hard capability ceiling and replay rejection; this is distinct from a model obeying a one-call prompt.
- Confirmed receipt completion is supported even with capability mode off when the internal runtime credential is configured. Previous QA launcher omitted it. Added off-mode completion regression.
- New acceptance runtime enables guarded enforcement and the account message gateway, uses supported automatic host approval for this disposable local instance, and keeps wallet/consent boundaries. IPv4 alias 127.0.0.2 was unavailable on this host; IPv6 loopback isolates cookies from both original previews instead. No network configuration changed.
- Real enforced ASI1 Mini request uncovered a second defect: first provider attempt returned 429, OpenCode 1.18.31 retried LLM.stream without rerunning the message hook, and the consumed one-use system authorization was rejected. Fixed by revalidating bounded, ephemeral unchanged message snapshots against the same run before retries. Changed messages/run and expired snapshots fail closed. No relaxation of one-use system authorization.
- Sidecar cold discovery now waits at most 8 seconds for its coalesced refresh; backend discovery deadline is 10 seconds (explicit operator limit still wins). Failed refresh retains truthfully stale data; unavailable payloads cannot poison fresh cache. Dedicated cold/coalescing/deadline/stale/failure/recovery tests pass.
- Isolated new Python sidecar (9878) cold live request returned HTTP 200 in 3,697 ms, block 9,175,040, freshness live, source bittensor-python-sdk, three requested subnets, no warnings. This is service evidence, not yet app Bittensor acceptance.

## Test/runtime evidence so far

- 258 focused server tests passed (privacy, capabilities, guarded runtime, receipts, plugin, Bittensor; 1,490 assertions).
- 27 model-usage-store tests passed (145 assertions), including mixed-operation settlement, tool loops, replay, cancellation ownership and restart.
- Full sidecar suite passed (HTTP/security/process/cache/unavailable SDK/Python compatibility).
- Server typecheck passed.
- Original preview and previous localhost QA runtime untouched. Superseded newly created test instance shut down; no data deleted.
- Current isolated frontend: `http://[::1]:63719`; data directory `/private/tmp/matterhorn-account-demo-6GpBOx`; launcher session 11324; sidecar session 58641. Credentials remain in mode-0600 test files outside Git.
- Ordinary UI model selection persisted and returned to all five desks. ASI1 Mini repeatedly rate-limited; Stop ended the request and produced a cancelled receipt. Changing to ASI1 preserved the draft.
- Private AI ASI1 completed through the app with no operator action: session `ses_f11c9e6f2ffe54c2sBf56OL6H8`, success receipt `agent_run_1212b380-1c02-4da7-932c-7213006a9b2a`, 6,652 input + 97 output = 6,749 tokens.
- Sui real read submitted with the formerly false-positive disclaimer; no transaction-consent modal appeared. Result pending inspection.

## Completion

Completed the local runtime and ordinary-user acceptance block. Full evidence, exact run/session IDs, tests, operator actions and limitations: `runtime-acceptance/RESULTS.md`.

- All five desks completed real ASI1 responses with enforcement and account gateway enabled; each crypto request had an issued and consumed read capability. Bittensor first returned stale data truthfully, then the app Retry recovered to live block 9,175,070 (17:36:39 UTC) without an operator warm-up.
- Seven settled ledger operations: 39,548 raw and charged tokens, zero pending holds. Six success receipts plus one cancelled rate-limited attempt. Cache usage display corrected to match ledger totals.
- Actual 390px authenticated mobile and 1280px desktop verified, without page overflow. Model search/focus/Escape, navigation/browser Back and draft preservation passed. Expired only the new disposable account's sessions; sign-in restored the same chat and draft. Removed only the synthetic unsent QA draft; screenshots saved under `runtime-acceptance/`.
- Final frontend: 1,241 passed. Auth integration: 30 passed. Composer browser: 8 passed / 2 optional scenarios skipped. Full platform safety gate passed. Final guarded runtime/plugin rerun: 59 passed. App/server typecheck passed. Frontend build passed with existing chunk-size warnings.
- No production changes or hosted claim. ASI1 Mini provider throttling remains external; SDK latency can still produce stale results within the bounded wait. Matching deployment and hosted acceptance are the next release gate.
- Original and previous isolated preview processes verified intact at handoff. Local acceptance preview remains signed in. No new commit/PR/merge/deployment.
