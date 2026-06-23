# Memory Producer V1 — UX Specification

**Audience:** Engineering, Stitch (design), Codex (backend/pipeline)
**Status:** Draft — ready for review and Stitch design pass
**Based on:** `docs/ui/matterhorn-memory/` prototype, `production-handoff.md`
**Version:** 1.0

---

## 1. Overview

The **Memory Producer** is the pipeline that generates memory suggestions — candidate memories that Matterhorn surfaces to the user for review before they become permanent. V1 focuses on the **Suggestion Inbox**: the surface where users see, confirm, edit, or dismiss suggestions.

The core UX principle: **no hidden saves.** Memory Producer suggestions are surfaced, not silently written. The user always has a chance to confirm, correct, or reject before anything is stored.

---

## 2. Suggestion Inbox Entry Point

### 2.1 Bell Icon (Primary Entry)

**Location:** App header, far right, adjacent to the user avatar / profile menu.
**Icon:** Bell (`bell.svg` / `bell-line.svg`).
**Badge:** Unread count badge — appears only when unread suggestions exist. Max display is `99+`.

```
[Avatar] [Search] [🔔 3] [⚙]
```

**Badge behavior:**
- Badge count reflects `suggestions.filter(s => !s.read).length`
- Badge pulses once when new suggestion arrives (CSS animation, 2s duration, non-intrusive)
- Badge disappears when inbox is empty (`count === 0`)

**States:**

| State | Icon | Badge | Meaning |
|-------|------|-------|---------|
| Empty | Outline bell | None | No pending suggestions |
| Has unread | Filled bell | Count (e.g. `3`) | N unread suggestions |
| Open | Filled bell | None (count clears on open) | Inbox is visible |
| Loading | Outline bell | Subtle spinner overlay | Fetching suggestions |

---

### 2.2 Slide-Over Inbox Panel

**Trigger:** Click bell icon.
**Animation:** Slides in from the right. `transform: translateX(100%)` → `translateX(0)`. 250ms, `cubic-bezier(0.32, 0.72, 0, 1)`.
**Width:** 480px (desktop), full-width (mobile < 768px).
**Close:** Click X button, click outside panel, press Escape.

**Panel layout:**

```
┌─ Memory Suggestions ─────────────────────── [×] ─┐
│  3 suggestions                          [Mark all read] │
│  Filter: [All ▾] [Protocol▾] [Wellness▾]            │
├────────────────────────────────────────────────────┤
│  ┌─ Suggestion Card ─────────────────────────────┐ │
│  │ [Confidence bar ████░ 82%]  [High]  [Protocol] │ │
│  │                                              │ │
│  │ Preference: 3× BTC-PERP leverage ceiling     │ │
│  │                                              │ │
│  │ Why suggested: You set this in Hyperliquid   │ │
│  │ Settings 3 times in the past 30 days.       │ │
│  │                                              │ │
│  │ Source: Hyperliquid Settings · 2 hr ago    │ │
│  │                                              │ │
│  │              [Confirm]  [Edit]  [Dismiss]   │ │
│  └──────────────────────────────────────────────┘ │
│  ┌─ Suggestion Card ─────────────────────────────┐ │
│  │ ...                                           │ │
│  └──────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────┤
│  Showing 3 of 3 · [Load more]                     │
└────────────────────────────────────────────────────┘
```

**Header row:**
- Title: "Memory Suggestions"
- Count: "3 suggestions" (updates live as user confirms/dismisses)
- "Mark all read" — text link, marks all as read without acting on them

**Filter bar:**
- Scope filter: All / Protocol / Wellness / Context / Preference (dropdown)
- Filter persists during session, resets on panel close

**Footer:**
- Pagination: "Showing N of M · Load more"
- Max visible: 20 at a time. "Load more" fetches next batch.
- When empty: empty state (see §6)

---

## 3. Suggestion Card

### 3.1 Anatomy

Each suggestion card contains:

```
┌─ Suggestion Card ─────────────────────────────┐
│ [Confidence bar ████░ 82%]  [Sensitivity]  [Type badge] │
│                                                        │
│ Title (2-line max, ellipsis)                           │
│                                                        │
│ Body / description (3-line max, ellipsis)             │
│                                                        │
│ ┌─ Why suggested ─────────────────────────────────┐  │
│ │ Left-border accent. Label + body text.           │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ Source chip: [icon] Source name · Relative time       │
│                                                        │
│           [Confirm ✓]  [Edit ✎]  [Dismiss ✕]         │
└────────────────────────────────────────────────────────┘
```

**Metadata row (top):**
- **Confidence bar:** 3-segment bar. Filled = high (≥ 80%, green), amber-filled = medium (50–79%), red-filled = low (< 50%). Numeric label: "82%". Screen-reader: "Confidence: 82%, high."
- **Sensitivity badge:** Personal / High / Restricted — same badge system as memory cards.
- **Type badge:** Protocol / Preference / Context / Wellness — same badge system as memory cards.

**Content:**
- **Title:** Extracted or generated label for the suggestion. Max 2 lines, ellipsis. E.g. "3× BTC-PERP leverage ceiling", "Keep my Bittensor stake in subnet 1".
- **Body:** Short description. Max 3 lines, ellipsis. May be empty if title is self-explanatory.
- **Why suggested:** Explanation of why the Producer surfaced this. Left-border accent (4px, `--mm-accent`). Label: "Why suggested:" + body text. E.g. "You set this in Hyperliquid Settings 3 times in the past 30 days." This is the most important UX element — it justifies the suggestion.
- **Source chip:** Icon (memory type icon) + source name + relative timestamp. Non-interactive display only.

**Action buttons (bottom):**
- **Confirm** — Primary button. Saves the suggestion as a permanent memory. Writes to the memory store. Closes card with a brief "Confirmed ✓" toast. Card animates out (fade + slide, 200ms).
- **Edit** — Default button. Opens inline edit mode (see §4). Card expands to show editable fields.
- **Dismiss** — Ghost/danger button (text only, subtle red on hover). Dismisses the suggestion. Closes card with a brief "Dismissed" toast. Card animates out. **Dismissal is permanent** for this suggestion — it will not reappear for the same trigger.

### 3.2 Suggestion Types

| Type | Label | Badge color | Description |
|------|-------|-------------|-------------|
| Protocol | Protocol | `--mm-type-protocol` | Derived from protocol settings or on-chain behavior patterns |
| Preference | Preference | `--mm-type-preference` | Inferred from repeated user choices or explicit settings |
| Context | Context | `--mm-type-context` | Extracted from chat, session, or workflow context |
| Wellness | Wellness | `--mm-type-wellness` | Derived from wellness workflow interactions |

### 3.3 Sensitivity Levels

| Level | Label | Badge color | Auto-suggest behavior |
|-------|-------|-------------|----------------------|
| Personal | Personal | `--mm-sens-personal` | Suggested freely; always opt-in |
| High | High | `--mm-sens-high` | Suggested; explicit Confirm required |
| Restricted | Restricted | `--mm-sens-restricted` | Never auto-suggested; only shown if user explicitly requests wellness memory |

**Restricted rule (non-negotiable):** Wellness memories tagged Restricted are **never** suggested without explicit user request. The Wellness section of the Privacy/Forget Center must have a toggle: "Allow wellness memory suggestions." Default: off.

---

## 4. Inline Edit Mode

### 4.1 Trigger

Click "Edit" on any suggestion card. Card expands in place — does not open a new panel.

### 4.2 Editable Fields

When in edit mode, the card shows:

```
┌─ Editing suggestion ──────────────────────── [Cancel] ─┐
│  Title:  [___________________________] (textarea, 2 rows) │
│                                                         │
│  Type:   [Protocol ▾]                                   │
│                                                         │
│  Sensitivity: [Personal ▾]                             │
│                                                         │
│  Why suggested:                                         │
│  [_____________________________________________________│
│  ______________________________________________________│
│  ] (textarea, non-editable label, editable body)         │
│                                                         │
│  [Save changes ✓]                                       │
└─────────────────────────────────────────────────────────┘
```

- **Title:** Editable textarea. Max 2 rows. Live character count.
- **Type:** Dropdown — Protocol / Preference / Context / Wellness.
- **Sensitivity:** Dropdown — Personal / High / Restricted.
- **Why suggested:** The "Why suggested" label is non-editable. The body text is editable.
- **Save changes:** Primary button. Saves the edited suggestion as a permanent memory.
- **Cancel:** Text link. Collapses back to read mode without saving.

### 4.3 Validation

- Title must not be empty.
- Title must not contain seed phrases, private keys, API secrets, raw signatures, or signed payloads. Inline validation on blur. If forbidden content detected: red border + error message "Memory cannot contain sensitive credentials."
- Wellness type: if changing type to Wellness, a confirmation dialog appears: "Wellness memories are stored locally only. Continue?"

### 4.4 No Hidden Save

**The most critical UX rule in V1:**

- **No changes are saved automatically.** User must explicitly click "Save changes" or "Confirm."
- **No changes persist if the user navigates away** without saving. The edit state is session-only.
- **No network request fires until** the user clicks "Save changes" or "Confirm."
- If the user closes the browser during an active edit (without saving), the draft is discarded silently. No recovery mechanism in V1.

---

## 5. Layouts

### 5.1 Desktop (≥ 1200px)

- Inbox panel: 480px wide, slides in over content (does not push layout)
- Behind panel: content is dimmed (`opacity: 0.3`, pointer-events: none) to indicate panel is topmost
- Suggestion cards: full-width within panel, stacked vertically
- Card grid not used — single-column card list within the panel

### 5.2 Tablet (768px – 1199px)

- Inbox panel: full-width, slides in from right edge
- Panel height: 100vh (full viewport height)
- Suggestion cards: single column, full-width
- Filter bar: wraps to second line if needed

### 5.3 Mobile (< 768px)

- Inbox panel: full-screen overlay
- Header: sticky, contains title + count + close button
- Suggestion cards: single column, full-width, reduced padding (12px horizontal)
- Action buttons: horizontal row, compact sizing (smaller text, tighter spacing)
- Edit mode: same as desktop but fields stack vertically
- Keyboard handling: virtual keyboard opens on textarea focus, panel height adjusts

---

## 6. States

### 6.1 Empty State

**Trigger:** `suggestions.length === 0`
```
┌─ Memory Suggestions ─────────────────────── [×] ─┐
│                                                  │
│              🔔                                  │
│         No suggestions yet                       │
│                                                  │
│   Matterhorn will suggest memories when it       │
│   finds patterns in your activity — like         │
│   repeated settings, wallet preferences,         │
│   or wellness goals.                             │
│                                                  │
│   Suggestions appear here for you to              │
│   review before they're saved.                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 6.2 Loading State

- Skeleton cards: 3 cards, animated pulse
- Header shows spinner icon next to "Loading…"
- Filter bar disabled until load completes

### 6.3 Error State

- Amber banner at top of panel: "Couldn't load suggestions. Try again."
- "Retry" button reloads suggestions
- No partial content shown on error

### 6.4 Wellness Suggestions Privacy State

**Trigger:** User has Wellness suggestions but the "Allow wellness memory suggestions" toggle in Privacy Settings is off.

```
🔒 Wellness suggestions are paused
─────────────────────────────
Wellness memory suggestions are currently disabled.
Enable them in Privacy & Forget Center → Wellness tab
→ "Allow wellness memory suggestions."

[Open Privacy settings]      [Dismiss]
```

- This state is only shown if Wellness suggestions exist AND the toggle is off. If there are zero Wellness suggestions, this state never appears.

---

## 7. Producer Pipeline (Data Contract)

Engineering teams: this section defines what the frontend receives from the Producer pipeline.

### 7.1 Suggestion Object

```typescript
interface Suggestion {
  id: string;                    // UUID — unique per suggestion
  type: "protocol" | "preference" | "context" | "wellness";
  sensitivity: "personal" | "high" | "restricted";

  title: string;                // Max 80 chars
  body?: string;                // Optional, max 200 chars

  confidence: number;            // 0–100
  confidenceLabel: "high" | "medium" | "low";  // derived from confidence

  whySuggested: string;         // Max 300 chars
  source: {
    type: "chat" | "protocol" | "workflow" | "on-chain" | "settings";
    name: string;               // E.g. "Hyperliquid Settings", "Bittensor subnet 1"
    timestamp: string;          // ISO 8601
  };

  read: boolean;                // False = unread
  dismissedAt?: string;         // ISO 8601 if dismissed
  confirmedAt?: string;         // ISO 8601 if confirmed + saved as memory

  actions: {
    canConfirm: boolean;        // Always true in V1
    canEdit: boolean;           // Always true in V1
    canDismiss: boolean;        // Always true in V1
  };
}
```

### 7.2 Confidence Calculation (Reference)

| Confidence | Label | Visual | Condition |
|-----------|-------|--------|-----------|
| ≥ 80 | High | 3/3 segments green | Repeated ≥ 3 times OR high-weight source |
| 50–79 | Medium | 2/3 segments amber | Repeated 2 times OR medium-weight source |
| < 50 | Low | 1/3 segments red | Single occurrence OR low-confidence source |

### 7.3 Source Weights (Reference for Producers)

| Source | Weight | Notes |
|--------|--------|-------|
| On-chain (verified) | 90 | High-confidence; user action is verifiable |
| Settings (explicit) | 80 | Explicit choice; high confidence |
| Protocol activity | 70 | Behavioral pattern; medium-high |
| Chat (explicit mention) | 60 | User stated intent; medium |
| Chat (inferred) | 40 | Inferred; low-medium |
| Workflow step | 50 | Depends on workflow type |

---

## 8. Safety Rules

These rules are enforced in the frontend and must also be enforced in the Producer pipeline.

### 8.1 Forbidden in All Suggestion Fields

The following must never appear in `title`, `body`, or `whySuggested`:

- Seed phrases or recovery phrases (any string resembling 12/24 word phrases)
- Private keys or raw private key values
- API secrets, API keys, or bearer tokens
- Raw signatures or signed payloads
- Medical diagnoses, prescriptions, treatment recommendations
- Financial guarantees ("guaranteed profit", "risk-free return")
- Custody or "sign transaction on your behalf" claims

**Frontend enforcement:** On Confirm or Save, the client validates all fields. If forbidden content is detected, the action is blocked, the field is highlighted red, and an inline error is shown: "This memory contains sensitive or forbidden content and cannot be saved."

### 8.2 Wellness Boundary

- Suggestions tagged `type: "wellness"` must be Personal or Restricted sensitivity.
- Wellness suggestions must never include: diagnoses, prescriptions, medical conditions, identifiable health data beyond goal progress.
- The "Why suggested" field for wellness suggestions must not imply medical expertise or outcomes.

### 8.3 No Passive Auto-Save

- The Producer generates suggestions. The user confirms, edits, or dismisses.
- Suggestions are never written to the memory store without a user action.
- The Producer pipeline itself must not write to the memory store. It only generates suggestions.

### 8.4 Receipt Independence

Confirmed memories appear in the Memory Overview. They do not appear in the Receipts screen (Receipts are for on-chain evidence only).

---

## 9. Stitch Prompts

See `docs/ui/matterhorn-memory/stitch-prompts.md` — Sprint 6: Memory Producer V1 (sections 18–22).

---

## 10. Integration with Existing Memory UI

### 10.1 Where Producer Suggestions Appear

- **Inbox panel** (new): Primary surface for suggestion management.
- **Memory Overview**: Confirmed memories appear here as regular memory cards, indistinguishable from non-suggested memories (no "suggested" badge post-confirmation).
- **Chat Memory Chips**: Confirmed memories are available as context chips in the chat composer. Suggestions are NOT available as context chips until confirmed.

### 10.2 Relationship to Privacy Settings

- Toggle: "Allow memory suggestions" (default: on)
- Toggle: "Allow wellness memory suggestions" (default: off)
- If "Allow memory suggestions" is off, no Producer suggestions appear in the inbox. The bell icon shows no badge.
- The inbox panel header shows the count of unread suggestions that respect the current privacy toggle state.

### 10.3 Relationship to Memory Overview

- "Forget" on a confirmed memory in Memory Overview does not affect the Producer's suggestion logic. The Producer may generate the same suggestion again.
- "Dismiss" in the inbox prevents the same suggestion from reappearing for the same trigger (e.g., same settings change pattern). Duration: 30 days.
