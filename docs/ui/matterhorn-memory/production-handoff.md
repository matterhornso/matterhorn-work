# Matterhorn Memory UI — Production Handoff

**Status:** Draft — awaiting Stitch final design
**Based on:** `docs/ui/matterhorn-memory/` prototype (13 screens, dark/light themes)
**Audience:** Stitch (design), Codex (backend/API), App implementation team

---

## 1. Screen Inventory

Every screen listed below is fully specified in the prototype at `docs/ui/matterhorn-memory/index.html`. Implementation teams should treat the HTML as the source of truth for layout, spacing, and visual states. This document captures the **data contracts and UX rules** that drive each screen — the parts the prototype cannot express.

### 1.1 Memory Overview

**Route:** `/memory` (sidebar nav entry)
**Layout:** Left sidebar (220px) + main content area with card grid
**Purpose:** Entry point for all memory surfaces. Shows count, search, chip bar, and recent cards.

**States:**
| State | Trigger | UI |
|-------|---------|-----|
| Default | Memoirs exist | Card grid, sidebar nav, search |
| Empty | No memoirs ever created | Empty state with "Start a session" CTA |
| Loading | First load or refresh | Skeleton cards (3-col grid) |
| Error | Backend unreachable | Amber banner + retry button |

**Card grid:** 3-column on ≥1200px, 2-column on 768–1199px, 1-column on <768px.

---

### 1.2 Protocol Memories

#### 1.2.1 Bittensor Memories

**Route:** `/memory/bittensor`
**Layout:** Protocol header + card grid (same as Overview)
**Data domain:** Subnet activity, validator selections, stake preferences, delegation history.

**Required data:**
- `validatorSet[]` — name, subnet ID, stake amount, selection date
- `delegationHistory[]` — amount, subnet, date, tx hash (receipt reference only — no raw signature)
- `compoundingPreference` — enum: `auto` | `manual` | `none`
- `confidence` — number 0–100, displayed as 3-segment bar

**Safety constraint:** Never display raw wallet addresses as "owned". Show only truncated display addresses. Never imply Matterhorn controls stake.

---

#### 1.2.2 Hyperliquid Memories

**Route:** `/memory/hyperliquid`
**Layout:** Protocol header + card grid
**Data domain:** Perpetual positions, margin preferences, funding rate alerts, leverage limits.

**Required data:**
- `positions[]` — asset, side, size, entry price, unrealized PnL (never display raw position value without context)
- `marginPreference` — leverage ceiling, conservative/aggressive flag
- `fundingRateAlerts[]` — asset, threshold, active boolean
- `confidence` — number 0–100

**Safety constraint:** Positions are displayed as user context, not as financial advice. Never show account balance. Never imply Matterhorn can modify positions.

---

#### 1.2.3 Polymarket Memories

**Route:** `/memory/polymarket`
**Layout:** Protocol header + card grid
**Data domain:** Tracked markets, prediction questions, market resolution criteria, position sizes.

**Required data:**
- `trackedMarkets[]` — market ID, question text, current probability, resolution date
- `marketPositions[]` — market ID, amount, side (YES/NO)
- `confidence` — number 0–100

**Safety constraint:** Market data is display-only. Never imply Matterhorn recommends trades based on tracked markets.

---

### 1.3 Wellness Memories

**Route:** `/memory/wellness`
**Layout:** Protocol header with local-only notice + card grid
**Data domain:** Goals, streaks, check-in cadence, health preferences, risk review habits.

**Required data:**
- `wellnessMemories[]` — title, goal text, recurrence, streak count, last check-in
- `wellnessPreferences` — check-in frequency, notification time
- `confidence` — number 0–100

**Safety constraints (non-negotiable):**
- All wellness memories are stored **locally only** — no wellness data is sent to any external server or third-party API
- No medical diagnoses, symptoms, or PHI in any field
- Wellness memories must carry `sensitivity: "restricted"` at all times — no override
- Wellness section must display the local-only notice prominently on every view:
  > "Wellness memories are stored locally on your device. No wellness data is sent to external servers."
- Wellness data must not appear in any export unless the export is explicitly a **local-only export** with a visible warning that it is for device-local use only
- Wellness memories must never appear in receipts, receipts export, or provenance table
- Do not use the word "sync" or "cloud" anywhere in the Wellness section

---

### 1.4 Watchlists

**Route:** `/memory/watchlists`
**Layout:** List view with item rows, not cards
**Data domain:** Tracked markets, alerts, manually bookmarked items.

**Required data:**
- `watchlistItems[]` — symbol/market, venue, reason (free text), type badge, addedAt

**Interactions:**
| Action | Behavior |
|--------|----------|
| + New Watchlist | Opens inline create form (symbol + venue + reason) |
| Edit | Inline edit row |
| Delete | Confirm dialog → remove |

---

### 1.5 Receipts and Evidence

**Route:** `/memory/receipts`
**Layout:** Receipt card grid, Export All button
**Data domain:** SHA-256 fingerprints of all external signer interactions.

**Required data:**
- `receipts[]` — receiptId, orderId, action type, asset, amount, price, signedAt, venue, signerType, sha256Fingerprint, status (`verified` | `pending` | `failed`)

**Safety constraints:**
- Only SHA-256 fingerprints are stored — no raw signatures, no signed payloads, no private transaction data
- "Preview" receipts (never submitted) are displayed with amber "Pending" badge and text: "Matterhorn never signed this"
- Receipt export must contain only: receiptId, action summary, SHA-256, timestamp, venue — never transaction amounts or wallet addresses in the exported CSV/JSON
- Export All must require confirmation step

---

### 1.6 Sources and Provenance

**Route:** `/memory/sources`
**Layout:** Attribution table (sortable columns) + source legend panel
**Data domain:** Memory attribution — every memory maps to a source event.

**Required data:**
- `provenanceEntries[]` — memoryId, source (enum), sourceLabel, sourceDetail, timestamp, confidence

**Source enum values:**
| Value | Label | Examples |
|-------|-------|----------|
| `on_chain` | On-chain | Hyperliquid fills, Bittensor stake txs |
| `chat` | Chat conversation | Explicit user statements, question context |
| `market_data` | Market data | Funding rates, Polymarket prices |
| `documentation` | Documentation | Bittensor docs, Polymarket docs |
| `wellness_workflow` | Wellness workflow | Goals, check-ins (never sent externally) |
| `user_action` | Manual entry | Watchlist add, memory create |

---

### 1.7 Privacy / Forget Center

**Route:** `/memory/privacy`
**Layout:** Toggle panel + forget actions + export panel
**Data domain:** Memory retention preferences, per-type toggles.

**Required data:**
- `memoryPreferences` — per-type enabled boolean (`protocolEnabled`, `wellnessEnabled`, `chatEnabled`)
- `forgetHistory[]` — memoryId, forgotAt, scope (`single` | `related` | `all`)

**Safety constraints:**
- "Forget All" must require multi-step confirmation: (1) Are you sure? (2) This cannot be undone. (3) Type "FORGET" to confirm.
- Forgetting a memory does not delete the underlying data from the protocol — it only removes Matterhorn's contextual reference. This must be clearly stated in the confirmation dialog.
- Forget confirmation must never be pre-filled or auto-submitted

---

### 1.8 Chat Memory Chips

**Locations:** Chat composer toolbar (inline chip bar), session header (active memory count)

**Chip variants:**
| Variant | Label | Condition |
|---------|-------|-----------|
| Active | "Using N memories" | Memories applied to current response |
| Memory chip | "[title]" | Single memory referenced |
| Count chip | "×N" | Multiple memories of same type |
| Remember | "Remember this" | User explicitly saves current context |
| Do Not Remember | "Do not remember" | User suppresses memory creation |
| Forget | "Forget related" | User requests removal of related memories |

**Required data:**
- `activeMemories[]` — id, title, type, confidence — shown in chip bar during active session
- `contextPacket` — `{ sessionId, memoryIds[], appliedAt }` — backend sends on each response

**Safety constraints:**
- Chips in the composer must never display raw data values (addresses, amounts, keys)
- "Remember this" must always be user-initiated — no passive background recording chip

---

### 1.9 Mobile Memory

**Route:** `/memory` on viewport <768px
**Layout:** Single-column, no sidebar, bottom tab bar for navigation between memory categories.

**Required adaptations:**
- Sidebar collapses to bottom tab bar (Overview · Protocol · Wellness · Privacy)
- Card grid becomes 1-column
- Receipt cards stack vertically
- Privacy panel scrolls vertically, no multi-column
- Search input spans full width
- Chip bar wraps horizontally with scroll

---

## 2. Component Inventory

Each component maps to a CSS class in `docs/ui/matterhorn-memory/styles.css`. Implementation teams should use these class names as the base for production component filenames.

### 2.1 MemoryCard — `.mm-card`

Root container for a single memory item.

**States:**
| State | Class | Trigger |
|-------|-------|---------|
| Default | `.mm-card` | Normal display |
| Hover | `.mm-card:hover` | Subtle lift + border accent |
| Loading | Skeleton variant — `.mm-skeleton-card` | Async load |
| Restricted | `.mm-card` + `.mm-badge--sensitivity-restricted` | Wellness type |
| Error | `.mm-card` with amber border | Source unavailable |

**Required sub-elements:**
- `.mm-card__header` — title + scope badge
- `.mm-card__title` — memory description (max 2 lines, ellipsis)
- `.mm-card__scope-badge` — Workspace / Session / Global
- `.mm-card__meta` — type badge + sensitivity badge + source chip + confidence bar
- `.mm-card__why` — "Why remembered?" callout with explanation text
- `.mm-card__timestamp` — relative time (e.g., "Updated 2 hours ago")
- `.mm-card__actions` — Use / Edit / Export / Forget buttons

**Required props (backend):** `id`, `title`, `type`, `sensitivity`, `source`, `sourceDetail`, `confidence`, `scope`, `whyText`, `updatedAt`

---

### 2.2 MemorySensitivityBadge — `.mm-badge--sensitivity`

Displays memory sensitivity level.

| Level | Class | Color | Applies To |
|-------|-------|-------|-----------|
| Personal | `.mm-badge--sensitivity` / `.mm-badge--sensitivity-personal` | `--mm-sens-personal` | Default for Fact, Preference, Context |
| High | `.mm-badge--sensitivity-high` | `--mm-sens-high` | Positions, margin prefs, tracked markets |
| Restricted | `.mm-badge--sensitivity-restricted` | `--mm-sens-restricted` | All Wellness memories |

**Safety:** Wellness memories must **always** render the Restricted badge. No exceptions, no overrides.

---

### 2.3 MemorySourceChip — `.mm-source`

Displays the origin of a memory.

**Required props (backend):** `source` (enum), `sourceDetail` (string)

**Visual:** Icon (SVG, 12px) + label text. Never show raw URLs, addresses, or API paths.

| Source | Icon | Label example |
|--------|------|---------------|
| `on_chain` | External link | "Hyperliquid market data" |
| `chat` | Chat bubble | "Chat conversation" |
| `market_data` | Globe | "Polymarket market data" |
| `documentation` | Book | "Bittensor documentation" |
| `wellness_workflow` | Heart | "Wellness workflow" |
| `user_action` | Plus | "Manually added" |

---

### 2.4 MemoryConfidenceBar — `.mm-confidence`

Three-segment confidence indicator.

| Range | Segments filled | Color |
|-------|----------------|-------|
| High: ≥80% | 3/3 | `--mm-conf-high` (green) |
| Medium: 50–79% | 2/3 | `--mm-conf-medium` (amber) |
| Low: <50% | 1/3 | `--mm-conf-low` (red) |

**Required props (backend):** `confidence` (number 0–100)

---

### 2.5 MemoryActionRow — `.mm-card__actions`

Per-card action buttons.

| Action | Style | Behavior |
|--------|-------|----------|
| Use | `.mm-btn--primary` | Applies memory to current session context |
| Edit | `.mm-btn` (default) | Opens inline edit for title/notes |
| Export | `.mm-btn` (default) | Downloads single memory as JSON |
| Forget | `.mm-btn--ghost` (red text) | Opens forget confirmation |

**Safety:** The Forget button must always be visible on every card. Every memory must be forgettable.

---

### 2.6 MemoryContextChip — `.mm-chip` / `.mm-chip-bar`

Inline chips for the chat memory chip bar.

**Variants:**
- `.mm-chip--active` — memories currently in use (accent border)
- `.mm-chip--forget` — forget action chip (red)
- Default — neutral chip

**Required props (backend):** `memoryId`, `title`, `type`, `confidence`

---

### 2.7 MemoryPrivacyPanel — `.mm-privacy-panel`

Container for privacy controls on `/memory/privacy`.

**Sub-elements:**
- `.mm-privacy-row` — toggle + label + description per memory type
- `.mm-toggle` — iOS-style toggle (on/off)
- Forget All button — red, bottom of panel

**Required props (backend):** `memoryPreferences` (per-type toggles)

---

### 2.8 MemoryEmptyState — `.mm-empty`

Shown when a memory category has no items.

**Required elements:**
- Illustration or icon (brain or memory-related)
- Headline: "No [type] memories yet"
- Subtext: brief explanation of how memories are created
- CTA: primary action button

---

### 2.9 MemoryBlockedState — `.mm-secret-block`

Shown when a memory cannot be displayed (e.g., user has disabled memory, or session is unauthenticated).

**Required elements:**
- Lock icon
- Headline: "Memory hidden"
- Subtext: explains why (e.g., "Memory is disabled for this workspace")
- Action: "Enable Memory" or "Contact admin"

---

### 2.10 MemoryDisabledState — `.mm-disabled`

Shown when the memory feature is globally disabled.

**Required elements:**
- Alert icon
- Headline: "Memory is disabled"
- Subtext: "Your administrator has disabled memory for this workspace."
- No action needed — informational only.

---

## 3. Data Required from Backend

### 3.1 Memory Record Fields

Every memory stored in the backend must carry these fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | UUID | Yes | Stable identifier |
| `title` | string | Yes | Display title, max 200 chars |
| `type` | enum | Yes | `fact` \| `preference` \| `context` \| `protocol` \| `wellness` |
| `sensitivity` | enum | Yes | `personal` \| `high` \| `restricted` |
| `scope` | enum | Yes | `global` \| `workspace` \| `session` |
| `source` | enum | Yes | See Source enum above |
| `sourceDetail` | string | Yes | Human-readable source label |
| `confidence` | number | Yes | 0–100 |
| `whyText` | string | Yes | One-line explanation of why this was remembered |
| `whyTrigger` | enum | No | `explicit_user` \| `system_derived` \| `market_event` \| `on_chain_event` |
| `createdAt` | ISO8601 | Yes | |
| `updatedAt` | ISO8601 | Yes | |
| `forgottenAt` | ISO8601 | No | Set when forgotten — never deleted |
| `forgetScope` | enum | No | `single` \| `related` \| `all` |

**Invariant:** `type === 'wellness'` implies `sensitivity === 'restricted'`. The backend must enforce this.

### 3.2 Context Packet Fields

Sent to the app on every response to indicate which memories are active:

```typescript
interface ContextPacket {
  sessionId: string;
  memoryIds: string[];   // IDs of memories applied to this response
  appliedAt: string;    // ISO8601
  memoryCount: number;   // Total applied (for chip bar count)
}
```

### 3.3 Suggestion Fields

For "Use" action — backend returns:

| Field | Type | Notes |
|-------|------|-------|
| `memoryId` | UUID | Stable ID |
| `title` | string | Display title |
| `type` | enum | Memory type |
| `confidence` | number | 0–100 |
| `previewText` | string | Short excerpt for chip tooltip |

### 3.4 Export Manifest Fields

For single-memory and bulk export:

| Field | Type | Notes |
|-------|------|-------|
| `exportedAt` | ISO8601 | |
| `memoryCount` | number | |
| `memories[]` | array | id, title, type, sensitivity, scope, source, confidence, whyText, createdAt, updatedAt |
| `sha256` | string | SHA-256 of export payload (for integrity verification) |

**Excluded from export (always):** Wellness memories (unless explicitly local-only export with warning), raw signatures, signed payloads, seed phrases, private keys, API secrets, wallet addresses.

### 3.5 Error States

| Error | Backend HTTP code | UI State |
|-------|------------------|----------|
| Memory not found | 404 | Card replaced with "This memory was removed" inline message |
| Backend unreachable | 503 | Amber banner: "Memory unavailable — retrying…" + auto-retry |
| Memory disabled for workspace | 403 | `.mm-disabled` state on full memory view |
| Unauthorized | 401 | Redirect to auth |
| Export failed | 500 | Toast notification + retry button |

---

## 4. UX Rules

### 4.1 No Hidden Memory

- Every memory the app holds about the user must be visible in the Memory surface.
- There is no background, passive, or invisible memory that is not surfaced.
- If a memory is temporarily suppressed (Do Not Remember), it must still appear in the Privacy/Forget Center as a suppressed item, with a "Restore" option.
- The Privacy/Forget Center must show a complete list of all suppressed memories.

### 4.2 Every Memory Has Why/Source

- Every card must display `.mm-card__why` (why remembered) and `.mm-source` (source chip).
- Neither field may be blank or omitted.
- The "Why remembered?" text must be specific — not generic like "Remembered for context". It must explain the **trigger**: e.g., "You set a funding rate alert" or "You asked about compounding strategies."
- The source chip must always show an icon and label — never a raw URL or address.

### 4.3 Every Memory Has Forget

- Every card must display a Forget button in `.mm-card__actions`.
- The Forget button must be styled as `.mm-btn--ghost` with red text — it must not look like a primary action.
- Clicking Forget opens a confirmation dialog. Forget is not immediate.
- The confirmation dialog must state clearly: "This removes Matterhorn's memory of [title]. The underlying data is not affected."
- Forget confirmation must not be pre-filled or auto-submitted.

### 4.4 Every Memory Has Sensitivity

- Every card must display a sensitivity badge.
- The badge must always be correct — `restricted` for Wellness, `high` for positions/markets, `personal` for facts/preferences.
- The sensitivity badge is not decorative — it controls behavior (Wellness = local-only, no export).

### 4.5 Wellness Is Restricted / Local-First

The following rules apply to all Wellness memory surfaces:

1. **No network transmission:** Wellness data is never sent to any external server. The app must confirm this at the API level — Wellness endpoints must return 403 if called from a server-side context.
2. **No export (default):** Wellness memories are excluded from standard export. A separate "Export Wellness Data (Local Only)" option may be provided with an explicit warning.
3. **No receipts:** Wellness data never appears in Receipts/Evidence or any export manifest.
4. **No provenance (external):** Wellness memories do not appear in the Sources/Provenance table for external audit — they appear only in the internal local provenance log.
5. **Restricted badge always:** Every Wellness card shows `.mm-badge--sensitivity-restricted` — always.

### 4.6 Protocol Memories Never Imply Custody

- Protocol memories display user context — what the user has done, seen, or set.
- No protocol memory card may use language that implies Matterhorn holds, controls, or can modify the user's on-chain position.
- Forbidden language includes: "Matterhorn staked", "Matterhorn controls your wallet", "Your position is managed by Matterhorn", "Matterhorn will trade on your behalf".
- Allowed language: "You have a long position", "You set a margin ceiling of 10×", "Matterhorn reminded you of your funding rate alert".

---

## 5. Responsive Rules

### 5.1 Desktop Layout (≥1200px)

- Sidebar: 220px fixed width, full height
- Main content: remaining width, card grid 3-column
- Chip bar: horizontal, full width above card grid
- Protocol headers: icon + name + stats row
- Receipt cards: 3-column grid

### 5.2 Tablet Layout (768–1199px)

- Sidebar: 180px, collapsed labels (icons only)
- Main content: card grid 2-column
- Chip bar: horizontal with overflow scroll
- Protocol headers: icon + name only (stats collapse to second row)
- Receipt cards: 2-column grid

### 5.3 Mobile Single-Column Layout (<768px)

- Sidebar: replaced by bottom tab bar (5 tabs: Overview, Protocol, Wellness, Watchlists, Privacy)
- Main content: card grid 1-column, full width
- Chip bar: horizontal wrap with scroll
- Protocol headers: icon + name only
- Receipt cards: 1-column stack
- Privacy panel: full-page scroll, no multi-column

### 5.4 No Right Rail Trapping

- On all viewports, the rightmost interactive element must have at least 24px of padding from the edge.
- No panel may extend beyond the viewport without a scroll indicator.
- Bottom sheets on mobile must have a drag handle and dismiss zone (top 40px).

### 5.5 No Bottom Overflow

- Content areas must scroll independently — page must not cause full-page scroll on short viewports.
- Action buttons (Forget, Export) must always be reachable without scrolling within a card.
- Mobile bottom tab bar is fixed — content area must account for 56px bottom offset.

---

## 6. Stitch Alignment Notes

This section is a placeholder for final alignment with Stitch's new Home/Profile/Settings navigation design. Once Stitch returns the final design, this section will be updated with the exact integration points.

### 6.1 Memory in Navigation

**Proposed nav placement (subject to Stitch confirmation):**

- **Sidebar nav item:** "Memory" (brain icon) — visible in the app sidebar at all times
- **Nested items:** Overview · Bittensor · Hyperliquid · Polymarket · Wellness · Watchlists · Receipts · Sources
- **Settings sub-entry:** Privacy & Forget Center accessible from Settings > Privacy
- **Chat composer:** Memory chip bar appears above the composer input, below the model selector

**Stitch action needed:** Confirm nav hierarchy, icon treatment for Memory vs. other sidebar items, and whether Memory appears in the mobile bottom tab bar.

### 6.2 Memory in Home Flow

- When a user returns to the app after a session, the Memory Overview should show new memories added since last visit (highlighted with "New" badge).
- The chip bar in the composer should auto-populate with memories relevant to the current session context — the bar should be collapsible if empty.
- "Start a session" empty state CTA should point to the chat composer, not to a blank Memory Overview.

### 6.3 Memory in Profile/Settings Flow

- **Settings > Privacy:** Full Privacy/Forget Center — toggles, forget actions, export options
- **Settings > Memory:** (optional) Per-workspace memory enable/disable, retention period settings
- **Profile:** Memory count badge visible in profile header (e.g., "127 memories")

### 6.4 Chat Chip Integration

- Memory chips appear in the composer toolbar above the input field
- Chips are clickable — clicking a chip expands a popover with the full memory card
- "Remember this" chip appears as an inline button at the bottom of the composer's right-click/long-press context menu
- Active chip count ("Using 3 memories") appears in the session header below the model selector
- Chips do NOT appear in the chat message history — they are UI-only, not message content

### 6.5 Stitch Deliverable Checklist

Before production implementation begins, Stitch should confirm:

- [ ] Memory icon treatment in sidebar (vs. other nav items)
- [ ] Chip bar positioning in composer (above input? below model selector?)
- [ ] Mobile bottom tab bar entries and Memory's place in it
- [ ] Empty state illustrations for each memory type
- [ ] Confirmation dialog styling for Forget actions
- [ ] Color treatment for Restricted sensitivity badge in production theme
- [ ] Responsive behavior for Privacy/Forget Center on tablet
- [ ] Whether Memory Overview has a hero/header area or starts immediately with the chip bar

---

## Revision History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 0.1 | 2026-06-22 | Coder (minimax) | Initial draft — based on Memory UI prototype, awaiting Stitch final design |
