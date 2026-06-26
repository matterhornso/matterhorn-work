# Matterhorn Desk UI V2 — Production QA

**Spec:** `docs/ui/matterhorn-desk-v2/SPEC.md`
**Purpose:** Exact visual acceptance criteria for Codex implementation. Codex ships production code against this document. Any deviation is a QA failure.
**Status:** Active — update this document when SPEC.md changes.

---

## Overview

Production QA is a **code-and-screenshot** check. Codex implementation must:

1. Use only `--v2-*` tokens from the SPEC. No ad-hoc color values.
2. Pass every criterion in this document.
3. Produce screenshots for every entry in the Production Screenshot Matrix (Section 7).

If a criterion cannot be met due to a technical constraint, open a SPEC question before shipping — do not silently deviate.

---

## 1. Per-Desk Visual Acceptance Criteria

### 1.1 Home Command Center

**Token prefix:** `--v2-desk-home`

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Hero header | Greeting: "Good morning/afternoon/evening, [Name]" + current date | Date updates dynamically |
| Active desk card | Full-width, `--v2-bg-elevated` fill, `--v2-desk-home` 3px top bar | Primary CTA "Open desk →" |
| Desk grid | 3-col desktop / 2-col tablet / 1-col mobile | Cards use `--v2-bg-surface` fill |
| Memory chip bar | Horizontal scroll on overflow, `--v2-desk-home` tint on active chip | Below active desk card |
| Quick stats row | `--v2-text-secondary`, `--text-xs` | Desk count, memory count, last active |
| No "Services" desk | Grid shows only the 7 desks from SPEC §9 | Grid never contains "Services" |
| No "Crypto workspace" label | Category label: "Desks" | Never "DeFi", "Crypto", "Web3" |

### 1.2 Bittensor Desk

**Token prefix:** `--v2-desk-bittensor` (`#FF7C43` dark / `#EA580C` light)

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Header | SVG icon (network node) + "Bittensor" + Beginner/Expert toggle + settings gear | All 4 elements present |
| Beginner/Expert toggle | Pill toggle: "Beginner" left (active default), "Expert" right | Persists across sessions |
| Beginner view: hero | 3 stat tiles: Total Stake (TAO), Active Subnets (N of M), Delegations (count + total TAO) | No addresses shown |
| Beginner view: top subnets | List: subnet name + TAO staked + [Stake more] button | Button opens stake flow |
| Expert view: data | Subnet IDs, validator addresses (truncated `5CfTC…3bX9`), raw metrics | 🔒 badge visible |
| Safety strip | "🔗 Read-only. Public Subtensor data only. No seed phrases, private keys, or signing capabilities. Matterhorn never holds or manages stake." | Amber strip, always visible |
| No wallet address in Beginner | Not present in Beginner view | Expert only |
| Accent color on nav | Active nav: `#FF7C43` icon + `--v2-accent-dim` pill | Visible on dark bg |
| Empty state | "Connect a wallet to see your Bittensor overview." | No skeleton loaders |
| Degraded: Subtensor unreachable | Red strip: "Subtensor network unreachable. Last known data from [time]." + Retry button | Amber→red transition |
| Forbidden copy | Never: "Matterhorn controls your stake", seed phrase fields, private key fields | QA scan |

### 1.3 Hyperliquid Desk

**Token prefix:** `--v2-desk-hyperliquid` (`#C084FC` dark / `#7C3AED` light)

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Header | SVG icon (infinity/perpetual) + "Hyperliquid" + settings gear | All 3 elements present |
| Position tiles | `--v2-bg-surface` fill, `--v2-desk-hyperliquid` 3px bar, Long/Short badge | Green Long, Red Short |
| Quick stats rail | Leverage ceiling, Margin mode, Funding rate alert threshold | Right rail on desktop |
| Safety strip | "📖 Preview only. Read-only via Hyperliquid Info API. No signing." | Amber strip |
| Forbidden copy | Never: "Close position", "Submit order", "sign transaction", API key input | QA scan |
| Empty state | "No open positions. Connect a wallet to track Hyperliquid positions." | |
| Degraded: API unreachable | "Hyperliquid API unreachable. Position data may be stale." | Amber strip |

### 1.4 Polymarket Desk

**Token prefix:** `--v2-desk-polymarket` (`#FBBF24` dark / `#D97706` light)

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Header | SVG icon (target/bullseye) + "Polymarket" + filter bar | Filter chips: All / Active / Resolved |
| Market card | `--v2-bg-surface` fill, probability badge (desk color), volume, 3-segment confidence bar | |
| Safety strip | "📖 Preview only. Read-only browsing data. No bet placement." | Amber strip |
| Empty state | "No markets tracked. Search markets to add them." | Search input present |
| Degraded: Polymarket unreachable | "Markets data unavailable. Cached data from [time]." | Amber strip |
| Forbidden copy | Never: "place bet on your behalf", bet amounts, "confirm trade" | QA scan |

### 1.5 Wellness Desk

**Token prefix:** `--v2-desk-wellness` (`#F472B6` dark / `#DB2777` light)

**Critical safety rules — any violation is a P0 bug.**

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Toggle default: OFF | `wellness_enabled` = false on first launch | UI shows disabled empty state |
| Disabled empty state | "Wellness suggestions are paused. Enable in Privacy & Forget Center." + link | Link navigates to settings |
| Enabled: goal cards | `--v2-bg-surface` fill, `--v2-desk-wellness` 3px bar | Card title + current value |
| Local-only notice | Every Wellness card: "🔒 Stored locally only" badge | Always visible |
| No PHI | No fields: blood pressure values, prescription names, diagnosis text | Input fields: goal name, reminder time only |
| No clinical language | No: "medical", "diagnosis", "prescription", "treatment", "patient", "condition" | QA scan |
| No sync/cloud | No: "sync", "cloud backup", "iCloud", "Google Fit" | QA scan |
| Sensitivity: Personal or Restricted | Data stored with sensitivity label | Memory desk shows "Personal" |
| Safety strip | "🔒 Stored locally only. Never sent to external servers." | Amber strip |
| Forget button | Always visible on each goal card | No hidden delete |

### 1.6 Memory Desk

**Token prefix:** `--v2-desk-memory` (`#67E8F9` dark / `#0891B2` light)

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Header | SVG icon (brain/circuit) + "Memory" + bell (badge) + [Export] + [New memory] | Bell shows unread count |
| Memory card | `--v2-bg-surface` fill, `--v2-desk-memory` 3px bar, title, summary, "Why remembered" chip | |
| Card actions | Use / Edit / Export / Forget — all always visible | No hidden overflow menu |
| Chip bar (right rail) | Active context chips, `--v2-desk-memory` tint on active chip | Scrolls horizontally |
| Empty state | "No memories yet. Start chatting and Matterhorn will surface suggestions." | No skeleton |
| Forbidden copy | Never: "Crypto" as category, hidden memory saves | QA scan |
| Bell badge | Red dot or number if unread suggestions exist | |

### 1.7 MCPs Desk

**Token prefix:** `--v2-desk-mcp` (`#34D399` dark / `#059669` light)

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Header | SVG icon (plug/connection) + "MCPs" + [Add server] button | Button opens MCP server config |
| Tool registry | Table: Tool name / Agent / Status / Scope / Actions | Status badges: Active/Inactive/External signer |
| Status: External signer | Amber badge "External signer required" | Present on tools needing external approval |
| Safety strip | "🔌 MCP tools run locally. No credentials stored in Matterhorn." | Amber strip |
| Empty state | "No MCP servers configured. Add a server to get started." | [Add server] button prominent |

### 1.8 Settings & Profile

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| SubNav | Desk Preferences / Privacy & Forget / Memory Settings / Notifications / Security | 5 tabs |
| Profile section | Avatar + name + email + "Member since [date]" | |
| Profile: wallet address | Truncated + copy button: `0x7a3B…F9d2` / `5CfTC…3bX9` | Copy shows "Copied!" toast |
| Profile: stats | Memory count badge + desk count badge | |
| Desk preference toggles | One row per desk: toggle + desk name + brief state | All on by default except Wellness |
| Wellness toggle | Prominent, defaults to Off | Shows current state |
| Forget all | Red "Forget all memories" → confirmation modal (type "FORGET") | Multi-step |
| Privacy & Forget | Link to Privacy Center, data export, forget individual items | |

---

## 2. Right Rail Acceptance Criteria

Applies to desktop ≥1200px. On tablet 768–1199px the rail is toggled.

| Criterion | Implementation rule | Validation |
|-----------|-------------------|------------|
| Width | 260px, fixed position | Does not scroll with main content |
| Profile card | Avatar (40px) + name + truncated wallet address + "Connected N min ago" | Never truncated to invisible |
| Copy wallet button | Copies full address, shows "Copied!" toast | Clipboard API |
| Quick stats | 2×2 grid: desk-specific numbers, `--text-xs`, `--v2-text-tertiary` | Updates on desk switch |
| Bell | Notification bell with badge count | Badge visible if > 0 |
| Memory chip bar | Active context chips, `--v2-desk-[desk]` tint on active chip | Horizontal scroll on overflow |
| No text clipped | All text fully visible at 1440px viewport | QA screenshot |
| No hidden actions | Profile card CTA ("View full profile →") always visible | No overflow |
| Tablet: hidden by default | Right rail absent on load; FAB (bottom-right) toggles overlay | |
| Tablet: overlay panel | Panel slides in from right, 260px wide, backdrop click closes | No layout shift |
| Mobile: absent | No right rail `<aside>` or equivalent | Top bar handles profile |
| Desktop layout | Left nav (56px) + main content + right rail (260px) fits 1280px without scroll | No horizontal overflow |

---

## 3. Boxiness Removal Checklist

P1 and P6 fixes. Every card must pass ALL items before shipping.

- [ ] Card background uses `--v2-bg-surface` fill (not transparent)
- [ ] Card border is `--v2-border-subtle` (`#1F1F1F` dark) — barely visible, not a frame
- [ ] No `border: 1px solid var(--border)` as the only differentiator
- [ ] `border-radius: 4px` max on all data cards (session cards, desk cards, stat tiles)
- [ ] No `border-radius: 8px` or `12px` on data cards — only on decorative containers
- [ ] No nested card grids (card inside card with its own border)
- [ ] Depth via surface hierarchy: `--v2-bg-base` → `--v2-bg-surface` → `--v2-bg-elevated`
- [ ] No `backdrop-filter: blur()` anywhere (no glassmorphism)
- [ ] Color used only for: desk accent, status, CTA — not decorative borders
- [ ] Interactive rows: hover uses `--v2-bg-hover`, not a border change
- [ ] Active session dot: 8px solid circle, `--v2-accent`, no animation (no pulse, no blink)
- [ ] No `box-shadow` on data cards (use surface hierarchy instead)
- [ ] Matterhorn brand anchors (`#0C0C0C` / `#D1F2FF`) as the color foundation, not the full palette
- [ ] No giant rounded boxes around entire sections

---

## 4. Mobile & Tablet Responsive Checklist

### Mobile <768px

- [ ] Bottom tab bar: exactly 5 tabs — Home, Bittensor, Hyperliquid, Polymarket, Wellness
- [ ] Settings accessible via gear icon in top bar (NOT in bottom tabs)
- [ ] Profile: avatar in top bar (NOT in bottom tabs)
- [ ] Right rail: absent (`<aside>` not rendered)
- [ ] Cards: full-width, 1-column layout
- [ ] Stat tiles: stacked vertically, no horizontal overflow
- [ ] Composer: `position: fixed`, always above keyboard, uses `visualViewport` API
- [ ] Tables: horizontal scroll with first column sticky
- [ ] No left nav rail visible

### Tablet 768–1199px

- [ ] Left nav: 48px, icons only (no labels)
- [ ] Right rail: hidden by default, FAB (bottom-right) toggles overlay panel
- [ ] FAB: avatar icon, `--v2-bg-elevated` fill, `--v2-border-default` border
- [ ] Cards: 2-column grid, no single orphans
- [ ] Tables: horizontal scroll with first column sticky
- [ ] No horizontal overflow
- [ ] Composer: `position: fixed` at bottom

### Desktop ≥1200px

- [ ] Left nav: 56px rail, icons with tooltips
- [ ] Right rail: 260px, always visible
- [ ] Cards: 3-column grid
- [ ] Memory chip bar: horizontal wrap
- [ ] Stat tiles: 3-column grid
- [ ] No horizontal overflow

---

## 5. Light & Dark Theme Checklist

### Dark Mode (all viewports)

- [ ] Page background: `--v2-bg-base` = `#0C0C0C`
- [ ] Card surface: `--v2-bg-surface` = `#111111`
- [ ] Elevated card: `--v2-bg-elevated` = `#1A1A1A`
- [ ] Accent: `--v2-accent` = `#D1F2FF` (ice blue)
- [ ] Text primary: `--v2-text-primary` = `#F0F0F0`
- [ ] Text secondary: `--v2-text-secondary` = `#8A8A8A`
- [ ] Per-desk accent: see per-desk table in SPEC.md §13
- [ ] Safety strip: `--v2-status-warning` = `#F59E0B` background at 15% opacity, warning icon

### Light Mode (all viewports)

- [ ] Page background: `--v2-bg-base` = `#F5F5F5`
- [ ] Card surface: `--v2-bg-surface` = `#FFFFFF`
- [ ] Accent: `--v2-accent` = `#2563EB` (blue)
- [ ] Text primary: `--v2-text-primary` = `#0C0C0C`
- [ ] Text secondary: `--v2-text-secondary` = `#5C5C5C`
- [ ] Light card border: `--v2-border-default` = `#D4D4D4`
- [ ] Per-desk light accents: Bittensor `#EA580C`, Hyperliquid `#7C3AED`, Polymarket `#D97706`, Wellness `#DB2777`, Memory `#0891B2`, MCP `#059669`
- [ ] No dark cards in light mode
- [ ] 4.5:1 contrast ratio on all text
- [ ] `:focus-visible` rings use `--v2-accent` (`#2563EB`)

---

## 6. Forbidden Patterns — Production QA Scan

Scan the implementation and every screenshot for these. Any match is a **failing QA issue**.

| Pattern | Where to scan | Severity |
|---------|--------------|----------|
| `seed phrase` input field | All forms, onboarding | P0 — never |
| `private key` input field | All forms, onboarding | P0 — never |
| `api secret` / `api key` input field | Hyperliquid, Polymarket, MCPs | P0 — never |
| `mint now` / `hire agent` button | Any desk | P0 — never |
| `OpenWork` visible copy | CSS, JS, UI strings | P1 |
| `openwork` in CSS classes | All CSS | P1 |
| `opencodec` in CSS classes | All CSS | P1 |
| `submit order` button | Hyperliquid, Polymarket | P0 |
| `sign transaction` button | Any desk | P0 |
| `close position` button | Hyperliquid | P0 |
| `confirm trade` button | Polymarket | P0 |
| `place bet on your behalf` | Polymarket | P0 |
| `Matterhorn holds your [asset]` | Any desk | P0 |
| `Matterhorn manages your position` | Hyperliquid | P0 |
| `Matterhorn controls your stake` | Bittensor | P0 |
| Full (non-truncated) wallet address | Profile, right rail | P0 |
| Emoji as primary desk icon | Nav rail icons | P0 |
| `backdrop-filter: blur()` | Any CSS | P0 |
| `border-radius: 12px` on data cards | Card CSS | P0 |
| Nested card grids | Card component | P0 |
| Medical diagnosis text | Wellness desk | P0 |
| Prescription reference | Wellness desk | P0 |
| Treatment recommendation | Wellness desk | P0 |
| `glassmorphism` | Any CSS | P0 |
| `Crypto workspace` label | Home grid | P0 |
| `Services` as primary desk | Home grid | P0 |

---

## 7. Production Screenshot Matrix

Every entry must be produced and reviewed before shipping. File naming: `screenshots/prod-qa/[desk]-[state]-[viewport]-[theme]-[date].png`

### 7.1 Matrix

| # | Desk | State | Viewport | Theme |
|---|------|-------|----------|-------|
| 1 | Home | Default (wallet connected) | 1280×800 | Dark |
| 2 | Home | Default (wallet connected) | 1280×800 | Light |
| 3 | Home | No wallet connected | 1280×800 | Dark |
| 4 | Bittensor | Beginner view | 1280×800 | Dark |
| 5 | Bittensor | Beginner view | 1280×800 | Light |
| 6 | Bittensor | Expert view | 1280×800 | Dark |
| 7 | Bittensor | Empty (no wallet) | 1280×800 | Dark |
| 8 | Bittensor | Degraded (Subtensor unreachable) | 1280×800 | Dark |
| 9 | Hyperliquid | Default (with positions) | 1280×800 | Dark |
| 10 | Hyperliquid | Default (with positions) | 1280×800 | Light |
| 11 | Hyperliquid | Empty (no positions) | 1280×800 | Dark |
| 12 | Hyperliquid | Degraded (API unreachable) | 1280×800 | Dark |
| 13 | Polymarket | Default (tracked markets) | 1280×800 | Dark |
| 14 | Polymarket | Default (tracked markets) | 1280×800 | Light |
| 15 | Polymarket | Empty (no markets) | 1280×800 | Dark |
| 16 | Polymarket | Degraded (API unreachable) | 1280×800 | Dark |
| 17 | Wellness | Default OFF (disabled) | 1280×800 | Dark |
| 18 | Wellness | Default OFF (disabled) | 1280×800 | Light |
| 19 | Wellness | Enabled (with goals) | 1280×800 | Dark |
| 20 | Wellness | Enabled (with goals) | 1280×800 | Light |
| 21 | Memory | Default (with memories) | 1280×800 | Dark |
| 22 | Memory | Default (with memories) | 1280×800 | Light |
| 23 | Memory | Empty (no memories) | 1280×800 | Dark |
| 24 | Memory | Bell open (with suggestions) | 1280×800 | Dark |
| 25 | MCPs | Default (with servers) | 1280×800 | Dark |
| 26 | MCPs | Default (with servers) | 1280×800 | Light |
| 27 | MCPs | Empty (no servers) | 1280×800 | Dark |
| 28 | Settings | Profile section | 1280×800 | Dark |
| 29 | Settings | Profile section | 1280×800 | Light |
| 30 | Settings | Desk Preferences | 1280×800 | Dark |
| 31 | Home | Default (wallet connected) | 768×1024 | Dark |
| 32 | Home | Default (wallet connected) | 768×1024 | Light |
| 33 | Home | FAB + rail open | 768×1024 | Dark |
| 34 | Bittensor | Beginner view | 768×1024 | Dark |
| 35 | Settings | Profile section | 390×844 | Dark |
| 36 | Settings | Profile section | 390×844 | Light |
| 37 | Bittensor | Beginner view | 390×844 | Dark |
| 38 | Bittensor | Beginner view | 390×844 | Light |
| 39 | Wellness | Enabled (with goals) | 390×844 | Dark |
| 40 | Wellness | Enabled (with goals) | 390×844 | Light |
| 41 | Memory | Default (with memories) | 390×844 | Dark |
| 42 | Memory | Default (with memories) | 390×844 | Light |
| 43 | Mobile bottom tab | 5 tabs visible | 390×844 | Dark |
| 44 | Mobile bottom tab | 5 tabs visible | 390×844 | Light |
| 45 | Mobile composer | Above keyboard open | 390×844 | Dark |
| 46 | Mobile composer | Above keyboard open | 390×844 | Light |

### 7.2 Screenshots to Review for Each

For each screenshot in the matrix, verify:

1. **No horizontal overflow** — content fits within viewport
2. **Right rail:** correct on desktop (visible), tablet (FAB present), mobile (absent)
3. **Safety strip** visible on all financial desks (Bittensor, Hyperliquid, Polymarket)
4. **Local-only strip** visible on Wellness
5. **Correct desk accent color** on active nav item and card bars
6. **No forbidden patterns** (Section 6)
7. **Cards use surface fills** — not outlined boxes
8. **Sharp corners** — no curved data cards
9. **Composer above content** on all mobile screenshots

---

## 8. Acceptance Criteria Summary

Before any desk is marked ready for review:

| Check | Who | Gate |
|-------|-----|------|
| All 46 screenshots produced | Codex | Self-review |
| All tokens from `--v2-*` system | Codex | Self-review |
| No forbidden pattern violations | Codex + Stitch | PR review |
| QA rubric passes (G1–G5) | Stitch | PR review |
| Light mode contrast ≥ 4.5:1 | Codex | Self-review |
| PROD-QA Section 1 (per-desk) complete | Codex | PR review |
| PROD-QA Section 2 (right rail) complete | Codex | PR review |
| PROD-QA Section 3 (boxiness) complete | Codex | PR review |
| PROD-QA Section 4 (responsive) complete | Codex | PR review |
| PROD-QA Section 5 (themes) complete | Codex | PR review |
| PROD-QA Section 6 (forbidden) zero violations | Codex + Stitch | PR review |

(End of file — total 8 sections)
