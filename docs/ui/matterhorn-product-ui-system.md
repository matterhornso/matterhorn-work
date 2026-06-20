# Matterhorn Work — Product UI System

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


---

## 9. Protocol Desks

Each protocol desk is a dedicated view scoped to a single venue. Desks are top-level nav items. Every desk follows the shared transcript/card system (§11) for all execution-related interactions.

### 9.1 Desk Shell

Every desk has a consistent header and layout:

```
┌─ [Logo]  Bittensor Desk          [Safety Badge] [Chain: Mainnet] [◈ Wallet] ─┐
│                                                                              │
│  Can Submit: No    Live Submission: Off    External Signer: Ready            │
│                                                                              │
│  ┌─ Market Selector ─────────────────────┐  ┌─ Context Panel ────────────┐  │
│  │ [TAO/SOL] [TAO/USDC] [+ Add Market] │  │  Wallet Snapshot           │  │
│  └───────────────────────────────────────┘  │  Orderbook Depth           │  │
│                                             │  Compliance Block          │  │
│  [Market Card Grid or Transcript View]      │  Action Preview            │  │
│                                             │  External Signer Handoff   │  │
│                                             └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Mandatory safety strip** (always visible at the top of every desk):

```
Can Submit: No    Live Submission: Off    External Signer: [Ready / Connecting / Unavailable]
```

This strip must never be hidden, collapsed, or disabled. It is the user's primary safety signal.

### 9.2 Bittensor Desk

**Venue:** Bittensor (mainnet + testnet)
**Scope:** Tao token markets, subnet markets, delegate staking
**Safety mode default:** `read_only`

#### Markets

| Market | Type | Safety |
|---|---|---|
| TAO/SOL | Spot | `read_only` — preview only |
| TAO/USDC | Spot | `read_only` — preview only |
| Subnet Register | Validator slot | `read_only` — preview only |
| Delegate Stake | Staking | `read_only` — preview only |

#### Desk Layout

```
┌─ Bittensor Desk ─────────────────────── [Read-Only] [Mainnet] [◈ wallet] ────┐
│  Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready         │
│                                                                              │
│  [TAO/SOL] [TAO/USDC] [Subnet Register] [Delegate Stake]                    │
│                                                                              │
│  ┌─ TAO/USDC ──────────────────────────────────────────────────────────┐   │
│  │ $18.42  ▲ +3.2%  (24h)                    [Blue Badge: Read-Only]      │   │
│  │                                                                          │   │
│  │  Bittensor subnet: 1  ·  circulating: 8,421,000  ·  market cap: $155M  │   │
│  │                                                                          │   │
│  │  ┌─ Wallet Snapshot ────────────────────────────────────────────────┐ │   │
│  │  │  TAO Balance:    0.2841  ($5.23)                                   │ │   │
│  │  │  SOL Balance:    1.832  ($312.40)                                  │ │   │
│  │  │  Delegated:      0.5000 TAO  → tao1…abc                           │ │   │
│  │  └─────────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                          │   │
│  │  [Preview Order]                                                         │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Key constraints

- **No order book** — Bittensor does not have an orderbook. The context panel shows subnet emission data, Tao price, and wallet balances instead.
- **Subnet validator slots** shown as market cards (not forms). Click → transcript card showing slot, cost, registration preview.
- **Delegate staking** shown as a card with current delegate, amount, and a "Preview Redelegate" action.
- **All actions are preview-only.** No submit, no staking transaction UI.

### 9.3 Hyperliquid Desk

**Venue:** Hyperliquid (mainnet + Base Sepolia testnet)
**Scope:** Perpetual futures, spot (read-only market data)
**Safety mode default:** `read_only`

#### Markets

| Market | Type | Safety |
|---|---|---|
| BTC-PERP | Perpetual | `read_only` — preview only |
| ETH-PERP | Perpetual | `read_only` — preview only |
| SOL-PERP | Perpetual | `read_only` — preview only |
| All Markets (browser) | Browse | `read_only` |

#### Desk Layout

```
┌─ Hyperliquid Desk ───────────────────── [Read-Only] [Base Sepolia] [◈ wallet] ┐
│  Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready           │
│                                                                                │
│  [BTC-PERP] [ETH-PERP] [SOL-PERP] [All Markets →]                             │
│                                                                                │
│  ┌─ BTC-PERP · Base Sepolia ─────────────────────────────────────────────┐   │
│  │ $64,250.00  ▲ +2.34% 24h    OI: $12.4B  ·  Funding: +0.0001/hr        │   │
│  │                                                                         │   │
│  │  ┌─ Orderbook ────────────────────────┐  ┌─ Action Preview ───────┐  │   │
│  │  │  Bids           Price      Asks     │  │  BTC-PERP · BUY        │  │   │
│  │  │  0.842          64,249    0.120     │  │  Size: 0.1 BTC         │  │   │
│  │  │  1.204          64,248    0.340     │  │  Price: $64,250.00    │  │   │
│  │  │  0.901          64,247    0.220     │  │  Est. slip: 0.02%     │  │   │
│  │  │                        …             │  │                         │  │   │
│  │  └─────────────────────────────────────┘  │  [View Handoff →]      │  │   │
│  │                                          └─────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

#### Key constraints

- **Perpetuals only** (no spot trading). Spot prices shown as reference data.
- **Orderbook is read-only** — depth chart visualization instead of a traditional order book table.
- **Leverage control** — preview shows estimated leverage, not a live margin calculator.
- **Perp position PnL** calculated from mark price, displayed in the portfolio view.

### 9.4 Polymarket Desk

**Venue:** Polymarket (mainnet)
**Scope:** Prediction markets / conditional markets
**Safety mode default:** `read_only`

#### Markets

| Market | Type | Safety |
|---|---|---|
| [Ethereum ETF approval] | Binary market | `read_only` — preview only |
| [SOL ETF approval] | Binary market | `read_only` — preview only |
| [Generic Yes/No] | Binary market | `read_only` — preview only |

#### Desk Layout

```
┌─ Polymarket Desk ────────────────────────────── [Read-Only] [Mainnet] [◈] ┐
│  Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready       │
│                                                                             │
│  [Trending] [Crypto] [Politics] [Tech] [All]                                │
│                                                                             │
│  ┌─ Will an Ethereum ETF be approved by end of 2025? ─────────────────┐  │
│  │                                                                         │  │
│  │  YES  $0.38  ████████████░░░░░░░░░░  38% liquidity owned             │  │
│  │  NO   $0.62  ████████████████████░  62%                              │  │
│  │                                                                         │  │
│  │  Volume: $4.2M  ·  Liquidity: $12.8M  ·  Expiry: 2025-12-31          │  │
│  │                                                                         │  │
│  │  [Preview "Yes" Position]  [Preview "No" Position]                    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key constraints

- **Binary outcomes only** — YES/NO positions. No AMM liquidity provision UI.
- **"Position"** means "preview of buying YES or NO shares" — never a direct trade execution.
- **Outcome resolution** shown in portfolio/evidence view when the market closes.
- **Fractional shares** not supported in preview — previews show integer share counts.
- **Market questions** displayed verbatim as the market title — no paraphrasing.

---

## 10. Wellness Workflow Desk

A dedicated desk for wellness tracking and goal management workflows. This desk operates entirely outside of market execution. It is completely separate from the protocol desks and does not share the `canSubmit` safety strip (no market execution occurs here).

### 10.1 Desk Overview

```
┌─ Wellness Desk ──────────────────────────────────────────────── [◈ wallet] ┐
│                                                                              │
│  Good morning. Your streak: 14 days  ·  This week: 3/5 goals complete     │
│                                                                              │
│  ┌─ Today's Goals ──────────────────────────────────────────────────────┐  │
│  │  ○ Morning stretch routine       (not done)                            │  │
│  │  ◉ Hydration: 2.5L target        ✓ complete                           │  │
│  │  ○ Evening walk                   (not done)                            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ Weekly Overview ────────────────────────────────────────────────────┐  │
│  │  Mon ✓   Tue ✓   Wed ✓   Thu ✓   Fri ○   Sat ○   Sun ○               │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ Wellness Artifact ──────────────────────────────────────────────────┐  │
│  │  [Icon] Weekly wellness summary exported.                              │  │
│  │  Hash: sha256:3a4b…e91f  ·  Exported: 2025-01-08  ·  [Download]      │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  [+ New Goal]  [Workflow Builder →]                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Design Rules

- **No execution strip** — the wellness desk has no `canSubmit` strip because no market execution occurs.
- **Streak counter** — shown as a prominent mono number in the desk header.
- **Goal states** — `○` pending, `◉` complete, `⊘` missed. Color-coded by completion rate.
- **Wellness artifacts** — exportable as signed JSON, hash logged for tamper-evidence.
- **Workflow integration** — goals can be automated via the workflow builder (e.g., "remind me to stretch every weekday 9am").

---

## 11. Shared Transcript / Card System

Every execution context across all desks uses one of these shared card types. They are the vocabulary of the transcript system.

### 11.1 Wallet Snapshot Card

Shown at the top of every context panel. Displays current wallet balances relevant to the active market.

```
┌─ Wallet Snapshot ────────────────────────────────────────────
│  Asset        Balance      USD Value
│  TAO          0.2841       $5.23
│  SOL          1.832        $312.40
│  USDC         42.18        $42.18
│
│  External signer address: 0x3a…7bc
└──────────────────────────────────────────────────────────────
```

States: `live` (balances current), `stale` (>60s old — amber border, "Refresh"), `disconnected` (no wallet — prompt to connect).

### 11.2 Orderbook / Context Card

Read-only context for Hyperliquid. Shows market depth without any order placement affordance.

```
┌─ Orderbook — BTC-PERP ────────────────────────────────────────
│  Bids                Price       Asks
│  ████░░░░░ 0.842    64,249.00   0.120
│  █████░░░░ 1.204    64,248.00   0.340
│  ███░░░░░░ 0.901    64,247.00   0.220
│
│  Spread: $1.00 (0.0016%)  ·  Mid: $64,249.50
└──────────────────────────────────────────────────────────────
```

Depth bars are visual only — they are not clickable. No "place order" affordance.

### 11.3 Compliance Block

Shown when the current market or jurisdiction prevents execution. Replaces the action preview card entirely when active.

```
┌─ ⚠ Compliance Block ─────────────────────────────────────────
│  [Amber Badge] Jurisdiction Restricted
│
│  Market execution is not available in your region.
│  For questions, see the Safety Explainer.
│
│  [View Safety Explainer →]
└──────────────────────────────────────────────────────────────
```

The compliance block must always show the amber safety badge and never attempt to bypass the restriction.

### 11.4 Action Preview Card

The central card for every market desk. Shows the action being previewed, its terms, and the safety badge.

```
┌─ Action Preview ─────────────────────────────────────────────
│  BTC-PERP · BUY · 0.1 BTC · $64,250.00
│  [Green Badge] External Signer Live
│
│  Notional: $6,425.00
│  Est. Slippage: 0.02%
│  Est. Fill: $64,262.80
│  Est. Liquidation: $51,400.00
│  Est. Leverage: 4.3×
│
│  🔒 Matterhorn does not sign, submit, or hold keys.
│
│  [View External Signer Handoff →]
└──────────────────────────────────────────────────────────────
```

Never contains: Submit, Confirm, Execute, Place Order buttons.

### 11.5 External Signer Handoff Card

```
┌─ External Signer Handoff ────────────────────────────────────
│  [Green Badge] External Signer Live
│
│  Order Terms (public):
│    Asset:  BTC-PERP
│    Side:   BUY
│    Size:   0.1 BTC
│    Price:  $64,250.00
│    Type:   GTC Limit
│
│  Preview SHA256:   a3f8…c12d
│  Handoff SHA256:   7b4e…9f82
│  Expires:          30 minutes
│
│  [Sign with your wallet →]   [Copy Handoff]
│
│  Sign using Hyperliquid's official client or SDK.
│  Matterhorn never receives your signature.
└──────────────────────────────────────────────────────────────
```

### 11.6 Receipt / Status Card

```
┌─ Execution Receipt ──────────────────────────────────────────
│  [Green Badge] Verified — Order Filled
│
│  Order ID: example-order-123
│  Asset: BTC-PERP  Side: BUY  Size: 0.1 BTC
│  Status: Filled
│
│  Preview Hash:  a3f8…c12d  ✓ Matched
│  Handoff Hash:  7b4e…9f82  ✓ Matched
│
│  [Download Receipt]  [Add to Evidence Log]
└──────────────────────────────────────────────────────────────
```

States: `verified` (green), `review-needed` (amber — no order ID found), `rejected` (red — hash mismatch).

### 11.7 Wellness Artifact Card

```
┌─ Wellness Artifact ──────────────────────────────────────────
│  Weekly wellness summary
│  Period: 2025-01-01 → 2025-01-07  ·  Goals completed: 4/5
│
│  sha256: 3a4b…e91f
│  Signed by: 0x3a…7bc  ·  Exported: 2025-01-08 14:32 UTC
│
│  [Download]  [Add to Evidence Log]
└──────────────────────────────────────────────────────────────
```

---

## 12. Empty / Loading / Degraded / Error States

Every view must handle these four states gracefully. Never show a blank white screen or an unhandled exception.

### 12.1 Empty State

Shown when there is no data for the current context (e.g., no positions, no markets matching filter, no workflow runs).

```
┌─ Positions ────────────────────────────────────────────────────
│  [mh-panel, empty-state]
│
│  ┌─ No positions ───────────────────────────────────────────┐
│  │                                                            │
│  │   [Icon: empty circle]                                    │
│  │   No open positions                                       │
│  │                                                            │
│  │   Markets are available on the Hyperliquid and            │
│  │   Polymarket desks.                                       │
│  │                                                            │
│  │   [Browse Markets →]                                      │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────
```

Design: centered icon (monochrome, 48px), heading in `--text-base` weight 500, subtext in `--mh-text-secondary`, optional CTA button in accent. No illustrations or decorative imagery.

### 12.2 Loading State

Shown while data is being fetched.

```
┌─ Market Detail ───────────────────────────────────────────────
│  [Skeleton loader — 3 rows of 3 market cards]
│
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  │  ████████████  ████████████  ████████████                │
│  └──────────────────────────────────────────────────────────┘
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  │  ████████████  ████████████  ████████████                │
│  └──────────────────────────────────────────────────────────┘
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  │  ████████████  ████████████  ████████████                │
│  └──────────────────────────────────────────────────────────┘
│
│  [skeleton class: mh-skeleton-row, animated pulse 1.5s ease-in-out]
```

Implementation: use `mh-skeleton` class — a `div` with `background: var(--mh-bg-elevated)` and `border-radius: 4px`. Pulse animation: `opacity: 0.5 → 1.0` over 1.5s, `ease-in-out`, infinite. No spinner or loading text in the main content area.

### 12.3 Degraded State

Shown when some data loaded but a non-critical source failed (e.g., wallet balance stale, one venue's data missing).

```
┌─ Bittensor Desk ───────────────────────────────────────────────
│  ⚠ Some data is unavailable
│
│  ┌─ Wallet Snapshot ──────────────────────────────────────────┐
│  │  TAO: 0.2841  (live)                                      │
│  │  SOL: 1.832  (live)                                       │
│  │  USDC: [amber] stale — last updated 3 min ago             │
│  └────────────────────────────────────────────────────────────┘
│
│  ┌─ TAO/USDC ─────────────────────────────────────────────────┐
│  │  $18.42  ▲ +3.2%  (24h)    [Blue Badge: Read-Only]        │
│  │  Bittensor subnet: 1  ·  circulating: 8,421,000            │
│  └────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────
```

Design: degraded panel gets an amber left border. A thin amber banner at the top of the affected card: "⚠ Some data is unavailable". The rest of the UI remains fully interactive.

### 12.4 Error State

Shown when a critical failure occurred (network error, wallet disconnected, venue unreachable).

```
┌─ Hyperliquid Desk ─────────────────────────────────────────────
│
│  ┌─ Error ────────────────────────────────────────────────────┐
│  │                                                           │
│  │   [Icon: warning triangle — amber]                         │
│  │   Unable to reach Hyperliquid                              │
│  │                                                           │
│  │   Check your connection and try again.                    │
│  │   If the problem persists, visit the status page.         │
│  │                                                           │
│  │   [Try Again]                                             │
│  │                                                           │
│  └───────────────────────────────────────────────────────────┘
│
└──────────────────────────────────────────────────────────────
```

Design: full-panel error card (centered). Warning icon in `--mh-amber`. Heading in `--text-lg` weight 600. Body in `--mh-text-secondary`. "Try Again" button in secondary style. Do not show technical error messages or stack traces.

For wallet disconnection:

```
┌─ Wallet Disconnected ───────────────────────────────────────────
│
│   [Icon: wallet-off]
│   Wallet disconnected
│
│   Reconnect to continue browsing markets.
│
│   [Reconnect Wallet]
│
└──────────────────────────────────────────────────────────────
```

---

## 13. Responsive Strategy (Updated)

### 13.1 Breakpoints

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | `< 640px` | Single column. Sidebar becomes bottom tab bar. Context panel slides up as a sheet. |
| Tablet | `640px – 1199px` | Sidebar collapses to icon rail (64px). Context panel becomes a slide-over (480px wide). |
| Desktop | `≥ 1200px` | Full layout. Sidebar 240px. Context panel 380px. Main area fills remaining space. |
| Wide | `≥ 1600px` | Context panel grows to 480px. Market card grid goes to 3 columns. |

### 13.2 Mobile (< 640px)

```
┌────────────────────────┐
│ [≡]  Bittensor  [◈]   │  ← topbar: hamburger + desk name + wallet
├────────────────────────┤
│                        │
│  [Safety Strip]        │  ← sticky, condensed: "Can: No · Live: Off"
│                        │
│  [Market Card Stack]   │  ← single column, full width
│                        │
│  [Context Panel]       │  ← slides up from bottom as a sheet
│  (draggable handle)    │     80% viewport height
│                        │
├────────────────────────┤
│ [◈] [≡] [◎] [⚙]       │  ← bottom tab bar: Markets · Home · Activity · Settings
└────────────────────────┘
```

- Safety strip always visible, never below the fold.
- Context panel is a bottom sheet with a drag handle (no swipe-to-dismiss on safety-critical panels).
- Portfolio table scrolls horizontally with sticky first column.
- No hover states — all interactions are tap.

### 13.3 Tablet (640px – 1199px)

```
┌───────────────────────────────────────────────────────────────┐
│ [≡]  Matterhorn Work  ·  Bittensor  ·  [Safety Badge]  [◈]  │
├────┬──────────────────────────────────────────────────────────┤
│    │  Safety Strip                                           │
│ 🏠 │─────────────────────────────────────────────────────────  │
│    │                                                          │
│ 📊 │  [Market Cards — 2 column grid]                          │
│    │  [Context Panel — 380px slide-over from right]           │
│ ⚙  │                                                          │
└────┴──────────────────────────────────────────────────────────┘
   ↑
 Icon rail (64px wide)
```

### 13.4 Desktop (≥ 1200px)

```
┌───────────────────────────────────────────────────────────────┐
│ Logo  Markets  Workflows  Wellness  ····  Safety Badge  [◈]  │ ← header
├──────────┬───────────────────────────────────┬───────────────┤
│          │                                   │               │
│ Sidebar  │   Main Content Area               │ Context Panel │
│ 240px    │   (fills remaining)               │ 380px         │
│          │                                   │               │
│  Nav     │   Market grid / desk view /        │ Wallet snap   │
│  items   │   portfolio table / workflow       │ Order preview │
│          │                                   │ Handoff card  │
│          │                                   │               │
└──────────┴───────────────────────────────────┴───────────────┘
```

### 13.5 Implementation Notes

- CSS Grid for main layout shell. Flexbox for component internals.
- Context panel uses `position: sticky` on desktop. On mobile/tablet, it is `position: fixed` with a sheet animation.
- The safety strip (`Can Submit: No · Live Submission: Off`) must never be hidden regardless of viewport.
- Touch targets minimum 44×44px on mobile and tablet.
- Font sizes scale down by 1 step on mobile (`--text-base` → 14px, `--text-sm` → 12px).
