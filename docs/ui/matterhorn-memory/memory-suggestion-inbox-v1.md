# Memory Suggestion Inbox V1 — Production UX Specification

**Document status:** Production-ready
**Audience:** Engineering (React implementation), Codex (backend/pipeline), Stitch (design review)
**Based on:** `docs/ui/matterhorn-memory/production-handoff.md`, `docs/ui/matterhorn-memory/memory-producer-v1.md`, `docs/ui/matterhorn-memory/styles.css`
**Companion:** `docs/ui/matterhorn-memory/memory-producer-v1.md` (pipeline data contract)
**Version:** 1.0

---

## §1. Entry Point — Bell Icon

### 1.1 Location

App shell header, far right, between the search icon and the settings/profile menu.

```
[Logo]  [Chat]  [Memory]  [Search]  [🔔 3]  [Avatar]
```

### 1.2 Bell Icon

| File | Notes |
|------|-------|
| `bell-line.svg` | Empty / loading state |
| `bell-fill.svg` | Has unread suggestions |

Icon size: `24×24px`. Color: `--mm-text-secondary` in empty/loading state; `--mm-accent` when has unread.

### 1.3 Unread Count Badge

- **Position:** Top-right corner of bell icon, `8px` offset
- **Shape:** Pill, `18px` min-width, `12px` height, `--mm-red` background, white text
- **Max display:** `99+`. If count > 99, show `99+`.
- **Count source:** `suggestions.filter(s => !s.read).length`
- **Badge hides** when count === 0 (not `0` as a badge with a line through it)

### 1.4 Tooltip

Hover over bell icon shows tooltip (400ms delay before showing):

| State | Tooltip copy |
|-------|-------------|
| Empty | "No memory suggestions" |
| Has unread | "You have N memory suggestions" |
| All read | "All suggestions reviewed" |
| Panel open | "Memory suggestions" (no badge tooltip when panel is open) |

Implementation: `title` attribute or CSS `[data-tooltip]` — use `aria-label` for accessibility: `aria-label="Memory suggestions, 3 unread"`.

### 1.5 Badge Pulse Animation

When a new suggestion arrives while the panel is closed:
- CSS animation: `transform: scale(1) → scale(1.2) → scale(1)`, 2s duration, once only
- Non-intrusive: does not interrupt typing, does not steal focus
- Fires on WebSocket/SSE event, not on page load

### 1.6 Bell States Summary

| State | Icon | Badge | Tooltip | Badge pulse |
|-------|------|-------|---------|------------|
| No suggestions | bell-line | None | "No memory suggestions" | No |
| Has unread | bell-fill | Count (e.g. `3`) | "You have 3 memory suggestions" | On new arrival |
| All read | bell-line | None | "All suggestions reviewed" | No |
| Panel open | bell-fill | None | — | No |
| Loading | bell-line | Spinner overlay | "Loading…" | No |
| Error | bell-line | Amber `!` badge | "Couldn't load suggestions" | No |

---

## §2. Inbox Panel

### 2.1 Desktop (≥ 1200px)

- **Type:** Slide-over from right
- **Width:** `480px`, fixed
- **Position:** Fixed, right edge of viewport, full viewport height
- **Animation:** `transform: translateX(100%)` → `translateX(0)`, `250ms cubic-bezier(0.32, 0.72, 0, 1)`
- **Backdrop:** Content behind dims to `opacity: 0.35`, `pointer-events: none`
- **Close:** X button (top-right of panel header), click backdrop, Escape key
- **Overflow:** `overflow-y: auto` on the card list. Panel header and footer are position: sticky. Cards never overflow the panel horizontally.

### 2.2 Tablet (768px – 1199px)

- **Type:** Full-width slide-over
- **Width:** `100vw` minus `sidebar-width` (i.e., the content area only, sidebar stays visible)
- **Position:** Same fixed-right behavior, sidebar remains interactive
- **Animation:** Same 250ms as desktop
- **Overflow:** Same as desktop — sticky header/footer, scrollable card list

### 2.3 Mobile (< 768px)

- **Type:** Full-screen sheet from bottom
- **Animation:** Slide up from bottom. `translateY(100%)` → `translateY(0)`, `300ms ease-out`
- **Backdrop:** `rgba(0,0,0,0.6)` overlay on full screen, tap backdrop to close
- **Close:** Swipe down (dismiss gesture), X button in sticky header, Escape key
- **Overflow:** Panel scrolls vertically. Virtual keyboard pushes panel up (not off-screen).
  Use `position: fixed` on panel + `visualViewport` API to handle keyboard without content jump.
- **Header:** Sticky, contains: title ("Memory Suggestions"), count badge, close X button

### 2.4 Pending vs. Confirmed Memories

The inbox panel shows **pending suggestions only** — items that have not been confirmed, edited, or permanently dismissed.

Confirmed memories are NOT shown in the inbox. They appear in the **Memory Overview** panel as regular memory cards (`.mm-card`). The inbox has no "confirmed" tab or section.

Dismissed suggestions are NOT shown. They are permanently removed from the inbox for this trigger.

### 2.5 Panel Anatomy

```
┌─ Memory Suggestions ────────────────── 3 ─ [Mark all read] [×] ─┐
│  Filter: [All ▾]                                                │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ Suggestion Card ───────────────────────────────────────┐   │
│  │ ... (see §3)                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Suggestion Card ───────────────────────────────────────┐   │
│  │ ...                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  Showing 3 of 3                              [Load more]       │
└───────────────────────────────────────────────────────────────┘
```

- **Header (sticky):** Title + count + "Mark all read" (text link) + close X
- **Filter bar (sticky):** Dropdown — "All" / "Protocol" / "Preference" / "Context" / "Wellness". Filter is session-only (resets on panel close).
- **Card list (scrollable):** Single-column stack, no grid. Cards are full-width within the panel.
- **Footer (sticky):** Pagination — "Showing N of M · Load more". Max 20 visible; "Load more" appends next batch.

### 2.6 Accessibility

- Focus trap inside panel when open (Tab cycles within panel only)
- Focus returns to bell icon on close (`ref` on bell button, `focus()` on close)
- `role="dialog"`, `aria-label="Memory Suggestions"`, `aria-modal="true"`
- Escape closes panel
- All interactive elements keyboard-accessible

### 2.7 Exact State Copy — Empty, Error, and Mobile

#### Empty State (no suggestions in inbox)

```
┌─ Memory Suggestions ──────────────────── 0 ─ [×] ─┐
│                                                        │
│                                                        │
│              💡                                        │
│                                                        │
│          No memory suggestions yet                     │
│                                                        │
│    Matterhorn will suggest memories about your         │
│    preferences, protocols, and context as you work.    │
│                                                        │
│                                                        │
│    All suggestions reviewed. [View saved memories →]    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- Icon: `💡` (lightbulb), `--mm-text-tertiary`, `48×48px`
- Title: "No memory suggestions yet", `--text-base`, `--mm-text-primary`, semibold
- Body: Two lines, `--text-sm`, `--mm-text-secondary`, centered
- "View saved memories →" link: `--text-sm`, `--mm-accent` — only shown when no pending suggestions exist
- `data-testid="suggestions-empty-state"`

#### Error State (failed to load suggestions)

```
┌─ Memory Suggestions ────────────────────── [×] ─┐
│                                                    │
│                                                    │
│              ⚠                                     │
│                                                    │
│         Couldn't load suggestions                  │
│                                                    │
│    Something went wrong. Your suggestions are safe. │
│    Try again in a moment.                          │
│                                                    │
│                   [Try again]                       │
│                                                    │
└────────────────────────────────────────────────────┘
```

- Icon: `⚠` (warning triangle), `--mm-amber`, `40×40px`
- Title: "Couldn't load suggestions", `--text-base`, `--mm-text-primary`, semibold
- Body: Two lines, `--text-sm`, `--mm-text-secondary`, centered, `--mm-amber` tint on body bg
- "Try again" button: `mm-btn--default`, centered, `data-testid="suggestions-error-state__retry"`
- Panel shows error state, not the card list
- Bell icon shows amber `!` badge while error persists (see §1.6)
- `data-testid="suggestions-error-state"`

#### Loading State (skeleton cards)

```
┌─ Memory Suggestions ──────────────── Loading… [×] ─┐
│                                                      │
│  ┌─ Skeleton card ──────────────────────────────┐ │
│  │  [██████░░░░░░░░░░] [████] [████]              │ │
│  │  [███████████████████████░░░░░░░░]            │ │
│  │  [███████████████░░░░░░░]                      │ │
│  │  [████████████░░░░░░░░░░]                      │ │
│  │  [Confirm]    [Edit]    [Dismiss]              │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Skeleton card ──────────────────────────────┐ │
│  │  ... (same structure)                         │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

- 3 skeleton cards shown while `GET /api/memory/suggestions` is in-flight
- Skeleton bars use `--mm-bg-elevated` and `--mm-bg-overlay-1` alternating
- Animation: shimmer (CSS gradient sweep, 1.5s, infinite)
- `data-testid="suggestion-skeleton--0"`, `"suggestion-skeleton--1"`, `"suggestion-skeleton--2"`

#### Mobile-Specific Copy Variations

Mobile uses the same content as desktop with these adaptations:

| Element | Desktop | Mobile |
|---------|---------|--------|
| Panel title | "Memory Suggestions" | "Memory Suggestions" (same) |
| Header subtitle | Count badge `3` | Count badge `3`, subtitle "3 suggestions" |
| Empty state icon | `💡 48px` | `💡 40px` |
| Empty state body | 2 lines, centered | 2 lines, left-aligned, 16px padding |
| Error state | Full centered layout | Full centered layout |
| Close button | `×` in header | `×` in header + swipe-down gesture |
| Filter dropdown | "All ▾" | "All ▾" (same, full-width on tap) |
| "Mark all read" | Text link in header | Same, always visible |
| "View saved memories →" | Text link below card list | Full-width text button, bottom of panel |

**Swipe-down to dismiss (mobile only):**
- Trigger: finger moves >80px downward from panel top
- Visual: panel slides down, backdrop fades to `rgba(0,0,0,0.3)` during swipe
- Threshold: if swipe distance >120px → panel closes automatically
- If swipe distance <120px → panel springs back to open position
- `data-testid="memory-suggestions-panel--swipe-dismiss"`

**Virtual keyboard handling (mobile):**
- When keyboard opens, panel height shrinks to `100vh - keyboardHeight`
- Uses `visualViewport` API: `visualViewport.addEventListener('resize', ...)`
- No content reflow during keyboard open/close — panel resizes smoothly
- Edit form fields scroll into view automatically on focus (native behavior)

---

## §3. Suggestion Card

### 3.1 Anatomy — Full Component

```
┌─ Suggestion Card ───────────────────────────────────────┐
│  [Confidence bar ████░ 82%]  [Wellness]  [Personal]     │
│                                                           │
│  You prefer short morning yoga sessions                   │
│  Duration: 20 min · Style: Vinyasa · Time: 6:30 AM      │
│                                                           │
│  ┌─ Why suggested ────────────────────────────────────┐ │
│  │ You completed 4 morning yoga sessions in the         │ │
│  │ past 2 weeks. Matterhorn inferred a preference.      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  Source: Wellness workflow · 2 hr ago                    │
│                                                           │
│  ┌─ Will be saved as ─────────────────────────────────┐ │
│  │ Type: Wellness  ·  Sensitivity: Personal            │ │
│  │ Scope: Session  ·  Title: (as shown above)          │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  [Confirm ✓]        [Edit]        [Dismiss ✕]           │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Metadata Row

**Confidence bar:**
- 3-segment bar. Each segment = one-third of the bar width.
- Filled = high (≥ 80%): all 3 segments `--mm-conf-high` (`#22C55E`)
- Amber = medium (50–79%): 2 segments `--mm-conf-medium` (`#F59E0B`), 1 segment `--mm-conf-low-dim`
- Red = low (< 50%): 1 segment `--mm-conf-low` (`#EF4444`), 2 segments `--mm-conf-low-dim`
- Numeric label: right-aligned, e.g. `82%`
- `aria-label="Confidence: 82%, high"`

**Kind badge (type):** "Protocol" / "Preference" / "Context" / "Wellness"
- Style: pill, `--mm-type-*` color, matching dim background

**Scope badge:** "Workspace" / "Session" / "Global"
- Style: small text, `--mm-scope-*` color

**Sensitivity badge:** "Personal" / "High" / "Restricted"
- Style: same as memory cards, `--mm-sens-*` color system

### 3.3 Content

**Title:**
- Max 2 lines, ellipsis after 2
- Font: `--font-sans`, `--text-base`, semibold
- Example: "You prefer short morning yoga sessions", "3× BTC-PERP leverage ceiling"

**Body / proposed memory value:**
- Max 3 lines, ellipsis after 3
- Font: `--font-sans`, `--text-sm`, `--mm-text-secondary`
- Example: "Duration: 20 min · Style: Vinyasa · Time: 6:30 AM"
- May be empty if title is self-explanatory

**"Why suggested" block:**
- Left border: 4px solid `--mm-accent`
- Label: `--mm-text-secondary`, `--text-xs`, uppercase — "Why suggested"
- Body: `--mm-text-primary`, `--text-sm`
- This is the single most important UX element. It must always be present and must always be specific — not generic text like "Context detected."
- Example: "You completed 4 morning yoga sessions in the past 2 weeks. Matterhorn inferred a preference."
- Example: "You set your Hyperliquid leverage to 3× BTC-PERP in Settings 3 times this month."
- Example: "You asked about Bittensor subnet 1 validators in 2 separate chat sessions."

**Source chip:**
- Non-interactive display
- Icon (per `source.type`) + source name + relative timestamp
- `source.type` icons: chat (💬), protocol (⚙), workflow (♥), on-chain (🔗), settings (⚡)
- Example: "⚙ Hyperliquid Settings · 2 hr ago"
- Timestamp format: relative ("2 hr ago", "3 days ago", "just now")

### 3.4 Preview of What Will Be Saved

A collapsed `"Will be saved as"` block below the source chip. Collapsed by default (click to expand).

```
┌─ Will be saved as ──────────────────────────────────────┐
│ ▶ Show preview                                          │
│   Type: Wellness  ·  Sensitivity: Personal               │
│   Scope: Session  ·  Title: (as shown above)             │
└──────────────────────────────────────────────────────────┘
```

- Shows the full set of fields that will be written if the user confirms
- Collapsed state: single line, "▶ Show preview"
- Expanded state: type + sensitivity + scope + title
- Scope: defaults to "Session" for new suggestions
- This gives the user full transparency before they click Confirm

### 3.5 Action Buttons

**Confirm** (`mm-btn--primary`):
- Label: "Confirm ✓"
- Action: Saves suggestion as permanent memory. Writes to memory store. Shows toast "Confirmed ✓" (3s, top-right). Card animates out (fade + slide up, 200ms).
- `data-testid="suggestion-card__confirm"`

**Edit** (`mm-btn--default`):
- Label: "Edit"
- Action: Expands card in-place to show edit form (see §4). Card height expands. Other cards remain in place.
- `data-testid="suggestion-card__edit"`

**Dismiss** (`mm-btn--ghost`, danger on hover):
- Label: "Dismiss ✕"
- Action: Dismisses suggestion. Shows toast "Dismissed" (2s). Card animates out. Permanently gone for this trigger.
- `data-testid="suggestion-card__dismiss"`

### 3.6 Card States

| State | Trigger | Visual |
|-------|---------|--------|
| Default | Normal display | Standard styling |
| Hover | Mouse over card | `translateY(-1px)`, border shifts to `--mm-accent`, `--shadow-sm` |
| Confirming | Confirm clicked, awaiting response | Button shows spinner, card is non-interactive |
| Editing | Edit clicked | Card expands, edit form visible, Confirm/Edit buttons replaced by "Save changes" / "Cancel" |
| Dismissing | Dismiss clicked | Card fades + slides up, non-interactive |

---

## §4. Edit Flow

### 4.1 Trigger

Click "Edit" on any suggestion card.

### 4.2 UI — Inline Expansion

Card expands in-place. Does NOT open a separate panel. Does NOT close the inbox.

**Edit form fields (in order):**

```
┌─ Editing suggestion ─────────────────────────── [Cancel] ─┐
│                                                           │
│  Title *                                                 │
│  [You prefer short morning yoga sessions___________]     │
│  24 / 80                                                │
│                                                           │
│  Type                                                    │
│  [Wellness ▾]                                           │
│                                                           │
│  Sensitivity                                             │
│  [Personal ▾]                                           │
│                                                           │
│  Why suggested                                           │
│  You completed 4 morning yoga sessions... (read-only)    │
│  [Editable explanation of why this was suggested___]    │
│                                                           │
│  ┌─ Validation error ──────────────────────────────┐    │
│  │ Memory cannot contain sensitive credentials.        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  [Save changes ✓]                                         │
└───────────────────────────────────────────────────────────┘
```

### 4.3 Field Specifications

| Field | Type | Max | Required | Notes |
|-------|------|-----|----------|-------|
| Title | textarea | 80 chars | Yes | Live character count below field |
| Type | select/dropdown | — | Yes | Protocol / Preference / Context / Wellness |
| Sensitivity | select/dropdown | — | Yes | Personal / High / Restricted |
| Why suggested body | textarea | 300 chars | No | Label "Why suggested:" is read-only; body is editable |

### 4.4 Validation

**On blur (per field):**
- Title empty → red border + "Title is required"
- Title contains forbidden content → red border + "Memory cannot contain sensitive credentials"

**On Save:**
- Re-validate all fields
- If Wellness type selected: confirmation dialog: "Wellness memories are stored locally only. Continue?"
- If forbidden content detected anywhere: block save, show error inline
- If valid: save + show toast "Saved ✓", card collapses back to read mode

**Forbidden content detection:**
On blur and on save, scan `title` and `whySuggestedBody` for:
- Seed phrase patterns (12 or 24 word sequences, space-separated)
- Private key patterns (`0x` + 64 hex chars, or `0x` + 40 hex chars)
- API secret patterns (long alphanumeric strings with typical secret names)
- Medical diagnosis patterns (see §7)

### 4.5 Cancel Behavior

Click "Cancel" → card collapses back to read mode. No network request. No toast. State discarded.

### 4.6 No Hidden Save — Non-Negotiable Rules

1. No field is saved on blur (blur validates, it does not save)
2. No network request fires until "Save changes" or "Confirm" is clicked
3. If the user navigates away (closes inbox, navigates to another page) during an active edit, the draft is discarded silently. No recovery in V1.
4. Closing the browser during an active edit discards the draft silently. No recovery in V1.

---

## §5. Dismiss / Block Flow

### 5.1 Dismiss Flow

**Trigger:** Click "Dismiss ✕" on any suggestion card.

**Immediate UI:**
- Card animates out: `opacity: 0` + `transform: translateY(-8px)`, 200ms, then removed from DOM
- Toast: "Dismissed" (2s, top-right, `--mm-text-secondary` text)
- Panel count decrements

**Data effect:**
- `dismissedAt: ISO8601` written to the suggestion object server-side
- This suggestion does not reappear for **30 days** for the same trigger
- The 30-day duration is enforced by the Producer pipeline

### 5.2 "Do Not Suggest Again" (Optional, UX-Optional in V1)

If the user dismisses the same suggestion type **3+ times** within 30 days, surface a prompt:

```
Stop suggesting this?
────────────────────
You've dismissed "Hyperliquid leverage ceiling" 3 times.
Stop suggesting it for the next 30 days?

[Stop suggesting]    [Keep suggesting]    [Cancel]
```

- "Stop suggesting": blocks the trigger for 30 days, equivalent to 3 manual dismisses
- "Keep suggesting": no change, dismiss as normal
- "Cancel": returns to inbox without dismissing

This is a UX enhancement. The V1 gate test does NOT assert this element. Engineering may implement or defer.

### 5.3 Blocked State — Forbidden Secrets

If the Producer pipeline surfaces a suggestion that contains forbidden content (e.g., a malformed memory containing a private key fragment):

**Blocked card UI:**
```
┌─ Suggestion blocked ─────────────────────────────────────┐
│                                                           │
│  🔒 This suggestion cannot be shown                      │
│                                                           │
│  It may contain sensitive data.                           │
│                                                           │
│  [Dismiss blocked suggestion]                             │
└───────────────────────────────────────────────────────────┘
```

- Amber left border (`--mm-amber`)
- Lock icon (`🔒`)
- Title: "This suggestion cannot be shown"
- Body: "It may contain sensitive data."
- One action: "Dismiss blocked suggestion" (dismisses it without revealing content)
- No Confirm. No Edit. No source chip. No "why suggested." Nothing that could expose the forbidden content.
- The blocked card is counted in the unread badge.

### 5.4 Blocked State — Wellness Clinical Content

If the Producer surfaces a Wellness suggestion containing clinical language (medical diagnosis, prescription, treatment advice — see §7):

**Same blocked card UI** as §5.3, with body text: "This suggestion contains content that is not allowed in wellness memories."

- Same: no Confirm, no Edit, no source exposure
- The producer pipeline must also reject this suggestion at the source — blocking at display is a defense-in-depth measure

---

## §6. Saved Memories — Inbox to Memory Panel

### 6.1 After Confirmation

When the user clicks "Confirm" or "Save changes":

1. Frontend sends `POST /api/memory/suggestions/:id/resolve` with `{ action: "confirm" }` (or `{ action: "edit", patch: { title, type, sensitivity, whySuggestedBody } }` for edited saves)
2. Backend writes to the memory store as a standard memory object
3. Backend marks the suggestion entry status as `confirmed`, sets `resolvedAt: ISO8601`, and stores `recordId`
4. Frontend receives `{ success: true, saved: true, record: MatterhornMemoryRecord }` — shows toast "Confirmed ✓" (3s, top-right)
5. Card animates out (`opacity: 0` + `transform: translateY(-8px)`, 200ms, then removed from DOM)
6. Bell badge count decrements; inbox count decrements

### 6.2 Link to Memory Panel

In the inbox panel header, a persistent link:

```
┌─ Memory Suggestions ────────────── 0 ─ [Mark all read] [×] ─┐
│  All suggestions reviewed. [View saved memories →]              │
└───────────────────────────────────────────────────────────────┘
```

- "View saved memories →" navigates to Memory Overview (the `mm-panel` or `/memory` route)
- This link appears only when the inbox count is 0
- `data-testid="inbox__view-saved-memories"`

### 6.3 Confirmed Memory — What Gets Saved

| Field | Value |
|-------|-------|
| `id` | New UUID (not the suggestion ID) |
| `title` | Edited title or original suggestion title |
| `type` | Edited type or original suggestion type |
| `sensitivity` | Edited sensitivity or original |
| `scope` | "Session" for all V1 suggestions |
| `whyRemembered` | Edited "why suggested" body, or original |
| `source` | Original `source` from suggestion |
| `producerSuggestionId` | Reference to the original suggestion |
| `confirmedAt` | ISO8601 |
| `memoryStore` | The appropriate store (protocol/wellness/context) |

### 6.4 Forget / Export on Confirmed Memories

Confirmed memories appear as standard memory cards in the Memory Overview. All standard actions apply:

- **Use**: Inserts memory context into the chat composer
- **Edit**: Opens the Memory Detail Panel (`.mm-panel--detail`)
- **Export**: Standard memory JSON export
- **Forget**: Opens confirmation dialog → removes from memory store. **Does not** affect the Producer pipeline (same suggestion may reappear).

---

## §7. Wellness-Specific Behavior

### 7.1 Wellness Suggestions Off by Default

**Default state:** Wellness suggestions are disabled.

The "Allow wellness memory suggestions" toggle lives in **Privacy & Forget Center → Wellness tab**.

**Toggle label:** "Allow wellness memory suggestions"
**Toggle default:** Off (unchecked)
**Toggle description:** "When enabled, Matterhorn may suggest memories about your wellness activity. Wellness data is stored locally on your device only."

### 7.2 Wellness Suggestions Panel State

If Wellness suggestions exist in the inbox **and** the toggle is off:

```
┌─ Memory Suggestions ────────────────── 2 ─ [Mark all read] [×] ─┐
│                                                                  │
│  🔒 Wellness suggestions are paused                               │
│  ──────────────────────────────────────────                      │
│  You have 2 wellness memory suggestions, but                     │
│  wellness suggestions are currently disabled.                     │
│                                                                  │
│  Enable them in Privacy & Forget Center → Wellness tab          │
│  → "Allow wellness memory suggestions."                          │
│                                                                  │
│  [Open Privacy & Forget Center]        [Dismiss]                 │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  (Protocol and Preference suggestions below, if any)            │
└──────────────────────────────────────────────────────────────────┘
```

- This state appears **above** the card list, inside the panel
- The 2 Wellness suggestions are not shown (they are gated by the toggle)
- "Open Privacy & Forget Center" navigates to the Privacy panel
- "Dismiss" closes the panel

**If Wellness suggestions exist AND the toggle is ON:** No special state. Wellness cards appear in the card list with normal styling.

**If zero Wellness suggestions exist:** The special state never appears (no empty Wellness state in the panel).

### 7.3 Wellness Card Restrictions

- **Sensitivity must be `Personal` or `Restricted`** — never `High`
- **Title/body/whySuggested must not contain:**
  - Medical diagnoses ("diabetes", "hypertension", "clinical depression", etc.)
  - Prescription references (drug names, dosage instructions)
  - Treatment recommendations ("try this medication", "see a specialist")
  - Cure claims ("cures insomnia", "treats anxiety")
- The Producer pipeline enforces these restrictions server-side. The inbox frontend enforces them on save (see §4.4).
- If a Wellness suggestion's `whySuggested` contains clinical language, the card is shown in the **blocked state** (§5.4) rather than displayed normally.

### 7.4 Wellness Memory — Local-Only Language

All Wellness cards (confirmed memories or suggestions) must display a local-only notice:

```
┌─ Suggestion card ─────────────────────────────────────────────┐
│ ...                                                          │
│ 🔒 Stored locally only. Never sent to external servers.        │
└──────────────────────────────────────────────────────────────┘
```

- Small text, `--mm-text-tertiary`, icon + text, below the source chip
- Non-interactive

### 7.5 Wellness Export Exclusion

Wellness memories are **excluded from all standard exports**. The Export button on a Wellness memory card shows:

"Export is not available for wellness memories. Wellness data is stored locally only."

---

## §8. Protocol-Specific Behavior

### 8.1 Bittensor — Public Address Behavior

**Memory model:** All Bittensor memories are derived from **public on-chain data** via Subtensor. Matterhorn reads validator state, stake amounts, and subnet stats from public Subtensor endpoints. It never accesses Bittensor wallet private keys, hot keys, or signing capabilities.

**What can be suggested:**
- Validator preference ("You consistently run validators on subnet 1")
- Stake ceiling ("You've set a 1000 TAO stake ceiling for subnet 3")
- Delegation history ("You've delegated to validator 5CfTC…3bX9 twice this month")
- Subnet selection criteria ("You prefer validators with >1000 Uids on subnet 1")

**Bittensor suggestion card UX — public address display:**

```
┌─ Suggestion Card ─────────────────────────────────────────┐
│  [████░ 85%]  [Protocol]  [Personal]                       │
│                                                            │
│  Your delegation ceiling: 2000 TAO on subnet 1            │
│                                                            │
│  ┌─ Why suggested ─────────────────────────────────────┐ │
│  │ You've delegated 1500 TAO to validator 5CfTC…3bX9      │ │
│  │ on subnet 1 in 2 separate transactions.                │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Source: ⚡ Bittensor · 5 days ago                         │
│                                                            │
│  🔗 Read-only — public Subtensor data only                 │
│                                                            │
│  [Confirm ✓]        [Edit]        [Dismiss ✕]             │
└────────────────────────────────────────────────────────────┘
```

- Public wallet addresses are **always truncated** to first 6 + last 4 chars: `5CfTC…3bX9`
- Full addresses are never displayed in any card, tooltip, source chip, or edit form
- The `🔗 Read-only — public Subtensor data only` notice appears on all Bittensor suggestion cards
- Font: `--text-xs`, `--mm-text-tertiary`, non-interactive
- `aria-label="Read-only — public Subtensor data only"`

**Safety rules:**
- Suggestions must only reference **public wallet addresses** — never private keys or seed phrases
- Public address display: truncated, e.g. `5CfTC…3bX9` — never full address
- No suggestion may describe Bittensor as "holding" or "managing" a stake
- Correct framing: "Your validator preference: subnet 1, 1000 TAO"
- Incorrect framing: "Matterhorn controls your Bittensor stake" ← forbidden

**Forbidden patterns in Bittensor suggestions:**
- Any mention of private keys, seed phrases, or wallet exports
- Any implication that Matterhorn can sign or submit on-chain transactions
- Any financial guarantee about validator returns

### 8.2 Hyperliquid — Preview-Only Behavior

**Memory model:** All Hyperliquid memories are **preview-only**. Matterhorn reads public on-chain position data and user-submitted account settings via the Hyperliquid Info API (read-only). It never places, modifies, or closes orders.

**What can be suggested:**
- Leverage ceiling ("Your BTC-PERP leverage ceiling: 3×")
- Margin mode preference ("You prefer cross-margin on BTC-PERP")
- Funding rate alert settings ("You've set alerts for BTC-PERP funding rate > 0.01%")
- Position memory ("You've held a BTC-PERP position for 5 days this month")

**Hyperliquid suggestion card — preview notice:**

```
┌─ Suggestion Card ─────────────────────────────────────────┐
│  [████░ 78%]  [Protocol]  [Personal]                       │
│                                                            │
│  Your BTC-PERP leverage ceiling: 3×                       │
│                                                            │
│  ┌─ Why suggested ─────────────────────────────────────┐ │
│  │ You set your Hyperliquid BTC-PERP leverage to 3× in    │ │
│  │ Settings 3 times this month.                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Source: ⚙ Hyperliquid Settings · 1 week ago              │
│                                                            │
│  📖 Preview only — read-only account data                 │
│                                                            │
│  [Confirm ✓]        [Edit]        [Dismiss ✕]             │
└────────────────────────────────────────────────────────────┘
```

- The `📖 Preview only — read-only account data` notice appears on all Hyperliquid suggestion cards
- Font: `--text-xs`, `--mm-text-tertiary`, non-interactive

**Safety rules:**
- Position memory: stores the fact that the user has a position — not the position value in a way that implies live execution capability
- Correct framing: "Your BTC-PERP leverage ceiling: 3×"
- Suggestions must never expose Hyperliquid API credentials, secret keys, or wallet private keys
- No implication that Matterhorn can place, modify, or close orders

**Forbidden patterns in Hyperliquid suggestions:**
- API secret, API key, secret key, wallet private key, raw signature
- "submit order", "place trade", "close position on your behalf"
- Margin ratio expressed as a financial guarantee

### 8.3 Polymarket — Market Preview-Only Behavior

**Memory model:** All Polymarket memories are **preview-only**. Matterhorn reads market data from public Polymarket REST API sources and stores facts about markets the user has viewed or tracked. Matterhorn never places bets, connects to the Polymarket CLOB, or accesses user credentials.

**What can be suggested:**
- Markets the user viewed or asked about in chat ("You've looked at BTC >$100k by EOY 2025 3 times")
- Prediction question preferences ("You prefer markets with >$100k volume")
- Resolution criteria notes ("You want to track your BTC-PERP prediction markets separately from Polymarket")
- Market sentiment annotations ("You flagged BTC >$100k by EOY as high confidence")

**What cannot be suggested:**
- Market positions, outstanding bets, or order state
- CLOB credentials or API tokens
- Signed payloads or submission metadata
- "Tracked" means the user browsed the market in Matterhorn — a read-only browsing action

**Correct framing examples:**
- "You've tracked 3 Polymarket BTC prediction markets this week" ✓
- "Your preferred resolution criteria: binary, cash-settled" ✓
- "Your Polymarket prediction question: BTC above $100k by end of year" ✓

**Incorrect framing (never in UI):**
- "You have $500 on BTC Polymarket markets" ✗
- "Your Polymarket portfolio" ✗
- "Place a bet on BTC Polymarket" ✗
- "Your Polymarket CLOB key" ✗

**Market Preview card UX — Polymarket suggestion card:**

```
┌─ Suggestion Card ─────────────────────────────────────────┐
│  [████░ 71%]  [Protocol]  [Personal]                       │
│                                                            │
│  You've viewed 3 BTC Polymarket prediction markets          │
│  this week                                                │
│                                                            │
│  ┌─ Why suggested ─────────────────────────────────────┐ │
│  │ You asked about "BTC > $100k by EOY" in Chat on        │ │
│  │ Tuesday. Viewed market details 2 times.               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Source: ⚙ Chat · 2 days ago                              │
│                                                            │
│  📖 Preview only — this tracks what you've viewed,        │
│    not your positions or bets                             │
│                                                            │
│  [Confirm ✓]        [Edit]        [Dismiss ✕]             │
└────────────────────────────────────────────────────────────┘
```

- The `📖 Preview only` notice appears on all Polymarket suggestion cards, directly below the source chip
- Font: `--text-xs`, `--mm-text-tertiary`, non-interactive
- `aria-label="Preview only — this tracks what you've viewed, not your positions or bets"`

**Forbidden patterns in Polymarket suggestions:**
- API secret, CLOB credentials, signed payload
- "Place bet on your behalf", "submit market on your behalf"
- Any guarantee about market outcomes
- "Portfolio", "position", "order" (in the sense of active trades)

### 8.4 Source Chip Icons — Protocol Reference

| Protocol | Source type icon | Color | Notice chip |
|---------|-----------------|-------|-------------|
| Bittensor | `⚡` (bolt) | `--mm-type-protocol` | `🔗 Read-only — public Subtensor data only` |
| Hyperliquid | `⚙` (gear) | `--mm-type-protocol` | `📖 Preview only — read-only account data` |
| Polymarket | `🔮` (crystal ball) | `--mm-type-protocol` | `📖 Preview only — this tracks what you've viewed, not your positions or bets` |
| Wellness | `♥` (heart) | `--mm-type-wellness` | `🔒 Stored locally only. Never sent to external servers.` |

Source chip format: `[icon] Source name · Relative time`
Example: `⚡ Bittensor · 5 days ago`
Example: `🔮 BTC Polymarket · 2 days ago`

Notice chips appear directly below the source chip, before the action buttons, on all protocol and Wellness cards.

---

## §9. Visual System

### 9.1 Design Token Reference

The Suggestion Inbox uses the existing `--mm-*` token system from `styles.css`. No new token namespaces are introduced in V1.

**Tokens used per component:**

| Component | Tokens |
|-----------|--------|
| Panel background | `--mm-bg-overlay-2` |
| Panel border | `--mm-border` |
| Card background | `--mm-bg-surface` |
| Card border | `--mm-border` |
| Card hover border | `--mm-accent` |
| Card shadow (hover) | `--shadow-sm` |
| Typography | `--font-sans` / `--font-mono` |
| Primary button | `--mm-accent` bg, `--mm-bg-base` text |
| Default button | `--mm-bg-elevated` bg, `--mm-text-primary` text |
| Ghost button | transparent bg, `--mm-text-secondary` text |
| Danger (on hover) | `--mm-red` text |
| Why suggested border | `--mm-accent` |
| Confidence high | `--mm-conf-high` |
| Confidence medium | `--mm-conf-medium` |
| Confidence low | `--mm-conf-low` |
| Sensitivity Personal | `--mm-sens-personal` |
| Sensitivity High | `--mm-sens-high` |
| Sensitivity Restricted | `--mm-sens-restricted` |
| Type Protocol | `--mm-type-protocol` |
| Type Preference | `--mm-type-preference` |
| Type Context | `--mm-type-context` |
| Type Wellness | `--mm-type-wellness` |
| Wellness local-only notice | `--mm-text-tertiary` |
| Error/warning | `--mm-amber` |
| Blocked state | `--mm-amber` left border |
| Toast | `--mm-bg-elevated` bg, `--shadow-md` |

### 9.2 Dark and Light Mode

All tokens have `[data-theme="light"]` overrides in `styles.css`. The Suggestion Inbox inherits all overrides automatically — no component-specific light mode code is needed.

**Light mode surface contrast:**
- Panel: `--mm-bg-surface` (`#FFFFFF`) on `--mm-bg-base` (`#F5F5F5`)
- Card: `--mm-bg-surface` (`#FFFFFF`) on panel `--mm-bg-overlay-2` (`#D5D5D5`)
- Text: `--mm-text-primary` (`#111111`) on `--mm-bg-surface` (`#FFFFFF`)

**Light mode accent:** `--mm-accent` (`#2563EB`) — blue, not `#D1F2FF`, to maintain contrast on white.

### 9.3 Responsive Layout Summary

| Breakpoint | Panel width | Panel position | Header | Cards |
|-----------|------------|----------------|--------|-------|
| ≥ 1200px | 480px | Fixed right, overlays | Sticky | Single column, full-width |
| 768–1199px | 100vw minus sidebar | Fixed right | Sticky | Single column, full-width |
| < 768px | 100vw × 100vh | Fixed, full-screen sheet from bottom | Sticky | Single column, compact padding (12px) |

### 9.4 Typography Scale

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Panel header title | `--text-lg` (17px) | Semibold | `--mm-text-primary` |
| Card title | `--text-base` (15px) | Semibold | `--mm-text-primary` |
| Card body | `--text-sm` (13px) | Normal | `--mm-text-secondary` |
| Why suggested label | `--text-xs` (11px) | Semibold | `--mm-text-secondary` |
| Why suggested body | `--text-sm` (13px) | Normal | `--mm-text-primary` |
| Source chip | `--text-xs` (11px) | Normal | `--mm-text-secondary` |
| Button text | `--text-sm` (13px) | Semibold | Per button style |
| Toast | `--text-sm` (13px) | Normal | `--mm-text-primary` |

---

## §10. Implementation Checklist

### 10.1 Components to Build

| Component | File | Responsibility |
|-----------|------|---------------|
| `MemorySuggestionsBell` | `memory-suggestions-bell.tsx` | Bell icon, badge, pulse animation, tooltip |
| `MemorySuggestionsPanel` | `memory-suggestions-panel.tsx` | Slide-over/full-screen shell, header, footer, filter, focus trap |
| `SuggestionCard` | `suggestion-card.tsx` | Card display, confidence bar, badges, source chip, actions |
| `SuggestionCardEdit` | `suggestion-card-edit.tsx` | Inline edit form, validation, save/cancel |
| `SuggestionPreviewBlock` | `suggestion-preview-block.tsx` | Collapsible "Will be saved as" block |
| `WellnessPausedBanner` | `wellness-paused-banner.tsx` | Paused state inside panel |
| `BlockedSuggestionCard` | `blocked-suggestion-card.tsx` | Blocked state with dismiss |
| `ConfirmationToast` | `confirmation-toast.tsx` | "Confirmed ✓", "Dismissed" toasts |
| `WellnessLocalNotice` | `wellness-local-notice.tsx` | "Stored locally only" chip |
| `PrivacyForgetPanel` | (existing) | Privacy toggle for wellness suggestions |

### 10.2 Required Props

```typescript
// MemorySuggestionsBell
interface MemorySuggestionsBellProps {
  unreadCount: number;       // suggestions.filter(s => !s.read).length
  isOpen: boolean;           // panel open state
  onToggle: () => void;      // toggle panel
  hasError: boolean;         // show amber ! badge
  isLoading: boolean;        // show spinner
}

// MemorySuggestionsPanel
interface MemorySuggestionsPanelProps {
  suggestions: Suggestion[]; // pending suggestions only
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
  onEdit: (id: string, fields: EditFields) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  privacyToggleState: { wellnessSuggestions: boolean };
}

// SuggestionCard
interface SuggestionCardProps {
  suggestion: Suggestion;
  isEditing: boolean;
  editFields: Partial<EditFields>;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  onEditSave: (fields: EditFields) => void;
  onEditCancel: () => void;
  onValidationError: (field: string, message: string) => void;
  // data-testid attributes
  testId?: string;
}

interface EditFields {
  title: string;
  type: "protocol" | "preference" | "context" | "wellness";
  sensitivity: "personal" | "high" | "restricted";
  whySuggestedBody: string;
}
```

### 10.3 Events and API Calls

All routes are prefixed with `/api/memory/suggestions`. The inbox operates on `MatterhornMemorySuggestionInboxEntry` objects (not raw `Suggestion` objects) — see §10.3.1–§10.3.6 for exact mappings.

#### 10.3.1 `GET /api/memory/suggestions`

**When:** Panel opens, panel refresh, filter change.

**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | `pending \| confirmed \| edited \| dismissed \| blocked` | `pending` (UI default) | Omit to get all statuses |
| `desk` | `bittensor \| hyperliquid \| polymarket \| wellness` | all | Filter by memory desk |
| `includeResolved` | `true` | `false` | `include_resolved` also accepted |
| `limit` | integer | 20 | Max entries per page |

**Response `200`:**
```json
{
  "success": true,
  "entries": [
    {
      "version": "matterhorn.memory.suggestion-inbox.v1",
      "id": "uuid",
      "suggestion": { /* MatterhornMemorySuggestion */ },
      "status": "pending",
      "createdAt": "2025-06-24T00:00:00.000Z",
      "updatedAt": "2025-06-24T00:00:00.000Z",
      "resolvedAt": null,
      "lastAction": null,
      "reason": null,
      "recordId": null,
      "markdownPath": null,
      "dismissedUntil": null,
      "policyWarnings": []
    }
  ],
  "count": 1
}
```

**UX mapping:**
- `entries` is rendered as suggestion cards
- `status === "pending"` → show card with Confirm/Edit/Dismiss actions
- `status === "blocked"` → show `BlockedSuggestionCard` (§5.3)
- `status === "confirmed" | "edited" | "dismissed"` → card already gone from pending list
- `policyWarnings` → if non-empty and Wellness type, show amber warning badge on card

#### 10.3.2 `POST /api/memory/suggestions/:id/resolve`

**When:** User clicks Confirm, Edit → Save, or Dismiss on any suggestion card.

**Path params:** `id` — the inbox entry ID (not the suggestion ID).

**Request body:**
```json
{
  "action": "confirm | edit | dismiss",
  "patch": {
    "title": "string",
    "type": "bittensor | hyperliquid | polymarket | wellness | context",
    "sensitivity": "personal | high | restricted",
    "whySuggestedBody": "string"
  },
  "reason": "optional string"
}
```

- `action` is required. If omitted, server falls back to `entry.suggestion.userAction`.
- `patch` is required for `confirm` and `edit`; ignored for `dismiss`.
- Wellness saves: `sensitivity` must be `personal` or `restricted` (server enforces).

**Response `200`:**
```json
{
  "success": true,
  "suggestion": { /* MatterhornMemorySuggestion — resolved copy */ },
  "saved": true | false,
  "dismissed": true | false,
  "reason": "string",
  "record": { /* MatterhornMemoryRecord — only if saved === true */ },
  "markdownPath": "/path/to/memory.md",
  "policyWarnings": []
}
```

**UX mapping per `action`:**

| Action | `saved` | `dismissed` | UI outcome |
|--------|---------|-------------|-----------|
| `confirm` | `true` | `false` | Toast "Confirmed ✓", card animates out |
| `edit` | `true` | `false` | Toast "Saved ✓", card animates out |
| `dismiss` | `false` | `true` | Toast "Dismissed", card animates out |

**Error `400`:** If `action === "confirm"` or `"edit"` and the patched record contains forbidden content (seed phrase, private key, medical diagnosis, etc.):
```json
{
  "success": false,
  "error": "memory_record_forbidden",
  "message": "Memory cannot contain sensitive credentials or clinical wellness content."
}
```
Frontend shows inline validation error on the card — does not crash or show a generic toast.

**Error `400` (wellness sensitivity violation):**
```json
{
  "success": false,
  "error": "memory_wellness_sensitivity_violation",
  "message": "Wellness memories cannot have High sensitivity."
}
```

**Error `404`:** Entry not found → show error state in panel.

#### 10.3.3 `GET /api/memory/suggestions/:id`

**When:** Deep link to a specific suggestion, or re-fetch before edit.

**Response `200`:**
```json
{
  "success": true,
  "entry": { /* MatterhornMemorySuggestionInboxEntry */ }
}
```

**Error `404`:** Suggestion not found.

#### 10.3.4 `POST /api/memory/suggestions` — (Pipeline Only, Not UI-Initiated)

This route triggers the Producer pipeline. It is called by the internal agent system, not by the UI. Frontend never calls this route directly.

#### 10.3.5 `GET /api/memory/entities` / `:id` — Confirmed Memories

After a suggestion is confirmed, the resulting memory is accessible via the standard memory entities API:

- `GET /api/memory/entities?desk=<desk>` — list confirmed memories by desk
- `GET /api/memory/entities/:id` — get single confirmed memory
- `PATCH /api/memory/entities/:id` — edit confirmed memory (forget, re-tag)
- `DELETE /api/memory/entities/:id` — forget confirmed memory

**The UI links to these via "View saved memories →" (see §6.2).**

#### 10.3.6 Real-Time Updates

**Polling (V1):** On panel open, poll `GET /api/memory/suggestions?status=pending` every 30 seconds. If `count` changes, animate bell badge.

**WebSocket / SSE (Future):** The backend supports `WS /api/memory/suggestions/stream`. Engineering may wire this in V2. V1 ships with polling only.

### 10.4 Test IDs for Codex Implementation

| Element | `data-testid` |
|---------|---------------|
| Bell icon button | `memory-suggestions-bell` |
| Unread badge | `memory-suggestions-bell__badge` |
| Panel | `memory-suggestions-panel` |
| Panel header | `memory-suggestions-panel__header` |
| Panel close button | `memory-suggestions-panel__close` |
| Filter dropdown | `memory-suggestions-panel__filter` |
| Mark all read link | `memory-suggestions-panel__mark-all-read` |
| Suggestion card (by index) | `suggestion-card--0`, `suggestion-card--1`, … |
| Suggestion card title | `suggestion-card--0__title` |
| Confidence bar | `suggestion-card--0__confidence` |
| Confidence bar segments | `suggestion-card--0__confidence-bar` |
| Type badge | `suggestion-card--0__type-badge` |
| Sensitivity badge | `suggestion-card--0__sensitivity-badge` |
| Source chip | `suggestion-card--0__source` |
| Why suggested block | `suggestion-card--0__why-suggested` |
| Preview block toggle | `suggestion-card--0__preview-toggle` |
| Preview block content | `suggestion-card--0__preview` |
| Confirm button | `suggestion-card--0__confirm` |
| Edit button | `suggestion-card--0__edit` |
| Dismiss button | `suggestion-card--0__dismiss` |
| Edit title input | `suggestion-card--0__edit-title` |
| Edit type dropdown | `suggestion-card--0__edit-type` |
| Edit sensitivity dropdown | `suggestion-card--0__edit-sensitivity` |
| Edit why body textarea | `suggestion-card--0__edit-why` |
| Edit save button | `suggestion-card--0__edit-save` |
| Edit cancel button | `suggestion-card--0__edit-cancel` |
| Wellness paused banner | `wellness-paused-banner` |
| Wellness paused open-settings link | `wellness-paused-banner__open-settings` |
| Blocked card | `blocked-suggestion-card--0` |
| Blocked dismiss button | `blocked-suggestion-card--0__dismiss` |
| Empty state | `suggestions-empty-state` |
| Error state | `suggestions-error-state` |
| Error retry button | `suggestions-error-state__retry` |
| Loading skeleton card | `suggestion-skeleton--0` |
| Load more button | `suggestions-panel__load-more` |
| View saved memories link | `inbox__view-saved-memories` |

### 10.5 Acceptance Criteria Checklist

Before marking V1 complete, verify:

- [ ] Bell icon visible in app header on Memory and Chat routes
- [ ] Badge shows correct unread count
- [ ] Badge hides when count === 0
- [ ] Badge pulses once on new suggestion arrival
- [ ] Tooltip shows correct copy per state
- [ ] Panel slides in from right (desktop) / bottom (mobile)
- [ ] Panel has no horizontal overflow
- [ ] Focus traps inside panel when open
- [ ] Escape closes panel, focus returns to bell
- [ ] Cards display all required elements (confidence, badges, source, why suggested)
- [ ] "Why suggested" is always present and specific — never generic
- [ ] "Will be saved as" preview is collapsible
- [ ] Confirm saves and shows toast
- [ ] Edit expands card in-place, does not open new panel
- [ ] Edit validates on blur, blocks forbidden content
- [ ] Edit "Save changes" saves with Wellness confirmation if needed
- [ ] Cancel discards edit without saving
- [ ] Dismiss removes card permanently, shows toast
- [ ] Blocked cards show no suggestion content
- [ ] Wellness suggestions gated by "Allow wellness memory suggestions" toggle
- [ ] Wellness local-only notice on all Wellness cards
- [ ] Wellness export shows "not available" message
- [ ] Protocol suggestions show no secrets, keys, or custody claims
- [ ] Dark and light mode both work correctly
- [ ] Mobile: virtual keyboard does not push panel off-screen
- [ ] All `data-testid` attributes present as specified

---

## §11. Relationship to Existing Memory System

### 11.1 Data Flow

```
Producer Pipeline
  → suggestion created
  → WebSocket / SSE event sent to frontend
  → Bell badge count increments
  → User opens panel
  → GET /memory/suggestions?status=pending
  → Cards rendered

User action:
  Confirm → POST /confirm → Memory store → card animates out
  Edit → PATCH + POST /confirm → Memory store → card animates out
  Dismiss → POST /dismiss → card animates out

Confirmed memory:
  → Appears in Memory Overview as regular .mm-card
  → Full set of Memory Overview actions (Use, Edit, Export, Forget)
```

### 11.2 Privacy Settings Integration

| Setting | Location | Effect |
|---------|----------|--------|
| "Allow memory suggestions" | Privacy & Forget Center | Toggles the Producer pipeline output for this user. When off: bell shows no badge. |
| "Allow wellness memory suggestions" | Privacy & Forget Center → Wellness | When off: Wellness suggestions never surface in inbox, even if Producer generates them. |

### 11.3 Forget vs. Dismiss

| Action | Location | Effect |
|--------|----------|--------|
| **Dismiss** | Inbox suggestion card | Removes from inbox; suggestion may reappear in 30 days for same trigger |
| **Forget** | Memory Overview card | Removes from memory store; does NOT affect Producer pipeline |

These are independent. A user can dismiss a suggestion, see it reappear in 30 days, confirm it, and then forget the resulting memory. Forget does not re-dismiss the trigger.
