# Chat-Native Crypto Execution Plan

Matterhorn should make crypto systems usable through chat without hiding the mechanics that can lose money. The product pattern is:

1. Chat understands intent.
2. Server tools turn intent into deterministic plans, quotes, and previews.
3. Cards show the consequence, cost, risk, and exact payload.
4. User explicitly approves.
5. Signing happens through the correct external signer or approved API-wallet model.
6. Submission happens only after signed payload validation.

This plan is gated. Hyperliquid and Polymarket execution work should not start until Bittensor's readiness audit has no blockers and only accepted provider/runtime warnings.

## Foundation Lane: Upstream OpenWork Intake

Matterhorn Work should continue to benefit from upstream OpenWork runtime, desktop, server, dependency, and packaging updates without losing Matterhorn-specific product direction. Upstream updates are integrated through a reviewed sync lane, not by direct auto-merge.

The sync lane is documented in [Upstream OpenWork Sync Playbook](./upstream-openwork-sync.md) and checked by:

```bash
pnpm upstream:openwork:check
pnpm test:upstream-openwork-sync
```

Every upstream sync PR must preserve:

- Matterhorn Work branding and engine abstraction.
- `matterhorn-work` and `matterhorn-work-server` commands with legacy OpenWork shims.
- `MATTERHORN_WORK_*` aliases with `OPENWORK_*` fallbacks.
- Bittensor non-custodial safety contracts.
- Agent-control HTTP, MCP, CLI, browser, event, file, and Bittensor interfaces.

## Gate 1: Perfect Bittensor First

Bittensor is the first proof that Matterhorn can make a complex ecosystem simple:

- ordinary chat intents map to `learn`, `discover`, `wallet`, `stake_plan`, `subnet_use`, and `monitor`.
- every subnet has universal explanation, discovery, metagraph, wallet/stake context, staking guidance, monitoring, and capability registry support.
- direct subnet service calls require explicit adapters.
- signed actions stay external; Matterhorn never asks for seed phrases, private keys, mnemonics, keyfiles, or wallet exports.
- readiness is checked with `bittensor_readiness_audit`.

The Bittensor gate is considered ready when:

- chat intent classification passes for core user journeys.
- subnet discovery returns provider-backed data or fallback warnings are explicitly accepted.
- wallet reads reject invalid SS58 public addresses and never request secrets.
- staking/unstaking/transfer previews are unsigned, checksumed, and external-signature-only.
- validator comparison works from public metagraph samples and avoids financial advice.
- watch creation/evaluation works and persists safely.
- sidecar status is explicit.
- no API, MCP, card, handoff, or log payload contains secret-shaped fields.

Research anchors:

- Bittensor subnets are UID/hotkey/coldkey based, and metagraph data is the right source for participants, stake, trust, dividends, emissions, hotkeys, and coldkeys: https://docs.learnbittensor.org/subnets/metagraph
- Dynamic TAO introduces subnet alpha tokens, pool pricing, and slippage/rate-tolerance requirements: https://docs.learnbittensor.org/dynamic-tao/sdk-cheat-sheet
- Bittensor SDK stake methods include safe staking, partial staking, and rate tolerance concepts: https://docs.learnbittensor.org/staking-and-delegation/managing-stake-sdk

## Hyperliquid: Chat and Trade

Goal: a user can say "buy 0.1 BTC perp with 2x max leverage and a stop", "close half my ETH position", "show my funding risk", or "place a post-only HYPE bid", and Matterhorn turns that into safe research, risk checks, preview cards, explicit confirmation, signing, and submission.

Official docs constraints:

- Hyperliquid has public info endpoints for mids, metadata, open orders, positions, fills, and account state: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- Trading uses the exchange endpoint and signed actions. Orders include asset id, side, price, size, reduce-only, order type, nonce, signature, optional vault address, and optional expiry: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- Hyperliquid recommends using official/existing SDK signing because manual signatures are easy to get wrong: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing
- API wallets sign on behalf of master/subaccounts but account data must still be queried by the actual account address: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets

### Hyperliquid Phase H1: Read-Only Chat

Add deterministic tools:

- `hyperliquid_plan_from_chat`
- `hyperliquid_get_markets`
- `hyperliquid_get_account`
- `hyperliquid_get_positions`
- `hyperliquid_get_open_orders`
- `hyperliquid_get_funding`
- `hyperliquid_explain_risk`

Cards:

- account summary
- position risk
- funding/rate card
- market depth card
- liquidation-risk warning

Safety:

- no private key capture.
- no leverage suggestion framed as advice.
- require account address for reads.
- distinguish spot, perp, vault, and subaccount.

### Hyperliquid Phase H2: Order Preview

Add deterministic tools:

- `hyperliquid_prepare_order`
- `hyperliquid_prepare_close`
- `hyperliquid_prepare_cancel`
- `hyperliquid_prepare_tpsl`

Preview card must show:

- asset id and display symbol.
- side, size, price, order type, TIF, reduce-only, cloid.
- estimated notional, leverage, margin impact, liquidation-risk context.
- slippage/marketability for IOC/market-like orders.
- funding exposure.
- nonce/expiry policy.
- final consequence statement.

Signing:

- use existing SDK-backed signing or an explicit external signer flow.
- support API-wallet mode only after user configures it knowingly.
- never store private keys in Matterhorn.

### Hyperliquid Phase H3: Submit and Monitor

Add:

- signed order submission.
- cancel/modify flows.
- dead-man switch/scheduled cancel support.
- post-trade monitor for fills, open orders, funding, liquidation buffer.
- chat-created risk watches.

Required tests:

- parser tests for buy/sell/close/reduce-only/stop/take-profit.
- order normalization tests for tick/lot size.
- no-secret schema tests.
- mock exchange submission tests.
- risk-card UI tests.
- "I want to buy" flow must stop at preview unless user signs.

## Polymarket: Chat and Bet

Goal: a user can say "find markets about the next Fed decision", "buy $25 YES if the price is below 45c", "sell half my YES", "show my unresolved exposure", or "alert me if this market crosses 60c".

Official docs constraints:

- Polymarket CLOB is non-custodial: offchain matching, onchain settlement, EIP-712 signed orders, Polygon settlement: https://docs.polymarket.com/trading/overview
- All orders are expressed as limit orders. Market orders are marketable limit orders using FOK/FAK style behavior: https://docs.polymarket.com/trading/orders/create
- Public market/orderbook/pricing reads need no auth, while trading endpoints require L2 headers; creating orders still requires signed order payloads: https://docs.polymarket.com/api-reference/authentication

### Polymarket Phase P1: Read-Only Chat

Add deterministic tools:

- `polymarket_plan_from_chat`
- `polymarket_search_markets`
- `polymarket_get_market`
- `polymarket_get_orderbook`
- `polymarket_get_prices`
- `polymarket_get_positions`
- `polymarket_explain_resolution`

Cards:

- market summary
- outcome prices
- orderbook/spread
- resolution source/rules
- user exposure
- liquidity warning

Safety:

- geographic restrictions must be surfaced before trading.
- resolution criteria must be shown before betting.
- market price is probability-like, not certainty.
- no private key capture.

### Polymarket Phase P2: Bet Preview

Add deterministic tools:

- `polymarket_prepare_order`
- `polymarket_prepare_market_order`
- `polymarket_prepare_sell`
- `polymarket_prepare_cancel`

Preview card must show:

- event/market, outcome token id, YES/NO side.
- limit price, size, max spend or max shares sold.
- FOK/FAK/GTC/GTD behavior.
- implied probability and worst-case loss.
- current spread/liquidity.
- fees/rebates if applicable.
- resolution caveats and final consequence statement.

Signing/auth:

- use SDK/client-backed EIP-712 order signing where possible.
- L2 API credentials may be stored only in an approved secret store/config path, never in chat transcripts.
- posting an order requires a signed order payload even with L2 credentials.

### Polymarket Phase P3: Submit and Monitor

Add:

- submit signed order.
- cancel orders.
- watch markets and positions.
- outcome-resolution monitor.
- portfolio/risk summaries.

Required tests:

- parser tests for YES/NO, spend amount, price caps, sell/close intents.
- market lookup tests with mocked API.
- order preview tests for worst-case loss.
- no-secret schema tests.
- geographic/restriction warning tests.
- "bet on X" flow must stop at preview unless signed.

## Shared Execution Architecture

Create a common chat execution contract:

- `ChatExecutionIntent`
- `ChatExecutionPlan`
- `ExecutionPreview`
- `ExecutionSignerStatus`
- `ExecutionSignedResult`
- `ExecutionRiskCheck`
- `ExecutionWatch`

Shared card kinds:

- plan
- market/search result
- account snapshot
- risk review
- order preview
- signing handoff
- submitted result
- watchlist
- readiness report

Shared safety rules:

- no hidden execution.
- no custody unless a separate security review explicitly approves it.
- explicit confirmation before every signed action.
- external signer or approved API-wallet/session signer only.
- no secret fields in API, MCP schemas, cards, logs, docs examples, or tests.
- plain-English consequence statement on every action.

## Execution Order

1. Keep the upstream OpenWork intake lane available so runtime and packaging fixes can flow into Matterhorn safely.
2. Finish Bittensor readiness audit and remove blockers.
3. Build Bittensor Subtensor sidecar contract/tests and live health probe. Delivered in PR #3 with `packages/bittensor-subtensor-sidecar`, deterministic mock mode, optional Python SDK bridge, health/status endpoints, metagraph/wallet reads, unsigned extrinsic previews, submit-disabled safety behavior, and no-secret contract tests.
4. Promote TAO sidecar reads from contract-ready to live-read-ready: sidecar-first subnet list/detail, Dynamic TAO metadata, wallet/stake exposure, quote enrichment, source/freshness labels, and CI-safe mocked live-read tests.
5. Build Hyperliquid read-only chat tools.
6. Build Hyperliquid order previews, not submission.
7. Build Polymarket read-only chat tools.
8. Build Polymarket bet previews, not submission.
9. Only after preview tests and no-secret audits pass, add signed submission flows.
