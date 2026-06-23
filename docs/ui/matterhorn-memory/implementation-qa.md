# Matterhorn Memory UI — Implementation QA Checklist

**Purpose:** QA-ready acceptance checklist for the production Memory UI surface.
**Owner:** Verifier / QA team
**Source of truth:** `docs/ui/matterhorn-memory/production-handoff.md`
**Run alongside:** `pnpm test:minimax-ui-system` and `pnpm test:market-execution-safety-gate`

Mark each item `PASS`, `FAIL`, or `N/A`. Any `FAIL` is a blocking defect.

---

## Hard Rules — Non-Negotiable

These must be verified for every PR that touches Memory UI code.

- [ ] **No hidden memory.** The Memory surface shows every memory the app holds. No background, passive, or invisible memory exists that is not surfaced.
- [ ] **Every memory has source.** Each card displays a `.mm-source` chip with icon + label. No raw URLs, addresses, or API paths shown.
- [ ] **Every memory has sensitivity.** Each card displays a `.mm-badge--sensitivity` badge. Correct level (Personal / High / Restricted) per type.
- [ ] **Every memory has why.** Each card displays `.mm-card__why` — a one-line explanation of the trigger. Not blank. Not generic.
- [ ] **Every memory has forget.** Every card has a Forget button (`.mm-btn--ghost`, red text) in `.mm-card__actions`. Not hidden. Not disabled.
- [ ] **Wellness is Restricted.** Every Wellness memory card shows `.mm-badge--sensitivity-restricted`. No override exists.
- [ ] **Wellness is local-only.** No wellness data is sent to any external server or third-party API.
- [ ] **Wellness excluded from export.** Wellness memories do not appear in any export manifest or Export All.
- [ ] **Wellness excluded from receipts.** Wellness data does not appear in Receipts or Sources tables.
- [ ] **No custody language.** No text implying Matterhorn holds, controls, or can modify on-chain positions. See Forbidden Language list.
- [ ] **No signing/submit/confirm language.** The words "sign", "submit", "confirm trade", "confirm order" do not appear in Memory UI copy.
- [ ] **No OpenWork/OpenCode.** The strings "openwork" or "opencodec" do not appear in visible copy.
- [ ] **No seed phrase / private key / API secret fields.** None of these appear in any Memory UI field, export, or log.

---

## Forbidden Language — Must Not Appear in Any Memory UI Copy

Scan all visible text (labels, placeholders, tooltips, toasts, modals, dialogs):

| Phrase | Notes |
|--------|-------|
| `seed phrase` | Never in any context |
| `private key` | Never in any context |
| `api secret` | Never in any context |
| `raw signature` | Never in any context |
| `signed payload` | Never in any context |
| `wallet export` | Never in any context |
| `submit order` | Never in Memory UI |
| `confirm trade` | Never in Memory UI |
| `sign transaction` | Never in Memory UI |
| `Matterhorn controls` | Custody language |
| `Matterhorn manages` | Custody language |
| `Matterhorn holds your` | Custody language |
| `Matterhorn staked` | Custody language |
| `medical diagnosis` | Never in any context |
| `openwork` | Legacy branding |
| `opencodec` | Legacy branding |

---

## 1. Layout & Responsive

### 1.1 Desktop (≥1200px)
- [ ] Sidebar: 220px fixed width, full height
- [ ] Sidebar nav includes all 8 Memory nav items with icons
- [ ] Memory count badge visible per nav item
- [ ] Main content: 3-column card grid
- [ ] Chip bar: horizontal, full width above card grid
- [ ] Protocol headers: icon + name + stats row
- [ ] Receipt cards: 3-column grid
- [ ] Rightmost interactive element has ≥24px padding from edge

### 1.2 Tablet (768–1199px)
- [ ] Sidebar: 180px or icons-only mode
- [ ] Card grid: 2-column
- [ ] Chip bar: horizontal with overflow scroll
- [ ] Protocol headers: icon + name only (stats collapse)
- [ ] Receipt cards: 2-column grid

### 1.3 Mobile (<768px)
- [ ] Sidebar replaced by fixed bottom tab bar (56px height)
- [ ] Bottom tab bar includes: Overview, Protocol, Wellness, Watchlists, Privacy
- [ ] Card grid: 1-column, full width
- [ ] Chip bar: horizontal wrap with scroll
- [ ] Receipt cards: 1-column stack
- [ ] Privacy panel: full-page scroll, no multi-column
- [ ] Content area accounts for 56px bottom tab offset

### 1.4 General Layout
- [ ] No panel extends beyond viewport without scroll indicator
- [ ] Action buttons (Forget, Export) always reachable without scrolling within a card
- [ ] Content areas scroll independently — no full-page scroll on short viewports
- [ ] Bottom sheets have drag handle and dismiss zone (top 40px)

---

## 2. Memory Overview Screen

**Route:** `/memory`

### 2.1 Header
- [ ] Page title: "Memory Overview"
- [ ] Memory count badge (e.g., "127 items")
- [ ] Search input — placeholder "Search memories…"
- [ ] "+ New Memory" button visible

### 2.2 Chip Bar
- [ ] Shows "Using N memories" when memories are active
- [ ] Active chips (`.mm-chip--active`) show memory titles with count
- [ ] "Remember this" chip present
- [ ] "Forget related" chip present
- [ ] Chips are horizontally scrollable on overflow

### 2.3 Card Grid
- [ ] Cards display in correct column count for viewport
- [ ] Every card shows: title (max 2 lines, ellipsis), scope badge, type badge, sensitivity badge, source chip, confidence bar, "Why remembered?", timestamp, action row
- [ ] Hover state: subtle lift + border accent

### 2.4 Empty State
- [ ] Shown when no memories exist
- [ ] Headline: "No memories yet"
- [ ] CTA button points to chat composer
- [ ] Subtext explains how memories are created

### 2.5 Loading State
- [ ] Skeleton cards (`.mm-skeleton-card`) shown on first load or refresh
- [ ] Correct column count skeleton grid per viewport

### 2.6 Error State
- [ ] Amber banner shown when backend unreachable
- [ ] Banner text: "Memory unavailable — retrying…"
- [ ] Auto-retry active; manual retry button available

---

## 3. Memory Cards — All Screens

### 3.1 Required Fields (every card, every screen)
- [ ] Title (`.mm-card__title`) — descriptive, max 2 lines with ellipsis
- [ ] Scope badge (`.mm-card__scope-badge`) — Workspace / Session / Global
- [ ] Type badge (`.mm-badge--type`) — Fact / Preference / Context / Protocol / Wellness
- [ ] Sensitivity badge (`.mm-badge--sensitivity`) — Personal / High / Restricted
- [ ] Source chip (`.mm-source`) — icon + label, no raw URLs or addresses
- [ ] Confidence bar (`.mm-confidence`) — 3-segment, correct color for range
- [ ] "Why remembered?" callout (`.mm-card__why`) — specific trigger, not generic
- [ ] Timestamp (`.mm-card__timestamp`) — relative time
- [ ] Action row (`.mm-card__actions`) — Use / Edit / Export / Forget

### 3.2 Type Badge Colors
| Type | Color |
|------|-------|
| Fact | Blue (`--mm-type-fact`) |
| Preference | Purple (`--mm-type-preference`) |
| Context | Green (`--mm-type-context`) |
| Protocol | Blue (`--mm-type-protocol`) |
| Wellness | Pink (`--mm-type-wellness`) |

### 3.3 Sensitivity Badge Colors
| Level | Color | Notes |
|-------|-------|-------|
| Personal | Blue | Default for Fact, Preference, Context |
| High | Amber | Positions, margin prefs, tracked markets |
| Restricted | Red | All Wellness — no override |

- [ ] Wellness cards always show Restricted — no override exists

### 3.4 Confidence Bar
| Range | Segments filled | Color |
|-------|----------------|-------|
| ≥80% | 3/3 | Green (`--mm-conf-high`) |
| 50–79% | 2/3 | Amber (`--mm-conf-medium`) |
| <50% | 1/3 | Red (`--mm-conf-low`) |

### 3.5 Action Buttons
| Action | Style | Position |
|--------|-------|----------|
| Use | `.mm-btn--primary` | First |
| Edit | `.mm-btn` (default) | Second |
| Export | `.mm-btn` (default) | Third |
| Forget | `.mm-btn--ghost`, red text | Last |

- [ ] Forget button always visible — not hidden, not disabled

---

## 4. Privacy / Forget Center

**Route:** `/memory/privacy`

### 4.1 Privacy Panel
- [ ] Toggle per memory type: Protocol / Wellness / Chat
- [ ] Each toggle: `.mm-privacy-row` + `.mm-toggle`
- [ ] Label and description per toggle
- [ ] Toggle state persists and updates card visibility

### 4.2 Forget Single
- [ ] Clicking Forget opens confirmation dialog
- [ ] Dialog: "This removes Matterhorn's memory of [title]. The underlying data is not affected."
- [ ] Buttons: Cancel / Confirm Forget
- [ ] Confirm Forget requires explicit click — not pre-filled, not auto-submitted

### 4.3 Forget All
- [ ] "Forget All" button present, red, bottom of panel
- [ ] Multi-step confirmation: Step 1 "Are you sure?" → Step 2 "This cannot be undone." → Step 3 type "FORGET"
- [ ] Each step requires explicit click to proceed

### 4.4 Export
- [ ] "Export All" button present
- [ ] Confirmation step before export
- [ ] Export manifest contains: exportedAt, memoryCount, memories[], sha256
- [ ] Wellness memories excluded from export
- [ ] Raw signatures, seed phrases, private keys, API secrets excluded from export
- [ ] Export file is valid JSON or CSV

### 4.5 Suppressed Memories
- [ ] "Do Not Remember" memories visible in Privacy Center
- [ ] "Restore" option on each suppressed memory
- [ ] Restoring returns memory to card grid

---

## 5. Chat Memory Chips

**Location:** Chat composer toolbar, above input field

### 5.1 Chip Variants
| Variant | Label | Style |
|---------|-------|-------|
| Active count | "Using N memories" | Bar label |
| Memory chip | "[title]" | `.mm-chip--active` |
| Count | "×N" | `.mm-chip` |
| Remember | "Remember this" | `.mm-chip` |
| Do Not Remember | "Do not remember" | `.mm-chip` |
| Forget | "Forget related" | `.mm-chip--forget` (red) |

### 5.2 Chip Behavior
- [ ] Chip bar appears above chat input, below model selector
- [ ] Active chips show count label
- [ ] Chips horizontally scrollable
- [ ] Clicking chip opens popover with full memory card
- [ ] "Remember this" is user-initiated only — no passive recording chip
- [ ] Chips absent from chat message history
- [ ] Session header shows active memory count

### 5.3 Chip Safety
- [ ] Chips never display raw data (addresses, amounts, keys)
- [ ] Chip titles use the memory title field only

---

## 6. Empty / Blocked / Error States

### 6.1 MemoryEmptyState (`.mm-empty`)
- [ ] Shown when a memory category has no items
- [ ] Icon or illustration present
- [ ] Headline: "No [type] memories yet"
- [ ] Subtext explains how memories are created
- [ ] CTA button present and correct

### 6.2 MemoryBlockedState (`.mm-secret-block`)
- [ ] Shown when memory cannot be displayed
- [ ] Lock icon visible
- [ ] Headline: "Memory hidden"
- [ ] Subtext explains why
- [ ] Action button present ("Enable Memory" or "Contact admin")

### 6.3 MemoryDisabledState (`.mm-disabled`)
- [ ] Shown when memory is globally disabled by admin
- [ ] Alert icon visible
- [ ] Headline: "Memory is disabled"
- [ ] Subtext: "Your administrator has disabled memory for this workspace."
- [ ] No action button — informational only

### 6.4 MemorySourceUnavailable (`.mm-source-unavailable`)
- [ ] Amber border on affected card
- [ ] Source chip replaced with "Source unavailable" text
- [ ] Card content still visible

### 6.5 Loading Skeleton (`.mm-skeleton`, `.mm-skeleton-card`)
- [ ] Skeleton cards shown during async load
- [ ] Correct number per grid column count
- [ ] Animated shimmer effect present

---

## 7. Protocol-Specific UI Rules

### 7.1 Bittensor Memories (`/memory/bittensor`)
- [ ] Protocol header: icon + "Bittensor" + description + stats (memories, validators, avg confidence)
- [ ] Cards show validator set, stake distribution, subnet incentives, delegation history
- [ ] Wallet addresses shown truncated — never labeled as "owned"
- [ ] No language implying Matterhorn controls stake
- [ ] "Why remembered?" explains user action (e.g., "You reviewed the validator list")

### 7.2 Hyperliquid Memories (`/memory/hyperliquid`)
- [ ] Protocol header: icon + "Hyperliquid" + description + stats (memories, positions)
- [ ] Cards show positions, margin preferences, funding rate alerts, leverage limits
- [ ] Positions displayed as user context — not financial advice
- [ ] No account balance displayed
- [ ] No language implying Matterhorn can modify positions
- [ ] Position-related cards show amber "High" sensitivity badge

### 7.3 Polymarket Memories (`/memory/polymarket`)
- [ ] Protocol header: icon + "Polymarket" + description + stats (memories, tracked)
- [ ] Cards show tracked markets, prediction questions, resolution criteria
- [ ] Market data is display-only — no recommendation language
- [ ] "Why remembered?" explains user action (e.g., "You bookmarked this market")

### 7.4 Wellness Memories (`/memory/wellness`)
- [ ] Local-only notice prominently displayed on every Wellness view:
  > "Wellness memories are stored locally on your device. No wellness data is sent to external servers."
- [ ] All Wellness cards show Restricted badge — always
- [ ] Wellness cards absent from Receipts, Sources, and Export All
- [ ] No "sync" or "cloud" language in Wellness section
- [ ] No network requests to external servers on Wellness page (DevTools verification)
- [ ] Wellness section excluded from standard Export All

---

## 8. Receipts & Evidence

**Route:** `/memory/receipts`

- [ ] Header: "Receipts and Evidence" with "Export All" button
- [ ] Each receipt card: status badge / action summary / order ID (truncated) / venue / network / signed timestamp / signer type / SHA-256 fingerprint
- [ ] Status badge: Verified (green) / Pending (amber) / Failed (red)
- [ ] Pending receipts: amber badge + "Matterhorn never signed this"
- [ ] Buttons: View / Download / Copy SHA
- [ ] Export All requires confirmation
- [ ] Export manifest: receiptId, action summary, SHA-256, timestamp, venue — never amounts or full addresses
- [ ] Export never contains raw signatures, signed payloads, or private data

---

## 9. Sources & Provenance

**Route:** `/memory/sources`

- [ ] Table columns: Memory | Type | Source | Confidence
- [ ] Sortable by all columns
- [ ] Source chip with icon + label (matches card source chip)
- [ ] Wellness memories NOT in external-facing Sources table
- [ ] Source legend panel accessible
- [ ] Each entry traces to exact source event

---

## 10. Watchlists

**Route:** `/memory/watchlists`

- [ ] List view (rows, not cards)
- [ ] Row fields: symbol/market, venue, reason, type badge, addedAt
- [ ] "+ New Watchlist" opens inline create form
- [ ] Edit button per row — inline edit
- [ ] Delete button per row — confirm dialog → remove
- [ ] No custody or trading language

---

## 11. Accessibility

### 11.1 Keyboard Navigation
- [ ] All interactive elements reachable via Tab
- [ ] Focus order follows visual order
- [ ] Focus visible indicator on all focusable elements
- [ ] Escape closes modals and popovers
- [ ] Enter/Space activates buttons and toggles

### 11.2 Screen Reader
- [ ] All icons have `aria-label` or `aria-hidden="true"`
- [ ] Confidence bar has `aria-label` with percentage
- [ ] Toggle switches have `aria-checked` state
- [ ] Dialogs have `role="dialog"` and `aria-labelledby`
- [ ] Memory card content announced correctly

### 11.3 Color & Contrast
- [ ] All text passes WCAG AA (4.5:1 normal, 3:1 large)
- [ ] Confidence bar distinguishable without color (segment count + color)
- [ ] Sensitivity badge distinguishable without color (label text present)
- [ ] Focus indicators visible on all backgrounds

### 11.4 Motion
- [ ] No auto-playing animation without user consent
- [ ] Animations respect `prefers-reduced-motion`

---

## 12. Screenshot QA Checklist

Capture at each breakpoint. Compare against `docs/ui/matterhorn-memory/index.html`.

### 12.1 Memory Overview
- [ ] Desktop (1440px) — full page, sidebar + content
- [ ] Tablet (768px) — collapsed sidebar, 2-col grid
- [ ] Mobile (375px) — bottom tab bar, 1-col grid

### 12.2 Memory Cards
- [ ] Desktop — Fact type card
- [ ] Desktop — Preference type card with High sensitivity
- [ ] Desktop — Protocol type card
- [ ] Desktop — Wellness card with Restricted sensitivity + local-only notice
- [ ] Desktop — Card hover state
- [ ] Desktop — All 3 confidence levels (high/medium/low)

### 12.3 Chat Memory Chips
- [ ] Desktop — Chip bar with active memories
- [ ] Desktop — "Remember this" / "Do not remember" / "Forget related" chips
- [ ] Desktop — Chip popover on click
- [ ] Mobile — Chip bar with horizontal scroll

### 12.4 Privacy / Forget Center
- [ ] Desktop — Privacy panel with all toggles
- [ ] Desktop — Forget single confirmation dialog
- [ ] Desktop — Forget All multi-step confirmation (all 3 steps)
- [ ] Desktop — Export confirmation
- [ ] Mobile — Privacy panel single column

### 12.5 Protocol Screens
- [ ] Desktop — Bittensor memories with protocol header
- [ ] Desktop — Hyperliquid memories with protocol header
- [ ] Desktop — Polymarket memories with protocol header
- [ ] Desktop — Wellness memories with local-only notice

### 12.6 Receipts & Evidence
- [ ] Desktop — Receipt with Verified badge
- [ ] Desktop — Receipt with Pending badge
- [ ] Desktop — Receipt export dialog

### 12.7 Empty / Blocked / Error States
- [ ] Desktop — Empty state (no memories)
- [ ] Desktop — Blocked state (`.mm-secret-block`)
- [ ] Desktop — Disabled state (`.mm-disabled`)
- [ ] Desktop — Source unavailable state (`.mm-source-unavailable`)
- [ ] Desktop — Loading skeleton state

### 12.8 Theme QA
- [ ] Dark theme: `#0C0C0C` background, `#D1F2FF` accent
- [ ] Light theme: `#F5F5F5` background, `#2563EB` accent
- [ ] Theme toggle works and persists across sessions

### 12.9 Accessibility QA
- [ ] Keyboard navigation through Memory Overview (focus indicators)
- [ ] Screen reader output for a memory card
- [ ] High contrast mode (if applicable)

---

## 13. Network & Security Verification (Wellness)

Requires DevTools or proxy inspection:

- [ ] Open Network tab → visit `/memory/wellness`
- [ ] Zero outbound requests to non-localhost during Wellness page load
- [ ] Wellness data absent from Export All response
- [ ] Wellness data absent from Receipts API response
- [ ] Wellness API endpoints return 403 from server-side context

---

## 14. Cross-Functional Checks

- [ ] Memory count badge updates when memories are added / forgotten
- [ ] Search filters cards by title, type, source
- [ ] Sorting on Sources table works for all columns
- [ ] Language / i18n toggled correctly (if applicable)
- [ ] No console errors on any Memory page
- [ ] No memory leaks on repeated navigation to/from Memory

---

## Revision History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 0.1 | 2026-06-23 | Coder (minimax) | Initial QA checklist |
