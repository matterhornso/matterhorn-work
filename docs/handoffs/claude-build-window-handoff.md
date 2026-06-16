# Claude Code Build-Window Handoff (for Codex)

This summarizes the work done during the Claude Code build window while Codex was paused, and what Codex should pick up on return. Everything below is **read-only plus preview-only**: no real trading, signing, custody, key handling, API-secret storage, or exchange/order submission was added.

## Merged PRs

| PR | Title | Scope |
| --- | --- | --- |
| #226 | Hyperliquid order preview risk polish | Enriched preview fields (notional, marketability/slippage, funding, leverage/liquidation placeholders, close-intent), close-from-live-position flow, funding-risk chat. |
| #227 | Hyperliquid operator QA matrix | `docs/hermes-hyperliquid-usability-security-qa.md` + readiness-gate assertions. |
| #228 | Polymarket read/preview tool foundation | `apps/server/src/tools/polymarket.ts` on the Hyperliquid pattern: provider, planner, workflow, compliance gate, non-submittable bet preview, credential rejection. |
| #229 | Polymarket QA harness + readiness gate | `scripts/polymarket-read-preview-qa.mjs`, `scripts/polymarket-readiness-gate.test.mjs`, `package.json` scripts. |
| #231 | Polymarket order preview risk polish | `risk` (cost/payout/max-loss/breakeven), `resolution`, `priceContext` (implied vs book), `liquidity`, slippage tolerance. |
| #232 | Polymarket read-only watchlist/monitor | `monitor` intent + `buildPolymarketWatchDescriptor` (works even when geoblocked). |
| #233 | Polymarket adversarial security sweep | 12-probe audit (ReDoS/DoS/SSRF/proto-pollution/secret-bypass/no-submit) codified as tests + threat-model docs. |
| #234 | Polymarket events discovery | `events` intent + `searchEvents` + `mapEventRecord` (grouped related markets). |
| #236 | Polymarket read/preview HTTP routes | `/api/polymarket/{markets,events,markets/:id,orderbook/:tokenId,compliance,orders/preview,chat/execute}` + `preparePolymarketOrderFromRequest` + card builders. |
| #237 | Polymarket MCP tools | `matterhorn_polymarket_{chat,search_markets,search_events,get_market,get_orderbook,check_compliance,preview_order}`. |
| #238 | Polymarket CLI commands | `matterhorn-work polymarket` (alias `pm`): chat/markets/events/market/orderbook/compliance/preview-order + `assertNoPolymarketSecrets` + CLI fallback test. |

PR #221 (earlier Polymarket stream, different shape) was **closed/superseded** by #228 for consistency with the Hyperliquid pattern.

**Ownership update:** the Polymarket server routes, MCP tools, and CLI — originally handed to Codex — were built by Claude Code in #236–238 at the user's request. Codex no longer needs to build these; only the Phase 5 unified integration remains.

## Current Hyperliquid State

Read-only + preview-only across server routes, chat, MCP, CLI, docs, QA, and readiness gate (Codex's #216–225) plus the #226 preview risk polish. Key preview fields now: `notionalUsd`, `marketability`, `funding`, `leverageContext` (with `requiresAccountContext`), `closeContext`. Every preview is `canSubmit: false`.

## Current Polymarket State

**Full read/preview surface: tool layer + HTTP routes + MCP + CLI**, mirroring Hyperliquid. Exported surface in `apps/server/src/tools/polymarket.ts`:

- `PolymarketInfoProvider` (Gamma + CLOB + geoblock, injectable fetcher) implementing `PolymarketProvider` — `searchMarkets`, `searchEvents`, `getMarket`, `getOrderbook`, `checkCompliance`.
- `planPolymarketChat` intents: `learn`, `discover`, `events`, `market`, `odds`, `orderbook`, `compliance`, `monitor`, `order_preview`.
- `executePolymarketChatWorkflow`, `extractPolymarketOrderInput`.
- `preparePolymarketOrderPreview` (now with `risk`, `resolution`, `priceContext`, `liquidity`, slippage), `buildBlockedPolymarketPreview`, `estimatePolymarketFill`, `buildPolymarketWatchDescriptor`.
- `findForbiddenPolymarketCredentialInput` (bounded, fail-closed).
- Types: `PolymarketActionPreview`, `PolymarketMarketSummary`, `PolymarketEventSummary`, `PolymarketWatchDescriptor`, `PolymarketOrderbook`, `PolymarketComplianceStatus`, `PolymarketChatCard`, etc.
- Card kinds for the new flows: `polymarket_event_list`, `polymarket_watch` (in addition to market list/detail/orderbook/compliance/order_preview/clarification).

Compliance: geoblock runs before any preview; blocked → `blocked_by_compliance` with no executable price/size/risk. Research, events, market detail, orderbook, and watchlist flows work regardless of compliance. 38 unit tests; the tool was adversarially audited (#233).

**HTTP routes** (`apps/server/src/server.ts`, all `client`-auth): `GET /api/polymarket/markets`, `GET /api/polymarket/events`, `GET /api/polymarket/markets/:id`, `GET /api/polymarket/orderbook/:tokenId`, `GET /api/polymarket/compliance`, `POST /api/polymarket/orders/preview`, `POST /api/polymarket/chat/execute`. Credential-shaped bodies are rejected with `market_secret_rejected`.

**MCP tools** (`packages/matterhorn-work-mcp/index.mjs`): `matterhorn_polymarket_{chat,search_markets,search_events,get_market,get_orderbook,check_compliance,preview_order}`.

**CLI** (`apps/orchestrator/src/cli.ts`): `matterhorn-work polymarket` (alias `pm`) with `chat|markets|events|market|orderbook|compliance|preview-order` and `assertNoPolymarketSecrets`. Covered by `scripts/polymarket-cli-fallback.test.mjs`.

## What Codex Should Pick Up

1. **Phase 5 — Unified market chat integration** — route across Bittensor, Hyperliquid, Polymarket; shared cards for discovery, account snapshot, orderbook, action preview, compliance block, watch alert, receipt/status; update the agent-control coverage matrix and customer evidence bundle. The Polymarket routes/MCP/CLI now exist and can be wired in directly.
2. **Bittensor closeout** — fix the 6 pre-existing `bittensor.ts`/`bittensor.test.ts` TypeScript errors (see below).
3. Optional: fold `test:polymarket-*` (read-preview-qa, cli-fallback, readiness-gate) into any customer-readiness aggregation, and add Polymarket coverage to the agent-control matrix.

**Polymarket routes, MCP, and CLI are done (#236–238) — do not rebuild them.**

## Safety Invariants (must stay true)

- No seed/mnemonic/private key/API secret/passphrase/wallet export/raw signature/signed payload accepted or echoed.
- Every order preview is `canSubmit: false`; blocked compliance yields no executable price/size.
- No `/orders/submit`, no exchange endpoint, no signing, no key custody.
- Account-dependent risk asks one clarification rather than guessing.

## Verification

```bash
bun test apps/server/src/tools/hyperliquid.test.ts apps/server/src/tools/polymarket.test.ts
node scripts/hyperliquid-readiness-gate.test.mjs
node scripts/polymarket-readiness-gate.test.mjs
node scripts/hyperliquid-read-preview-qa.mjs --self-test --strict --json
node scripts/polymarket-read-preview-qa.mjs --self-test --strict --json
pnpm --filter matterhorn-work-server typecheck   # 6 pre-existing bittensor errors are unrelated to this window
```

## Known Pre-Existing Issue (not from this window)

`apps/server/src/tools/bittensor.ts` and `bittensor.test.ts` have 6 pre-existing TypeScript errors on `dev` (e.g. `buildBittensorAdapterOperatorHandoffCard`, adapter card `kind` union mismatches). They predate this build window and are unrelated to Hyperliquid/Polymarket. Worth a separate Bittensor closeout fix.
