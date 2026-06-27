# Matterhorn App Shell V2 — Visual Redesign Handoff

**Spec version:** 1.0
**Status:** Draft — for Stitch review and Codex implementation
**Branch:** `minimax/matterhorn-app-shell-v2`
**Owns:** `docs/ui/app-shell-v2/`, `scripts/minimax-app-shell-v2.test.mjs`
**Replaces:** App Shell V1 (established in `docs/ui/matterhorn-product-ui-system.md`)

---

## What This Document Is

A complete visual and product QA handoff for the production UI polish pass. It defines the App Shell V2 — the outer chrome, all desk pages, dark/light themes, responsive behavior, and the specific boxiness/quality problems to solve. Codex ships production code against this document.

**Companion documents:**
- `docs/ui/matterhorn-desk-v2/SPEC.md` — Desk-level V2 visual spec (token system, per-desk accents, session cards, wellness rules)
- `docs/ui/app-shell-v2/QA-RUBRIC.md` — Screenshot QA rubric for Stitch review
- `scripts/minimax-app-shell-v2.test.mjs` — Static gate (this document's existence is asserted by the gate)

---

## 1. Before / After Critique

### Current Problems (V1 / As-Is Screenshots)

Reference screenshots in `docs/ui/screenshots/`:

| Screenshot | Problem |
|-----------|---------|
| `bittensor-desk--desktop.png` | Heavily outlined cards, flat `#0C0C0C` bg, wallet hidden in bottom bar, nav rail is info dump |
| `hyperliquid-desk--desktop.png` | Table-like rows, "submit order" framing, no surface hierarchy |
| `polymarket-desk--desktop.png` | Monotonous dark, outlined market cards, "place bet on your behalf" copy |
| `wellness-desk--desktop.png` | Medical-framed language, clinical color treatment, no local-only notice |
| `session-hub--desktop.png` | Debug-feel layout, session cards feel like log entries, no product polish |
| `welcome--desktop.png` | Generic onboarding, no product personality, "Services" desk visible |
| `services--desktop.png` | "Services" as customer-facing desk — forbidden in V1 |

### V2 Fixes

| Problem | V2 Solution |
|---------|-------------|
| Heavy white outlines on cards | `--v2-bg-surface` fill, `--v2-border-subtle` barely-visible separator |
| Flat `#0C0C0C` everywhere | Warm `#111111` surfaces, per-desk accent tints |
| Wallet hidden | Right rail profile card on desktop |
| Nav as information dump | Icons + tooltips only; right rail for stats/chips/bell |
| Home feels like debug screen | Product launcher: greeting + active desk hero + recent sessions + memory chips |
| Desk pages feel like wireframes | Surface fills + accent bars + one clear CTA per card |
| Mobile bottom bar has profile | Profile in top bar only; bottom bar = 5 nav tabs |
| Wellness feels clinical | Rose accent, local-only badges, Personal/Restricted sensitivity only |
| Loading states are skeletons | Spinner + context label (e.g., "Loading subnet data…") |

---

## 2. App Shell Architecture

### 2.1 Layout Grid

```
Desktop ≥1200px:
┌──────────┬──────────────────────────────────┬────────────────┐
│  LEFT    │   MAIN                           │  RIGHT         │
│  NAV     │   (desk content)                 │  RAIL          │
│  56px    │   scrollable                     │  260px         │
│          │   ┌──────────────────────────┐   │  fixed         │
│  Logo    │   │  Composer (80px, fixed)  │   │                │
│  ────    │   └──────────────────────────┘   │  Profile       │
│  Home    │                                  │  Wallet addr   │
│  Bitt    │                                  │  Quick stats   │
│  Hyper   │                                  │  Bell (N)      │
│  Poly    │                                  │  Memory chips  │
│  Well    │                                  │  Desk context  │
│  Memo    │                                  │                │
│  MCP     │                                  │                │
│  ────    │                                  │                │
│  ⚙ Set  │                                  │                │
└──────────┴──────────────────────────────────┴────────────────┘

Tablet 768–1199px:
┌────────┬─────────────────────────────┬───────────┐
│  LEFT  │   MAIN                      │  RIGHT    │
│  NAV   │   scrollable                │  RAIL     │
│  48px  │                            │  absent   │
│        │   Composer (fixed)         │  FAB →    │
└────────┴─────────────────────────────┴───────────┘

Mobile <768px:
┌─────────────────────────────────────────┐
│  TOP BAR (48px)                         │
│  Avatar  Matterhorn  ⚙ Settings  Bell   │
├─────────────────────────────────────────┤
│                                         │
│   MAIN (scrollable)                     │
│   Composer (fixed, above keyboard)      │
│                                         │
├─────────────────────────────────────────┤
│  BOTTOM TAB BAR (56px)                  │
│  🏠  ⚡  💎  📊  ♥   + More            │
└─────────────────────────────────────────┘
```

### 2.2 CSS Custom Properties

```css
/* ── Surface hierarchy ───────────────────────────────────── */
--v2-bg-base:       #0C0C0C;   /* page background */
--v2-bg-surface:     #111111;   /* card / panel surface (warmer) */
--v2-bg-elevated:    #1A1A1A;   /* elevated / hover state */
--v2-bg-hover:       #202020;   /* interactive hover */
--v2-border-subtle:  #1F1F1F;   /* card separators */
--v2-border-default: #2A2A2A;   /* interactive card borders */
--v2-border-strong:   #3A3A3A;   /* emphasized */

/* ── Text ───────────────────────────────────────────────── */
--v2-text-primary:   #F0F0F0;
--v2-text-secondary: #8A8A8A;
--v2-text-tertiary:  #555555;

/* ── Brand accent ───────────────────────────────────────── */
--v2-accent:         #D1F2FF;   /* dark mode */
--v2-accent-dim:     rgba(209,242,255,0.08);

/* ── Per-desk accents (dark mode) ────────────────────────── */
--v2-desk-bittensor:   #FF7C43;
--v2-desk-hyperliquid: #C084FC;
--v2-desk-polymarket:  #FBBF24;
--v2-desk-wellness:    #F472B6;
--v2-desk-memory:      #67E8F9;
--v2-desk-mcp:         #34D399;
--v2-desk-home:        #D1F2FF;

/* ── Status ─────────────────────────────────────────────── */
--v2-status-success: #22C55E;
--v2-status-warning: #F59E0B;
--v2-status-error:   #EF4444;

/* ── Confidence ──────────────────────────────────────────── */
--v2-conf-high:   #22C55E;
--v2-conf-medium: #F59E0B;
--v2-conf-low:    #EF4444;

/* ── Layout ──────────────────────────────────────────────── */
--v2-nav-width:   56px;
--v2-rail-width:  260px;
--v2-radius:      4px;  /* maximum on data cards */
--v2-font-mono:   'JetBrains Mono', monospace;
--v2-font-sans:   'Aeonik', system-ui, sans-serif;

/* ── Light mode overrides ───────────────────────────────── */
:root[data-theme="light"] {
  --v2-bg-base:        #F5F5F5;
  --v2-bg-surface:     #FFFFFF;
  --v2-bg-elevated:    #FAFAFA;
  --v2-text-primary:   #0C0C0C;
  --v2-text-secondary: #5C5C5C;
  --v2-accent:         #2563EB;
  --v2-accent-dim:     rgba(37,99,235,0.08);
  --v2-border-subtle:  #EBEBEB;
  --v2-border-default: #D4D4D4;
  /* Per-desk accents (light mode) */
  --v2-desk-bittensor:   #EA580C;
  --v2-desk-hyperliquid: #7C3AED;
  --v2-desk-polymarket:  #D97706;
  --v2-desk-wellness:    #DB2777;
  --v2-desk-memory:      #0891B2;
  --v2-desk-mcp:         #059669;
  --v2-desk-home:        #2563EB;
}
```

---

## 3. Left Navigation Rail

### Desktop (≥1200px)

- Width: 56px, fixed left, full height
- Logo: Mountain mark SVG + "Matterhorn" 13px Aeonik 500
- Nav items: icon (24px SVG, `currentColor`) + tooltip on hover
- Active state: `--v2-accent` icon color + `--v2-accent-dim` pill background
- Items: Home, Bittensor, Hyperliquid, Polymarket, Wellness, Memory, MCPs, Settings
- No notification counts in nav — bell in right rail
- No memory chips in nav — chips in right rail
- No text labels in rail (tooltip on hover)

### Tablet (768–1199px)

- Width: 48px, icons only, no labels, no tooltips
- Same icon set

### Mobile (<768px)

- Hidden — replaced by bottom tab bar

### Logo Rules

- **Primary:** Mountain mark SVG + "Matterhorn" wordmark
- **Nav mark:** Mountain mark only (32px) in nav rail
- **Never:** emoji as logo, generic "M" letterform without mountain mark

---

## 4. Right Rail

### Desktop (≥1200px)

Width: 260px, fixed right, does not scroll with main.

**Sections (top to bottom):**

1. **Profile card** — Avatar (40px) + display name + truncated wallet `0x7a3B…F9d2` + copy button → "Copied!" toast
2. **Connected status** — "Connected N min ago"
3. **Quick stats** — 2×2 grid of desk-specific numbers (e.g., Bittensor: Total Stake, Active Subnets, Delegations, Last sync)
4. **Bell** — Notification/suggestion icon with badge count
5. **Memory chip bar** — Active context chips with desk color tint on active chip; horizontal scroll
6. **Desk context panel** — Current desk's at-a-glance (e.g., on Bittensor: top subnet, delegation status)

**Rules:**
- No text clipped — profile card fits without scrolling on 1440px viewport
- Copy button uses Clipboard API
- Quick stats update when switching desks
- Memory chips: `--v2-bg-surface` background, `--v2-border-subtle` border

### Tablet (768–1199px)

- Right rail hidden on load
- FAB (bottom-right): avatar icon, `--v2-bg-elevated` fill, `--v2-border-default` border
- FAB tap → right rail as overlay panel (slides in from right, 260px, backdrop click closes)
- No layout shift on tablet

### Mobile (<768px)

- Right rail absent entirely
- Profile: avatar in top bar (always visible)
- Settings: gear icon in top bar

---

## 5. Top Bar (Mobile)

- Height: 48px, fixed top
- Left: Avatar (32px circle)
- Center: "Matterhorn" wordmark
- Right: Settings gear icon + Bell icon (badge)
- Background: `--v2-bg-surface`
- No search bar, no breadcrumb

---

## 6. Bottom Tab Bar (Mobile)

- Height: 56px + safe area, fixed bottom
- 5 tabs: Home, Bittensor, Hyperliquid, Polymarket, Wellness
- More tab → overflow sheet with Memory, MCPs, Settings
- Active tab: `--v2-accent` icon + `--v2-accent-dim` pill
- No profile in bottom bar (top bar only)
- Composer: fixed above keyboard, uses `visualViewport` API

---

## 7. Composer

- Desktop: 80px fixed at bottom of main area, above content
- Mobile: fixed above keyboard on open
- Background: `--v2-bg-surface`
- Border-top: `--v2-border-subtle`
- Never overlaps content (fixed position)
- No submit action — sends to AI only

---

## 8. Home Desk

### V1 Problem (reference: `welcome--desktop.png`)

Generic onboarding feel, "Services" desk visible, no product personality, session list feels like debug output.

### V2 Home Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Good evening, Alex          Thu Jun 26 · Matterhorn       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Active Desk ──────────────────────────────────────────┐│
│  │  [Icon]  Bittensor                          Open →    ││
│  │  1,247 TAO staked · 8 subnets active · 3 delegations ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  Recent Sessions                                            │
│  ┌───────────────────┐  ┌───────────────────┐            │
│  │ ○ Bittensor       │  │ ○ Hyperliquid     │            │
│  │ Today 2:34 PM     │  │ Yesterday 5:12 PM │            │
│  │ Set delegation    │  │ Reviewed position │            │
│  └───────────────────┘  └───────────────────┘            │
│                                                             │
│  Memory Chips                                               │
│  [Subnet 4 delegation] [Finetune rewards] [HL position]      │
│                                                             │
│  Quick Stats                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 3 Desks  │ │ 12 Mem.  │ │ 2 Pos.  │ │ 4 Markets│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  Desk Grid                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │  Bittensor │ │ Hyperliquid │ │ Polymarket │              │
│  └────────────┘ └────────────┘ └────────────┘              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │  Wellness  │ │  Memory    │ │   MCPs     │              │
│  └────────────┘ └────────────┘ └────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### V2 Rules

- Greeting: "Good morning/afternoon/evening, [Name]" + date
- Active Desk card: full-width, `--v2-bg-elevated`, `--v2-desk-home` 3px top bar, "Open →" CTA
- Recent sessions: V2 session cards (sharp corners, inline metrics, no animation)
- Memory chips: horizontal scroll, cross-desk
- Quick stats: 4 tiles, `--text-xs`, `--v2-text-tertiary`
- Desk grid: 3-col desktop / 2-col tablet / 1-col mobile
- **Forbidden:** "Services", "Crypto workspace", "DeFi workspace"

---

## 9. Desk Pages

### 9.1 Bittensor Desk

**Tokens:** `--v2-desk-bittensor` (`#FF7C43` dark / `#EA580C` light)

| State | What shows |
|-------|-----------|
| Default (Beginner) | 3 stat tiles, top subnets list, "Set Validator Preference" CTA, safety strip |
| Expert mode | Raw Subtensor data, truncated addresses, 🔒 badge |
| Loading | Spinner + "Loading subnet data…" |
| Empty | "Connect a wallet to see your Bittensor overview." |
| Degraded | "Subtensor network unreachable. Last known data from [time]." + Retry |

**Safety strip:** "🔗 Read-only. Public Subtensor data only. No seed phrases, private keys, or signing capabilities. Matterhorn never holds or manages stake."

**Forbidden:** Seed phrase fields, private key fields, "Matterhorn controls your stake", full wallet address in Beginner view.

### 9.2 Hyperliquid Desk

**Tokens:** `--v2-desk-hyperliquid` (`#C084FC` dark / `#7C3AED` light)

| State | What shows |
|-------|-----------|
| Default | Position tiles (Long=green, Short=red), funding rate, margin mode |
| Empty | "No open positions. Connect a wallet to track Hyperliquid positions." |
| Degraded | "Hyperliquid API unreachable. Position data may be stale." |

**Safety strip:** "📖 Preview only. Read-only via Hyperliquid Info API. No signing."

**Forbidden:** "Close position", "Submit order", "sign transaction", API key input.

### 9.3 Polymarket Desk

**Tokens:** `--v2-desk-polymarket` (`#FBBF24` dark / `#D97706` light)

| State | What shows |
|-------|-----------|
| Default | Market cards (probability badge + volume + confidence bar) |
| Empty | "No markets tracked. Search markets to add them." + search input |
| Degraded | "Markets data unavailable. Cached data from [time]." |

**Safety strip:** "📖 Preview only. Read-only browsing data. No bet placement."

**Forbidden:** "Place bet on your behalf", bet amounts, "confirm trade".

### 9.4 Wellness Desk

**Tokens:** `--v2-desk-wellness` (`#F472B6` dark / `#DB2777` light)

**Toggle default: OFF.** When OFF, show: "Wellness suggestions are paused. Enable in Privacy & Forget Center." + link.

| State | What shows |
|-------|-----------|
| OFF | Disabled empty state with link to Privacy & Forget Center |
| ON (enabled) | Goal cards, streak display, today's check-in |
| Empty (ON) | "Add your first wellness goal." + form |
| Loading | Spinner + "Loading wellness data…" |

**Every Wellness card:** "🔒 Stored locally only" badge.

**Forbidden:** Medical diagnosis, prescription, treatment recommendation, PHI, "sync", "cloud backup", "patient", "condition".

### 9.5 Memory Desk

**Tokens:** `--v2-desk-memory` (`#67E8F9` dark / `#0891B2` light)

| State | What shows |
|-------|-----------|
| Default | Memory cards (title, summary, "Why remembered" chip), chip bar in right rail |
| Empty | "No memories yet. Start chatting and Matterhorn will surface suggestions." |
| Bell open | Suggestion cards with "Remember / Dismiss" |

**Card actions (always visible):** Use / Edit / Export / Forget. No hidden overflow.

**Forbidden:** "Crypto" as category, hidden memory saves.

### 9.6 MCPs Desk

**Tokens:** `--v2-desk-mcp` (`#34D399` dark / `#059669` light)

| State | What shows |
|-------|-----------|
| Default | Tool registry table (Tool / Agent / Status / Scope / Actions) |
| Empty | "No MCP servers configured. Add a server to get started." |
| External signer | Amber "External signer required" badge |

**Safety strip:** "🔌 MCP tools run locally. No credentials stored in Matterhorn."

### 9.7 Settings & Profile

| Section | What shows |
|---------|-----------|
| Profile | Avatar + name + email + "Member since" |
| Wallet | Truncated address `0x7a3B…F9d2` + copy button |
| Stats | Memory count badge, desk count badge |
| Desk Preferences | Toggle per desk (all on by default except Wellness) |
| Privacy & Forget | Privacy Center link, data export, forget individual |
| Forget all | Red button → modal: type "FORGET" to confirm |

---

## 10. Session Cards (Shell Element)

Session cards appear in Home and the Session Hub. V2 anatomy:

```
┌──────────────────────────────────────────────────────────┐
│ ○ Active session · Bittensor                              │
│                                                            │
│ Today at 2:34 PM                                           │
│                                                            │
│ You set a delegation ceiling of 200 TAO on Finetune.       │
│                                                            │
│  [Bittensor]  [Delegation set]  [200 TAO · Finetune]    │
└──────────────────────────────────────────────────────────┘
```

**Rules:**
- `border-radius: 4px` — sharp corners, not curved
- No nested cards — stats are inline chips, not bordered sub-cards
- Active dot: 8px solid `--v2-accent`, no animation (no pulse, no blink)
- Timestamp: `--text-xs`, `--v2-text-tertiary`
- Summary: `--text-sm`, `--v2-text-secondary`, max 2 lines
- Metrics: inline `--text-xs` chips with desk accent tint

---

## 11. Surface & Card System (Boxiness Fix)

### The Problem

V1 stacks cards with `border: 1px solid` on every surface. This creates a wireframe feel — every card competes as an outline.

### V2 Solution: Surfaces Over Outlines

```
Background (#0C0C0C)
  └── Surface card (#111111, border: 1px solid #1F1F1F)
        └── Content — no additional outlines
              └── Interactive row (hover: #1A1A1A, not outlined)
```

**Rules:**
- `--v2-bg-surface` is the default card fill — NOT a border
- Default card border: `--v2-border-subtle` (`#1F1F1F`) — barely visible separator
- Only interactive cards get `--v2-border-default`
- No `border-radius` > 4px on data cards
- No nested card grids — a card contains content, not another card with its own border
- Depth from **background hierarchy** (base → surface → elevated), not border weight
- 3px desk accent bar replaces the need for heavy borders
- **No glassmorphism** — `backdrop-filter: blur()` is forbidden
- **Sharp corners** — all cards use `--v2-radius: 4px`; no border-radius on outer chrome elements beyond this
- **Surface fill** — every card gets a background fill, not just a border outline
- surface fill: cards use a background color, not just borders, to establish visual hierarchy

---

## 12. Dark Mode & Light Mode

### Dark Mode (default)

`--data-theme` attribute not set or set to `"dark"`. Background `#0C0C0C`, surface `#111111`, elevated `#1A1A1A`. Text primary `#F0F0F0`. Accent `#D1F2FF`. All desk accent colors tuned for dark backgrounds.

### Light Mode

Set via `data-theme="light"` on `<html>`. Background `#F5F5F5`, surface `#FFFFFF`, elevated `#FAFAFA`. Text primary `#0C0C0C`. Accent `#2563EB`. Desk accents shifted to darker tints for legibility on white.

### Accessibility Requirements

- All text/background pairs must maintain **contrast ratio ≥ 4.5:1** (WCAG AA) for body text and ≥ 3:1 for large text / UI components
- Focus indicators use `outline: 2px solid var(--v2-accent)` with `outline-offset: 2px`; the `focus-visible` pseudo-class gates keyboard focus rings (no mouse focus rings)
- No color as the sole means of conveying information — pair color with text labels or icons

---

## 13. Responsive Behavior

### Desktop ≥1200px

| Element | Behavior |
|---------|----------|
| Left nav | 56px rail, icons + tooltips |
| Right rail | 260px, always visible, fixed |
| Cards | 3-column grid |
| Memory chip bar | Horizontal wrap |
| Stat tiles | 3-column grid |
| Tables | Full columns |

### Tablet 768–1199px

| Element | Behavior |
|---------|----------|
| Left nav | 48px, icons only |
| Right rail | Hidden, FAB toggles overlay. No trapped right rail — overlay does not reflow main content or cause horizontal overflow. |
| Cards | 2-column grid |
| Tables | Horizontal scroll, first column sticky |

### Mobile <768px

| Element | Behavior |
|---------|----------|
| Left nav | Hidden |
| Right rail | Absent |
| Top bar | Avatar + wordmark + settings + bell |
| Bottom bar | 5 tabs (Home, Bittensor, Hyperliquid, Polymarket, Wellness) + More |
| Cards | 1-column stack |
| Stat tiles | Stacked vertically |
| Tables | Horizontal scroll, first column sticky |
| Composer | Fixed above keyboard, `visualViewport` API |

---

## 13. States

### Loading

- Spinner (CSS, not GIF) + context label: "Loading [specific data]…"
- Never skeleton loaders on first render — show spinner with label
- Skeleton loaders acceptable on desk switch after first load

### Empty States

Each desk has a specific empty state message (documented in §9 above). Empty states include:
- Icon (SVG, not emoji)
- Heading (sentence case, not ALL CAPS)
- Body text (what to do next)
- Primary CTA button (if actionable)

### Degraded States

When a data provider is unreachable:
- Amber strip at top of desk: "[Provider] unreachable. [What data is affected]. Last known from [time]."
- Retry button in strip
- Cached/stale data shown if available
- Never silently fail — always show degraded state with retry

### Error States

- Red strip at top: "Something went wrong. [Specific error]. [Retry]"
- Error boundary catches crashes, shows friendly message

---

## 14. Forbidden Patterns

| Pattern | Why | Severity |
|---------|-----|----------|
| Generic "Crypto workspace" | Re-brands as crypto app | P0 |
| "Services" in customer nav | Not a V1 customer desk | P0 |
| Seed phrase input field | Never | P0 |
| Private key input field | Never | P0 |
| API secret / key input field | Customer-facing only | P0 |
| "Submit order" button | Preview-only, no execution | P0 |
| "Sign transaction" button | Preview-only | P0 |
| "Close position" button | Hyperliquid is read-only | P0 |
| Medical diagnosis text | Wellness uses educational framing only | P0 |
| Prescription reference | Wellness uses educational framing only | P0 |
| Treatment recommendation | Wellness uses educational framing only | P0 |
| Full wallet address (non-truncated) | Always truncate | P0 |
| Emoji as primary desk icon | Use SVG icon system | P0 |
| `backdrop-filter: blur()` | Glassmorphism forbidden | P0 |
| `border-radius` > 4px on data cards | Sharp corners standard | P0 |
| Nested card grids | Cards contain content, not more bordered cards | P0 |
| "Place bet on your behalf" | Polymarket read-only only | P0 |
| "Matterhorn controls your stake" | Non-custodial framing | P0 |
| "Matterhorn holds or manages your [asset]" | Non-custodial framing | P0 |
| "OpenWork" in visible UI copy | Not a customer-facing product | P1 |
| "openwork" / "opencodec" in CSS | Brand bleed | P1 |
| "Mint now" / "Hire agent" | Not V1 features | P0 |
| ALL CAPS card titles | Sentence case only | P2 |
| Notification counts in left nav | Right rail bell only | P2 |

---

## 15. Token Reference Summary

```css
/* Layout */
--v2-nav-width:   56px;   /* 48px tablet */
--v2-rail-width:  260px;
--v2-radius:      4px;

/* Surfaces */
--v2-bg-base:     #0C0C0C;   /* dark / #F5F5F5 light */
--v2-bg-surface:  #111111;   /* dark / #FFFFFF light */
--v2-bg-elevated: #1A1A1A;   /* dark / #FAFAFA light */

/* Text */
--v2-text-primary:   #F0F0F0;   /* dark / #0C0C0C light */
--v2-text-secondary: #8A8A8A;   /* dark / #5C5C5C light */

/* Brand */
--v2-accent:     #D1F2FF;   /* dark / #2563EB light */
--v2-accent-dim: rgba(209,242,255,0.08);
```

---

## 16. QA Gates

Before shipping the app shell polish pass, all of the following must pass:

```bash
pnpm test:minimax-app-shell-v2   # 247+ checks, all PASS
pnpm test:market-execution-safety-gate  # all PASS
pnpm test:minimax-ui-system      # system compatibility, all PASS
```

### Screenshot Review Required

Every desk at:
- 1280×800 dark (primary review — Gate S1)
- 1280×800 light (Gate S2)
- 768×1024 dark (tablet — Gate S3)
- 390×844 dark (mobile — Gate S4)
- 390×844 light (Gate S5)

Plus: empty states, loading states, degraded states, right rail open/closed on tablet.

(End of file)
