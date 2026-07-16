# Matterhorn Work Design Contract

Matterhorn Work is a desk-first app for doing useful work through chat. The customer sees desks, not internal categories: Home, Bittensor, Hyperliquid, Polymarket, Longevity, Memory, MCPs, and Settings.

This file mirrors the durable product rules in [docs/ui/matterhorn-design-system.md](docs/ui/matterhorn-design-system.md). Keep both files aligned when changing the shell or protocol desks.

## Product Shape

- **Home** is the launcher. It creates a session, opens a desk, or starts a workflow with an editable prompt. It never auto-sends.
- **Bittensor** supports public SS58 wallet reads, subnet discovery, validator comparison, unsigned staking/unstaking/transfer previews, watches, receipt import, and coldkey/hotkey explanations. Live chain submission remains outside Matterhorn Work.
- **Hyperliquid** supports account/orderbook/funding/open-order reads, watches, previews, receipt evidence, and manual connected-wallet execution in its dedicated trade ticket. Chat, MCP, CLI, and watches never auto-submit. Every order uses explicit review, a short-lived one-time intent, connected-wallet signing, and the deployment kill switch; testnet is the default and mainnet requires an additional typed confirmation.
- **Polymarket** is preview-only. It supports market discovery, outcome probability context, liquidity/orderbook reads, compliance state, watches, preview handoffs, and receipt evidence. Compliance-blocked previews must not show executable price, size, or share fields.
- **Longevity** is standalone. It is not Web3, not a market desk, and not medical care. It creates safe offline optimization workflows and client artifacts without diagnosis, prescription, treatment claims, guaranteed outcomes, live payment, live email, live hosting, or token-gating claims.
- **Memory** is visible and user-controlled. No hidden saves. Every suggestion shows why suggested, source, sensitivity, confidence, and confirm/edit/dismiss controls.
- **MCPs** explains how to use Matterhorn Work tools outside the app in Codex, Claude Code, Claude Desktop, Cursor, and compatible MCP clients.

## Visual System

- Brand anchors: `#0C0C0C`, `#D1F2FF`, Matterhorn logo, Aeonik-style sans fallback.
- Use light and dark themes. Do not make either theme a one-note black/cyan page.
- Desk colors are accents, not full-page floods:
  - Bittensor: electric cyan and violet.
  - Hyperliquid: blue and green.
  - Polymarket: purple and amber.
  - Longevity: coral and mint.
  - Memory: gold and slate.
- App radii: 8-12px for cards and controls. Avoid giant pill cards except small badges.
- Page sections are not nested cards. Use cards only for repeatable items, previews, receipts, memory suggestions, and focused tool panels.
- Keep typography compact in operational surfaces. Large type belongs on first-run welcome only.

## Interaction Rules

- The composer is always visible but never overlaps card content.
- The right rail is optional. On narrower layouts it collapses before it traps the main desk.
- Back to chat, Home, Profile, and Settings must be discoverable.
- Every serious action uses preview -> explicit review -> external signer or connected-wallet approval. Matterhorn never hides signing or signs on behalf of users. It may relay only the exact Hyperliquid intent the connected wallet approved; other write paths remain external handoffs.
- Empty, loading, degraded-provider, and no-wallet states must explain what still works and what to try next.
- Stable launch navigation includes only production-approved surfaces. Generated-media publishing, billing, and Matterhorn Cloud stay hidden unless their explicit build flags are enabled.

## Forbidden Patterns

- Customer-facing `Crypto workspace`, `Services`, `Computer Use`, `OpenWork`, or unexplained `OpenCode` copy.
- Seed phrase, private key, mnemonic, raw signature, signed payload, wallet export, API secret, or exchange secret fields.
- Agent-initiated or unreviewed Hyperliquid submission, any Polymarket live submission, or hidden signing claims.
- Trapped right rails, horizontal overflow, nested scrolling inside cards, bottom composer overlap, text clipped inside buttons, and cards inside cards.
