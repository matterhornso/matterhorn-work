# Matterhorn Desks Design System

**Status:** Production contract for the desk-first customer UI  
**Audience:** Codex, Kimi, Minimax, Claude Code, Stitch, and implementation reviewers  
**Source:** Matterhorn Desks production app, Minimax desk specs, memory specs, and customer beta screenshots

Matterhorn Desks is not a generic chat app and it is not a raw crypto dashboard. It is a desk-first workspace where a customer can use Bittensor, Hyperliquid, Polymarket, Longevity workflows, Memory, and Matterhorn MCPs through plain chat with visible safety boundaries.

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
- Keep dark-theme text crisp without flattening hierarchy: primary `#fafcff`, secondary `#d0dae5`, and muted metadata `#c4ceda`. Secondary and muted body copy must remain above WCAG AA on the app background; opacity modifiers are reserved for genuinely subordinate metadata.
- Light-theme secondary and muted text use `#41495a` and `#4c5566` respectively so supporting copy stays readable on the pale Matterhorn canvas.

### Desk Colors

| Desk | Token | Intent |
| --- | --- | --- |
| Bittensor | electric cyan / violet | TAO, subnets, validators, external-signer previews |
| Hyperliquid | blue / green | market data, account exposure, preview planning, wallet-approved orders |
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
- Right rails share the main workspace canvas. Use open sections and spacing; do not stack a card around every group.
- Rail content responds to its container width, not the global viewport. A 340-500px rail is a single-pane surface even on a wide desktop.
- Notes and other list/detail rails use explicit list -> detail -> back navigation at narrow widths.
- Machine payloads such as receipt JSON render as readable summaries first; raw data belongs behind disclosure.
- Cards: one card level only. Avoid cards inside cards.
- Operational card radius: 8-12px. Badges can be pill-shaped if small.
- Spacing: use 4px grid. Operational panels should prefer 16-24px padding.

## 4. Card Anatomy

### Composer Capability Controls

The composer control strip may show four independent concepts:

- **Mode:** Discuss, Plan, or Work; controls request capabilities.
- **Agent or Desk:** the actor and its domain tool/safety contract.
- **Perspective:** Cautious, Balanced, or Optimistic answer framing only.
- **Model:** the selected inference engine.

Mode uses a compact icon-and-label menu, not a fourth segmented control. Its
menu uses one surface, 8px radius or less, restrained contrast, and short
descriptions. Selected state is visible without oversized badges or persistent
explanatory copy. Disable mode changes while a response is active.

Plan exposes a subtle `Start work` action that keeps the same session and
context. Discuss and Plan do not advertise slash commands that they cannot
execute. The feature can be removed with
`VITE_MATTERHORN_EXECUTION_MODES=0`; when removed, Work remains the default.

Mode never changes the visual or functional meaning of Agent, Perspective, or
Model and never implies that wallet, billing, secret, transaction, or external
submission controls have been bypassed.

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

### Prediction markets

Standard actions:

- Cross-venue market discovery across Polymarket, Kalshi, and Manifold.
- Outcome probabilities.
- Venue, market-type, source, and freshness comparison.
- Polymarket liquidity/orderbook context.
- Polymarket compliance state.
- Preview only.
- External wallet/client handoff.
- Watches and receipts.

Kalshi and Manifold remain research-only in Matterhorn.

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
- Viewport breakpoints that force hidden second columns inside a narrow right rail.
- Runtime status copy that says `apps connected` when the source only proves MCP processes are active.
- A capability mode styled as response tone, an agent identity, or a global
  permission bypass.

## 8. Implementation Checklist

Before shipping a UI PR:

- Run app typecheck and UI contract tests.
- Verify dark and light theme.
- Inspect desktop, tablet, and mobile widths.
- Confirm right rail collapse behavior.
- Confirm no horizontal overflow.
- Confirm the composer does not overlap cards.
- Confirm Discuss and Plan hide command affordances, lock mode switching while
  busy, and preserve context when Plan hands off to Work.
- Confirm all protocol previews preserve non-custodial language.
- Confirm Wellness remains standalone and non-medical.
- Confirm Memory has no hidden save behavior.
