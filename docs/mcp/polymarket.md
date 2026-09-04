# Polymarket MCP

Use the Polymarket MCP when an agent needs market discovery, outcome context, compliance checks, liquidity, orderbooks, watches, handoffs, or receipt verification.

## What It Does

- Searches markets and events.
- Reads market details, outcome context, liquidity, and orderbooks.
- Runs compliance checks before any handoff is prepared.
- Creates read-only watches for probability, liquidity, and compliance changes.
- Builds compliance-gated connected-wallet handoffs and verifies public receipts.

## Tools

- `matterhorn_polymarket_chat`
- `matterhorn_polymarket_search_markets`
- `matterhorn_polymarket_search_events`
- `matterhorn_polymarket_get_market`
- `matterhorn_polymarket_get_orderbook`
- `matterhorn_polymarket_check_compliance`
- `matterhorn_polymarket_create_watch`
- `matterhorn_polymarket_check_watches`
- `matterhorn_polymarket_watch_digest`
- `matterhorn_polymarket_act_on_watch_alert`
- `matterhorn_polymarket_preview_order`
- `matterhorn_polymarket_prepare_handoff`
- `matterhorn_polymarket_verify_receipt`

## Setup

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

After installing, restart the client and confirm `matterhorn_polymarket_chat`, `matterhorn_polymarket_search_markets`, or `matterhorn_polymarket_check_compliance` appears.

## Safety Boundary

- The MCP and agent cannot approve, sign, relay, or submit an order.
- No hidden wallet connection, custody, signing, raw signature storage, or signed payload storage.
- Compliance-blocked flows must not expose executable price, size, or share fields.
- Supported buy, sell, and cancel actions continue only through a separate, exact connected-wallet ticket in the Matterhorn web app.
- Receipt checks are evidence tools, not a Matterhorn submission path.

## Example Prompts

- Search Polymarket for Bitcoin ETF markets and summarize liquidity.
- Check compliance for this market before preparing any handoff.
- Create a watch for probability changes and explain today's movement.
