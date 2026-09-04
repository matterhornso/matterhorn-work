# Hyperliquid MCP

Use the Hyperliquid MCP when an agent needs market, orderbook, funding, exposure, watch, handoff, or receipt context.

## What It Does

- Reads market lists, funding, open interest, L2 orderbooks, accounts, positions, and open orders.
- Creates read-only market, funding, orderbook, and account watches.
- Builds non-submittable order previews and prepares exact connected-wallet handoffs.
- Verifies public receipts after the connected wallet acts.

## Tools

- `matterhorn_hyperliquid_chat`
- `matterhorn_hyperliquid_list_markets`
- `matterhorn_hyperliquid_get_account`
- `matterhorn_hyperliquid_get_positions`
- `matterhorn_hyperliquid_get_open_orders`
- `matterhorn_hyperliquid_get_funding`
- `matterhorn_hyperliquid_get_orderbook`
- `matterhorn_hyperliquid_create_watch`
- `matterhorn_hyperliquid_check_watches`
- `matterhorn_hyperliquid_watch_digest`
- `matterhorn_hyperliquid_act_on_watch_alert`
- `matterhorn_hyperliquid_preview_order`
- `matterhorn_hyperliquid_prepare_handoff`
- `matterhorn_hyperliquid_verify_receipt`

## Setup

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

After installing, restart the client and confirm `matterhorn_hyperliquid_chat`, `matterhorn_hyperliquid_get_orderbook`, or `matterhorn_hyperliquid_preview_order` appears.

## Safety Boundary

- The MCP and agent cannot approve, sign, relay, or submit an order.
- No custody, hidden signing, exchange API secret storage, raw signatures, or signed payloads.
- Supported actions continue only through a separate, exact connected-wallet ticket in the Matterhorn web app.
- Receipt tools are verification and evidence tools, not a submission path.

## Example Prompts

- Show BTC-PERP funding, open interest, and the current orderbook.
- Summarize exposure for this public account and flag liquidation-sensitive positions.
- Draft a BTC-PERP long and prepare its connected-wallet review without submitting anything.
