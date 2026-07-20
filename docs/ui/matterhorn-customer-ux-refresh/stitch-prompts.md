# Stitch AI Prompts — Matterhorn Customer UI

Use these prompts to guide Stitch AI agents through implementing the Matterhorn Desks customer UI from the design spec.

---

## Prompt 1: Bootstrap Design System

```
You are building a React + TypeScript + Tailwind UI for Matterhorn Desks, a Web3-native desktop workspace.

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
Create a reusable SafetyBadge component for Matterhorn Desks.

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
