# Matterhorn Desks Market Parallel Roadmap

This roadmap coordinates the next Matterhorn Desks build across Bittensor, Hyperliquid, and Polymarket without letting parallel agents collide.

Matterhorn Desks is becoming a chat-first Web3 operating layer. Bittensor remains the most mature path and must stay non-custodial. Hyperliquid and Polymarket start as read-only plus preview-only product surfaces. Live trading, betting, signing, or API-wallet execution is out of scope until a separate security review and explicit approval.

## Current State

- Bittensor has chat execution, readiness checks, wallet/stake reads, validator comparison, watch/autopilot flows, external-signer preview/handoff/receipt checks, MCP tools, CLI flows, customer evidence bundles, and adapter canary gates.
- PR #212 added the Bittensor panel receipt import command with client Bearer auth.
- PR #213 added the MCP receipt import tool for public external-signer receipt evidence.
- Agent control already has HTTP, MCP, and CLI coverage for sessions, files, approvals, browser actions, and Bittensor operator flows.

## Coordination Rules

- Codex owns Bittensor closeout, shared market safety contracts, Hyperliquid, agent-control/MCP/CLI integration, customer evidence, and cross-venue UX integration.
- Claude Code owns Polymarket discovery, compliance, read-only provider work, Polymarket preview contracts, and Polymarket-specific docs/tests.
- Hermes owns black-box QA/security after enough PRs land.
- No agent edits another agent's owned files without an explicit handoff comment on the relevant PR.
- All implementation branches must start from updated `dev` after this coordination PR lands.
- Keep PRs small: build, test, open PR, wait for green CI, merge, then continue.

## Phase 1: Bittensor Completion

Owner: Codex.

Finish the remaining customer-readiness loop:

- Keep receipt import/check evidence aligned across panel, API, CLI, and MCP.
- Keep direct subnet execution gated behind preview-confirm-invoke, request hashes, adapter canary gates, and read-only canary evidence.
- Polish durable public wallet timeline and customer-readiness UI only after the receipt loop is complete.
- Continue rejecting seed phrases, private keys, mnemonics, wallet exports, raw signatures, signed payloads, and signed extrinsics in API/MCP/CLI payloads.

Required checks:

```bash
pnpm test:agent-control-mcp
pnpm test:bittensor-cli-fallback
pnpm test:bittensor-live-qa
pnpm test:bittensor-customer-readiness-gate
pnpm test:bittensor-customer-evidence-bundle
pnpm test:bittensor-receipt-check
```

## Phase 2: Shared Market Safety Contract

Owner: Codex.

Add shared read/preview-only market contracts before venue-specific trading logic:

- Market venue identifiers: `bittensor`, `hyperliquid`, `polymarket`.
- Market chat intents: `learn`, `discover`, `account`, `positions`, `orderbook`, `quote`, `order_preview`, `cancel_preview`, `monitor`, `compliance`.
- Market signer policies: `read_only`, `external_signer_required`, `api_wallet_required`, `blocked_by_compliance`, `disabled`.
- Market action preview shape for venue, action, market/asset, side, size, price, slippage/tolerance, expiry, fees, warnings, source/freshness, and preview hash.
- Market receipt shape for public status only. It must not contain private keys, API secrets, passphrases, raw signatures, signed payloads, or wallet exports.

Security defaults:

- Every action request produces a preview first.
- No live submission is enabled by default.
- Compliance blocks override user prompts.
- Prompt injection cannot bypass preview-confirm-submit.
- Mock provider fixtures are used before live provider work.

## Phase 3: Hyperliquid Read + Preview

Owner: Codex.

Build the first Hyperliquid surface as read-only plus preview-only:

- Provider reads: market metadata, all mids, user open orders/fills/status, and optional websocket contracts later.
- Chat flows: "show my Hyperliquid account", "what are BTC/SOL doing", "show my open orders", "prepare a reduce-only order", "cancel this order".
- Server routes: chat execute, market list, account read, order preview, monitoring watchlist.
- MCP/CLI tools after HTTP contracts are stable.

Rules:

- Use testnet first for any action path.
- No private key import.
- API-wallet execution is a later env-gated phase.
- Validate tick size, lot size, minimum notional, reduce-only, leverage, stale price, and slippage before preview.

## Phase 4: Polymarket Discovery + Compliance + Preview

Owner: Claude Code.

Build the first Polymarket surface as research, compliance, orderbook, and preview-only:

- Provider reads: Gamma event/market discovery, CLOB orderbook, price/spread/midpoint, public user positions where available.
- Compliance: call Polymarket geoblock before any order preview.
- Chat flows: "find markets about AI", "explain this market", "show the orderbook", "prepare a $10 Yes order".
- Server routes: chat execute, market search/detail, orderbook, geoblock, order preview.

Rules:

- If geoblock says blocked, return `blocked_by_compliance` and do not create an executable order preview.
- No private key import.
- No API key/secret/passphrase storage.
- Research and watchlist flows can work even when order previews are blocked.
- Explain prediction markets as risk-bearing information, never as betting advice.

## Phase 5: Unified Market Chat Integration

Owner: Codex after Claude Code's Polymarket PRs merge.

- Add market chat routing across Bittensor, Hyperliquid, and Polymarket.
- Add shared cards for discovery, account snapshot, orderbook, action preview, compliance block, watch alert, and receipt/status.
- Add MCP/CLI coverage for Hyperliquid and Polymarket.
- Update the agent-control coverage matrix and customer evidence bundle.

## Phase 6: Hermes QA/Security Handoff

Owner: Hermes after Phases 1 through 5 land.

Acceptance:

- No seed/private/mnemonic/API-secret/passphrase/raw-signature leaks.
- No live Hyperliquid or Polymarket order can be submitted by default.
- Polymarket order previews are blocked when the geoblock check blocks the user.
- Bittensor remains non-custodial.
- All three venues are usable through chat, HTTP, MCP, and CLI for read/preview workflows.
