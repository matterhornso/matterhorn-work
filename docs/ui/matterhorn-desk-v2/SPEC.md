# Matterhorn Desk UI — V2 Visual Design Spec

**Spec version:** 2.0
**Status:** Draft — for Stitch review and Codex implementation
**Branch:** `minimax/matterhorn-desk-v2`
**Replaces:** `docs/ui/matterhorn-desk-system/` (PR #539 — V1 spec)

---

## What Is Different in V2

V1 established the desk structure and tokens. V2 fixes the **visual quality problems** that make the current implementation feel boxy, monochrome, and unpolished. This spec defines the target visual quality standard and the explicit patterns to solve each identified problem.

**7 problems V2 solves:**

| # | Problem (V1/current) | V2 Solution |
|---|----------------------|-------------|
| P1 | Too many outlined boxes — heavy `1px solid border` cards stacking | Solid surface backgrounds, 1px subtle borders, depth via layered surfaces not outlines |
| P2 | Monotonous dark UI — flat `#0C0C0C` everywhere, no warmth | Warm near-black (`#111111`), per-desk accent tints, richer surface hierarchy |
| P3 | Profile/wallet hidden in bottom bar — no desktop presence | Right rail on desktop: avatar, wallet address, quick stats, notification bell |
| P4 | Side rail as information dump — every status crammed into nav | Nav rail = clean icon + label; content lives in main area and right rail |
| P5 | Fake protocol icons — emoji instead of SVG icon system | Full SVG icon set per desk; emoji is never a primary protocol icon |
| P6 | Ugly curved session cards — heavy border-radius, nested card grids | Sharp corners (2–4px max), no nested card grids, clean surface cards |
| P7 | Bittensor too expert-oriented — raw Subtensor data overload | Beginner view by default: summary + one action; expert mode is a toggle |

---

## 1. Brand Anchors

Both light and dark mode must use these anchors. No deviation.

### Dark Mode (primary)

| Token | Value | Use |
|-------|-------|-----|
| `--v2-bg-base` | `#0C0C0C` | Page background |
| `--v2-bg-surface` | `#111111` | Card / panel surface (warmer than pure black) |
| `--v2-bg-elevated` | `#1A1A1A` | Elevated cards, hover states |
| `--v2-bg-hover` | `#202020` | Interactive hover |
| `--v2-border-subtle` | `#1F1F1F` | Subtle dividers, card separators |
| `--v2-border-default` | `#2A2A2A` | Default border |
| `--v2-border-strong` | `#3A3A3A` | Emphasized borders |
| `--v2-text-primary` | `#F0F0F0` | Primary text |
| `--v2-text-secondary` | `#8A8A8A` | Secondary / muted text |
| `--v2-text-tertiary` | `#555555` | Placeholder, disabled |
| `--v2-accent` | `#D1F2FF` | Brand accent — links, focus rings, active states |
| `--v2-accent-dim` | `rgba(209,242,255,0.08)` | Accent tint backgrounds |

### Light Mode

| Token | Value | Use |
|-------|-------|-----|
| `--v2-bg-base` | `#F5F5F5` | Page background |
| `--v2-bg-surface` | `#FFFFFF` | Card / panel surface |
| `--v2-bg-elevated` | `#FAFAFA` | Elevated panels |
| `--v2-text-primary` | `#0C0C0C` | Primary text |
| `--v2-text-secondary` | `#5C5C5C` | Secondary text |
| `--v2-accent` | `#2563EB` | Brand accent (light mode) |
| `--v2-accent-dim` | `rgba(37,99,235,0.08)` | Accent tint backgrounds |

### Per-Desk Accent Colors (V2)

These are richer than V1's palette. Each desk gets a distinctive accent that carries through cards, icons, active states, and confidence bars.

| Desk | Dark Mode Accent | Light Mode Accent | Description |
|------|-------------------|-------------------|-------------|
| Bittensor | `#FF7C43` (warm orange) | `#EA580C` | Validator energy, subnet activity |
| Hyperliquid | `#C084FC` (soft purple) | `#7C3AED` | Perpetual finance |
| Polymarket | `#FBBF24` (gold) | `#D97706` | Market prediction |
| Wellness | `#F472B6` (rose) | `#DB2777` | Health/wellness |
| Memory | `#67E8F9` (cyan) | `#0891B2` | Context/memory |
| MCP | `#34D399` (emerald) | `#059669` | Tools/agents |
| Home | `#D1F2FF` (brand) | `#2563EB` | Command center |

### Logo

- **Primary logo:** Matterhorn wordmark in Aeonik Bold + geometric mountain mark (SVG)
- **Never use:** emoji as logo, generic "M" letterform without mountain mark
- **Favicon:** Mountain mark only, 32×32px
- **Nav mark:** Mountain mark + "Matterhorn" text in 13px Aeonik 500, not full wordmark

---

## 2. Surface & Card System (V2)

### The Problem: Outlined Boxes

V1 and the current implementation stack cards with `border: 1px solid var(--border)` on every surface. This creates visual noise — every card is competing as an outline, not as a surface.

### V2 Solution: Surfaces Over Outlines

```
Background (#0C0C0C)
  └── Surface card (#111111, border: 1px solid #1F1F1F)
        └── Content within card — no additional outlines
              └── Interactive row (hover: #1A1A1A, not outlined)
```

**Rules:**
- `--v2-bg-surface` is the default card fill — NOT a border
- Default card border: `--v2-border-subtle` (`#1F1F1F`) — barely visible separator, not a frame
- Only interactive cards that need explicit boundaries get `--v2-border-default`
- No card has `border-radius` > 4px — no curved corners on data cards
- No nested card grids — a card contains content, not another card with its own border
- Depth comes from **background hierarchy** (base → surface → elevated), not border weight

### Card Anatomy (V2)

```
┌─────────────────────────────────────────────────────────┐
│ [Desk accent bar — 3px top border, desk accent color]  │
│                                                         │
│  ████  Desk Name              Status badge    Confidence │
│                                                         │
│  Description text, 1–2 lines                            │
│                                                         │
│  Primary action button  ·  Secondary action             │
└─────────────────────────────────────────────────────────┘
```

**Key rules:**
- Top accent bar (3px, desk color) replaces the need for heavy borders
- Status badge uses desk color at 20% opacity fill, desk color text
- Confidence bar: 3 segments (green/amber/red) — not a border
- Actions: ghost button primary, text button secondary — no outlined button stack

### No Glassmorphism

V2 explicitly forbids:
- `backdrop-filter: blur()`
- `background: rgba(..., 0.5)` with transparency
- "frosted glass" panels
- Semi-transparent card overlays

Rationale: Glassmorphism fails in real-world conditions (GPU rendering, readability on varied content) and is a trendy pattern, not a Matterhorn pattern.

### Typography in Cards

- Card title: `--text-base` (15px), weight 600, `--v2-text-primary`
- Card description: `--text-sm` (13px), weight 400, `--v2-text-secondary`, max 2 lines
- Card metadata: `--text-xs` (11px), weight 400, `--v2-text-tertiary`
- No card title in ALL CAPS — use sentence case
- No card has more than 3 lines of text before truncation

---

## 3. Desk Accent Color Usage (V2)

Each desk's accent color is used **consistently** in these places and nowhere else:

1. **Top accent bar** on desk cards (3px)
2. **Active nav item** background tint and text
3. **Confidence bar segments** for that desk's context
4. **Status badges** for that desk's items
5. **Primary action button** fill
6. **Memory chip bar** active chip tint

**Forbidden:** Accent color as full-card background (creates color bleed), accent color as text on white without dark background, accent color on large surface areas (>40% of card fill).

---

## 4. Navigation: Right Rail Architecture (V2)

### V1 Problem: Side Rail as Information Dump

V1's sidebar tried to show everything — desk list, memory chips, notification count, wallet status, settings — all compressed into a narrow rail. This creates information overload and buries the profile.

### V2 Architecture

```
┌──────────┬──────────────────────────────────────────┬────────────────┐
│          │                                          │                │
│  LEFT    │   MAIN AREA                              │  RIGHT         │
│  NAV     │   (desk content)                         │  RAIL          │
│  RAIL    │                                          │                │
│  56px    │   Full width, scrollable                  │  260px         │
│          │                                          │                │
│  🏠 Home │                                          │  Profile       │
│  ⚡ Bitt │                                          │  Wallet addr   │
│  💎 Hyper│                                          │  Quick stats   │
│  📊 Poly │                                          │  Bell (N)      │
│  ♥ Well  │                                          │  Memory chips  │
│  🧠 Memo │                                          │  Desk context  │
│  🔌 MCP  │                                          │                │
│  ──────  │                                          │                │
│  ⚙ Set  │                                          │                │
└──────────┴──────────────────────────────────────────┴────────────────┘
```

### Left Nav Rail (V2)

- Width: 56px (desktop ≥1200px), 48px (tablet 768–1199px)
- Icons only on mobile (<768px): left nav hidden, replaced by bottom tab bar
- Nav items: icon (24px SVG) + tooltip on hover, no text label in rail
- Active desk: `--v2-accent` icon tint + `--v2-accent-dim` background pill
- Hover: `--v2-bg-hover` background
- No notification counts in nav rail — counts move to right rail bell
- No memory chips in nav rail — chips live in right rail
- Nav rail never scrolls — fixed position

### Right Rail (V2 — NEW in V2)

- Width: 260px, fixed position, does not scroll with main content
- Top: Profile card (avatar, name, truncated wallet `0x1234…abcd`, copy button)
- Below profile: Quick stats (desk-specific — e.g., for Bittensor: total stake, active validators)
- Bell: notification/suggestion inbox count
- Memory chip bar: active context chips for current desk
- Desk context panel: current desk's at-a-glance status

**Collapses cleanly:** On tablet (768–1199px), right rail is hidden by default. A floating profile button (bottom-right) toggles it as an overlay panel. On mobile, right rail is absent — profile moves to top bar.

### Mobile: No Bottom Nav for Profile

- Bottom bar has: Home, Bittensor, Hyperliquid, Polymarket, Wellness
- Profile: accessible via avatar in the top bar (always visible)
- Settings: accessible via gear icon in top bar

---

## 5. Protocol Icon System (V2)

### V1 Problem: Fake/Emoji Icons

V1 uses emoji as primary desk icons (⚡, 💎, 📊, ♥, 🧠, 🔌). Emoji is inconsistent, not vector, and fails at small sizes.

### V2 Solution: SVG Icon Set

| Desk | Icon Name | Description |
|------|-----------|-------------|
| Home | `icon-home` | Rounded square with roof mark |
| Bittensor | `icon-bittensor` | Geometric network node mark |
| Hyperliquid | `icon-hyperliquid` | Infinity/perpetual mark |
| Polymarket | `icon-polymarket` | Target/bullseye mark |
| Wellness | `icon-wellness` | Heart with pulse mark |
| Memory | `icon-memory` | Brain/circuit mark |
| MCP | `icon-mcp` | Plug/connection mark |
| Settings | `icon-settings` | Gear (standard) |

**Rules:**
- All icons: 24×24px SVG, 1.5px stroke, `currentColor`
- Never use emoji as primary icon — emoji is acceptable in empty states only
- Icon color: `--v2-text-secondary` by default, `--v2-accent` when active
- Icon file format: inline SVG in components, or SVG sprite at build time

---

## 6. Bittensor Desk: Beginner vs Expert Mode (V2)

### V1 Problem: Too Expert-Oriented

V1 showed raw Subtensor data, validator addresses, subnet IDs — every field looks like a developer dashboard. This alienates new users.

### V2 Solution: Beginner Default + Expert Toggle

**Beginner view (default):**
```
┌──────────────────────────────────────────────────────────┐
│ Your Bittensor Overview                          [Expert]│
│                                                          │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │
│ │ Total Stake    │  │ Active Subnets │  │ Delegation │ │
│ │ 1,247 TAO      │  │ 8 of 11        │  │ 3 wallets  │ │
│ │ ▲ 12.3% ytd    │  │ ◉ All healthy  │  │ 800 TAO    │ │
│ └────────────────┘  └────────────────┘  └────────────┘ │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │  Your Top Subnets                                    ││
│ │                                                      ││
│ │  Navion (1)   12.4 TAO   [Stake more]               ││
│ │  Finetune (4)  8.2 TAO   [Stake more]               ││
│ │  Alpha (7)      2.1 TAO   [Stake more]               ││
│ │                                                      ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│  [Set Validator Preference]   [Manage Delegations]       │
└──────────────────────────────────────────────────────────┘
```

**Expert toggle (top-right of desk header):**
- Toggle: "Beginner | Expert"
- Beginner = summary stats, no addresses shown
- Expert = full Subtensor data, validator addresses (truncated), raw metrics
- User preference persists across sessions
- Expert mode label: "Expert view" with a lock icon

**No wallet address shown in Beginner view.** Only TAO amounts and subnet names.

---

## 7. Right Rail: Profile & Wallet (V2)

### V1 Problem: Profile/Wallet Hidden

V1 has no desktop profile presence. The wallet address is buried or absent.

### V2 Right Rail Profile Card

```
┌────────────────────────────────┐
│  [Avatar]  Alex Chen           │
│            alex@matter.io      │
│                                │
│  ┌──────────────────────────┐  │
│  │ 0x7a3B…F9d2   [📋]        │  │  ← copy button
│  └──────────────────────────┘  │
│                                │
│  Connected: 3 min ago          │
│                                │
│  ┌────────┐ ┌────────┐        │
│  │ Stake  │ │ Posit. │        │
│  │1,247   │ │2       │        │
│  │ TAO    │ │ $12.4k │        │
│  └────────┘ └────────┘        │
│                                │
│  [View full profile →]         │
└────────────────────────────────┘
```

**Rules:**
- Wallet address always truncated: `5CfTC…3bX9` (SS58) / `0x7a3B…F9d2` (EVM)
- Copy button: copies full address to clipboard, shows "Copied!" toast
- "Connected" status: shows time since last wallet connection (not a live indicator)
- Quick stats are desk-specific and update when switching desks
- Profile card never requires scrolling on a 1440px viewport

---

## 8. Session Cards (V2)

### V1 Problem: Ugly Curved Session Cards

V1 uses heavy `border-radius: 12px` on session cards with nested card grids inside.

### V2 Session Card

```
┌──────────────────────────────────────────────────────────┐
│ ○ Active session · Matterhorn Dev                        │
│                                                           │
│ Today at 2:34 PM                                          │
│                                                           │
│ You asked about subnet validator rewards and set a        │
│ delegation ceiling of 200 TAO on Finetune.               │
│                                                           │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│ │ Bittensor   │ │ Delegation  │ │ 200 TAO ceiling    │  │
│ │ ▲ +0.8%     │ │ set today   │ │ Finetune subnet 4  │  │
│ └─────────────┘ └─────────────┘ └─────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Rules:**
- `border-radius: 4px` — sharp corners, not curved
- No nested cards — stats are inline chips/text, not bordered sub-cards
- Session timestamp: `--text-xs`, `--v2-text-tertiary`
- Session summary: `--text-sm`, `--v2-text-secondary`, max 2 lines
- Active indicator: 8px circle, `--v2-accent` color, no pulsing animation

---

## 9. Screens

### 9.1 Home — Command Center

**Purpose:** Entry point that surfaces the most relevant desk context without requiring navigation.

**Layout:**
- Welcome header: "Good morning, Alex" + date
- Active desk card (large, full-width) — desk you're currently working in
- Recent sessions list (3 cards)
- Quick stats across all connected protocols
- Memory chip bar (cross-desk active memories)

**First action:** Click the active desk card to open it.

**Forbidden:** "Services" desk, "Crypto workspace" category.

### 9.2 Bittensor Desk

**Layout:**
- Header: desk icon (SVG) + "Bittensor" + Beginner/Expert toggle + Settings gear
- Right rail: quick stats (Total stake, Active validators, Delegation ceiling, Last sync)
- Main: summary cards (Top Subnets, Validator Preference, Delegations)
- Safety strip: "🔗 Read-only. Public Subtensor data only. No signing."

**States:** Default (beginner), Expert, Loading, Error (Subtensor unreachable), Empty (no subnets configured).

**Forbidden:** Full wallet address, "Matterhorn controls your stake", seed phrase fields.

### 9.3 Hyperliquid Desk

**Layout:**
- Header: desk icon + "Hyperliquid" + settings
- Right rail: Leverage ceiling, Margin mode, Funding alert thresholds
- Main: position tiles + alert list
- Safety strip: "📖 Preview only. Read-only via Hyperliquid Info API. No signing."

**Forbidden:** "Close position", "Submit order", API key fields.

### 9.4 Polymarket Desk

**Layout:**
- Header: desk icon + "Polymarket" + filter bar
- Right rail: Tracked market count, High-volume filter active
- Main: tracked market card grid
- Safety strip: "📖 Preview only. Read-only browsing data. No bet placement."

**Forbidden:** "Place bet on your behalf", CLOB credentials, bet amounts.

### 9.5 Wellness Desk

**Layout:**
- Header: desk icon + "Wellness" + toggle
- Right rail: streak display + today's check-in status
- Main: goal cards + check-in form
- Safety strip: "🔒 Stored locally only. Never sent to external servers."

**Toggle default: Off.** When Off, desk shows "Wellness suggestions are paused. Enable in Privacy & Forget Center." with a link.

**Forbidden:** Medical diagnoses, prescriptions, treatment recommendations, PHI, "sync" language.

### 9.6 Memory Desk

**Layout:**
- Header: desk icon + "Memory" + suggestion bell (badge count) + actions
- Right rail: active memory chip bar + filter chips
- Main: confirmed memory cards sorted by recency
- Empty state: "No memories yet. Start chatting and Matterhorn will surface suggestions."

**Card actions:** Use, Edit, Export, Forget (all always visible).

**Forbidden:** Hidden memory saves, "Crypto" as category.

### 9.7 MCPs Desk

**Layout:**
- Header: desk icon + "MCPs" + Add server button
- Right rail: Active tool count, External signer required count
- Main: tool registry table (Tool / Agent / Status / Scope / Actions)
- Safety strip: "🔌 MCP tools run locally. No credentials stored in Matterhorn."

**Status badges:** Active (green), Inactive (gray), External signer required (amber).

### 9.8 Settings & Profile

**SubNav:** Desk Preferences / Privacy & Forget / Memory Settings / Notifications / Security

**Profile section:**
- Avatar, name, email, member since
- Wallet address (truncated + copy)
- Memory count badge, desk count badge

**Desk preference toggles:** One row per desk, toggle + desk name + brief current state. All on by default except Wellness.

**Forget all:** Red button → multi-step confirmation (Type "FORGET" to confirm).

---

## 10. Responsive Behavior

### Desktop ≥1200px

- Left nav: 56px rail, icons + tooltips
- Main: full width minus nav + right rail
- Right rail: 260px fixed
- Memory chip bar: horizontal wrap
- Stat tiles: 3-column grid
- Tables: full columns

### Tablet 768–1199px

- Left nav: 48px rail, icons only
- Right rail: hidden, toggled as overlay panel. No trapped right rail — overlay does not reflow main content or cause horizontal overflow.
- Floating profile button: bottom-right corner
- Stat tiles: 2-column wrap
- Tables: horizontal scroll, first column sticky

### Mobile <768px

- Left nav: hidden
- Right rail: absent — never present on mobile
- Bottom tab bar: 5 tabs (Home, Bittensor, Hyperliquid, Polymarket, Wellness) + More (Settings)
- Profile: avatar in top bar
- Stat tiles: 1-column stack
- Tables: horizontal scroll, first column sticky
- Composer: fixed position, always above keyboard. Uses `visualViewport` API to detect keyboard open/close and avoid overlap.
- No horizontal overflow: all content respects viewport width

---

## 11. Do Not Build Patterns

These patterns must never appear in V2 implementation:

| Pattern | Why Forbidden |
|---------|---------------|
| Generic "Crypto workspace" | Re-brands Matterhorn as a crypto app |
| "Services" in customer nav | Not a customer-facing desk in V1 |
| Computer Use in customer defaults | Not a default feature; developer-only |
| Seed phrase input field | Never — no exceptions |
| Private key input field | Never — no exceptions |
| API secret input field | Never for customer-facing features |
| "Submit order" button | Preview-only, no execution in V1 |
| "Sign transaction" button | Preview-only, external signer only |
| "Close position" button | Hyperliquid is read-only in V1 |
| Medical diagnosis text | Wellness must use educational framing only |
| Prescription reference | Wellness must use educational framing only |
| Treatment recommendation | Wellness must use educational framing only |
| Full wallet address (non-truncated) | Always truncate to `5CfTC…3bX9` |
| Emoji as primary desk icon | Use SVG icon system |
| Glassmorphism panels | Explicitly forbidden |
| Border-radius > 4px on data cards | Sharp corners standard |
| Nested card grids | Cards contain content, not more bordered cards |
| Notification counts in left nav rail | Move to right rail bell |
| Memory chips in left nav rail | Move to right rail |
| Bottom bar profile/wallet | Desktop: right rail; Mobile: top bar |
| ALL CAPS card titles | Sentence case only |

---

## 12. QA Screenshot Rubric

Review the following in every desk implementation. For each check, a screenshot must show compliance.

### Dark Mode — Desktop (1280×800)

| Check | Expected |
|-------|----------|
| Left nav rail: 56px, icons with desk accent on active | Icon colored, not white |
| Right rail: 260px, profile card visible | Avatar + truncated address |
| No full-width outlined card borders | Cards use surface fill, not outlines |
| Desk accent bar (3px) on cards | Colored top border visible |
| Safety strip visible on each desk | Safety text in amber strip |
| Memory chip bar in right rail | Chips with desk color tint |
| Bottom composer: 80px, above content | No overlap with content |
| No horizontal overflow | No right-edge cutoff |
| Bell badge count in right rail | Number visible if > 0 |
| Logo: mountain mark + "Matterhorn" in nav | SVG mark, not emoji |

### Dark Mode — Tablet (768px width)

| Check | Expected |
|-------|----------|
| Left nav rail: 48px, icons only | Text labels hidden |
| Right rail: hidden, floating profile button | FAB visible bottom-right |
| 2-column card grid | No single orphans |
| Tables: horizontal scroll | First column sticky |
| Bottom composer: fixed position | Always above keyboard |
| No horizontal overflow | Horizontal scroll works |

### Dark Mode — Mobile (390px width)

| Check | Expected |
|-------|----------|
| Bottom tab bar: 5 tabs | Home, Bittensor, Hyperliquid, Polymarket, Wellness |
| Profile: top bar avatar | Avatar visible, not in bottom bar |
| 1-column card layout | Full-width cards |
| Stat tiles: stacked vertically | No horizontal overflow |
| Tables: scroll with sticky first col | Data readable |
| Composer above keyboard | No content overlap |

### Light Mode — Desktop (1280×800)

| Check | Expected |
|-------|----------|
| `--v2-bg-base: #F5F5F5` visible | Page background is off-white |
| Cards: white surface `#FFFFFF` | Not gray or dark |
| Accent color: `#2563EB` | Brand accent is blue |
| Text: `#0C0C0C` primary | Dark text on light background |
| Border: `#E0E0E0` on cards | Light gray, not dark |
| Safety strip: readable | Sufficient contrast |

### Light Mode — Mobile (390px width)

| Check | Expected |
|-------|----------|
| Cards: white surface | No dark cards |
| Text contrast: 4.5:1 minimum | All text readable |
| Bottom tab bar: readable | Sufficient contrast on off-white |
| Focus rings visible | `:focus-visible` in `--v2-accent` |

### Per-Desk Visual Checks

**Bittensor:**
- Beginner/Expert toggle in header
- No full wallet address in Beginner view
- TAO amounts shown with ▲/▼ change indicator
- Warm orange accent `#FF7C43` visible on active nav and card bars

**Hyperliquid:**
- Soft purple accent `#C084FC` visible
- Position tiles: Long (green), Short (red) side badges
- No "Close position" button

**Polymarket:**
- Gold accent `#FBBF24` visible
- Market cards: probability badge, volume, confidence bar
- No bet placement UI

**Wellness:**
- Rose accent `#F472B6` visible
- Local-only notice on every Wellness card
- Toggle default Off — disabled empty state if Off
- No medical language

**Memory:**
- Cyan accent `#67E8F9` visible
- Forget button always visible on each card
- Bell badge with unread count
- No "Crypto" as category label

**MCP:**
- Emerald accent `#34D399` visible
- "External signer required" amber badge present
- No credentials stored in Matterhorn notice

### Global Visual Checks

| Check | Expected |
|-------|----------|
| No horizontal overflow on any viewport | 1280px, 768px, 390px all clean |
| No right-edge content cut-off | Full width visible |
| Bottom composer never overlaps content | Fixed above content |
| Right rail collapses cleanly on tablet | FAB reveals overlay |
| Right rail absent on mobile | Top bar shows profile |
| No outlined box stacking | Cards use surface fills |
| No glassmorphism | No blur/transparency |
| No border-radius > 4px on data cards | Sharp corners |
| SVG icons, not emoji | Protocol icons are vector |
| One obvious first action per desk | Primary CTA visible without scrolling |

---

## 13. Token Reference

```css
/* Surface hierarchy */
--v2-bg-base:        #0C0C0C;   /* page background */
--v2-bg-surface:     #111111;   /* card / panel surface */
--v2-bg-elevated:    #1A1A1A;   /* elevated panel */
--v2-bg-hover:       #202020;   /* interactive hover */

/* Borders */
--v2-border-subtle:  #1F1F1F;   /* card separators (nearly invisible) */
--v2-border-default: #2A2A2A;   /* interactive card borders */
--v2-border-strong:  #3A3A3A;   /* emphasized */

/* Text */
--v2-text-primary:   #F0F0F0;
--v2-text-secondary: #8A8A8A;
--v2-text-tertiary:  #555555;

/* Brand */
--v2-accent:         #D1F2FF;   /* dark mode */
--v2-accent-dim:     rgba(209,242,255,0.08);

/* Per-desk accents (dark mode) */
--v2-desk-bittensor:  #FF7C43;
--v2-desk-hyperliquid: #C084FC;
--v2-desk-polymarket:  #FBBF24;
--v2-desk-wellness:    #F472B6;
--v2-desk-memory:      #67E8F9;
--v2-desk-mcp:         #34D399;
--v2-desk-home:        #D1F2FF;

/* Status */
--v2-status-success: #22C55E;
--v2-status-warning: #F59E0B;
--v2-status-error:   #EF4444;
--v2-status-info:    #60A5FA;

/* Confidence */
--v2-conf-high:   #22C55E;
--v2-conf-medium: #F59E0B;
--v2-conf-low:    #EF4444;

/* Layout */
--v2-nav-width:   56px;
--v2-rail-width:  260px;
--v2-radius:      4px;   /* maximum radius on data cards */
--v2-font-mono:   'JetBrains Mono', monospace;
--v2-font-sans:   'Aeonik', system-ui, sans-serif;

/* Light mode overrides */
:root[data-theme="light"] {
  --v2-bg-base:        #F5F5F5;
  --v2-bg-surface:     #FFFFFF;
  --v2-bg-elevated:    #FAFAFA;
  --v2-text-primary:   #0C0C0C;
  --v2-text-secondary: #5C5C5C;
  --v2-text-tertiary:  #9CA3AF;
  --v2-accent:         #2563EB;
  --v2-accent-dim:     rgba(37,99,235,0.08);
  --v2-border-subtle:  #EBEBEB;
  --v2-border-default: #D4D4D4;
  --v2-border-strong:  #A3A3A3;
  /* Per-desk accents (light mode) */
  --v2-desk-bittensor:  #EA580C;
  --v2-desk-hyperliquid: #7C3AED;
  --v2-desk-polymarket:  #D97706;
  --v2-desk-wellness:    #DB2777;
  --v2-desk-memory:      #0891B2;
  --v2-desk-mcp:         #059669;
  --v2-desk-home:        #2563EB;
}
```

---

## 14. Testing & QA

### Screenshot Review Required

Before shipping each desk, a screenshot review is required in:
- Dark mode: 1280×800, 768×1024, 390×844
- Light mode: 1280×800, 390×844

Each screenshot must show:
1. The correct layout (nav/rail/content/rail)
2. Desk accent color visible
3. Safety strip present
4. No horizontal overflow
5. One obvious first action

### Gate

```bash
pnpm test:minimax-desk-v2       # spec coverage gate
pnpm test:minimax-ui-system      # system compatibility
pnpm test:market-execution-safety-gate  # safety
```

### Open Questions for Kimi

1. **Right rail on tablet** — overlay panel vs. slide-in from right? Preference: overlay panel (no layout shift).
2. **Expert mode for Bittensor** — should it require re-authentication, or is it a simple local toggle?
3. **Profile card quick stats** — should "Stake" in the profile card link to the Bittensor desk, or is that too implicit?
4. **Session cards** — should they be editable/renamed, or read-only?
