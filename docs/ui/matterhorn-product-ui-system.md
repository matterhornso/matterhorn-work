# Matterhorn Work — Product UI System

> **Current implementation note (2026-07-11):** Use [Matterhorn design system](matterhorn-design-system.md) and [Product surfaces](../product-surfaces.md) as the current source of truth. This broader system document remains useful for product rationale and historical design decisions.

**Spec version:** 1.0
**Audience:** Design engineers, frontend implementers, agent prompts
**Scope:** All customer-facing UI in the Matterhorn Work app (market browsing, workflow execution, portfolio tracking, settings)
**Brand:** Matterhorn Work — Web3-native desktop workspace

---

## 1. Design Language

### 1.1 Aesthetic Direction

**Aeonik-inspired premium dark workspace.** Clean, focused, technical — built for power users who live in the app all day. Not a marketing site; a professional tool. Generous whitespace, crisp typography, restrained color. Every element earns its place.

The visual language borrows from Aeonik's geometric clarity and the precision of developer tooling. Monospaced accents for data, proportional text for prose, subtle depth through layered surfaces rather than shadows.

### 1.2 Color Palette

All values are CSS custom properties defined on `:root` and scoped per-theme.

#### Brand Colors

| Token | Hex | Use |
|---|---|---|
| `--mh-bg-base` | `#0C0C0C` | Page background |
| `--mh-bg-surface` | `#141414` | Card / panel background |
| `--mh-bg-elevated` | `#1E1E1E` | Hover states, dropdowns, tooltips |
| `--mh-bg-overlay` | `#252525` | Modal backgrounds |
| `--mh-border` | `#2A2A2A` | Default border |
| `--mh-border-subtle` | `#1F1F1F` | Subtle dividers |
| `--mh-text-primary` | `#F0F0F0` | Primary text |
| `--mh-text-secondary` | `#8A8A8A` | Secondary / muted text |
| `--mh-text-tertiary` | `#5C5C5C` | Placeholder, disabled |
| `--mh-accent` | `#D1F2FF` | Primary accent — interactive elements, focus rings, links |
| `--mh-accent-dim` | `rgba(209,242,255,0.10)` | Accent fill backgrounds |
| `--mh-accent-hover` | `rgba(209,242,255,0.15)` | Accent hover state |

#### Safety / Status Colors

| Token | Hex | Semantic | Use |
|---|---|---|---|
| `--mh-green` | `#22C55E` | External signer live | Borders, badges, live indicators |
| `--mh-green-dim` | `rgba(34,197,94,0.12)` | Green fill backgrounds | |
| `--mh-amber` | `#F59E0B` | Compliance / restricted | Warning badges, blocked states |
| `--mh-amber-dim` | `rgba(245,158,11,0.12)` | Amber fill backgrounds | |
| `--mh-blue` | `#3B82F6` | Planned / not live | "Coming soon" badges, planned indicators |
| `--mh-blue-dim` | `rgba(59,130,246,0.12)` | Blue fill backgrounds | |
| `--mh-red` | `#EF4444` | Error / rejection | Error messages, invalid states |
| `--mh-red-dim` | `rgba(239,68,68,0.12)` | Red fill backgrounds | |

#### Data / Market Colors

| Token | Hex | Use |
|---|---|---|
| `--mh-long` | `#22C55E` | Buy / long positions |
| `--mh-short` | `#EF4444` | Sell / short positions |
| `--mh-neutral` | `#8A8A8A` | Neutral / closed positions |

### 1.3 Typography

**Primary font:** Aeonik (self-hosted or Google Fonts fallback to `system-ui`). Geometric, clean, excellent legibility at small sizes.

**Monospace:** JetBrains Mono — used for all numeric data, addresses, hashes, prices, quantities, contract values.

**Type Scale:**

| Class | Size | Weight | Use |
|---|---|---|---|
| `--text-xs` | 11px | 400 | Timestamps, tertiary labels |
| `--text-sm` | 13px | 400 | Secondary text, table cells, metadata |
| `--text-base` | 15px | 400 | Body text, default |
| `--text-lg` | 17px | 500 | Section labels, card titles |
| `--text-xl` | 20px | 600 | Page headings |
| `--text-2xl` | 24px | 700 | Hero numbers, portfolio totals |
| `--text-3xl` | 32px | 700 | Screen headers |

**Font stacks:**
```css
--font-sans: 'Aeonik', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

### 1.4 Spacing System

8px base grid. Spacing tokens: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`.

### 1.5 Motion Philosophy

- **Entrance:** 200ms ease-out opacity + 8px translate-Y. Never janky or distracting.
- **State transitions:** 150ms ease for color, border, background changes.
- **Panels / drawers:** 250ms cubic-bezier(0.32, 0.72, 0, 1) slide-in from right.
- **Loaders:** Subtle pulse animation on skeleton loaders, not spinners.
- **Safety badges:** No animation — they must feel authoritative, not playful.

---

## 2. Core Components

### 2.1 Safety Badge

Four variants, matching the four execution states:

| Variant | Color | Label examples |
|---|---|---|
| `live` | Green / `#22C55E` | "External Signer Live", "Non-Custodial" |
| `restricted` | Amber / `#F59E0B` | "Compliance Blocked", "Jurisdiction Restricted" |
| `planned` | Blue / `#3B82F6` | "Planned — Not Live", "Coming Soon" |
| `error` | Red / `#EF4444` | "Receipt Rejected", "Signature Rejected" |

```html
<!-- Variant: live -->
<span class="mh-badge mh-badge--live">
  <span class="mh-badge__dot"></span>
  External Signer Live
</span>

<!-- Variant: restricted -->
<span class="mh-badge mh-badge--restricted">
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">…</svg>
  Compliance Blocked
</span>

<!-- Variant: planned -->
<span class="mh-badge mh-badge--planned">
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">…</svg>
  Planned — Not Live
</span>
```

CSS: `mh-badge` is a small pill (height 22px, border-radius 9999px, padding 0 8px), with a 6px dot or 12px icon on the left.

### 2.2 Market Card

Used in the market browser (Hyperliquid + Polymarket tabs). Shows venue, market name, current price, 24h change, safety badge, and key stats.

```
┌─────────────────────────────────────────────────────────┐
│ [HYP]  BTC-PERP                         [Green Badge]  │
│ Hyperliquid                                    Base Sepolia │
│ $64,250.00  ▲ +2.34%                              24h    │
│ Funding: +0.0001 (hourly)                         OI: $12.4B │
│                                                         [Preview →] │
└─────────────────────────────────────────────────────────┘
```

States: default, hover (elevated background), selected (accent border), loading (skeleton).

### 2.3 Order Preview Panel

The core execution-context panel. Shows a preview of a planned market order with all risk context and safety disclaimers.

```
┌─ Order Preview ────────────────────────────────────────┐
│ ⚠ Preview Only — Can Not Submit                        │
│                                                          │
│ BTC-PERP · Hyperliquid · Base Sepolia                   │
│ Side: BUY  Size: 0.1 BTC  Price: $64,250.00             │
│                                                          │
│ ┌─ Risk Context ──────────────────────────────────────┐│
│ │ Notional: $6,425.00                                  ││
│ │ Est. Slippage: 0.02%  Est. Fill: $64,262.80         ││
│ │ Funding: +$0.64/day                                  ││
│ │ Est. Liquidation: $51,400.00                         ││
│ │ Max Leverage: 20×   Est. Leverage: 4.3×             ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ [View External Signer Handoff →]                        │
│                                                          │
│ 🔒 Matterhorn does not sign, submit, or hold keys.       │
└─────────────────────────────────────────────────────────┘
```

The panel NEVER has a "Submit" or "Confirm" button. It shows exactly one action: "View External Signer Handoff →" (green button) or nothing if compliance-blocked. Every preview carries `canSubmit: false` — this is enforced by the system, not just the UI.

### 2.4 External Signer Handoff Card

Displayed after the user clicks "View External Signer Handoff". Shows the public order terms, the handoff hash, expiry, and instructions.

```
┌─ External Signer Handoff ───────────────────────────────┐
│ [GREEN BADGE] External Signer Live                      │
│                                                          │
│ Order Terms (public):                                    │
│   Asset:  BTC-PERP                                      │
│   Side:   BUY                                           │
│   Size:   0.1 BTC                                        │
│   Price:  $64,250.00                                    │
│   Type:   GTC Limit                                     │
│                                                          │
│ Preview SHA256:   a3f8…c12d                             │
│ Handoff SHA256:   7b4e…9f82                             │
│ Expires:          30 minutes                             │
│                                                          │
│ [Sign with your wallet →]   [Copy Handoff]              │
│                                                          │
│ Sign using Hyperliquid's official client or SDK.         │
│ Matterhorn never receives your signature.                │
└─────────────────────────────────────────────────────────┘
```

### 2.5 Receipt / Evidence Card

Displayed after the user imports a public receipt.

```
┌─ Execution Receipt ─────────────────────────────────────┐
│ [GREEN BADGE] Verified — Order Filled                   │
│                                                          │
│ Order ID: example-order-123                             │
│ Asset: BTC-PERP  Side: BUY  Size: 0.1 BTC                │
│ Status: Filled                                          │
│                                                          │
│ Preview Hash:  a3f8…c12d  ✓ Matched                      │
│ Handoff Hash:  7b4e…9f82  ✓ Matched                      │
│                                                          │
│ [Download Receipt]  [Add to Evidence Log]                │
└─────────────────────────────────────────────────────────┘
```

States: `verified` (green), `review-needed` (amber — no order ID found), `rejected` (red — hash mismatch or signature present).

### 2.6 Position Row

A row in the portfolio table showing a single position.

```
│ BTC-PERP │ BUY │ +0.1000 │ $6,425 │ +$124 │ +1.97% │ ▼ │
```

Columns: Asset, Side, Size, Notional, PnL (USD), PnL (%), Actions (close/reduce dropdown).
Color coding: `--mh-long` for positive PnL or long side, `--mh-short` for negative or short side.

### 2.7 Workflow Step Row

```
┌─ Step 2: Preview ────────────────────────────────────────┐
│ ✓ Completed  Preview generated                         │
│ [View Preview] [Handoff] [Evidence]                      │
└─────────────────────────────────────────────────────────┘
```

States: `pending` (gray), `active` (accent), `completed` (green check), `blocked` (amber), `failed` (red).

### 2.8 Navigation Sidebar Item

```
[◈]  Markets        Hyperliquid + Polymarket
```

States: default, hover, active (accent left border + accent text), notification dot.

---

## 3. Screen Inventory

### Screen 1 — Welcome / Onboarding
First-run or post-install landing. Brand hero, brief value prop (3 bullets), "Connect Wallet" CTA, links to docs and support.

**No execution UI.** Purely informational.

### Screen 2 — Main Dashboard
Overview screen after login. Shows:
- Portfolio total (equity, open PnL)
- Active positions count
- Recent activity feed (last 5 executions)
- Quick-access market shortcuts (Hyperliquid BTC, ETH; Polymarket ETH> $2k)
- System status bar: current chain, connected address, safety mode

### Screen 3 — Markets Browser
Full-screen market explorer. Two tabs: Hyperliquid, Polymarket. Each tab shows a searchable list of markets with live(ish) prices, 24h change, and a safety badge. Filter bar: All / Favorites / by asset. Clicking a market opens Screen 4.

### Screen 4 — Market Detail
Focused view of a single market. Orderbook (read-only), recent trades, position entry, open orders, market stats (funding, OI, etc.). Safety badge always visible. "Preview Order" button → Screen 5.

### Screen 5 — Order Preview
The order preview panel (Section 2.3 above) embedded in the market detail layout. Also accessible from the workflow builder.

### Screen 6 — External Signer Handoff
The handoff card (Section 2.4 above). Displayed when user elects to proceed with a preview. Clear instructions, no submit affordance.

### Screen 7 — Portfolio / Positions
Table of all open positions across venues. Sortable columns: Asset, Side, Size, Entry Price, Mark Price, Notional, Unrealized PnL, Actions. Safety badge in header ("Read-Only Portfolio" or per-position compliance note).

### Screen 8 — Activity / Execution Log
Chronological feed of all execution events: previews, handoffs, receipts, alerts. Each entry is a row with timestamp, type, market, outcome, and safety badge. Filterable by type and venue.

### Screen 9 — Workflow Builder
Visual workflow editor. Nodes: Trigger, Market Select, Preview, Handoff, Receipt, Notification. Edges show data flow. "Preview Workflow" runs through all steps in simulation mode. Safety badges on every execution node.

### Screen 10 — Workflow Run Panel
Side panel showing a running workflow's progress step by step (Section 2.7). Live status, current step highlight, expandable log for each step. "Cancel" available on pending steps only.

### Screen 11 — Settings: Markets
Market execution preferences. Per-venue settings: default chain, preferred slippage tolerance, notification preferences. Safety mode toggle (read-only / allow-handoff). This is read-only configuration — no execution credentials.

### Screen 12 — Settings: Notifications
Configure alert types: funding rate alerts, position liquidation warnings, receipt received, workflow step notifications. Each notification type is a toggle row.

### Screen 13 — Documentation Hub
Searchable docs panel. Sections: Getting Started, Market Execution (Hyperliquid, Polymarket), Workflows, Safety & Compliance, API Reference. Opens as a full-screen overlay.

### Screen 14 — Market Safety Explainer
Educational screen explaining the external-signer model. What Matterhorn can and cannot do. Non-custodial architecture diagram (SVG). FAQ accordion. Triggered from the safety badge help icon.

### Screen 15 — Artifacts / Evidence Panel
Slide-over panel listing all execution artifacts for the current session: previews, handoffs, receipts, and evidence exports. Each artifact is a card with type, timestamp, market, status badge, and action buttons (View, Download, Copy Handoff SHA).

### Screen 16 — Settings: General
App-level settings: theme (dark only for v1), font size, language, session chain, connected wallet address, sign out. No account settings yet — wallet is the identity.

---

## 4. State Architecture

### 4.1 Execution State Machine

Each market order follows this state machine:

```
IDLE → PREVIEW_GENERATED → HANDOFF_CREATED → USER_SIGNED → RECEIPT_IMPORTED → VERIFIED | REJECTED | REVIEW_NEEDED
         ↓                      ↓
      BLOCKED (compliance)  EXPIRED (30 min timeout)
```

States are displayed as workflow steps in Screen 10 and as status badges in Screens 11–14.

### 4.2 Safety Modes

Three execution safety modes:

| Mode | Badge | Behavior |
|---|---|---|
| `read_only` | Blue | No handoff button shown. Preview only. |
| `handoff_allowed` | Green | Handoff button shown. User signs externally. |
| `compliance_locked` | Amber | Handoff blocked. Full explanation shown. |

Default mode: `read_only`. Mode transitions require explicit user acknowledgement.

### 4.3 Chain Context

Current chain is displayed in the sidebar footer: "Base Sepolia" or "Base". Switching chains updates all market data and re-evaluates compliance status. Chain is persisted in session state.

---

## 5. Anti-Patterns (Forbidden)

The UI must NEVER contain:

1. **"Submit Order"** or **"Confirm Trade"** buttons anywhere in the market execution UI.
2. **API key input fields** for any venue in the UI.
3. **Private key**, **seed phrase**, or **mnemonic** input fields under any label.
4. **"Sign Transaction"** buttons that invoke Matterhorn as a signer (Matterhorn is never a signer).
5. **Custodial messaging** — phrases like "your funds are safe with Matterhorn" or "Matterhorn holds your assets."
6. **"Connect to Exchange"** actions that imply a direct exchange API connection.
7. **"Live Trading"** toggles that enable `canSubmit: true`.
8. **OpenWork or OpenCode branding** in any UI surface (these are Matterhorn internal references).
9. **Jurisdiction bypass fields** or "I confirm I am not in a restricted region" checkboxes.
10. **Signature paste fields** in the receipt import UI.

---

## 6. Responsive Strategy

**Desktop-first.** Matterhorn Work is a desktop application. Minimum supported width: 1200px. The UI is designed for a 1440px primary viewport.

Below 1200px: sidebar collapses to icon-only mode. Market cards stack vertically. Tables become horizontally scrollable.

Mobile is out of scope for v1.

---

## 7. Component CSS Custom Properties (Summary)

```css
:root {
  /* Brand */
  --mh-bg-base: #0C0C0C;
  --mh-bg-surface: #141414;
  --mh-bg-elevated: #1E1E1E;
  --mh-bg-overlay: #252525;
  --mh-border: #2A2A2A;
  --mh-border-subtle: #1F1F1F;
  --mh-text-primary: #F0F0F0;
  --mh-text-secondary: #8A8A8A;
  --mh-text-tertiary: #5C5C5C;
  --mh-accent: #D1F2FF;
  --mh-accent-dim: rgba(209, 242, 255, 0.10);
  --mh-accent-hover: rgba(209, 242, 255, 0.15);

  /* Safety */
  --mh-green: #22C55E;
  --mh-green-dim: rgba(34, 197, 94, 0.12);
  --mh-amber: #F59E0B;
  --mh-amber-dim: rgba(245, 158, 11, 0.12);
  --mh-blue: #3B82F6;
  --mh-blue-dim: rgba(59, 130, 246, 0.12);
  --mh-red: #EF4444;
  --mh-red-dim: rgba(239, 68, 68, 0.12);

  /* Market data */
  --mh-long: #22C55E;
  --mh-short: #EF4444;
  --mh-neutral: #8A8A8A;

  /* Typography */
  --font-sans: 'Aeonik', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
}
```

---

## 8. Implementation Notes

- All color values use CSS custom properties — never hardcode hex values in components.
- Safety badges must be screen-reader accessible with `aria-label` describing the safety state.
- Order previews are ephemeral — they are not persisted to disk or sent to external services.
- Handoff hashes are SHA-256 of deterministic serializations — no entropy source needed.
- Receipt import is read-only HTTP POST — no persistent connection to venue APIs.
- The evidence log is a local file export — no server-side storage of execution metadata.
