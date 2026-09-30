# Runtime reliability and ordinary-user journey — local acceptance

Date: 29 September 2026. Branch: `codex/retro-ui-2026-09-28`. Changes remain local and uncommitted on top of `d941e234843ab0e6c5832bc34e315016e0a1d6f2`; earlier UI work and unrelated handoffs are preserved. No push, merge, deployment, production configuration change, or wallet transaction.

## Outcome

All five desks completed real CUDOS ASI1 responses through the authenticated app with capability enforcement and the authoritative account message gateway enabled. Crypto requests used read-only tools, with issued/allowed capability decisions recorded. No host-token approval helper was used. The disposable runtime uses the supported automatic host-approval configuration; this does not disable transaction review, capability checks, provider-policy checks, or account authentication.

This is **local real-provider acceptance**, not hosted/production acceptance or a blanket claim that every provider/model is available. ASI1 Mini returned repeated provider rate-limit errors; ASI1 responded successfully.

## Repairs and proofs

1. **Sui consent classification:** exact standalone negative wallet-action disclaimers no longer imply transaction intent. Mixed requests containing a positive transfer, wallet-sourced context, explicit transaction mode, secrets, and privacy floors retain conservative handling.
2. **Provider retries:** a real 429 exposed OpenCode retrying its system hook without repeating the message hook. Matterhorn now revalidates the unchanged captured message batch against the original run before issuing a new one-use system authorization. Mutated messages, replaced/cancelled runs and expired authorization still fail closed. Snapshots are process-local, capped by bytes and entry count, deleted on completion, and expire after two minutes; no prompt snapshot is written to disk by this retry mechanism. Runtime behavior was checked against the pinned [OpenCode 1.18.31 source](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/session/prompt.ts).
3. **Receipt settlement:** prior permissive QA omitted the internal runtime credential. The new isolated configuration supplies both server-only credentials and enforcement. Added an off-mode completion regression to distinguish configuration from receipt capability. Real final receipts now settle without a later request cancelling them.
4. **Read budgets:** verified existing 12-read per-run ceiling, rejection of call 13 and replay/reissue denial. Prompt wording such as “once” is not itself an enforceable one-call quota. Each successful crypto request in this run used one read.
5. **Bittensor cold discovery:** bounded eight-second wait for a coalesced refresh, ten-second default backend discovery deadline, explicit configured deadline preserved. Refresh failure retains stale evidence with truthful labels; unavailable/empty payloads are not cached as fresh. Cold service request completed live in 3,697 ms. The first app request truthfully returned stale data after the bounded wait; the ordinary Retry action returned live data without operator warm-up.
6. **Usage presentation:** response-detail totals now include cache read/write tokens, matching the provider totals and usage ledger. No pricing or charging policy changed.

## Real-response evidence

Workspace `ws_web_75097be77343133b`. All rows below have a final success receipt.

| Desk | Session | Final run | Evidence | Total provider tokens including cache |
| --- | --- | --- | --- | ---: |
| Private AI | `ses_f11c9e6f2ffe54c2sBf56OL6H8` | `agent_run_1212b380-1c02-4da7-932c-7213006a9b2a` | Two-sentence real answer; no tools | 6,749 |
| Sui | `ses_f11c79b63ffeZdU0nILkrCkbMa` | `agent_run_905ab675-0554-40c5-8124-c88eb8e48047` | Public `0x5` mainnet balance through `sui.grpc`; no false transaction-consent prompt | 4,130 |
| Hyperliquid | `ses_f11c5f9a0ffeXOm2q1sur1Tiuy` | `agent_run_d2a48c6b-d935-401c-8dbf-645e14bc2a69` | BTC bid/ask from `hyperliquid.info`, live | 7,399 |
| Polymarket | `ses_f11c4fda7ffehEmebuAo5pfEzt` | `agent_run_d1fdd9d2-e7ad-4bdc-b4bd-f4f07cd7fe82` | One active market from market-search tool, with fetch timestamp | 7,817 |
| Bittensor initial | `ses_f11c43965ffe7eoDXRjrb0Zdmi` | `agent_run_87d6b77d-e27b-4031-9b40-8d6173ae9695` | Explicitly stale result, not counted as live acceptance | 6,689 |
| Bittensor retry | same | `agent_run_143f758a-9799-49d3-ba18-545db543dcd5` | SDK block **9,175,070**, fetched **2026-09-29 17:36:39 UTC**, live | 6,764 |

The rate-limited ASI1 Mini run `agent_run_6f35e2e7-b076-407b-b32b-a010b04fbf22` was stopped through the UI and has a cancelled receipt with zero usage. The ledger has seven settled operations totaling **39,548 raw tokens = 39,548 charged tokens**, and **zero pending holds**. A cancelled zero-token attempt is settled in the usage ledger, separately from its cancelled execution receipt. No submit capabilities or transaction receipts were generated.

Receipt metadata for Sui/Polymarket/Bittensor does not consistently copy the tool body's freshness into its top-level tool receipt field; live/stale assertions above use the actual tool response, not an invented receipt value.

## User journey and failure paths

- Normal sign-in, persisted model selection, immediate five-desk launcher and one-action desk entry passed.
- Real provider rate-limit retry passed context validation; Stop returned the composer to usable state and finalized the cancelled receipt.
- Model change preserved an unsent draft. Desktop/mobile desk navigation and browser Back preserved the draft.
- Expired only the sessions belonging to the new disposable `demo@matterhorn.test` account in its isolated auth DB. Reload required normal sign-in; sign-in restored the same chat and draft. Original accounts/cookies were untouched.
- Actual authenticated viewport measured **390 × 844** with document scroll width 390, and **1280 × 900** with scroll width 1280. Mobile drawer, recent-chat navigation, model search, selection label, search focus, Escape dismissal, and composer verified. Wide result tables scroll inside their container, not the page.
- Saved screenshots: `mobile-model-picker.png`, `mobile-bittensor-response.png`, `desktop-bittensor-response.png`.
- Cleared only the synthetic QA draft after testing; left all test responses accessible. Restored browser viewport override.

## Automated verification

- 258 focused server tests / 1,490 assertions passed (privacy, capability, guarded runtime, receipts, plugin, Bittensor).
- Final guarded-runtime/plugin rerun: 59 tests / 227 assertions passed after retry-cache cleanup hardening.
- Usage store: 27 tests / 145 assertions passed, including idempotent mixed-operation settlement, tool loops, cancellation ownership and restart.
- Account/auth integration: 30 tests / 596 assertions passed, including isolation, session revocation, recovery fixtures and hosted boundary checks.
- Full sidecar suite passed: HTTP contract, secret rejection, process lifecycle/bounds, new cache regressions, missing SDK, Python compatibility.
- Frontend: **1,241 passed**, 7,815 assertions. Initial sandbox run had two loopback HTTP test failures; rerun with loopback permitted passed completely.
- Composer browser fixture: 8 passed, 2 optional capture/navigation scenarios skipped by the harness configuration. Fixture evidence is not a live-provider browser test.
- Full Matterhorn platform safety gate passed.
- Server/app typecheck passed. Final frontend build status recorded in the worklog.

## Remaining release actions / limits

1. Review and publish the local patch; no PR/merge/deployment is implied by this report.
2. Operator must verify production account-message-gateway configuration, internal runtime credential delivery to the managed OpenCode child, capability signing credential, supported approval policy and durable single-instance topology. Use the secret manager; never paste credentials into chat or Git. Local test configuration is not a production environment template.
3. Resolve/monitor ASI1 Mini provider throttling or choose a verified available model for launch. Do not silently substitute a user's selected model.
4. Deploy matching app/server/guard plugin and the updated sidecar together, then repeat these ordinary-account requests on the hosted release. Verify exact release SHA, receipts, token ledger, signup/email/recovery and backup gates separately.
5. Chain-service latency can still exceed the bounded discovery wait. The app truthfully labels stale results and Retry works; it cannot promise upstream availability.
6. No real wallet signing, production auth-email delivery, backup restore, screen-reader certification, authenticated Safari/Firefox session, or new 200% zoom/light-theme pass was performed in this work block. Prior fixture reports must not be relabelled as this live acceptance.

## Local continuation

Preview: `http://[::1]:63719/workspace/ws_web_75097be77343133b/session/ses_f11c43965ffe7eoDXRjrb0Zdmi` (signed in in the Codex test tab).

Disposable data: `/private/tmp/matterhorn-account-demo-6GpBOx`. Private test credentials and diagnostics are mode-0600 files outside the repository; do not attach them. Launcher session 11324; separate SDK sidecar session 58641 on 9878. Original previews on 58437 and 60894 and sidecars 9876/9877 were preserved.
