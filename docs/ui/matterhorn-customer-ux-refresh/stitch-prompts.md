# Stitch AI Prompts — Matterhorn Customer UI

Use these prompts to guide Stitch AI agents through implementing the Matterhorn Work customer UI from the design spec.

---

## Prompt 1: Bootstrap Design System

```
You are building a React + TypeScript + Tailwind UI for Matterhorn Work, a Web3-native desktop workspace.

Set up the design system using the CSS custom properties defined in docs/ui/matterhorn-customer-ux-refresh/styles.css.

Key constraints:
- Dark theme only. Background: #0C0C0C. Accent: #D1F2FF.
- Font: use 'JetBrains Mono' for all numeric data, addresses, prices.
- Import the design tokens as CSS custom properties.
- Create a safety badge component (mh-badge) with four variants: live (green), restricted (amber), planned (blue), error (red).
- Never use hardcoded hex values in components — always use the CSS custom properties from :root.
- Do NOT import any OpenWork or OpenCode branding.
- Do NOT add "Submit Order" or "Confirm Trade" buttons anywhere.
```

---

## Prompt 2: Markets Browser Component

```
Implement a Markets Browser component matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 03.

Requirements:
- Two venue tabs: Hyperliquid (active) and Polymarket (shown with a blue "Planned" badge).
- Each market card shows: venue logo, symbol, price, 24h change, funding rate, open interest, and a safety badge.
- Green badge for Hyperliquid ("External Signer Live"), blue badge for Polymarket ("Planned — Not Live").
- "Preview →" button on each card — generates a preview, does NOT submit.
- NO "Submit" or "Confirm Trade" buttons.
- Filter chips: All Markets, Favorites, Perpetuals, Spot.
- Use font-mono for all numeric data.
- Polymarket cards should be visually distinct (e.g., dashed border or muted) since it's planned.
```

---

## Prompt 3: Order Preview Panel Component

```
Implement the Order Preview panel matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 05.

Requirements:
- Header: "Order Preview" with a warning icon and "canSubmit: false" badge.
- Show order terms: side, size, price, order type, preview SHA256, estimated total.
- Show a "Risk Context" box with: notional, est. slippage, est. fill price, funding/day, est. leverage, est. liquidation price, max leverage, depth sufficient.
- Show a warning callout with the consequence statement: "Matterhorn will not sign, submit, or broadcast this order."
- Show ONE call-to-action button: "View External Signer Handoff →" (green button).
- Show a green disclaimer in the footer: "Matterhorn does not sign, submit, or hold keys. You execute using your own wallet."
- NEVER show a "Submit" or "Confirm Trade" button.
```

---

## Prompt 4: External Signer Handoff Component

```
Implement the External Signer Handoff component matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 06.

Requirements:
- Header: "External Signer Handoff" with a shield/lock icon and green "External Signer Live" badge.
- Safety banner explaining the user signs and Matterhorn never receives the signature.
- "Order Terms (public)" section: asset, venue, side, size, price, order type, chain, signer address.
- "Signing Payload Template" section showing the unsigned order action object. Highlight in AMBER any field that requires client/wallet computation (connectionId, nonce, signature). Label them "requiresClientCompute".
- Show Preview SHA256 and Handoff SHA256 in monospace.
- Show expiry countdown (30 minutes, in amber).
- Two buttons: "Sign with your wallet →" (green) and "Copy Handoff" (secondary).
- "How external signing works" info callout.
- Green non-custodial disclaimer in footer.
- NO field to paste a signature — receipt import is a separate step.
```

---

## Prompt 5: Workflow Builder with Safety Badges

```
Implement a visual Workflow Builder matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 09.

Requirements:
- Each workflow node shows: icon, label, sublabel, and a safety badge.
- Node types with safety states:
  - Trigger (blue badge)
  - Market Select (no badge)
  - Preview (accent/dim badge + "canSubmit: false")
  - Handoff (green badge + "External Signer Live")
  - Receipt (no badge)
  - Notification (blue badge)
- Connectors between nodes (vertical lines).
- Active node highlighted with accent border.
- Workflow properties panel showing: trigger, market, chain, and safety mode.
- "Simulation Mode" blue badge in the header.
- "Preview Workflow ▶" button.
- NO path that submits directly — all execution goes through preview → handoff.
```

---

## Prompt 6: Safety Badge Component Library

```
Create a reusable SafetyBadge component for Matterhorn Work.

Variants:
- live: green background (#22C55E), white text. Shows a 6px green dot.
- restricted: amber background (#F59E0B), dark text. Shows amber dot.
- planned: blue background (#3B82F6), white text. Shows blue dot.
- error: red background (#EF4444), white text. Shows red dot.
- review: amber background, "No Order ID" or similar label.

Accessibility: every badge must have an aria-label describing the safety state.

Usage examples:
- Hyperliquid market card: "External Signer Live"
- Polymarket market card: "Planned — Not Live"
- Compliance blocked: "Compliance Blocked"
- Receipt verified: "Verified"
- Receipt review needed: "No Order ID — Review Needed"
- Order preview: "canSubmit: false"
```

---

## Prompt 7: Portfolio Table with Safety States

```
Implement the Portfolio / Positions table matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 07.

Requirements:
- Table columns: Market, Side, Size, Entry Price, Mark Price, Notional, PnL (USD), PnL (%), Safety, Actions.
- Color coding: green for positive PnL, red for negative. Monospace for all numeric data.
- Safety badge per position: green "Live" for Hyperliquid, blue "Planned" for Polymarket.
- "Close ↗" action button per row (ghost button — opens a preview workflow, NOT direct submit).
- Footer disclaimer: "Portfolio data is read from public blockchain data. All close/reduce actions require external signing."
- Header badge: "Read-Only · External Signer Only" in blue.
- NO "Submit Trade" or "Execute" buttons.
```

---

## Prompt 8: Market Safety Explainer Screen

```
Implement the Market Safety Explainer screen matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 14.

Requirements:
- Visual architecture diagram showing the non-custodial flow:
  Matterhorn → Public Order Terms (no keys) → Your Wallet / Hyperliquid SDK → Public Receipt Import
- FAQ accordion with 5 questions:
  1. Does Matterhorn hold my private keys? → No, never.
  2. What does Matterhorn see? → Only public order terms and public receipts.
  3. Can Matterhorn submit orders? → No, every order must be signed by you.
  4. What about restricted jurisdictions? → Polymarket blocked with amber state.
  5. What is the external signer model? → You are the sole signer; canSubmit is always false.
- Language: precise and technical. "you are the sole signer", "Matterhorn never holds keys".
- NO custody messaging like "your funds are safe with Matterhorn".
```

---

## Prompt 9: Artifacts / Evidence Panel

```
Implement the Artifacts / Evidence Panel matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 15.

Requirements:
- List of execution artifacts for the current session:
  - Receipts (green "Verified" badge)
  - Handoffs (green "Pending" badge, with "Import Receipt" button)
  - Previews (blue "canSubmit: false" badge)
  - Compliance blocks (amber "Restricted" badge)
  - Review-needed receipts (amber "No Order ID" badge)
- Each artifact shows: type, market, timestamp, status badge, action buttons.
- Action buttons: View, Download, Copy SHA, Import Receipt.
- "Export Evidence Log" button exports all artifacts to a local JSON file.
- NO signature paste fields anywhere in this panel.
```

---

## Prompt 10: Settings Pages — Safety Mode

```
Implement Settings: Markets page matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 11.

Requirements:
- Safety Mode selector with three options:
  - Read-Only (Preview Only)
  - External Signer Handoff
  - Compliance Locked
- Per-venue integration status:
  - Hyperliquid: green "Live" badge ("Read-only via Hyperliquid info API. No exchange API key needed.")
  - Polymarket: blue "Planned" badge ("Coming soon.")
- Other settings: Default Chain, Slippage Tolerance, Receipt Import toggle.
- "No credentials stored" info callout prominently displayed.
- NO API key input fields.
- NO "enable live trading" toggles.
```


---

## Prompt 11: Bittensor Desk

```
Implement the Bittensor Desk matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 17.

Requirements:
- Dedicated desk header: "Bittensor Desk", venue badge, chain badge, wallet avatar.
- ALWAYS VISIBLE safety strip: "Can Submit: No · Live Submission: Off · External Signer: Ready"
  (this strip must never be hidden or collapsed).
- Market tabs: TAO/SOL, TAO/USDC, Subnet Register, Delegate Stake.
- Bittensor has NO ORDERBOOK — show subnet emission data and wallet balances instead.
- Market cards show: price, 24h change, market cap, subnet number, circulating supply.
- Wallet Snapshot card shows TAO, SOL, USDC balances and external signer address.
- "Preview Order" button — previews the action, does NOT submit.
- Subnet Register card shows validator slot cost, registration preview.
- Delegate Stake card shows: currently delegated amount, daily emission, delegate address.
  "Preview Redelegate" button — previews redelegation, does NOT submit.
- All action buttons are "Preview" only. NO submit, NO stake transaction UI.
- Brand: Matterhorn logo only. No OpenWork/OpenCode copy.
```

---

## Prompt 12: Hyperliquid Desk (Extended)

```
Implement the Hyperliquid Desk matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 18.

Requirements:
- ALWAYS VISIBLE safety strip: "Can Submit: No · Live Submission: Off · External Signer: Ready"
- Market tabs: BTC-PERP, ETH-PERP, SOL-PERP, All Markets →.
- Per market: price, 24h change, OI, funding rate, est. liquidation price.
- Read-only orderbook: bid/ask depth bars (green bids, red asks). Spread and mid price shown.
  The orderbook is NOT clickable — no order placement affordance.
- Action Preview card: shows terms, green "External Signer Live" badge, risk estimates.
  ONE CTA: "View External Signer Handoff →" (green button).
- Compliance Block card (amber): shown when jurisdiction restricted. Shows amber badge, reason,
  "View Safety Explainer →" button. Replaces the action preview card when active.
- Both cards shown together to illustrate the card system.
- No submit, confirm, or execute buttons anywhere.
- Hyperliquid is for perpetuals only (no spot). Spot prices shown as reference data.
- Brand: Matterhorn logo only.
```

---

## Prompt 13: Polymarket Desk

```
Implement the Polymarket Desk matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 19.

Requirements:
- ALWAYS VISIBLE safety strip: "Can Submit: No · Live Submission: Off · External Signer: Ready"
- Category filter chips: Trending, Crypto, Politics, Tech, All.
- Market card shows the question verbatim (exact wording from Polymarket API — no paraphrasing).
- Binary YES/NO displayed as price bars: green bar for YES price, red bar for NO price.
  Bar width proportional to the probability.
- YES price and NO price shown in monospace font. Percentage label shown next to each bar.
- Below bars: volume, total liquidity, resolution date.
- TWO "Preview" buttons: "Preview 'Yes' Position" and "Preview 'No' Position" (side by side).
  "Position" = preview of buying shares. NOT a direct trade execution.
- No fractional share previews — show integer share counts.
- Blue "Planned — Not Live" badge on each market card.
- No submit, no trade confirmation.
- Brand: Matterhorn logo only. No OpenWork/OpenCode copy.
```

---

## Prompt 14: Wellness Desk

```
Implement the Wellness Desk matching docs/ui/matterhorn-customer-ux-refresh/index.html Screen 20.

Requirements:
- No market execution safety strip — the wellness desk does not conduct market execution.
- Streak counter: large mono number (40px, accent color), "day streak" label.
- Today's Goals section:
  - Each goal row: checkbox (○ pending / ◉ complete), goal name, status label.
  - Complete goals shown with green check + "✓ complete" label.
  - Pending goals shown with empty circle + "not done" label in muted color.
- Weekly overview: 7-day grid (Mon–Sun). Each day: circle with checkmark (green fill) for complete,
  empty circle for pending/missed.
- Wellness Artifact card (blue left border): shows period, goals completed count, SHA-256 hash,
  signer address, export timestamp. "Download" and "Add to Evidence Log" buttons.
- "+ New Goal" primary button, "Workflow Builder →" ghost button linking to the workflow builder.
- Goals can be automated via the workflow builder (e.g., reminder triggers, not market execution).
- Brand: Matterhorn logo only. No OpenWork/OpenCode copy.
```

---

## Prompt 15: Shared Transcript — Card System

```
Implement the shared card components matching docs/ui/matterhorn-product-ui-system.md §11.

Seven card types must be consistent across all desks (Bittensor, Hyperliquid, Polymarket, Wellness):

1. WalletSnapshotCard
   States: live (green dot), stale (amber border, "Refresh" link), disconnected (red border, "Connect Wallet" CTA).
   Always shows truncated wallet address in monospace.

2. OrderbookContextCard (Hyperliquid only)
   Read-only bid/ask depth bars. Spread and mid price. NOT clickable.

3. ComplianceBlockCard
   Amber badge, reason text, "View Safety Explainer →" button.
   Replaces ActionPreviewCard when jurisdiction restricted.

4. ActionPreviewCard
   Shows terms, green "External Signer Live" badge, risk estimates.
   ONE CTA: "View External Signer Handoff →" (green button).
   NEVER contains submit/confirm/execute buttons.

5. ExternalSignerHandoffCard
   Public order terms, Preview SHA256, Handoff SHA256, expiry countdown (30 min).
   "Sign with your wallet →" (green) and "Copy Handoff" (secondary).
   Footer: "Matterhorn never receives your signature."

6. ReceiptStatusCard
   States: verified (green), review-needed (amber), rejected (red).
   Shows order ID, market, side, size, hash matches (✓).

7. WellnessArtifactCard (Wellness desk only)
   Blue accent border, SHA-256 hash, signer address, export timestamp.
   "Download" and "Add to Evidence Log" buttons.

All cards: use CSS custom properties, font-mono for data, no hardcoded hex values.
Brand: Matterhorn logo only.
```

---

## Prompt 16: Empty / Loading / Degraded / Error States

```
Implement the empty, loading, degraded, and error state components matching
docs/ui/matterhorn-product-ui-system.md §12.

1. Empty State (mh-empty-state):
   - Centered 48px monochrome icon (circle with line — "no data" symbol).
   - Heading in weight 500.
   - Subtext in secondary color, line-height 1.6.
   - Optional CTA button in secondary style.
   - NO illustrations or decorative imagery.

2. Loading State (mh-skeleton):
   - A div with class mh-skeleton: background var(--mh-bg-elevated), border-radius 4px.
   - Animation: skeleton-pulse, 1.5s ease-in-out infinite, opacity 0.5 → 1.0.
   - Used to replace market cards, table rows, and content panels during loading.
   - NO spinner or loading text in main content area.

3. Degraded State:
   - Amber left border (3px solid var(--mh-amber)) on the affected card.
   - Thin amber banner at the top of the card: "⚠ Some data is unavailable".
   - Stale data shown in amber text with a timestamp of when it was last updated.
   - "Refresh" link available on stale rows.
   - UI remains fully interactive for non-degraded content.

4. Error State:
   - Full-panel card, centered layout.
   - Warning triangle icon (amber) — 48px circle with amber background rgba(239,68,68,0.1).
   - Heading in weight 600.
   - Body: "Check your connection and try again." + optional status page link.
   - "Try Again" button in secondary style.
   - NO stack traces, no technical error messages.
   - For wallet disconnection: "Wallet disconnected" heading + "Reconnect Wallet" button.

Design tokens: all colors via CSS custom properties. Brand: Matterhorn logo only.
```

---

## Prompt 17: Responsive Layout — Mobile / Tablet

```
Implement responsive layout variants matching docs/ui/matterhorn-product-ui-system.md §13.

Mobile (< 640px):
- Top bar: hamburger menu, desk name, wallet avatar.
- Safety strip always visible (sticky, condensed: "Can: No · Live: Off").
- Market card grid: single column, full width.
- Context panel: slides up from bottom as a sheet (80vh, draggable handle).
  No swipe-to-dismiss on safety-critical panels (action preview, handoff).
- Portfolio table: horizontal scroll with sticky first column.
- Bottom tab bar: 4 icons — Markets, Home, Activity, Settings. Min 44×44px touch targets.
- Font sizes scale down 1 step (--text-base → 14px, --text-sm → 12px).
- No hover states — all interactions are tap.

Tablet (640px – 1199px):
- Sidebar collapses to icon rail (64px wide).
- Context panel becomes a 380px slide-over from the right.
- Main content: 2-column market card grid.
- Top bar shows: hamburger, desk name, safety badge, wallet avatar.

Desktop (≥ 1200px):
- Sidebar 240px, main content fills remaining, context panel 380px.
- CSS Grid for main layout shell.
- Context panel: position sticky on desktop, position fixed on mobile/tablet.

Design tokens: all via CSS custom properties. Brand: Matterhorn logo only.
```
