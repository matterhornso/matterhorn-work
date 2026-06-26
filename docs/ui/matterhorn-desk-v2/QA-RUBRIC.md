# Matterhorn Desk UI V2 — Screenshot QA Rubric

**Spec:** V2 Visual Design Spec (`docs/ui/matterhorn-desk-v2/SPEC.md`)
**Purpose:** Visual review checklist for Codex and Stitch QA. Every desk implementation must pass this rubric before shipping.
**Format:** Screenshot review at specified viewports and themes.

---

## QA Gates

Before any desk is marked complete, a screenshot review is required at:

| Gate | Viewport | Theme | Purpose |
|------|----------|-------|---------|
| G1 | 1280×800 | Dark | Desktop primary review |
| G2 | 768×1024 | Dark | Tablet review |
| G3 | 390×844 | Dark | Mobile primary review |
| G4 | 1280×800 | Light | Desktop light mode review |
| G5 | 390×844 | Light | Mobile light mode review |

**Each gate must be reviewed independently.** All 5 gates must pass.

---

## Section 1: Layout Architecture (All Gates)

These checks apply to every gate — all 5 screenshots.

### 1.1 Navigation

| Check | Expected | P-value |
|-------|---------|---------|
| Left nav rail: correct width (56px desktop, 48px tablet, hidden mobile) | Rail visible on ≥768px, absent on <768px | P4 |
| Active desk: accent-colored active state in nav | `--v2-accent` fill, not a border | — |
| Nav icons: SVG, not emoji | `<svg>` elements in nav | P5 |
| Nav rail: no notification counts | Bell badge in right rail, not nav | P4 |
| Nav rail: no memory chips | Chips in right rail, not nav | P4 |
| Bottom tab bar (mobile): exactly 5 tabs | Home, Bittensor, Hyperliquid, Polymarket, Wellness | — |
| Bottom tab bar (mobile): Profile NOT in bottom bar | Profile in top bar | P3 |
| Settings: accessible via gear icon | Not a primary bottom tab | — |

### 1.2 Right Rail (Desktop/Tablet ≥768px)

| Check | Expected | P-value |
|-------|---------|---------|
| Right rail: 260px width | Visible on desktop | P3 |
| Right rail: profile card visible | Avatar + truncated wallet address | P3 |
| Right rail: copy button on wallet address | Copies full address | P3 |
| Right rail: quick stats | Desk-specific numeric stats | — |
| Right rail: bell with suggestion count | Badge visible if count > 0 | — |
| Right rail: memory chip bar | Active chips with desk color tint | P4 |
| Right rail: does not scroll with main content | Fixed position | — |
| Right rail (tablet): hidden, FAB toggle present | Overlay panel on FAB tap | — |
| Right rail (mobile): absent | No right rail on <768px | — |

### 1.3 Main Content Area

| Check | Expected | P-value |
|-------|---------|---------|
| No horizontal overflow | Content fits within viewport width | Global |
| No right-edge cutoff | No truncated content at right edge | Global |
| Bottom composer: fixed, above content | Never overlaps with content | Global |
| Composer (mobile): above keyboard | Uses `visualViewport` API | — |

### 1.4 Global Visual

| Check | Expected | P-value |
|-------|---------|---------|
| No horizontal overflow on any viewport | 1280px, 768px, 390px all clean | Global |
| Right rail collapses cleanly on tablet | No layout jump on tablet | P4 |
| `--v2-radius: 4px` max on data cards | No border-radius > 4px | P6 |
| No glassmorphism | No `backdrop-filter: blur()` | — |
| No nested card grids | Cards contain content, not more bordered cards | P6 |
| One obvious first action per desk | Primary CTA visible without scrolling | — |

---

## Section 2: Surface & Card Pattern (Gates G1, G2, G4)

These checks are visual — examine the card backgrounds and borders.

### 2.1 Card Surface Hierarchy

| Check | Expected | P-value |
|-------|---------|---------|
| Cards use surface fill, not outlined boxes | `--v2-bg-surface` (`#111111`) as card background, not just border | P1 |
| Card border: `--v2-border-subtle` (`#1F1F1F`) | Nearly invisible separator, not a frame | P1 |
| No stacking of bordered cards creating "boxed" feel | Cards distinguished by surface + accent bar, not outline weight | P1 |
| No card has `border-radius` > 4px | Sharp corners on data cards | P6 |

### 2.2 Per-Desk Accent Bar

| Check | Expected |
|-------|---------|
| Desk cards have 3px top accent bar | Colored bar in desk's accent color |
| Active nav item has accent tint | `--v2-accent-dim` background |

### 2.3 Typography in Cards

| Check | Expected |
|-------|---------|
| Card title: sentence case, not ALL CAPS | "Subnet 1" not "SUBNET 1" |
| Card title: `--text-base` (15px), weight 600 |
| Card description: `--text-sm` (13px), max 2 lines |
| Card metadata: `--text-xs` (11px), `--v2-text-tertiary` |

---

## Section 3: Per-Desk Visual Checks

### 3.1 Home Command Center (Gates G1, G4)

| Check | Expected |
|-------|---------|
| Greeting with date/time | "Good morning, Alex" |
| Active desk card (large, full-width) | Shows current desk with "Open desk →" CTA |
| Desk grid below hero | 3-column grid (desktop), 2-column (tablet) |
| Memory chip bar below active desk | Active context chips |
| "Services" NOT in grid | No generic desk |
| "Crypto workspace" NOT in grid | No re-branding |

### 3.2 Bittensor (Gates G1–G5)

| Check | Expected | P-value |
|-------|---------|---------|
| Beginner/Expert toggle in header | Pill toggle, "Beginner" active by default | P7 |
| Expert badge (🔒) visible in expert mode | Amber lock badge | P7 |
| Beginner view: TAO amounts, no addresses | "12.4 TAO" — no validator address | P7 |
| Expert view: truncated addresses | `5CfTC…3bX9`, not full address | — |
| Warm orange accent `#FF7C43` visible | On nav active, card bars, confidence | P2 |
| Safety strip: "Read-only. Public Subtensor" | Amber strip, present | — |
| Stat tiles: Total Stake, Active Subnets, Delegation Ceiling | Beginner-friendly labels |
| No "Matterhorn controls your stake" | Framing: "You set a preference" |
| No seed phrase / private key fields | Never |

### 3.3 Hyperliquid (Gates G1–G5)

| Check | Expected |
|-------|---------|
| Soft purple accent `#C084FC` visible | On nav active, card bars |
| Position tiles: Long/Short badge | Green for Long, red for Short |
| No "Close position" button | Preview-only framing |
| No "Submit order" button | Forbidden |
| No Hyperliquid API key fields | Forbidden |
| Safety strip: "Preview only" | Present |

### 3.4 Polymarket (Gates G1–G5)

| Check | Expected |
|-------|---------|
| Gold accent `#FBBF24` visible | On nav active, card bars |
| Market cards: probability badge + volume | Clean display |
| No "Place bet on your behalf" | Forbidden |
| No CLOB credentials | Forbidden |
| No bet amounts or "your position" | Forbidden |
| Safety strip: "Preview only. Read-only browsing" | Present |

### 3.5 Wellness (Gates G1–G5)

| Check | Expected | P-value |
|-------|---------|---------|
| Rose accent `#F472B6` visible | On nav active, card bars |
| Toggle default: Off | Disabled empty state shown by default |
| Disabled empty state: link to Privacy & Forget Center | Present |
| Local-only notice on every Wellness card | "🔒 Stored locally only" |
| No medical diagnoses | Forbidden |
| No prescriptions | Forbidden |
| No treatment recommendations | Forbidden |
| No PHI in any field | Sensitivity: Personal or Restricted only |
| No "sync" or "cloud" language | Forbidden |
| Safety strip: "Never sent to external servers" | Present |

### 3.6 Memory (Gates G1–G5)

| Check | Expected |
|-------|---------|
| Cyan accent `#67E8F9` visible | On nav active, chip bar |
| Forget button always visible on each card | No hidden delete |
| Bell badge with unread suggestion count | Number visible if > 0 |
| "Why remembered" callout | Plain English, no jargon |
| No "Crypto" as category label | Forbidden |
| No hidden memory saves | All memories visible in Memory desk |

### 3.7 MCPs (Gates G1–G5)

| Check | Expected |
|-------|---------|
| Emerald accent `#34D399` visible | On nav active, card bars |
| "External signer required" amber badge | Present on relevant tools |
| No credentials stored in Matterhorn notice | In safety strip |
| Tool scope accurately describes capability | Never implies execution unless configured |

---

## Section 4: Light Mode Checks (Gates G4, G5)

### 4.1 Color Correctness

| Check | Expected |
|-------|---------|
| Page background: `#F5F5F5` | Off-white, not gray |
| Card surface: `#FFFFFF` | White, not dark |
| Brand accent: `#2563EB` | Blue on light background |
| Text primary: `#0C0C0C` | Dark text on light |
| Text secondary: `#5C5C5C` | Visible on white |
| Border: `#D4D4D4` on cards | Light gray, readable |
| Per-desk accent in light mode | Warm, readable (see per-desk list below) |

### 4.2 Per-Desk Light Mode Accents

| Desk | Light Mode Accent | Check |
|------|------------------|-------|
| Bittensor | `#EA580C` | Orange readable on white |
| Hyperliquid | `#7C3AED` | Purple readable on white |
| Polymarket | `#D97706` | Gold readable on white |
| Wellness | `#DB2777` | Rose readable on white |
| Memory | `#0891B2` | Cyan readable on white |
| MCP | `#059669` | Emerald readable on white |

### 4.3 Contrast

| Check | Expected |
|-------|---------|
| All text: 4.5:1 contrast ratio minimum | Verify on each text color |
| Bottom tab bar: readable on off-white | Tab labels and icons visible |
| Focus rings: `--v2-accent` (`#2563EB`) | Visible on all interactive elements |

---

## Section 5: Forbidden Pattern Check

For each screenshot, scan the visible UI for these patterns:

| Pattern | Action if found |
|---------|----------------|
| Emoji as primary protocol icon | FAIL — replace with SVG |
| Seed phrase input field | FAIL — never |
| Private key input field | FAIL — never |
| API secret input field | FAIL — never |
| "Submit order" button | FAIL — never |
| "Sign transaction" button | FAIL — never |
| "Close position" button | FAIL — never |
| Full wallet address (non-truncated) | FAIL — always truncate |
| Medical diagnosis text | FAIL — wellness only |
| Prescription reference | FAIL — wellness only |
| "Crypto workspace" label | FAIL — rebrand |
| "Services" as primary desk | FAIL — not in V1 |
| Glassmorphism panels | FAIL — remove blur |
| `border-radius` > 4px on data cards | FAIL — reduce radius |
| Nested card grids | FAIL — flatten |

---

## Section 6: Problem-Specific QA (Per P#)

For each of the 7 problems, verify the V2 solution:

### P1: Outlined Boxes → Surface Fills

Screenshot must show:
- [ ] Cards have `--v2-bg-surface` fill (`#111111` dark / `#FFFFFF` light)
- [ ] Card borders are `--v2-border-subtle` (`#1F1F1F` dark / `#EBEBEB` light) — barely visible
- [ ] No card has a heavy `1px solid #2A2A2A` border as its primary differentiator
- [ ] 3px desk accent bar is the primary visual differentiator for cards

### P2: Monotonous Dark → Warmer Surfaces + Richer Accents

Screenshot must show:
- [ ] `--v2-bg-surface` is `#111111` (warmer than `#0C0C0C`)
- [ ] Per-desk accent color is visible on nav active state
- [ ] Per-desk accent bar visible on cards
- [ ] Surface hierarchy is visible (base → surface → elevated)
- [ ] Light mode has off-white `#F5F5F5` background, not flat gray

### P3: Profile Hidden → Right Rail Profile Card

Desktop screenshot must show:
- [ ] Right rail visible with profile card
- [ ] Avatar + truncated wallet address in right rail
- [ ] Copy button on wallet address
- [ ] Quick stats in right rail
- [ ] Profile NOT in bottom bar

### P4: Side Rail Info Dump → Clean Nav + Right Rail

Screenshot must show:
- [ ] Nav rail: icons only, no text labels
- [ ] Tooltips appear on hover
- [ ] Notification counts: in right rail bell, not nav
- [ ] Memory chips: in right rail, not nav
- [ ] All extra information in right rail or main content area

### P5: Fake Icons → SVG Icon System

Screenshot must show:
- [ ] Protocol icons are SVG (not emoji) in nav rail
- [ ] Icons use `currentColor` — accent color when active
- [ ] No emoji (⚡💎📊) as primary desk icons
- [ ] Emoji only in empty state illustrations (if applicable)

### P6: Ugly Curved Cards → Sharp Corners + Inline Metrics

Screenshot must show:
- [ ] Session cards: `border-radius: 4px`
- [ ] Active session dot: 7px, solid green, NO animation
- [ ] Metrics are inline chips/text, not nested bordered sub-cards
- [ ] No pulsing or blinking indicators on session cards

### P7: Bittensor Too Expert → Beginner Default + Expert Toggle

Bittensor screenshot must show:
- [ ] Beginner/Expert toggle visible in desk header
- [ ] "Beginner" is active by default
- [ ] Beginner view shows: TAO amounts, subnet names, no addresses
- [ ] Expert view (if toggled): 🔒 badge, truncated addresses
- [ ] No full wallet address in Beginner view

---

## Section 7: QA Sign-Off

Each gate requires a sign-off from:

| Role | Gate |
|------|------|
| Codex (implementer) | All gates |
| Stitch (design) | G1, G4 (desktop dark/light) |
| Peer review | G1 |

**QA file naming convention:**
```
screenshots/desk-v2/[desk]-[gate]-[reviewer]-[date].png
```
Example: `screenshots/desk-v2/bittensor-g1-dark-alex-2025-07-01.png`
