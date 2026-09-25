---
name: Matterhorn
description: A focused, desk-first workspace for chat and reviewed tools.
colors:
  brand-ice: "#D1F2FF"
  brand-ink: "#0C0C0C"
  light-canvas: "#f6f9ff"
  dark-canvas: "#05070b"
typography:
  body:
    fontFamily: "Aeonik, Geist Variable, sans-serif"
    fontSize: "14px"
    lineHeight: "20px"
rounded:
  control: "8px"
spacing:
  compact: "8px"
  control: "12px"
  section: "24px"
---

# Matterhorn Desks Design Contract

Matterhorn is a desk-first app for doing useful work through chat. The primary desks are Private AI, Bittensor, Hyperliquid, Polymarket, and Sui. Memory, notes, wallet and integrations are workspace tools. Capability descriptions below are not deployment-readiness evidence.

Longevity is standalone and outside the primary crypto experience.

This file mirrors the durable product rules in [docs/ui/matterhorn-design-system.md](docs/ui/matterhorn-design-system.md). Keep both files aligned when changing the shell or protocol desks.

## Product Shape

- **Home** is the launcher. It creates a session, opens a desk, or starts a workflow with an editable prompt. It never auto-sends.
- **Bittensor** supports public SS58 wallet reads, subnet discovery, validator comparison, watches, receipt import, and coldkey/hotkey explanations. TAO transfers, staking, and unstaking move from an agent-prepared draft into a separate Finney transaction ticket, where an installed Bittensor-compatible extension reviews, signs, and broadcasts the exact call. Delegation and advanced runtime calls remain unavailable until each adapter and review contract is audited.
- **Hyperliquid** supports account/orderbook/funding/open-order reads, watches, previews, receipt evidence, and manual connected-wallet execution in its dedicated trade ticket. Chat, MCP, CLI, and watches never auto-submit. Every order uses explicit review, a short-lived one-time intent, connected-wallet signing, and the deployment kill switch; testnet is the default and mainnet requires an additional typed confirmation.
- **Polymarket** supports market discovery, outcome probability context, liquidity/orderbook reads, compliance state, watches, reviewed buy and sell orders, cancellation, and receipt evidence. A complete, compliance-allowed EOA order continues in a separate Polygon wallet ticket for exact review and wallet-authorized submission. Proxy accounts, watch-triggered orders, and unattended execution are unsupported. Compliance-blocked previews must not show executable price, size, or share fields.
- **Longevity** is standalone. It is not Web3, not a market desk, and not medical care. It creates safe offline optimization workflows and client artifacts without diagnosis, prescription, treatment claims, guaranteed outcomes, live payment, live email, live hosting, or token-gating claims.
- **Memory** is visible and user-controlled. No hidden saves. Every suggestion shows why suggested, source, sensitivity, confidence, and confirm/edit/dismiss controls.
- **MCPs** explains how to use Matterhorn Desks tools outside the app in Codex, Claude Code, Claude Desktop, Cursor, and compatible MCP clients.

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

## Layout

The staged minimal layout is enabled only by `VITE_MATTERHORN_MINIMAL_UI=1`. The default remains the existing layout during validation. Both use the same routes, persisted chats, model selections and draft stores.

- One left navigation column with workspace, New chat, five desks, recent chats and Settings.
- Header: conversation or launcher title, model, Workspace tools. No permanent right rail in the minimal layout.
- Below 768px, navigation is a labelled drawer. Contextual tools are full-screen below 1024px, a sheet up to 1279px, and a docked pane from 1280px. Only one contextual tool opens at a time.
- Launcher uses open, divided rows. Secondary project information is collapsed. Chat suggestions fill drafts, never send.
- Models use a searchable list with a provider filter, pending/error feedback and server-persisted selection.
- Existing semantic `dls` tokens and theme preferences remain authoritative. No new palette or decorative motion was introduced.

## Interaction Rules

- The composer is always visible but never overlaps card content.
- The legacy right rail remains in the default-off layout; the minimal layout replaces it with Workspace tools.
- Back to chat, Home, Profile, and Settings must be discoverable.
- Every serious action uses agent draft -> separate exact review -> connected-wallet approval -> public receipt. Matterhorn never hides signing or signs on behalf of users. The current reviewed wallet paths are Hyperliquid place/cancel/modify/close actions, compliance-allowed Polymarket buy/sell/cancel actions, Bittensor TAO transfer/stake/unstake actions, and Sui coin/object/batch transfers. Advanced protocol calls stay unavailable until they receive their own audited adapter and review contract.
- Empty, loading, degraded-provider, and no-wallet states must explain what still works and what to try next.
- Stable launch navigation includes only production-approved surfaces. Generated-media publishing, billing, and Matterhorn Cloud stay hidden unless their explicit build flags are enabled.

## Forbidden Patterns

- Customer-facing `Crypto workspace`, `Services`, `Computer Use`, `OpenWork`, or unexplained `OpenCode` copy.
- Seed phrase, private key, mnemonic, raw signature, signed payload, wallet export, API secret, or exchange secret fields.
- Agent-initiated, watch-triggered, unattended, or unreviewed submission; Polymarket submission without an explicit allowed compliance result; unsupported Bittensor write submission; or hidden signing claims.
- Trapped right rails, horizontal overflow, nested scrolling inside cards, bottom composer overlap, text clipped inside buttons, and cards inside cards.
