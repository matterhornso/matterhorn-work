# Claude Code Build-Window Handoff (for Codex)

This summarizes the work done during the Claude Code build window while Codex was paused, and what Codex should pick up on return. Everything below is **read-only plus preview-only**: no real trading, signing, custody, key handling, API-secret storage, or exchange/order submission was added.

## Merged PRs

| PR | Title | Scope |
| --- | --- | --- |
| #226 | Hyperliquid order preview risk polish | Enriched preview fields (notional, marketability/slippage, funding, leverage/liquidation placeholders, close-intent), close-from-live-position flow, funding-risk chat. |
| #227 | Hyperliquid operator QA matrix | `docs/hermes-hyperliquid-usability-security-qa.md` + readiness-gate assertions. |
| #228 | Polymarket read/preview tool foundation | `apps/server/src/tools/polymarket.ts` on the Hyperliquid pattern: provider, planner, workflow, compliance gate, non-submittable bet preview, credential rejection. |
| #229 | Polymarket QA harness + readiness gate | `scripts/polymarket-read-preview-qa.mjs`, `scripts/polymarket-readiness-gate.test.mjs`, `package.json` scripts. |

PR #221 (earlier Polymarket stream, different shape) was **closed/superseded** by #228 for consistency with the Hyperliquid pattern.

## Current Hyperliquid State

Read-only + preview-only across server routes, chat, MCP, CLI, docs, QA, and readiness gate (Codex's #216–225) plus the #226 preview risk polish. Key preview fields now: `notionalUsd`, `marketability`, `funding`, `leverageContext` (with `requiresAccountContext`), `closeContext`. Every preview is `canSubmit: false`.

## Current Polymarket State

Read/preview **tool layer only** (no HTTP routes/MCP/CLI yet). Exported surface in `apps/server/src/tools/polymarket.ts`:

- `PolymarketInfoProvider` (Gamma + CLOB + geoblock, injectable fetcher) implementing `PolymarketProvider`.
- `planPolymarketChat`, `extractPolymarketOrderInput`, `executePolymarketChatWorkflow`.
- `preparePolymarketOrderPreview`, `buildBlockedPolymarketPreview`, `estimatePolymarketFill`.
- `findForbiddenPolymarketCredentialInput` (bounded, fail-closed).
- Types: `PolymarketActionPreview`, `PolymarketMarketSummary`, `PolymarketOrderbook`, `PolymarketComplianceStatus`, `PolymarketChatCard`, etc.

Compliance: geoblock runs before any preview; blocked → `blocked_by_compliance` with no executable price/size.

## What Codex Should Pick Up

1. **Polymarket server routes** — mirror the Hyperliquid routes (`/api/hyperliquid/...`) for Polymarket:
   - `GET /api/polymarket/markets` (search), `GET /api/polymarket/markets/:id`, `GET /api/polymarket/orderbook/:tokenId`, `GET /api/polymarket/compliance`, `POST /api/polymarket/orders/preview`, `POST /api/polymarket/chat/execute`.
   - Reuse `executePolymarketChatWorkflow` and the provider directly. Reject credential-shaped bodies with `market_secret_rejected` (same shape as the Hyperliquid route).
2. **Polymarket MCP tools** — mirror `matterhorn_hyperliquid_*`: `matterhorn_polymarket_chat`, `_search_markets`, `_get_market`, `_get_orderbook`, `_check_compliance`, `_preview_order`. No secret fields in any schema.
3. **Polymarket CLI** — `matterhorn-work polymarket ...` mirroring `hyperliquid`, with `assertNoPolymarketSecrets` flag rejection. (Plan: "CLI later.")
4. **Phase 5 — Unified market chat integration** — route across Bittensor, Hyperliquid, Polymarket; shared cards for discovery, account snapshot, orderbook, action preview, compliance block, watch alert, receipt/status; update the agent-control coverage matrix and customer evidence bundle.
5. Extend `scripts/polymarket-read-preview-qa.mjs` to hit the new live routes once they exist (it currently drives the public read endpoints / self-test), and add `test:polymarket-*` entries to the customer-readiness aggregation if desired.

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
