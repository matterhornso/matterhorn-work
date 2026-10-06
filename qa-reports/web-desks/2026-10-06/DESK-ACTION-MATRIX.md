# Five-desk action inventory — 6 October 2026

Scope: current source and isolated local QA, not a hosted release certification. This inventories all 48 crypto starter actions plus the Private AI actions. A visible label, HTTP 200, capability flag or completed model answer is not proof of every action. No wallet connection, signing, submission, paid-resource purchase or private-context model request was performed by this audit.

## Evidence key

- **R-UI**: actual normal-account browser chat returned public evidence; details and receipts in [RESULTS.md](RESULTS.md).
- **R-API**: actual public upstream read through the authenticated local API. This is not browser/model acceptance.
- **F**: implemented and covered by existing source/fixture tests, but this specific action was not established live. Plain-language planning/explanation is not a saved workflow.
- **G**: existing capability requires configuration, reviewed-action feature access, explicit terms or separate wallet approval; not exercised here.
- **M**: the claimed operation has no managed chat tool or direct starter implementation. An API/CLI or a separately gated panel may exist; do not infer that chat performed it.

Relevant runtime for the additional cross-venue probe: `desks-qa.localhost:54727`, isolated root ending `3fKlOL`; no runtime restart by this audit. The new cross-venue backend projection requires a fresh backend process before browser validation. Parent-run browser evidence elsewhere in this folder identifies exact older candidate runtimes.

## What clicking an action actually does

1. [`desk-task-starters.ts`](../../../apps/app/src/react-app/domains/session/workflows/desk-task-starters.ts) defines the labels, prompts and reviewed-action tags. [`desk-task-inputs.ts`](../../../apps/app/src/react-app/domains/session/workflows/desk-task-inputs.ts) turns missing public inputs into clarification prompts.
2. `ProtocolDeskEmptyState.handleTaskAction` in [`session-page.tsx`](../../../apps/app/src/react-app/domains/session/chat/session-page.tsx) calls `startTask`; `onUsePrompt` delegates to `sidebar.onCreateTaskWithPrompt`. The handler in [`session-route.tsx`](../../../apps/app/src/react-app/shell/session-route.tsx) creates/navigates to a chat with an editable draft. It does **not** execute a watch-create or receipt-import endpoint. The beta rail also primes a chat draft.
3. Sending still crosses the authenticated message/preflight, model-policy and operator-approval boundary. Tools are selected by the model from the canonical registry, not directly by clicking the starter. Prepared transactions move to a separate exact reviewed-action ticket; the starter itself never signs or submits.
4. Public Beta hides the 15 tagged wallet starters by default: Bittensor 3, Hyperliquid 4, Polymarket 3, Sui 5 (including fee preview). `groupMatterhornDeskTaskStarters` retains the other 33 crypto starters and displays three recommendations before More tasks. [`launch-features.ts`](../../../apps/app/src/app/lib/launch-features.ts) controls the reviewed-action flag. Do not call hidden wallet functionality live or enable it to obtain a passing result.
5. Existing watch buttons in [`BittensorPanel.tsx`](../../../apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx) copy API/CLI example commands; they are not a browser scheduler. Sui's real receipt form in [`sui-workflow-panel.tsx`](../../../apps/app/src/react-app/domains/wallet/sui-workflow-panel.tsx) invokes `workspaceSuiVerifyTransactionReceipt`, but the entire full panel is replaced by the beta rail when reviewed desk actions are disabled.

Copy corrected in this change: watch actions now say **Plan a watch** and explicitly deny saving/scheduling from chat; receipt actions now explain receipt fields or where verification lives and deny chat import/verification. Controls and IDs remain present. This fixes the UI promise, not the absent scheduler/import tool. The shared UI owner also corrected the session hero/mini-rail to say “watch planning.”

## Private AI

The Private AI manifest is [`PRIVATE_AI_PROTOCOL_DESK_MANIFEST`](../../../packages/types/src/matterhorn-workflows.ts); this desk uses the general task surface rather than the crypto starter catalog.

| Visible action or promise | Evidence | Actual path and boundary |
| --- | --- | --- |
| Start a task; draft a project plan; research a topic | R-UI for a public ASI1 explanation; F for each individual suggested task | Editable chat → `POST /workspace/:id/sessions/:sessionId/messages`; model/provider connection, quota, policy and operator approval still apply. Other models not established. |
| Work with files; Analyze these files | F/G | Selected workspace files/attachments are explicit context; filesystem/path, account and export/privacy gates apply. No real private-file inference performed. Browser cannot silently open arbitrary local folders; native folder selection belongs to Desktop. |
| Turn my notes into a clear brief | R-UI for synthetic Notes CRUD/persistence; F/G for model use of notes | Notes exist in workspace UI; selecting content for model use is a separate privacy/export decision. CRUD is not proof of private-context inference. |
| Use selected memory | R-UI for explicit synthetic memory save/search; G for export | User-selected/reviewed memory only; conservative export policy remained visible. No hidden save or automatic model transmission inferred. |
| Approved tools / integrations | F/G | Workspace-approved MCP integrations need actual operator configuration and connector authorization. No OAuth was granted; unavailable/setup states are genuine. |

The “Private AI” name is not independent verification of provider retention/training terms. Actual ASI1 public-only inference succeeded; policy verification was still unverified in QA.

## Bittensor — 10 starters

The managed reader is `matterhorn_bittensor_chat` → `POST /api/bittensor/chat/execute` with **forced `readOnly: true`**. Typed operations are authoritative; free-form prose is not permission to prepare or submit. See [`managed-opencode-mcp.ts`](../../../apps/server/src/managed-opencode-mcp.ts), [`server.ts`](../../../apps/server/src/server.ts), and [`tools/bittensor.ts`](../../../apps/server/src/tools/bittensor.ts).

| Starter ID / current label | Evidence | Backend capability and limitation |
| --- | --- | --- |
| `tao-balance` / Show TAO balance | F | Typed `wallet` read requires a public SS58 address; `GET /api/bittensor/wallet/:ss58Address`. No user wallet supplied or connected. |
| `stake-allocations` / Review stake allocations | F | Same public wallet read exposes stake/delegation context. No wallet-secret input or signing. |
| `discover-subnets` / Explore subnets | R-UI | Typed `subnet` with omitted netuid lists bounded subnets; `GET /api/bittensor/subnets`. Actual subnets 0/1/2, SDK Finney source, block 9,220,062. Malformed supplied netuid remains rejected. Use-case ranking itself is model interpretation. |
| `compare-validators` / Compare validators | F | Typed `validators` requires a valid subnet ID; intelligence/sidecar read. Missing netuid still fails rather than silently listing. Live validator comparison not established. |
| `review-subnet-emissions` / Review subnet emissions | R-API for exact emission fields; F for recent-change analysis | `GET /api/bittensor/subnets/:netuid` and `/intelligence/subnet/:netuid`. A single snapshot cannot establish recent change. Zero `emission` is verified SDK data, not proved to be a snapshot artifact. |
| `create-watch` / Plan a subnet or validator watch | F planning; M chat persistence | No chat watch-create tool. Separate `POST /api/bittensor/monitoring/watchlist` and monitoring checks/digest exist; this starter only explains setup and thresholds. |
| `stake-preview` / Stake TAO | G, hidden in default beta | `matterhorn_bittensor_prepare_action` / unified preparation → `/api/bittensor/extrinsics/prepare`; exact public terms + reviewed ticket + installed Bittensor wallet. Not exercised. |
| `unstake-preview` / Unstake TAO | G, hidden in default beta | Same reviewed preparation boundary; no autonomous submission. |
| `transfer-preview` / Send TAO | G, hidden in default beta | Exact Finney transfer preparation followed by separate wallet review/sign/broadcast. Not exercised. |
| `import-receipt` / Understand transaction receipts | F explanation; M chat import | Separate `/api/bittensor/extrinsics/receipt` workflow/API exists; no managed chat import or receipt lookup tool. Current prompt must not claim verified/saved evidence. |

Dependency: isolated Python sidecar with repository-pinned Bittensor SDK 10.5.0, public Finney network egress and `READ_ONLY=1`; loopback only. Health at `http://127.0.0.1:60914/health`, real read at `/subnets?limit=3`. No wallet/keys were loaded. Source/tests permanently disallow sidecar submit in this setup. See [bittensor-sidecar-results.json](bittensor-sidecar-results.json) and [bittensor-emission-verification.md](bittensor-emission-verification.md).

## Hyperliquid — 13 starters

Public managed tools call the fixed public exchange adapter. [`tools/hyperliquid.ts`](../../../apps/server/src/tools/hyperliquid.ts) and the canonical registry distinguish reads from prepare operations.

| Starter ID / current label | Evidence | Backend capability and limitation |
| --- | --- | --- |
| `market-overview` / Read market overview | R-API; related funding R-UI | `matterhorn_hyperliquid_list_markets` → `GET /api/hyperliquid/markets`; source/freshness required. Full narrated overview not separately accepted. |
| `orderbook` / Read orderbook depth | R-UI | `matterhorn_hyperliquid_get_orderbook` → `GET /api/hyperliquid/orderbook/BTC`; real depth/source/time returned. Visible depth is not guaranteed fill liquidity. |
| `compare-funding` / Compare funding | R-UI for BTC; F for exact BTC+ETH comparison | `matterhorn_hyperliquid_get_funding` → `GET /api/hyperliquid/funding/:asset`; prompt needs two public asset reads. |
| `account-exposure` / Review account exposure | F | `get_account` / `get_positions` → `GET /api/hyperliquid/account/:address` and `/positions`; explicit public EVM address required. No customer account used. |
| `open-orders` / Review open orders | F | `get_open_orders` → `GET /api/hyperliquid/account/:address/open-orders`; empty list is a valid state, not a tool failure. |
| `price-watch` / Plan a price watch | F planning; M chat persistence | Separate `POST /api/hyperliquid/watches`; no chat scheduler. UI copies setup examples. |
| `funding-watch` / Plan a funding watch | F planning; M chat persistence | Same watch API; separate `/watches/check` and `/watches/digest`. No auto-trade promised. |
| `order-preview` / Place an order | G, hidden in default beta | `/api/hyperliquid/orders/preview` and `/orders/handoff`; exact network/asset/side/size/slippage + separate signature and execution switch. |
| `cancel-order` / Cancel an order | G, hidden in default beta | Unified exact cancel intent → separate reviewed ticket; numeric order ID and public wallet/network required. |
| `modify-order` / Modify an order | G, hidden in default beta | Unified exact modify intent; revised exact terms separately reviewed. |
| `close-position` / Close a position | G, hidden in default beta | Unified close intent uses reduce-only terms and wallet authorization. |
| `wallet-approved-trade` / Review a wallet-approved trade | F explanation; G execution | Read-only explanation is visible; actual execution requires short-lived intent, exact wallet signature and `MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED`. Mainnet additionally requires explicit confirmation. |
| `import-receipt` / Understand trade receipts | F explanation; M chat import | `/api/hyperliquid/orders/receipt` is a separate reviewed workflow/API; no arbitrary chat import. |

Public market egress is required. No exchange API secret is necessary for these public reads. Testnet/mainnet signatures, order placement/cancel/modify/close and actual wallet receipts remain untested.

## Polymarket / prediction markets — 12 starters

[`tools/prediction-markets.ts`](../../../apps/server/src/tools/prediction-markets.ts) owns cross-venue normalization; [`tools/polymarket.ts`](../../../apps/server/src/tools/polymarket.ts) owns Polymarket reads and reviewed preparation. Kalshi and Manifold are research-only, and Manifold is play money.

| Starter ID / current label | Evidence | Backend capability and limitation |
| --- | --- | --- |
| `compare-venues` / Compare venues | R-API + new projection regression; browser pending | `matterhorn_prediction_markets_search` → `GET /api/prediction-markets/search?query=Bitcoin&limit=3`; actual PM 3, Manifold 3, Kalshi 0. New projection retains 4 in 1,859 chars, explicitly omits 2; source/time/types preserved. Empty Kalshi result is not proof that Kalshi has no relevant markets. |
| `discover-markets` / Discover markets | R-UI for Polymarket-specific discovery; cross-venue R-API | `matterhorn_polymarket_search_markets` → `/api/polymarket/markets?query=...&limit=...`; cross-venue tool above also available. Actual fixed chat returned three markets. |
| `research-market` / Research a market | R-API detail; F complete composite answer | Exact `marketId` uses `GET /api/polymarket/markets/:id`, not fuzzy search. Broader outcomes+book+compliance needs multiple reads and sufficient exact IDs. |
| `compare-outcomes` / Compare outcomes | R-UI for returned odds; F causal interpretation | Search/detail returns outcomes and probabilities. Claims about what will move prices require evidence; not established by current odds alone. |
| `review-liquidity` / Review liquidity | R-API sampled book; F full starter | `get_orderbook` → `GET /api/polymarket/orderbook/:tokenId`; exact outcome token ID required. Thin/empty books are valid states. Natural-language discovery may require search + detail + book, exceeding the desk's two-tool-turn guidance. |
| `check-compliance` / Check compliance | R-API blocked result; G executable handoff | `matterhorn_polymarket_check_compliance` → `GET /api/polymarket/compliance`. Current public geoblock says jurisdiction blocked; no bypass. A capability's `canSubmit` is not this user's authorization. |
| `create-watch` / Plan a market watch | F planning; M chat persistence | Separate `POST /api/polymarket/watches`, `/watches/check`, `/watches/digest`; no managed chat scheduler. |
| `review-watch-alerts` / Explain watch signals | F explanation; M loading saved alerts from chat | Current prompt asks for supplied public signal/source/time and explicitly cannot load saved alert history. No inference of a historical event from one snapshot. |
| `preview-trade` / Buy an outcome | G, hidden in default beta | `/api/polymarket/orders/preview` / `/orders/handoff`; exact market/outcome/amount, current eligibility, EOA Polygon chain 137 wallet review. Blocked here. |
| `sell-shares` / Sell shares | G, hidden in default beta | `/api/polymarket/orders/sell-preview`; exact shares + eligibility + reviewed wallet flow. Blocked here. |
| `cancel-order` / Cancel orders | G, hidden in default beta | Certified exact cancellation path; separate authorization, no automatic chat submission. |
| `import-receipt` / Understand market receipts | F explanation; M chat import | `/api/polymarket/orders/receipt` exists separately; no managed chat receipt import/verification. |

Public Gamma/CLOB, Kalshi and Manifold access is required for their respective reads. An unavailable venue remains degraded while other public results survive. Provider messages, HTTP success and readiness are not execution permission.

## Sui — 13 starters

[`tools/sui.ts`](../../../apps/server/src/tools/sui.ts) and the managed schema require an explicit `mainnet` or `testnet` network for reads. Public object access is metadata-only; no custom RPC or raw BCS is exposed.

| Starter ID / current label | Evidence | Backend capability and limitation |
| --- | --- | --- |
| `read-wallet` / Read Sui wallet | R-UI testnet balance | `matterhorn_sui_get_balance` → `GET /api/sui/balance/:address?network=...`; account wrapper at `/api/sui/account/:address`. Public address required, not wallet connection. |
| `inspect-objects` / Inspect objects | R-UI testnet public object 0x2 | `matterhorn_sui_get_object` → `GET /api/sui/object/:objectId?network=...`; owner/type/version/digest/package/source/time. Missing object returns 404. Read uses object ID, not wallet address. |
| `read-testnet-balance` / Check testnet balance | R-UI/R-API | Same explicit testnet balance route; fixture public 0x2 address, not a user wallet. Zero balance is a valid answer. |
| `read-mainnet-balance` / Check mainnet balance | F | Same implementation with fixed mainnet RPC; mainnet browser acceptance not performed. |
| `compare-networks` / Compare network balances | F; browser pending | Sui prompt/evidence budget is now two. Instructions default to one read, allowing exactly one mainnet and one testnet balance read for the same public address only on explicit comparison; preview remains once with stop on failure. This pair is model guidance, **not a newly enforced runtime counter or authorization**. Read-only tool permissions are unchanged. |
| `validate-recipient` / Validate a recipient address | F format checks | Strict public address validation exists in inputs/backend; no standalone managed validation tool. Format validity cannot prove ownership or intended recipient. |
| `sui-transfer-preview` / Review a SUI transfer | G, hidden in default beta | `matterhorn_sui_preview_transfer` / `POST /workspace/:id/sui/transactions/preview`; native SUI terms then separate wallet flow. |
| `token-transfer-preview` / Review a token transfer | G; M exact generic chat preparation | Dedicated Sui panel/API supports custom coin flow; managed preview schema is native-SUI-only. Do not claim arbitrary coin chat preparation is established. |
| `object-transfer` / Transfer an object or NFT | G; M exact generic chat preparation | Dedicated Sui panel/API handles object transfer; not exposed by native-SUI-only managed preview schema. |
| `batch-transfer` / Send SUI to multiple recipients | G; M exact generic chat preparation | Dedicated Sui panel/API handles batch transfer; not exposed by native-SUI-only managed preview schema. |
| `review-transfer-fees` / Review transfer fees | G, hidden in default beta | Now explicitly tagged as the existing Sui `transfer_sui` reviewed action; opens the same gated transfer draft/ticket and must not bypass read-only mode. Its recommendation slot is replaced with the public testnet balance read. No proved gas estimate or write-access expansion. |
| `review-signing-handoff` / Review signing handoff | F explanation; G actual signing | Web uses connected Sui wallet; Desktop prepares external handoff. Neither signing path was exercised. |
| `import-receipt` / Find receipt verification | F guidance; G separate form; M chat import | Existing Sui tools **Import receipt → Verify receipt** invokes `POST /workspace/:id/sui/transactions/verify-receipt` and checks public RPC evidence before saving. Full panel is unavailable in default beta; chat only explains where it exists. |

Public fullnode egress is required. Sui browser object answer included an unsupported “shared system object” phrase even though authoritative owner kind is `immutable`; use source metadata. This is an answer-quality caveat, not a failed SDK execution.

### Source-grounded answer wording

For Bittensor, the supported statement is: “The SDK's `emission` field is zero in this block; separate alpha/TAO emission metrics may differ.” The source does not establish why it is zero; avoid “likely snapshot artifact” or a staking recommendation. For Sui, say “owner kind: immutable” exactly when that is returned, without calling it shared. A model answer should distinguish a directly returned value, a derived calculation and an unsupported interpretation. Neither caveat justifies changing the upstream value or financial guidance.

## Authoritative readiness, gates and honest empty states

| Scope | Read-only status surface | Meaning / what it cannot establish |
| --- | --- | --- |
| Workspace | `GET /api/backend/capabilities`; `/workspace/:id/backend/readiness`; `/workspace/:id/backend/models` | Connected model catalog and checks, not successful inference, provider privacy certification or hosted availability. |
| Own chat | `GET /workspace/:id/sessions/:sessionId/status`; `/snapshot` | Actual state. New `awaitingOperatorApproval` is scoped to exact workspace/session/subject; it grants no approval authority. Stop/cancel should clear the pending request and preserve draft. |
| Bittensor | `GET /api/bittensor/sidecar/health`; `/api/bittensor/readiness` | Must distinguish absent sidecar/fallback data from actual SDK/live source and block. Healthy read service does not enable submit. |
| Market execution | `GET /api/crypto/market-execution-readiness`; `/api/crypto/readiness` | Per-venue capability/configuration report; not jurisdiction eligibility or wallet authorization. |
| Polymarket | `GET /api/polymarket/compliance` | Current execution restriction is authoritative; `canSubmit: true` elsewhere does not override it. |
| Prediction search | `GET /api/prediction-markets/venues`; `/search` | `ready + resultCount: 0` is a valid bounded search result; `degraded` must remain visible. Never fabricate a market to fill the UI. |
| Sui | Workspace capabilities + explicit balance/object route | Network/ID validation and actual RPC evidence; zero balance or 404 is not proof of broken UI. No positive read proves transfer readiness. |

No native-only capability was moved into web. Opening arbitrary local folders and external Desktop wallet/client handoffs remain explicit environment boundaries. Web wallet actions need installed/connected appropriate wallets and separate reviewed approval, not server-held secrets.

## Reproduced bounded defects and remaining gaps

Fixed with focused regressions in this candidate:

1. Polymarket normalized descriptions/nested metadata exhausted the unchanged 2,000-character MCP cap; bounded public summaries now retain records and omissions.
2. Omitted Bittensor `netuid` on a subnet-list request incorrectly failed; omission now lists, explicit malformed values still fail, validators still require an ID.
3. Sui advertised object reading but had no managed implementation; strict public metadata reader and lossless short-ID model projection added. No signing permission expanded.
4. Cross-venue search returned real public records but MCP discarded all of them. At **00:37:28 UTC**, one authenticated GET returned six markets, 2,820 raw characters. Local new projection retained four markets (two Polymarket, two Manifold), explicitly omitted two, preserved source URL/time and real-/play-money classification, and kept both output channels at **1,859 characters**. Kalshi remained `ready` with zero results. No inference or workflow mutation was dispatched by this check. Browser test awaits new backend.
5. Watch/receipt starters implied persistence unsupported by their actual draft-only handler. Labels/prompts now accurately describe planning/guidance; controls remain available. Sui fee preview is now explicitly in the existing reviewed-transfer group/gate rather than advertised among the three beta public-read recommendations.

Remaining, not silently passed: full wallet execution acceptance; native Desktop signing; connected third-party integrations; hosted authenticated five-desk acceptance; other model/provider coverage; actual watch creation/scheduling from web chat; chat receipt import; Sui non-native/object/batch chat preparation; live acceptance of the clarified Sui network comparison; composite Polymarket research requiring more calls than current per-turn guidance. A narrow receipt-only Sui panel variant could expose the existing public-digest verification safely in beta, but it has **not** been implemented; do not unhide the entire transaction panel as a shortcut.

## Verification commands and source basis

Run from repository root with pnpm and no implicit environment loading. Counts overlap; do not sum as unique coverage.

```sh
pnpm exec bun --no-env-file test apps/server/src/managed-opencode-mcp.test.ts apps/server/src/tools/prediction-markets.test.ts apps/server/src/agent-token-budget.test.ts
# 53 passed / 522 assertions after cross-venue fix.
pnpm --dir apps/server exec tsc -p tsconfig.json --noEmit
# Passed after cross-venue fix.
pnpm exec bun --no-env-file test apps/app/tests/desk-task-starters.test.ts apps/app/tests/public-beta-desk-surface.test.ts apps/app/tests/desk-task-inputs.test.ts apps/app/tests/desk-task-transaction-chat-flow.test.ts apps/app/tests/sui-desk-contract.test.ts
# 36 passed / 371 assertions after starter-copy and Sui fee-gate correction.
pnpm exec bun --no-env-file test apps/app/tests/operator-approval-status.test.ts apps/app/tests/session-approval-status-client.test.ts
# 6 passed / 19 assertions; pure/source/client tests, not mounted React acceptance.
pnpm exec bun --no-env-file test apps/app/tests/desk-agent-architecture.test.ts apps/app/tests/agent-runtime-performance.test.ts apps/server/src/agent-token-budget.test.ts apps/server/src/agent-capability.test.ts
# 48 passed / 398 assertions after Sui comparison guidance; schema stays 10,982 characters.
pnpm exec bun --no-env-file test apps/server/src/tools/bittensor.test.ts apps/server/src/bittensor-chat-routes.e2e.test.ts apps/server/src/tools/hyperliquid.test.ts apps/server/src/tools/polymarket.test.ts apps/server/src/tools/sui.test.ts
# Existing desk fixture/route suites; exact completed stage runs recorded in RESULTS.md and independent reports.
git diff --check
# Passed.
```

Canonical authority is [`crypto-action-registry.ts`](../../../packages/types/src/crypto-action-registry.ts), [`desk-agents.ts`](../../../packages/types/src/desk-agents.ts), transport projection and actual server handlers, not the marketing manifest. The existing model-context cap, 11,000-character schema ceiling, consent, account isolation, raw-secret rejection and wallet approval boundaries were not widened by this audit.
