# Customer UX Overhaul — Desk-First Navigation & Theme System

**Audience:** Engineering, Stitch (design)
**Status:** Draft — ready for Stitch design pass
**Version:** 1.0

---

## 1. Problem Statement

The current customer-facing navigation is organized around Matterhorn's internal structure (Chat, Sessions, Services, Markets, Settings) rather than around what the user wants to do. Users coming to interact with Bittensor, Hyperliquid, or Polymarket have to know that these live under "Services" or "Markets" — an implementation detail that creates friction.

Additionally, the theme system uses a single accent color (`--mh-accent: #D1F2FF`) for all interactive elements, which makes it difficult to differentiate protocol-specific surfaces without relying on color alone.

This overhaul addresses both: a **desk-first navigation** organized around user goals, and a **semantic color system** that uses color purposefully rather than uniformly.

---

## 2. Desk-First Navigation

### 2.1 Navigation Structure

**Core principle:** The sidebar is organized by the user's desk — what they're working on, not how Matterhorn is structured internally.

**Primary nav sections:**

```
┌──────────────────────────────────────┐
│  [Matterhorn logo]                  │
│                                      │
│  ┌─ Desk ──────────────────────────┐│
│  │ Bittensor                    [⊗] ││
│  │ Hyperliquid                  [H] ││
│  │ Polymarket                   [P] ││
│  │ Wellness                     [♥] ││
│  └──────────────────────────────────┘│
│                                      │
│  ┌─ Memory ─────────────────────────┐│
│  │ Memory                      [M]   ││
│  │   ↳ Inbox badge (producer count) ││
│  │ Sources & Provenance              ││
│  │ Watchlists                       ││
│  └──────────────────────────────────┘│
│                                      │
│  ┌─ Tools ───────────────────────────┐│
│  │ MCPs                         [⚡] ││
│  │ Workflows (future)                ││
│  └──────────────────────────────────┘│
│                                      │
│  ┌─ Settings ────────────────────────┐│
│  │ Settings                          ││
│  │ Profile                           ││
│  │ Privacy & Forget Center           ││
│  └──────────────────────────────────┘│
│                                      │
│  [Collapse sidebar ─]                │
└──────────────────────────────────────┘
```

**Section breakdown:**

| Section | Items | Purpose |
|---------|-------|---------|
| **Desk** | Bittensor, Hyperliquid, Polymarket, Wellness | Protocol-specific surfaces the user is actively working with |
| **Memory** | Memory Overview, Sources & Provenance, Watchlists | Memory management and evidence |
| **Tools** | MCPs, Workflows (future) | Extensions and automation |
| **Settings** | Settings, Profile, Privacy & Forget Center | Account and preferences |

### 2.2 What Gets Removed

**"Services" is removed from the customer-facing nav entirely.**

"Services" was an internal grouping term. Its contents are redistributed:

| Old location | New location |
|-------------|--------------|
| Services → Bittensor | Desk → Bittensor |
| Services → Hyperliquid | Desk → Hyperliquid |
| Services → Polymarket | Desk → Polymarket |
| Services → Wellness | Desk → Wellness |
| Services → MCPs | Tools → MCPs |
| Markets (if separate) | Desk (merged) |

**"Chat" and "Sessions" nav items are removed** from the primary sidebar (they remain accessible via the main app header, which always shows the chat composer). The chat is the ambient context — the desk is where work happens.

### 2.3 Inbox Badge on Memory

The Memory nav item shows an unread Producer suggestion count badge when inbox has unread suggestions.

```
Memory  [3]    ← badge appears when unread > 0
```

Clicking Memory → navigates to Memory Overview. The bell icon in the app header is the dedicated entry point for the inbox.

### 2.4 Collapsed Sidebar

- Default: expanded (220px wide)
- Collapse trigger: "Collapse sidebar" button at bottom of sidebar, or double-click sidebar edge
- Collapsed: icon-only (56px wide). Tooltip on hover shows full label.
- Mobile: sidebar hidden by default, hamburger menu in header

---

## 3. Desk Surfaces

Each Desk item opens a protocol-specific surface. These surfaces share the common Memory card design from `production-handoff.md` but have a protocol header:

### 3.1 Bittensor Desk

```
┌─ Bittensor ──────────────────────────────────────────────────┐
│ [⊗]  Bittensor              [View market ↗]  [Settings ⚙]  │
│ Stake preferences, validator behavior, subnet activity        │
│                                                                │
│ Memories: 12    Validators tracked: 4    Avg confidence: 74%   │
└────────────────────────────────────────────────────────────────┘
```

- Icon: TAO symbol (⊗) in `--desk-bittensor` tint
- "View market" link: opens Bittensor subnet market in external browser (never in-app iframe)
- "Settings" link: opens Bittensor integration settings

### 3.2 Hyperliquid Desk

```
┌─ Hyperliquid ─────────────────────────────────────────────────┐
│ [H]  Hyperliquid            [View market ↗]  [Settings ⚙]    │
│ Perpetual positions, margin preferences, funding rate alerts   │
│                                                                │
│ Memories: 8     Active positions: 2     Avg confidence: 81%    │
└────────────────────────────────────────────────────────────────┘
```

- Icon: "H" in `--desk-hyperliquid` tint
- "View market" link: opens Hyperliquid in external browser
- "Settings" link: opens Hyperliquid integration settings

### 3.3 Polymarket Desk

```
┌─ Polymarket ──────────────────────────────────────────────────┐
│ [P]  Polymarket             [Browse markets ↗]  [Settings ⚙] │
│ Tracked markets, prediction questions, resolution criteria    │
│                                                                │
│ Memories: 5     Markets tracked: 3     Avg confidence: 67%    │
└────────────────────────────────────────────────────────────────┘
```

- Icon: "P" in `--desk-polymarket` tint
- "Browse markets" link: opens Polymarket in external browser
- "Settings" link: opens Polymarket integration settings

### 3.4 Wellness Desk

```
┌─ Wellness ───────────────────────────────────────────────────┐
│ [♥]  Wellness                  [New goal ↗]  [Settings ⚙] │
│ Health goals, wellness plans, progress streaks               │
│                                                                │
│ [🔒 Wellness memories are stored locally only]                │
│                                                                │
│ Memories: 4     Current streak: 7 days    Avg confidence: 88% │
└────────────────────────────────────────────────────────────────┘
```

- Icon: heart (♥) in `--desk-wellness` tint
- "New goal" link: opens wellness workflow creator
- **Privacy notice is mandatory** on this surface — must always be visible
- "Settings" link: opens Wellness integration settings

---

## 4. Enhanced Theme System

### 4.1 Problem with the Current System

The current theme uses a single accent color (`#D1F2FF`) for all interactive elements — buttons, links, focus states, badges. This creates two problems:

1. **No visual hierarchy** — primary actions, secondary actions, and disabled states all use the same accent, making surfaces feel flat.
2. **No protocol differentiation** — Bittensor, Hyperliquid, and Polymarket surfaces all look identical, requiring users to read labels to orient themselves.

### 4.2 New Semantic Color Tokens

The theme is organized around **semantic intent**, not visual description. Each token has a name that describes its purpose, not its color.

#### Core Brand Tokens

These remain unchanged — they define the base brand palette:

| Token | Dark value | Light value | Use |
|-------|-----------|-------------|-----|
| `--brand-bg` | `#0C0C0C` | `#F5F5F5` | Page background |
| `--brand-surface` | `#141414` | `#FFFFFF` | Cards, panels |
| `--brand-elevated` | `#1E1E1E` | `#EBEBEB` | Modals, dropdowns |
| `--brand-accent` | `#D1F2FF` | `#0284C7` | Primary interactive elements, links |
| `--brand-accent-dim` | `rgba(209,242,255,0.10)` | `rgba(2,132,199,0.08)` | Accent backgrounds |
| `--brand-text` | `#F0F0F0` | `#1A1A1A` | Primary text |
| `--brand-text-secondary` | `#8A8A8A` | `#666666` | Secondary text |
| `--brand-border` | `#2A2A2A` | `#D0D0D0` | Borders |

#### Protocol Brand Tokens (NEW)

Each protocol gets a signature color that appears in its desk header, protocol badge, and any protocol-specific surfaces. This is the user's first visual anchor when they land on a desk.

| Token | Dark value | Light value | Use |
|-------|-----------|-------------|-----|
| `--desk-bittensor` | `#F472B6` (pink) | `#DB2777` | Bittensor desk, TAO-related badges |
| `--desk-hyperliquid` | `#60A5FA` (blue) | `#2563EB` | Hyperliquid desk, position badges |
| `--desk-polymarket` | `#C084FC` (purple) | `#9333EA` | Polymarket desk, market question badges |
| `--desk-wellness` | `#F472B6` (pink) | `#DB2777` | Wellness desk, streak badges |
| `--desk-memory` | `#34D399` (green) | `#059669` | Memory desk, provenance badges |

**Usage rules:**
- Protocol color appears in: desk icon background, desk header, protocol badge in memory cards, nav active state
- Protocol color does NOT appear in: action buttons (use `--brand-accent`), danger states (use `--status-danger`), error states (use `--status-error`)
- Protocol colors are not used to indicate status — status is always communicated via status tokens (see §4.3)

#### Status Tokens (Enhanced)

| Token | Dark value | Light value | Use |
|-------|-----------|-------------|-----|
| `--status-success` | `#22C55E` | `#16A34A` | Confirmed, saved, positive PnL |
| `--status-success-dim` | `rgba(34,197,94,0.12)` | `rgba(22,163,74,0.10)` | Success backgrounds |
| `--status-warning` | `#F59E0B` | `#D97706` | Compliance blocked, Restricted, caution |
| `--status-warning-dim` | `rgba(245,158,11,0.12)` | `rgba(217,119,6,0.10)` | Warning backgrounds |
| `--status-info` | `#60A5FA` | `#2563EB` | Read-only, preview, informational |
| `--status-info-dim` | `rgba(96,165,250,0.12)` | `rgba(37,99,235,0.10)` | Info backgrounds |
| `--status-danger` | `#EF4444` | `#DC2626` | Errors, forget, reject |
| `--status-danger-dim` | `rgba(239,68,68,0.12)` | `rgba(220,38,38,0.10)` | Danger backgrounds |

#### Semantic Action Tokens (NEW)

| Token | Dark value | Light value | Use |
|-------|-----------|-------------|-----|
| `--action-primary` | `#D1F2FF` (accent) | `#0284C7` | Primary CTA buttons |
| `--action-primary-hover` | `rgba(209,242,255,0.18)` | `rgba(2,132,199,0.12)` | Primary button hover |
| `--action-secondary` | `#2A2A2A` | `#E5E5E5` | Secondary buttons |
| `--action-ghost` | transparent | transparent | Ghost buttons, icon buttons |
| `--action-ghost-hover` | `#1E1E1E` | `#F0F0F0` | Ghost button hover |
| `--action-danger` | `#EF4444` | `#DC2626` | Danger buttons (forget, delete) |

#### Navigation Tokens (NEW)

| Token | Dark value | Light value | Use |
|-------|-----------|-------------|-----|
| `--nav-bg` | `#0F0F0F` | `#EBEBEB` | Sidebar background |
| `--nav-bg-hover` | `#1A1A1A` | `#E0E0E0` | Nav item hover |
| `--nav-bg-active` | `rgba(209,242,255,0.08)` | `rgba(2,132,199,0.08)` | Active nav item |
| `--nav-text` | `#8A8A8A` | `#666666` | Inactive nav text |
| `--nav-text-active` | `#F0F0F0` | `#1A1A1A` | Active nav text |
| `--nav-border` | `#1F1F1F` | `#D0D0D0` | Nav dividers |

### 4.3 Color Usage Rules

1. **Primary actions** → `--action-primary`
2. **Secondary actions** → `--action-secondary`
3. **Danger actions** → `--action-danger`
4. **Ghost/icon buttons** → `--action-ghost` + `--action-ghost-hover`
5. **Protocol surfaces** → protocol brand token (`--desk-*`)
6. **Status indicators** → status tokens (`--status-*`) — NOT protocol colors
7. **Links** → `--brand-accent`
8. **Text** → `--brand-text` (primary), `--brand-text-secondary` (secondary)
9. **Borders** → `--brand-border`
10. **Backgrounds** → `--brand-*` tokens

**Never use:**
- Protocol colors for status (don't use pink to indicate error in Bittensor)
- Status colors for protocol branding
- Accent color for danger actions

### 4.4 Light Mode Rules

All dark mode tokens have a corresponding light mode value. Light mode must NOT simply invert dark mode — it must be a genuine light-theme interpretation:

| Dark | Light principle |
|------|---------------|
| `#0C0C0C` background | `#F5F5F5` — off-white, not pure white |
| `#141414` surface | `#FFFFFF` — white surface on off-white background |
| `#D1F2FF` accent | `#0284C7` — blue with enough contrast on white |
| `#F472B6` (pink) | `#DB2777` — deeper pink for light backgrounds |
| `#2A2A2A` borders | `#D0D0D0` — visible but not heavy |
| Shadows use black at 40–60% opacity | Shadows use black at 8–15% opacity |

**Contrast requirements:**
- Primary text on background: minimum 4.5:1 (WCAG AA)
- Secondary text: minimum 3:1
- Interactive elements: minimum 3:1 against adjacent background
- Protocol colors on light backgrounds: verify ≥ 3:1 against white surfaces

---

## 5. Responsive Behavior

### 5.1 Sidebar Behavior

| Breakpoint | Width | Behavior |
|-----------|-------|---------|
| ≥ 1200px | 220px | Always visible, always expanded |
| 768px – 1199px | 220px | Visible, collapsible to 56px icon-only |
| < 768px | 0px (hidden) | Hamburger menu in header, sidebar as full-screen overlay |

### 5.2 Mobile Overlay

On mobile, the sidebar becomes a full-screen overlay when the hamburger is tapped:

```
┌────────────────────────────────────────┐
│ [Matterhorn logo]              [×]    │  ← overlay header
├────────────────────────────────────────┤
│  Bittensor                            │
│  Hyperliquid                          │
│  Polymarket                           │
│  Wellness                             │
│  ─────────────────────────────────    │
│  Memory                         [3]   │
│  Sources & Provenance                 │
│  Watchlists                           │
│  ─────────────────────────────────    │
│  MCPs                                 │
│  ─────────────────────────────────    │
│  Settings                             │
│  Profile                              │
│  Privacy & Forget Center              │
└────────────────────────────────────────┘
```

- Background: `--nav-bg` with `backdrop-filter: blur(8px)` on mobile
- Active item: `--nav-bg-active` background
- Animation: slide in from left, 250ms

### 5.3 Card Grid (Memory Surfaces)

Memory cards in the Memory Overview and desk surfaces:

| Breakpoint | Grid columns | Card padding |
|-----------|-------------|-------------|
| ≥ 1200px | 3 columns | 20px |
| 768px – 1199px | 2 columns | 16px |
| < 768px | 1 column | 12px |

### 5.4 Producer Inbox Panel

| Breakpoint | Width | Behavior |
|-----------|-------|---------|
| ≥ 1200px | 480px | Slides in over content, content dims |
| 768px – 1199px | 100vw | Slides in, full-width panel |
| < 768px | 100vw × 100vh | Full-screen overlay |

---

## 6. Comparison: Before vs. After

### 6.1 Navigation

| Before | After |
|--------|-------|
| Chat (always present header) | Desk section: Bittensor, Hyperliquid, Polymarket, Wellness |
| Sessions | Memory section: Memory Overview, Sources, Watchlists |
| **Services** (removed) | Redistributed to Desk + Tools |
| Markets | Merged into Desk |
| Settings | Settings section: Settings, Profile, Privacy |
| Chat Memory Chips (separate section) | Part of Memory section |

### 6.2 Color System

| Before | After |
|--------|-------|
| Single `--mh-accent` for everything | Semantic tokens per intent: `--action-primary`, `--status-success`, `--desk-bittensor`, etc. |
| No protocol differentiation | Protocol brand tokens: each desk has a signature color |
| Status and protocol colors mixed | Status tokens only for status; protocol tokens only for protocol |
| Single shadow depth | Three shadow levels (`--shadow-sm/md/lg`) with different opacity in light mode |
| `--mh-*` namespace only | `--brand-*` + `--action-*` + `--status-*` + `--desk-*` + `--nav-*` namespaces |

---

## 7. Safety Rules

### 7.1 Navigation Safety

- Desk surfaces (Bittensor, Hyperliquid, Polymarket) must never show "sign transaction," "submit trade," or "place order" buttons.
- The Wellness desk nav item must have a lock icon (🔒) indicator if wellness data is Restricted.
- "Privacy & Forget Center" is always accessible — never hidden behind an advanced settings toggle.

### 7.2 Theme Safety

- No protocol brand color may be used to imply a live trading capability.
- Status tokens (`--status-success` green) may only appear in contexts where a confirmation is genuinely complete (e.g., "Confirmed ✓"). Green must never appear to imply guaranteed financial outcomes.
- The Wellness desk's protocol brand color (`--desk-wellness`) must not appear in contexts that imply medical endorsement.

---

## 8. Stitch Prompts

See `docs/ui/matterhorn-memory/stitch-prompts.md` — Sprint 7: Customer UX Overhaul (sections 23–27).

---

## 9. Relationship to Existing UI

This spec builds on `docs/ui/matterhorn-memory/production-handoff.md` and `docs/ui/matterhorn-customer-ux-refresh/styles.css`. It does not replace them — it extends them.

| File | Role in this spec |
|------|------------------|
| `production-handoff.md` | Memory card design, detail panel, Privacy Center — unchanged |
| `memory-producer-v1.md` | Producer inbox — runs alongside this nav |
| `styles.css` (memory) | Memory-specific tokens — add `--desk-*`, `--action-*`, `--status-*` |
| `styles.css` (ux-refresh) | Brand tokens — add semantic namespaces |
| `stitch-prompts.md` | New Sprint 7 sections |
