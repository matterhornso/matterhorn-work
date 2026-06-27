# Matterhorn App Shell V2 — Screenshot QA Rubric

**Spec:** `docs/ui/app-shell-v2/SPEC.md`
**Purpose:** Visual review checklist for Codex implementation. All gates must pass before shipping.
**Format:** Screenshot review at specified viewports and themes.

---

## QA Gates

Before any shell or desk is marked complete, a screenshot review is required at:

| Gate | Viewport | Theme | Purpose |
|------|----------|-------|---------|
| S1 | 1280×800 | Dark | Desktop primary |
| S2 | 1280×800 | Light | Desktop light mode |
| S3 | 768×1024 | Dark | Tablet |
| S4 | 390×844 | Dark | Mobile primary |
| S5 | 390×844 | Light | Mobile light mode |

---

## Section 1: App Shell (All Gates)

### 1.1 Left Navigation Rail

| Check | Expected | Gate |
|-------|---------|------|
| Left nav: 56px desktop / 48px tablet / hidden mobile | Correct width per viewport | All |
| Active desk: `--v2-desk-[desk]` accent icon color | Icon colored, not white | All |
| Nav icons: SVG (not emoji) | `<svg>` in nav | All |
| No notification counts in nav rail | Bell badge in right rail | All |
| No memory chips in nav rail | Chips in right rail | All |
| Logo: Mountain mark SVG in nav | Not emoji | All |

### 1.2 Right Rail (Desktop ≥1200px)

| Check | Expected | Gate |
|-------|---------|------|
| Right rail: 260px visible | Visible on desktop | S1, S2 |
| Profile card: avatar + truncated wallet address | `0x7a3B…F9d2` | S1, S2 |
| Copy button on wallet address | Copies full address | S1, S2 |
| Quick stats: 2×2 grid, desk-specific numbers | Updates on desk switch | S1, S2 |
| Bell with badge count | Badge visible if > 0 | S1, S2 |
| Memory chip bar with desk accent tint | Scrolls horizontally | S1, S2 |
| No text clipped in rail | All text fully visible at 1440px | S1, S2 |

### 1.3 Right Rail (Tablet 768–1199px)

| Check | Expected | Gate |
|-------|---------|------|
| Right rail hidden by default | No rail element | S3 |
| FAB button bottom-right | Avatar FAB visible | S3 |
| FAB tap → overlay panel | 260px panel slides in | S3 |

### 1.4 Right Rail (Mobile <768px)

| Check | Expected | Gate |
|-------|---------|------|
| Right rail absent | No `<aside>` element | S4, S5 |
| Top bar: avatar + wordmark + settings + bell | All 4 present | S4, S5 |

### 1.5 Main Content Area

| Check | Expected | Gate |
|-------|---------|------|
| No horizontal overflow | Content fits within viewport | All |
| Bottom composer: fixed, above content | Never overlaps content | All |
| Composer (mobile): above keyboard | Uses `visualViewport` API | S4, S5 |

---

## Section 2: Surface & Card Pattern (S1, S2, S3)

| Check | Expected |
|-------|---------|
| Cards use `--v2-bg-surface` fill | `#111111` dark / `#FFFFFF` light |
| Card border: `--v2-border-subtle` (`#1F1F1F`) | Barely visible, not a frame |
| 3px desk accent bar on cards | Colored top border visible |
| No `border-radius` > 4px on data cards | Sharp corners |
| No nested card grids | Cards contain content, not more bordered cards |
| No glassmorphism | No `backdrop-filter: blur()` |
| Depth via background hierarchy | base → surface → elevated |

---

## Section 3: Per-Desk Screens

### Home (Gates S1, S2)

| Check | Expected |
|-------|---------|
| Greeting: "Good morning/afternoon/evening, [Name]" + date | Updates dynamically |
| Active desk hero card: full-width, `--v2-bg-elevated`, 3px accent bar | Primary CTA visible |
| Recent sessions: V2 session cards | Sharp corners, inline metrics |
| Memory chips bar below hero | Cross-desk active chips |
| Quick stats row | 4 tiles, `--text-xs` |
| Desk grid: 3-col desktop / 2-col tablet / 1-col mobile | |
| **No "Services"** in grid | Forbidden |
| **No "Crypto workspace"** label | Forbidden |

### Bittensor (Gates S1–S5)

| Check | Expected | Gate |
|-------|---------|------|
| Beginner/Expert toggle in header | Pill toggle, Beginner active default | S1–S5 |
| Beginner: TAO amounts, no addresses | "1,247 TAO" — no validator address | S1–S5 |
| Safety strip: "🔗 Read-only. Public Subtensor…" | Amber strip, always visible | S1–S5 |
| Warm orange `#FF7C43` visible on nav active + card bars | Desk accent color | S1–S5 |
| **No "Matterhorn controls your stake"** | Framing: "You set a preference" | All |
| **No seed phrase / private key fields** | Never | All |

### Hyperliquid (Gates S1–S5)

| Check | Expected | Gate |
|-------|---------|------|
| Soft purple `#C084FC` accent visible | Nav active + card bars | S1–S5 |
| Position tiles: Long (green) / Short (red) badges | Accurate status | S1–S5 |
| Safety strip: "📖 Preview only…" | Amber strip | S1–S5 |
| **No "Close position" button** | Forbidden | All |
| **No "Submit order" button** | Forbidden | All |
| **No API key fields** | Forbidden | All |

### Polymarket (Gates S1–S5)

| Check | Expected | Gate |
|-------|---------|------|
| Gold `#FBBF24` accent visible | Nav active + card bars | S1–S5 |
| Market cards: probability badge + volume + confidence bar | 3-segment bar | S1–S5 |
| Safety strip: "📖 Preview only. Read-only browsing…" | Amber strip | S1–S5 |
| **No "place bet on your behalf"** | Forbidden | All |
| **No bet amounts** | Forbidden | All |
| **No "confirm trade"** | Forbidden | All |

### Wellness (Gates S1–S5)

| Check | Expected | Gate |
|-------|---------|------|
| Rose `#F472B6` accent visible | Nav active + card bars | S1–S5 |
| Toggle default: OFF | Disabled empty state shown by default | S1–S5 |
| Disabled empty state: link to Privacy & Forget Center | Present | S1–S5 |
| 🔒 "Stored locally only" badge on every Wellness card | Always visible | S1–S5 |
| **No medical diagnoses** | Forbidden | All |
| **No prescriptions** | Forbidden | All |
| **No treatment recommendations** | Forbidden | All |
| **No "sync" / "cloud"** | Forbidden | All |

### Memory (Gates S1–S5)

| Check | Expected | Gate |
|-------|---------|------|
| Cyan `#67E8F9` accent visible | Nav active + chip bar | S1–S5 |
| Forget button always visible on each card | No hidden delete | S1–S5 |
| Bell badge with unread count | Number visible if > 0 | S1–S5 |
| "Why remembered" callout | Plain English, no jargon | S1–S5 |
| **No "Crypto" as category label** | Forbidden | All |

### MCPs (Gates S1–S5)

| Check | Expected | Gate |
|-------|---------|------|
| Emerald `#34D399` accent visible | Nav active + card bars | S1–S5 |
| "External signer required" amber badge | Present on relevant tools | S1–S5 |
| Safety strip: "🔌 MCP tools run locally…" | Amber strip | S1–S5 |
| **No credentials stored in Matterhorn notice** | In safety strip | All |

---

## Section 4: Session Cards (S1, S2)

| Check | Expected |
|-------|---------|
| `border-radius: 4px` | Sharp corners |
| Active dot: 8px solid `--v2-accent` | No pulse, no animation |
| Metrics: inline chips, not nested bordered sub-cards | |
| Timestamp: `--text-xs`, `--v2-text-tertiary` | |
| Summary: `--text-sm`, max 2 lines | |

---

## Section 5: Light Mode (Gates S2, S5)

| Check | Expected |
|-------|---------|
| Page background: `--v2-bg-base` = `#F5F5F5` | Off-white |
| Card surface: `--v2-bg-surface` = `#FFFFFF` | White, not dark |
| Accent: `--v2-accent` = `#2563EB` | Blue |
| Text primary: `--v2-text-primary` = `#0C0C0C` | Dark on light |
| No dark cards in light mode | |
| 4.5:1 contrast ratio minimum | Verify all text |
| `:focus-visible` rings: `--v2-accent` = `#2563EB` | Visible on all interactive |

---

## Section 6: Forbidden Pattern Scan

For every screenshot, scan the visible UI for these. Any match is a **failing QA issue**.

| Pattern | Severity |
|---------|----------|
| Seed phrase input field | P0 — never |
| Private key input field | P0 — never |
| API secret / key input field | P0 — never |
| `mint now` / `hire agent` button | P0 — never |
| `submit order` / `sign transaction` button | P0 — never |
| `close position` button | P0 — never |
| `place bet on your behalf` | P0 — never |
| `confirm trade` | P0 — never |
| Medical diagnosis text | P0 — never |
| Prescription reference | P0 — never |
| Treatment recommendation | P0 — never |
| Full (non-truncated) wallet address | P0 — always truncate |
| Emoji as primary desk icon | P0 — use SVG |
| `backdrop-filter: blur()` | P0 — no glassmorphism |
| `border-radius: 12px` on data cards | P0 — max 4px |
| Nested card grids | P0 — flatten |
| `OpenWork` visible in UI copy | P1 |
| `openwork` / `opencodec` in CSS | P1 |
| "Crypto workspace" label | P0 |
| "Services" as customer desk | P0 |
| "Matterhorn controls your stake" | P0 |

---

## Section 7: QA Sign-Off

| Role | Gates |
|------|-------|
| Codex (implementer) | All gates |
| Stitch (design) | S1, S2 (desktop dark/light) |
| Peer review | S1 |

**Screenshot naming:**
```
screenshots/app-shell-v2/[desk]-[state]-[viewport]-[theme]-[date].png
```
Example: `screenshots/app-shell-v2/bittensor-beginner-1280x800-dark-2025-07-01.png`

(End of file — 7 sections)
