# Public beta candidate verification

The five core desks completed real responses through the authenticated local app with the new built-in guidance on 16 October 2026. Local release checks pass; production deployment and ordinary hosted acceptance remain operator gates. This report supersedes the earlier budget-blocked results in `qa-reports/post1036-five-desks/2026-10-15` and the pre-refresh limits in `qa-reports/desk-skills/2026-10-16`.

## Scope and source

- Branch: `codex/post1036-five-desk-qa-2026-10-15`, based on merged #1036 `c5f326b2a38ecc49817adcce5922ba5ad95991eb`.
- Final preview source digest: `b4a9a8b70bcb393c90f15f04e7acf7adca7d3ee247683baa5239b9c991debb72`, hashing tracked and nonignored untracked app/server source paths and bytes. The local display marker appends `-candidate-b4a9a8b70bcb` to the baseline; it is not a Git commit SHA.
- Local live requests used source digest `9d15bc0075e34979a447354e1c2d71c4a4a91b6b23c1bbbbf2491f582d6af2f7`, containing the final managed-agent guidance and chat/tool execution changes. Subsequent changes corrected custom skill editing, Sui capability copy and numbered-list gutters, plus regressions/CI. No agent prompt, provider dispatch or accounting code changed after these live requests. Final browser reload and regression checks cover those subsequent changes; the requests were not rerun merely to relabel evidence.
- Only public synthetic prompts and public read-only tools were used. No private files/memories, new connector access, transactions, wallet signing, production mutations or deployment.

## Real local app acceptance

| Desk | Completed result | Recovery and evidence |
| --- | --- | --- |
| Private AI | GPT OSS 20B completed a 300-item synthetic educational response; 11,215 reported tokens | Observed live partial text, pressed Stop, retained partial response and an unknown-usage hold, then Retry completed. Unsent draft survived Retry, model selection and reload. [Completed](private-ai-completed.jpg), [stopped](private-ai-stopped.jpg). |
| Bittensor | ASI1 called the Python SDK on testnet subnet 27; block 8,235,057 / metagraph 8,235,058, observed 15:02:22 UTC; 8,490 tokens | Successful Retry of the earlier stopped row, one replacement user turn, no duplicate dispatch. Source/network/truncated-validator limitation present. [Result](bittensor-retry.jpg). |
| Hyperliquid | ASI1 returned BTC orderbook and funding from `hyperliquid.info`, observed 15:07:35 UTC; 9,588 tokens | Successful Retry with source/freshness/read-only limitations; no account/order operations. [Result](hyperliquid-live.jpg). |
| Polymarket | ASI1 found active market 701502; complete Yes/No prices 0.044/0.956, Gamma public search at 15:03:51 UTC; 10,019 tokens | Fixed active-market discovery and bounded output projection produced a useful answer through the app. Omission and non-executable-price limitations retained. [Live read](polymarket-live.jpg). |
| Sui | ASI1 balance read for public synthetic address `0x1` on testnet; 90,579,153,635 MIST, `sui.grpc`, observed 15:05:03 UTC; 6,754 tokens | Supported live read completed and prior unsent draft restored. [Receipt before final capability-copy correction](sui-live.jpg). Object/checkpoint/history reads are unavailable, not certified by this balance test. |

Early Stop and safe Retry were exercised in all five QA sessions across the two linked QA reports; this run closed Bittensor's previously blocked Retry and repeated Private AI streaming cancellation. Model search, no-result recovery, chat-compatible filtering, workspace persistence and draft preservation passed. ASI1 and GPT OSS 20B are the exercised models; this is not certification of every model in the catalog, ASI1 Mini throttling, Jev, optional connectors, mainnet Bittensor or wallet execution.

## Included corrections

1. Unknown stopped-stream usage displays **Tokens unavailable**, not a false zero. Existing reservations remain enforced until authoritative reconciliation.
2. Empty stopped/failed assistant responses offer safe Retry through the existing guarded path; inactive Copy/Save/rating actions are absent.
3. Polymarket search excludes closed markets and retains complete bounded price/provenance fields instead of truncating useful market data.
4. Seven original, immutable built-in guidance documents are preloaded virtually. Managed desks receive common safety guidance plus their applicable workflow. Thirteen connector recommendations distinguish existing adapters, optional setup and future work; no optional connection is silently installed or authorized.
5. Same-name `.claude/skills` custom guidance can save a workspace-local copy without overwriting its external source or the canonical built-in. Import/export, symlink/traversal and authenticated isolation regressions protect the boundary.
6. Sui beta copy states its supported public balance scope. Long numbered lists reserve enough gutter width for full markers on narrow screens, preserving native ordered-list semantics and start values.
7. New web-container CI builds the candidate and checks its compiled marker/auth shell with no publishing, external network or production secrets. Its no-upstream readiness response must fail closed; this is not hosted acceptance.

## Verification

Final full checks were repeated after the mobile list-gutter correction and finished at 15:20:20 UTC. Counts overlap and must not be added as unique tests. The final code-manifest SHA256 is `74075e821b2698698f4b1021c8f4f088e1823a4aea2330c7df95fe916de8a71b` across 2,039 non-document source/configuration files; original and disposable-copy hashes remained equal and stable.

| Check | Final passing result |
| --- | --- |
| Full frontend | 1,384 tests, 8,408 assertions, 193 files |
| Combined backend | 377 tests, 3,124 assertions, 14 files |
| Full platform safety | 11/11 stages, 52 offline desk sub-gates; 696 visible Bun tests / 5,500 assertions plus 38 Node tests |
| App and server typechecks | Passed |
| Strict release-source secret scan | 1,238 files; zero findings or oversized skips |
| Secret scanner / gate wiring / container contracts | Passed |
| Production-format web build | Final list-gutter candidate passed at 15:17:34 UTC; existing chunk/circular annotation warnings remain |
| Independent review | No remaining blocker in chat recovery, guidance boundaries, Polymarket projection, Sui copy, container job or list-gutter correction |

Commands: `bun --no-env-file test apps/app/tests`; focused combined backend tests for built-in catalog/routes/content, import/init, skills, MCP, privacy, auth, session read model, budgets, usage and Polymarket; `pnpm test:matterhorn-platform-safety`; app/server TypeScript; strict `scripts/release-secret-scan.mjs`; scanner/gate/container contract tests. Toolchain: Node 24.20.0, Bun 1.3.11, pnpm 10.27.0. Final detailed local logs and exact commands are in `/private/tmp/matterhorn-release-regressions.CopyRD/RESULTS.md`.

Regressions ran in a disposable copy with clean environment and isolated data; no provider credentials inherited. Its synthetic Git metadata exists only for an offline smoke metadata contract and is not release identity. Initial harness failures from missing built SDK, restricted loopback and conflicting test-directory overrides were corrected, then the full suites repeated without skipping or weakening tests. No local Docker daemon is available; actual API/web image checks must pass in PR CI.

## Data preservation and accounting

All 13 chats were idle before each graceful restart. Final refresh preserved all 35 checked tables across four SQLite databases and all existing bytes in 44 checked saved/configuration files; only the engine project-access timestamp is normalized. Subsequent viewing appended one 233-byte `workflow.completed` event to a QA task log; its complete original prefix matched the baseline hash. Original account/chat/message/part hashes remained unchanged. Earlier initial guidance activation changed only eight release-owned agent templates; no original conversation was edited. Five dedicated QA chats account for the added test history.

The final browser pass confirmed no page overflow at 390×844, 768×1024 and 1280×800. Full three-digit list markers, draft, composer, model/settings controls and corrected Sui capability text are visible. Native drawer navigation works and the temporary viewport override was reset. [Final mobile](private-ai-final-mobile.jpg) and [final Sui desktop](sui-final-desktop.jpg) are local authenticated captures. No browser console errors/warnings were recorded after refresh. Earlier light/dark fixture coverage is in the linked historical reports; no wholesale UI redesign was introduced.

An owner-only AES-256-GCM application-state recovery snapshot was streamed directly to encryption, including stopped SQLite state, without a plaintext archive or copies of standalone provider/operator secret files. Recovery material stays private on this machine. This is not proof of production disk encryption, off-host backup durability or an application restore drill.

After the final response, monthly usage was 226,625 plus 60,000 held out of 300,000 (13,375 available); daily usage was 46,066 plus 60,000 held out of 150,000 (43,934 available). Six unresolved 10,000-token holds reflect cancelled streams without authoritative totals, not active runs. No hold, counter or reservation was cleared to obtain a pass. Limits remain the previously approved local QA limits; do not copy them into production.

## Hosted release limits

At the read-only hosted check, `desks.matterhorn.so` responded and advertised ready launch/auth flags, but web marker `ff0fee42b375e3dc58cbc73918d0093fa2eded40` and API marker `0d209fb4d3ab0d4beb62610b801f455aed09e398` were 28/30 commits behind #1036; neither contains it. Health flags do not prove email delivery, recovery, isolation or a successful restore.

Complete the [deployment handoff](../../../docs/handoffs/public-beta-release-2026-10-16.md). Hosted five-desk ordinary-user acceptance, two-account isolation, real email/reset delivery, approved CUDOS disclosure/policy, production backup/restore and operational approval handling remain required. Jev is optional/off, STM off, unsupported models/reads remain honestly labelled, and expired Polymarket preparation policy remains blocked. Safari, Firefox, physical-device keyboards, 200% zoom and a complete screen-reader/contrast audit are not certified by this run.
