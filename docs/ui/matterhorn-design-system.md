# Matterhorn Work Design System

**Status:** Production contract for the desk-first customer UI  
**Audience:** Codex, Kimi, Minimax, Claude Code, Stitch, and implementation reviewers  
**Source:** Matterhorn Work production app, Minimax desk specs, memory specs, and customer beta screenshots

Matterhorn Work is not a generic chat app and it is not a raw crypto dashboard. It is a desk-first workspace where a customer can use Bittensor, Hyperliquid, Polymarket, Longevity workflows, Memory, and Matterhorn MCPs through plain chat with visible safety boundaries.

## 1. Navigation Model

The primary customer model is **desks**:

1. **Home:** start a session, open a desk, or choose a workflow.
2. **Bittensor:** TAO wallet, subnets, validators, unsigned previews, watches, receipts.
3. **Hyperliquid:** account/orderbook reads, funding, open orders, preview handoffs, watches, receipts.
4. **Polymarket:** market discovery, outcomes, liquidity, compliance, preview handoffs, watches, receipts.
5. **Longevity:** trainer, yoga, dietician, and service-creator workflows. Standalone and non-medical.
6. **Memory:** suggestion inbox, memories, provenance, privacy, watchlists, receipts.
7. **MCPs:** Matterhorn MCP setup and tools for Codex, Claude Code, Claude Desktop, Cursor, and compatible clients.
8. **Settings:** account, profile, appearance, privacy, connectors, developer/advanced surfaces.

Customer-facing navigation must not expose **Services** as a primary destination. Future decentralized service hooks can live in developer/advanced planning or workflow docs until live provider execution exists.

## 2. Themes And Tokens

### Brand Anchors

- Ink: `#0C0C0C`
- Matterhorn blue: `#D1F2FF`
- Logo: Matterhorn mark only, never OpenWork assets.
- Font: Aeonik-style sans stack, falling back to IBM Plex Sans, Geist, Avenir Next, Inter, and system sans.

### Theme Requirements

- Support light and dark themes.
- Use Matterhorn blue for primary affordances and selected state, not every surface.
- Use semantic status colors for pass, warning, blocked, degraded, and preview-only states.
- Use desk accents sparingly: headers, badges, focus outlines, icon wells, and chart accents.

### Desk Colors

| Desk | Token | Intent |
| --- | --- | --- |
| Bittensor | electric cyan / violet | TAO, subnets, validators, external-signer previews |
| Hyperliquid | blue / green | market data, account exposure, preview-only trade planning |
| Polymarket | purple / amber | market outcomes, compliance, preview-only prediction planning |
| Longevity | coral / mint | human service workflows, educational client artifacts |
| Memory | gold / slate | remembered context, provenance, confidence, privacy |

## 3. Layout System

- Desktop: workspace sidebar + main desk + optional right rail.
- Tablet: sidebar can collapse; right rail becomes drawer or hides behind explicit controls.
- Mobile/narrow: one column. No right-edge overflow. No horizontal scrolling.
- No horizontal overflow.
- Composer: bottom anchored inside the main desk column, never covering panel content.
- Right rail: optional contextual tools, never a permanent trap. It should collapse before the main desk becomes unusable.
- Cards: one card level only. Avoid cards inside cards.
- Operational card radius: 8-12px. Badges can be pill-shaped if small.
- Spacing: use 4px grid. Operational panels should prefer 16-24px padding.

## 4. Card Anatomy

Every important card should answer:

- **What is this?** clear title and desk label.
- **Why am I seeing it?** source, trigger, or user prompt context.
- **Can it act?** `Can submit`, `Live submission`, signer/client requirement.
- **How fresh is it?** source, block/time/freshness where available.
- **What can I do next?** one primary action and safe secondary actions.

Memory suggestion cards additionally show lifecycle state: `new`, `edited`, `confirmed`, `dismissed`, `expired`, or `blocked`, plus why suggested, source, sensitivity, confidence, confirm/edit/dismiss. No hidden memory saves.

## 5. Safety Strip

Safety strips are mandatory on protocol action surfaces and preview cards.

Required fields:

- Status, such as `Beta-ready`, `Preview only`, `Read/preview + external signer`, `Blocked`, or `Degraded`.
- Data source and freshness.
- `Can submit`.
- `Live submission`.
- Signer/client/custody statement.
- Missing context when the action cannot be prepared safely.

Required language:

- Hyperliquid/Polymarket previews: `Can submit: No`, `Live submission: Off`, `External signer/client required`.
- Bittensor actions: external Bittensor-compatible signer required for stake, unstake, transfer, register, serve, and related extrinsics.
- Matterhorn never asks for, stores, logs, or transmits seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, or wallet exports.

## 6. Desk-Specific Requirements

### Bittensor

Standard actions:

- Show TAO balance.
- Read wallet and stake positions.
- Discover subnets by goal.
- Compare subnets.
- Compare validators.
- Prepare stake preview.
- Prepare unstake preview.
- Prepare transfer preview.
- Create watches and alerts.
- Explain coldkey, hotkey, SS58, subnet, validator hotkey, alpha, slippage, and external signing.
- Import receipts and evidence.

Copy must stay SS58/coldkey/hotkey-aware and beginner-readable.

### Hyperliquid

Standard actions:

- Account exposure.
- Market and orderbook reads.
- Funding context.
- Open-order context.
- Preview only.
- External signer/client handoff.
- Watches and receipts.

No live order submission in the customer UI. No API secret, private key, or raw signature fields.

### Polymarket

Standard actions:

- Market discovery.
- Outcome probabilities.
- Liquidity/orderbook context.
- Compliance state.
- Preview only.
- External wallet/client handoff.
- Watches and receipts.

Compliance-blocked previews must not expose executable price, size, or share fields.

### Wellness

Standard workflows:

- Service offer.
- Onboarding questionnaire.
- Weekly program plan.
- Progress check-in.
- Renewal/follow-up note.
- Client handoff packet.

Wellness is not Web3 and not medical care. It must not diagnose, prescribe, claim treatment, guarantee outcomes, or claim live payment/email/hosting/token-gating.

### MCPs

MCP cards show:

- Matterhorn MCP name.
- Install command.
- Supported tools.
- Works in Codex, Claude Code, Claude Desktop, Cursor, and compatible MCP clients.
- Safety boundary.

## 7. Forbidden UI Patterns

- Generic `Crypto workspace` as the main user model.
- Customer-facing `Services` primary nav.
- Customer-facing `Computer Use` default task.
- Unexplained `OpenWork` or `OpenCode` copy.
- Hidden submit, hidden signing, or language implying custody.
- Secret-taking fields or examples.
- Nested cards, decorative glass, huge rounded cards, pill overload, gradient-orb backgrounds.
- Horizontal overflow, right rail trapping, bottom composer overlap, clipped buttons, clipped cards, and nested scrolling inside cards.

## 8. Implementation Checklist

Before shipping a UI PR:

- Run app typecheck and UI contract tests.
- Verify dark and light theme.
- Inspect desktop, tablet, and mobile widths.
- Confirm right rail collapse behavior.
- Confirm no horizontal overflow.
- Confirm the composer does not overlap cards.
- Confirm all protocol previews preserve non-custodial language.
- Confirm Wellness remains standalone and non-medical.
- Confirm Memory has no hidden save behavior.
