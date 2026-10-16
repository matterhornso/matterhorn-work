# Public beta candidate completion

User requested completion of local release work and a handoff, retaining deployment ownership. Work is on `codex/post1036-five-desk-qa-2026-10-15`, based on merged #1036 `c5f326b2a38ecc49817adcce5922ba5ad95991eb`. No deployment, merge, production configuration, wallet action or new external connection is authorized by this task.

## Plan

1. Preserve the existing local preview and refresh it with the combined chat fixes and built-in guidance.
2. Close Bittensor Retry, Sui balance and Polymarket discovery acceptance; replay the remaining desks with the new guidance and check model selection, Stop/Retry and responsive controls.
3. Fix bounded reproducible defects, obtain independent review, and run clean regressions, typechecks, builds, safety and security checks.
4. Publish a reviewable candidate PR with exact-head CI, including API and web container checks. Do not merge or deploy.
5. Deliver exact release identity, evidence, deployment/rollback instructions and remaining hosted operator gates.

## Verified local progress

- At 14:58 UTC, the daily allowance had reset: 100,000 available daily and 69,441 monthly. Limits remain the approved 150,000 daily / 300,000 monthly. Five historical unknown-usage reservations totaling 50,000 remain intact.
- All 13 chats were idle before refresh. A direct encrypted AES-256-GCM application-state snapshot was created without copying standalone provider/operator secret files. The owner-only recovery key remains local; this is not production backup certification. An unencrypted credential-containing backup proposal was blocked and was not executed.
- Initial combined candidate source digest: `9d15bc0075e34979a447354e1c2d71c4a4a91b6b23c1bbbbf2491f582d6af2f7`, covering tracked and nonignored untracked app/server source. Isolated production-format web build passed. After refresh all 35 database tables matched, and 35/43 saved files matched; only eight release-owned `.opencode/agents` templates changed for guidance. Original account/chat/message/part row hashes were preserved.
- Bittensor Retry completed through the normal authenticated app: ASI1, testnet subnet 27, SDK block 8,235,057, metagraph block 8,235,058, observed 15:02:22 UTC; complete bounded tool result and final answer, 8,490 reported tokens. History contains one replacement user turn; previous unknown holds retained.
- Polymarket Retry completed after discovery correction: active Bitcoin market 701502, complete Yes/No prices 0.044/0.956, source Gamma public search, observed 15:03:51 UTC; bounded tool output 1,543 characters, 10,019 reported tokens. The answer disclosed omission and non-executable-price limitations. No orders.
- Sui supported balance read completed: public synthetic address `0x0000000000000000000000000000000000000000000000000000000000000001`, testnet, 90,579,153,635 MIST from `sui.grpc`, observed 15:05:03 UTC; 6,754 reported tokens. Prior unsent draft was restored. Unsupported checkpoint/object/history requests are not claimed as working.
- Hyperliquid Retry completed with real BTC orderbook and funding receipts, 9,588 reported tokens. Exact public receipt evidence retained locally.
- Independent review found a same-name custom-skill regression: a valid `.claude/skills` copy was listed editable but could not save locally. Fixed with regressions preserving the source file, virtual built-in immutability and symlink/traversal boundaries.
- Sui public-beta UI copy overstated available chat reads. Narrowed it to public balances and saved results, with unavailable object/checkpoint/history reads explained. Existing reviewed-action surface remains unchanged. Focused surface tests: 4 passed / 54 assertions.
- Added non-publishing exact-head production web-container CI build/smoke alongside the existing API job. Local Docker is unavailable. Smoke checks the compiled SHA/restored auth shell and intentional fail-closed health without an upstream, not hosted readiness.

## Hosted read-only findings

At 12:38 UTC the canonical site responded and launch health/config flags reported ready with signup open, verification required and reset available. Web marker `ff0fee42b375e3dc58cbc73918d0093fa2eded40` is 28 commits behind #1036; API marker `0d209fb4d3ab0d4beb62610b801f455aed09e398` is 30 behind. GitHub ancestry confirms neither contains #1036. Configuration flags do not establish actual inbox delivery, isolation or an encrypted restore drill.

## Final local completion

- Private AI completed visible-stream Stop then Retry with GPT OSS 20B, 11,215 reported tokens; partial response and unsent draft retained. Its unreported stopped-stream usage created the sixth protected 10,000-token hold. No extra cap increase was applied.
- Final mobile inspection caught clipped three-digit ordered-list markers. Corrected the marker gutter without changing layout, with native-list regression coverage and independent review. Confirmation captures show complete markers; 390px, 768px and 1280px layouts have no page overflow.
- Final built source digest `b4a9a8b70bcb393c90f15f04e7acf7adca7d3ee247683baa5239b9c991debb72`; final restart retained all35 tables and existing bytes in all44 files. Viewing Sui appended one legitimate QA workflow completion event; original file prefix verified unchanged. Original account/chat/message/part row hashes still match.
- Final clean frontend 1,384 tests / 8,408 assertions; backend 377 / 3,124; full safety 11/11 stages and52 offline desk sub-gates; both typechecks, source secret scan and gate/scanner contracts passed. Final code-manifest SHA256 `74075e821b2698698f4b1021c8f4f088e1823a4aea2330c7df95fe916de8a71b`. Full detail in RESULTS.md; counts overlap.

## Publication and handoff

Local implementation and acceptance complete for the scoped read-only beta candidate. Published implementation `392a426ebbadbed499c473f637578e3e8dd7c4da` as [PR #1037](https://github.com/matterhornso/matterhorn-work/pull/1037); the handoff-only follow-up records these identities. [Final-head checks](https://github.com/matterhornso/matterhorn-work/pull/1037/checks), including real API/web image jobs, must pass before review/merge. No merge/deployment performed. Operator-only hosted identity, policy, email/reset, isolation, approval handling and encrypted application restore gates are in `docs/handoffs/public-beta-release-2026-10-16.md`.
