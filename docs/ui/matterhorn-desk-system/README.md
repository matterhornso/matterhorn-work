# Matterhorn Desk System — Visual Design Specification

**Status:** Draft — for Stitch review and Codex implementation
**Version:** 1.0
**Audience:** Stitch (design), Codex (implementation), Kimi (contract review)
**Based on:** `docs/ui/matterhorn-memory/` (design tokens, component system)
**Prototype:** `index.html`

---

## 1. Desk System Overview

The Matterhorn Desk System is the top-level navigation and workspace layer. Each desk is a specialized workspace that aggregates protocol-specific context, memories, and tools into a unified surface.

**Desk hierarchy:**

```
Matterhorn
└── Home (Desk Launcher)
    ├── Bittensor Desk       ← protocol, read-only Subtensor
    ├── Hyperliquid Desk     ← protocol, research + wallet-approved orders
    ├── Polymarket Desk      ← protocol, preview-only
    ├── Wellness Desk       ← restricted, opt-in, local-only
    ├── Memory Desk          ← cross-desk memory overview
    └── MCP Desk             ← tool/agent capability matrix
        └── Settings & Profile
```

**Navigation model:** Left sidebar on ≥768px (desk icons + labels). Bottom tab bar on <768px. No "Services" in the primary customer-facing nav.

**Design tokens:** `styles.css` — `--desk-*` namespace. See §6.

---

## 2. Screen Inventory

### 2.1 Desk Launcher (Home)

**Route:** `/desks` or app home
**Purpose:** Entry point showing all available desks with status and shortcut actions.
**Layout:** 3-column card grid (≥1200px), 2-column (768–1199px), 1-column (mobile).
**Primary actions:** Click desk card to open.
**States:** Default (active desk cards), Empty (no desks available), Error (degraded data).

**Desk card anatomy:**
- Desk icon (emoji, 40×40px)
- Desk name (semibold, 15px)
- Brief description (regular, 12px, 2-line max)
- Status indicator (8px circle: green=active, amber=stale, gray=inactive)
- Quick-stat badges (e.g., "3 subnets", "2 positions")
- Hover: lift + border accent

**Forbidden:** No "Crypto" as a category label. No generic "Services" desk.

---

### 2.2 Bittensor Desk

**Route:** `/desks/bittensor`
**Purpose:** Validator preferences, subnet intelligence, stake planning, delegation history.
**Layout:** SubNav (Overview / Subnets / Validators / Delegations) + content grid.
**Safety strip:** "🔗 Read-only. Public Subtensor data only. No private keys, seed phrases, or signing capabilities. Matterhorn never holds or manages stake."

**Primary actions:** Set validator preference, set stake ceiling, set delegation ceiling.

**Data displayed:**
- Subnet cards: ID, name, your stake, confidence bar, delegation address (truncated)
- Stat tiles: Total stake (TAO), Active validators, Delegation ceiling, Last sync
- Table: Subnet / Stake / Confidence / Delegation address / Status

**Safety constraint:** Public addresses always truncated: `5CfTC…3bX9`. No full addresses shown.

**States:** Default, Loading (skeleton), Error (Subtensor unreachable — show cached + retry), Empty (no subnets).

**Forbidden patterns:** No "Matterhorn controls your stake", no full wallet address, no seed phrase, no custody, no signing.

---

### 2.3 Hyperliquid Desk

**Route:** `/desks/hyperliquid`
**Purpose:** Perpetual positions, margin preferences, funding rate alerts.
**Layout:** SubNav (Positions / Alerts / Preferences) + content grid.
**Safety strip:** "📖 Preview only. Read-only account data via Hyperliquid Info API. No API keys, no signing, no order placement. Matterhorn never places, modifies, or closes orders."

**Primary actions:** Set leverage ceiling, set margin mode, create funding alert.

**Data displayed:**
- Position tiles: asset, side, size, entry price, confidence bar
- Stat tiles: leverage ceiling, margin mode, last settings change
- Alert list: asset, threshold, active status

**Safety constraint:** Position data is display-only context. Never implies execution capability.

**States:** Default, Loading, Error (Info API unreachable), Empty (no positions).

**Forbidden patterns:** No position values implying execution, no "close position", no API key exposure, no Hyperliquid API secret.

---

### 2.4 Polymarket Desk

**Route:** `/desks/polymarket`
**Purpose:** Tracked prediction markets, resolution criteria, sentiment annotations.
**Layout:** Filter bar + tracked market card grid.
**Safety strip:** "📖 Preview only. Read-only browsing data. No bet placement, no CLOB credentials, no signed payloads. Matterhorn never places bets or accesses trading accounts."

**Primary actions:** Track market (from Chat browse), remove from tracking, annotate with sentiment.

**Data displayed:**
- Market card: question text, current probability, volume, confidence bar, source chip, "Why tracked" callout
- Filter: All / Binary / Scalar / High volume

**Memory chip bar:** Active tracked market memories applied to current session.

**States:** Default, Loading, Empty ("No markets tracked yet"), Error.

**Forbidden patterns:** No bet amounts, no "place bet", no CLOB credentials, no Polymarket API key.

---

### 2.5 Wellness Desk

**Route:** `/desks/wellness`
**Purpose:** Goals, streaks, check-ins, wellness preferences. Local-only, no network transmission.
**Layout:** Toggle + content grid.
**Safety strip:** "🔒 Stored locally only. Never sent to external servers. No wellness data in exports, receipts, or provenance tables. Not medical advice."

**Wellness toggle:** "Allow wellness memory suggestions" — lives in Privacy & Forget Center. Default: Off. When Off, Wellness desk shows the disabled empty state.

**Primary actions:** Create goal, log check-in, view streak, edit goal, forget memory.

**Data displayed:**
- Goal card: title, recurrence, streak count, last check-in, confidence bar
- Streak display: current streak, longest streak, last logged
- "Why suggested" callout on each card

**Wellness disabled state:** "Wellness suggestions are paused. Enable in Privacy & Forget Center."

**Safety constraints (non-negotiable):**
- Sensitivity: Personal or Restricted (never High)
- No medical diagnoses, prescriptions, or treatment recommendations
- No PHI in any field
- No "sync" or "cloud" language
- Local-only notice on every Wellness card

**States:** Default, Loading, Empty (no goals), Disabled (toggle off), Error.

---

### 2.6 Memory Desk

**Route:** `/desks/memory`
**Purpose:** Cross-desk memory overview, suggestion inbox, filter by desk.
**Layout:** Header (title, bell badge, actions) + Memory chip bar + filter chips + card grid.
**Safety strip:** N/A (cross-desk, no single-desk safety framing needed).

**Memory chip bar:** Active memories applied to current session, per desk color-coded chips.

**Filter chips:** All / Bittensor / Hyperliquid / Polymarket / Wellness / General.

**Suggestion bell:** Badge count of pending suggestions. Panel: slide-over from right.

**States:** Default (confirmed memories), Empty (no memories), Loading (skeleton), Error.

**Memory card actions:** Use, Edit, Export, Forget.

**Forbidden:** No "Crypto" as a memory category label.

---

### 2.7 MCP Desk

**Route:** `/desks/mcp`
**Purpose:** Tool configuration, agent capability matrix, skill registry.
**Layout:** Tool registry table + capability matrix + add server.
**Safety strip:** "🔌 MCP tools run locally in your environment. No credentials are stored in Matterhorn. Tool access is scoped to your configured permissions."

**Table columns:** Tool / Agent / Status / Scope / Actions.

**Scope field:** Describes exactly what the tool can read or do — never implies execution capability unless explicitly configured.

**Status badges:** Active (green), Inactive (gray), External signer required (amber).

**States:** Default, Loading, Empty ("No MCP servers configured"), Error.

---

### 2.8 Settings & Profile

**Route:** `/settings`
**Purpose:** Profile, desk preferences, privacy controls, account management.
**SubNav:** Desk Preferences / Privacy & Forget / Memory Settings / Notifications / Security.

**Desk preference toggles:** One row per desk, toggle + desk name + brief current state.

**Privacy controls:** Allow memory suggestions (global), Allow wellness memory suggestions (local-only).

**Forget all:** Red button, multi-step confirmation: (1) Are you sure? (2) Cannot be undone. (3) Type "FORGET" to confirm.

---

## 3. Forbidden UI Patterns

All desks must follow these non-negotiable rules:

| Pattern | Forbidden | Required |
|---------|-----------|---------|
| Category label | "Crypto workspace", "DeFi", "Trading" | Protocol name (Bittensor, Hyperliquid, Polymarket) |
| Nav item | "Services" as a primary customer desk | "Services" is not a customer-facing desk in V1 |
| Signing | "Submit order", "Place trade", "Sign transaction", "Open position" | Preview-only, read-only framing |
| Secrets | Seed phrase, private key, API secret, raw signature, signed payload in any field | Never displayed; blocked at input |
| Custody | "Matterhorn manages your stake", "Matterhorn holds your position" | "Your validator preference", "You set a leverage ceiling of 3×" |
| Wallet | Full wallet address displayed | Truncated SS58: `5CfTC…3bX9` |
| Wellness | Medical diagnosis, prescription, treatment recommendation, PHI | Educational framing only, local-only notice |
| Data export | Wellness data in standard exports | Wellness excluded unless explicit local-only export with warning |

---

## 4. Responsive Behavior

### Desktop (≥ 1200px)

- Sidebar: 220px fixed, full height, sticky
- Desk launcher: 3-column card grid
- Desk content: single-column with stat tiles and table/data grid
- Memory chip bar: horizontal wrap
- Bottom: none

### Tablet (768–1199px)

- Sidebar: 180px, labels collapsed, icons + abbreviated labels
- Desk launcher: 2-column card grid
- Desk content: single-column
- Stat tiles: wrap to 2-column if needed
- Tables: horizontal scroll if needed (no column removal)

### Mobile (< 768px)

- Sidebar: hidden, replaced by bottom tab bar
- Bottom tab bar: 5 tabs (Home, Bittensor, Hyperliquid, Wellness, More/Settings)
- Desk launcher: 1-column card list
- Desk content: 1-column, full-width cards
- Stat tiles: stacked vertically
- Tables: first column sticky, horizontal scroll
- Composer: always visible above keyboard (fixed position)
- Memory chip bar: horizontal scroll
- Right rail: no right rail — no overflow, no edge trap

---

## 5. Design Token Reference

See `styles.css` for the full token definitions.

Key token namespaces:

| Namespace | Purpose |
|----------|---------|
| `--desk-bg-*` | Background layers (base, surface, elevated, overlay) |
| `--desk-accent` | Primary brand accent (#D1F2FF dark / #2563EB light) |
| `--desk-type-*` | Per-desk color (bittensor, hyperliquid, polymarket, wellness, memory, mcp) |
| `--desk-sens-*` | Sensitivity (personal, high, restricted) |
| `--desk-status-*` | Status (success, warning, error, info) |
| `--desk-conf-*` | Confidence levels (high, medium, low) |
| `--desk-action-*` | Button variants (primary, default, ghost, danger) |
| `--desk-nav-*` | Navigation (bg, text, hover, active) |

All tokens have `[data-theme="light"]` overrides. No new token namespace in V1.

---

## 6. Component Library

| Component | CSS class | States |
|----------|-----------|--------|
| Desk card | `.desk-card` | default, hover, active, error |
| Stat tile | `.stat-tile` | default, loading |
| Memory chip | `.desk-chip` | default, hover, active |
| Badge | `.desk-badge` | per-desk color variants |
| Toggle | `.desk-toggle` | off, on |
| Safety strip | `.desk-safety-strip` | protocol, wellness, memory, mcp |
| Button | `.desk-btn` | primary, default, ghost, danger |
| Empty state | `.desk-empty` | default |
| Skeleton | `.desk-skeleton` + `.desk-skeleton-bar` | shimmer animation |
| Bell badge | `.suggestion-bell` + `.suggestion-bell__badge` | count, error |

---

## 7. States — Global

| State | Trigger | UI |
|-------|---------|-----|
| Default | Normal | Full desk content |
| Loading | First load / refresh | Skeleton cards (3-col grid) |
| Error | Backend unreachable | Amber banner + retry button |
| Degraded | Partial data (stale) | Stale indicator on affected cards, cached values shown |
| Empty | No items in desk | Empty state with CTA |

---

## 8. Accessibility

- All interactive elements keyboard-accessible
- Focus visible on all interactive elements (`:focus-visible` ring)
- ARIA labels on icon-only buttons
- Color contrast ≥ 4.5:1 for text
- Screen reader labels on status badges and confidence bars
- `role="navigation"` on sidebar and bottom tab bar
- Skip-to-content link on page load
