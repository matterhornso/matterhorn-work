# Matterhorn Memory UI — Stitch Prompts

Stitch prompts for implementing the Matterhorn Memory UI system. Each prompt maps to one screen or component.

---

## Sprint 1: Core Memory Infrastructure

### 1. Bootstrap Memory Design System

Use `docs/ui/matterhorn-memory/styles.css` as the single source of truth for all CSS. Add to your design token system:

1. Import all `--mm-*` tokens into your component library's theme.
2. Implement `[data-theme="light"]` to override all tokens for light mode.
3. Confirm all 5 type badges (`--type`, `--type-preference`, `--type-context`, `--type-protocol`, `--type-wellness`) render correctly in both themes.
4. Confirm all 3 sensitivity badges (`--sensitivity`, `--sensitivity-high`, `--sensitivity-restricted`) render correctly in both themes.
5. Confirm the 3-segment confidence bar uses the correct color per threshold (≥ 80% = green, 50–79% = amber, < 50% = red).
6. Confirm `--font-mono` is JetBrains Mono and `--font-sans` is Aeonik or system fallback.
7. Implement `::-webkit-scrollbar`, `::selection`, and `:focus-visible` with design token values.

**Verification:** `docs/ui/matterhorn-memory/index.html` — view Screen 1 in dark and light mode. All tokens must match.

---

### 2. Memory Overview Page

Implement the Memory Overview page as shown in `docs/ui/matterhorn-memory/index.html` Screen 01.

**App Shell:**
- Left sidebar: 220px wide, collapsible on mobile
- Nav items: Overview, Bittensor, Hyperliquid, Polymarket, Wellness, Watchlists, Receipts, Sources (with item counts)
- Privacy & Forget Center link at sidebar footer
- Main header: title "Memory Overview", item count badge, search input, "+ New Memory" button
- Content area: scrollable card grid

**Memory Card (reusable across all memory screens):**
- Title: max 2 lines, ellipsis
- Scope badge: "Workspace" (blue tint) / "Session" (amber tint) / "Global" (no tint)
- Type badge: Fact / Preference / Context / Protocol / Wellness — use correct color per design token
- Sensitivity badge: Personal / High / Restricted
- Source chip: icon + source name, hover shows full source + timestamp
- Confidence bar: 3 segments, filled = high, amber-filled = medium, red-filled = low
- "Why remembered?" callout: left-border accent, label + body text
- Timestamp: clock icon + relative time ("Updated 2 hours ago")
- Action buttons: Use (primary), Edit (default), Export (default), Forget (ghost/danger)
- On hover: subtle elevation (`translateY(-1px)`, border color shifts to accent, shadow)

**Chat Chip Bar (inline on overview and chat context):**
- Label: "Using N memories"
- Active chips: filled accent style
- Action chips: "Remember this" (default), "Do not remember" (danger), "Forget related" (danger with trash icon)

**Safety:** No memory card may display seed phrases, private keys, API secrets, raw signatures, wallet exports, or medical diagnoses. If such data appears in a memory field, show `[REDACTED]` and a "Restricted content" badge.

---

### 3. Memory Detail Panel

Implement the slide-over detail panel triggered by clicking "Edit" on any memory card.

**Trigger:** Click "Edit" on a memory card → panel slides in from right (250ms ease).
**Width:** 480px (full-width on mobile).
**Close:** X button or click outside.

**Sections:**
1. Title (editable textarea)
2. Type badge (dropdown)
3. Sensitivity badge (dropdown with explanation)
4. Scope (Global / Workspace / Session)
5. Source (read-only, with provenance link)
6. Confidence (read-only bar)
7. "Why remembered?" (editable textarea)
8. Last updated (read-only)
9. Raw memory JSON (collapsible, developer view)
10. Footer actions: Save, Cancel, Export, Forget

**Safety:** The "Why remembered?" field must not accept seed phrases, private keys, or API secrets. Validate on save and show an inline error if forbidden content is detected.

---

## Sprint 2: Protocol Memory Screens

### 4. Bittensor Protocol Memory Screen

Implement Screen 02: Bittensor memories.

**Protocol header:**
- Icon: TAO symbol (⊗) in pink tint (`#F472B6`)
- Protocol name: "Bittensor"
- Description: "Validator behavior, stake preferences, subnet performance"
- Stats row: Memories count / Validators count / Average confidence

**Cards:** Same reusable memory card as Overview, filtered to Bittensor source.

**Empty state:** "No Bittensor memories yet. Your validator preferences and subnet activity will appear here as you explore."

**Safety:** Bittensor memories must NOT show private keys, seed phrases, wallet exports, or API credentials. Bittensor is a non-custodial read/preview surface only.

---

### 5. Hyperliquid Protocol Memory Screen

Implement Screen 03: Hyperliquid memories.

**Protocol header:**
- Icon: "H" in blue tint (`#60A5FA`)
- Protocol name: "Hyperliquid"
- Description: "Perpetual positions, margin behavior, funding rate patterns"
- Stats row: Memories count / Active positions / Average confidence

**Cards:** Same reusable memory card. Note: position memories (entry price, size) are High sensitivity. Funding rate preference memories are Personal sensitivity.

**Safety:** Position memories must NOT show API keys, secret keys, or order submission credentials. All Hyperliquid previews are read-only; no memory should describe a live execution capability.

---

### 6. Polymarket Protocol Memory Screen

Implement Screen 04: Polymarket memories.

**Protocol header:**
- Icon: "P" in purple tint (`#C084FC`)
- Protocol name: "Polymarket"
- Description: "Tracked markets, prediction questions, market resolution criteria"
- Stats row: Memories count / Markets tracked / Average confidence

**Cards:** Same reusable memory card. Market question memories display the full question text as title.

**Safety:** Polymarket memories must NOT imply that Matterhorn can place bets, connect to Polymarket on the user's behalf, or store CLOB credentials. The fact that a market was "tracked" is a read-only browsing action.

---

### 7. Wellness Memory Screen

Implement Screen 05: Wellness memories.

**Protocol header:**
- Icon: heart (♥) in pink tint (`#F472B6`)
- Protocol name: "Wellness"
- Description: "Goals, streaks, health preferences — private, never shared"
- Privacy notice banner: "Wellness memories are stored locally on your device. No wellness data is sent to external servers."
- Stats row: Memories count / Current streak

**Sensitivity:** ALL wellness memories are Restricted by default. The Restricted badge must always be visible.

**Safety — NON-NEGOTIABLE:**
- Wellness memories must NOT store medical diagnoses, prescription information, or identifiable health data beyond goal progress.
- All wellness data must be explicitly labeled "stored locally only" with no cloud sync implied.
- Do not use the word "diagnosis" or imply medical advice capability.
- The wellness privacy notice must appear at the top of the Wellness screen at all times.

---

## Sprint 3: Features and Privacy

### 8. Watchlists

Implement Screen 06: Watchlists.

**Watchlist item row:**
- Market/symbol name (mono font)
- Venue (e.g. "Hyperliquid · Base Sepolia")
- Reason for tracking (one line)
- Type badge (Protocol / Preference / Context)
- Edit action (ghost button)

**Actions:** "+ New Watchlist" button → modal with market selector, alert threshold fields.

**Empty state:** "No watched markets yet. Browse a market and use 'Track this market' to add it to your watchlist."

---

### 9. Receipts and Evidence

Implement Screen 07: Receipts and Evidence.

**Receipt card:**
- Verified badge (green) for completed transactions / Pending badge (amber) for previews that were never submitted
- Market and action (e.g. "BTC-PERP · BUY 0.1 · $64,250")
- Order ID (mono, truncated with copy button)
- Venue and chain
- Timestamp
- SHA-256 fingerprint (mono, full hash, copy button)
- Actions: View, Download, Export

**Safety:** Receipts must clearly state "Matterhorn never signed" for preview-state entries. The SHA-256 is a read-only fingerprint of what was generated, not a signed artifact. Do not imply that Matterhorn holds or controls any signing keys.

---

### 10. Sources and Provenance

Implement Screen 08: Sources and Provenance.

**Attribution table:**
- Columns: Memory title | Type badge | Source (icon + name + timestamp) | Confidence
- 4–5 sample rows covering each source type
- Sortable by memory, type, source, confidence

**Source legend:**
- On-chain (link icon)
- Chat conversation (chat icon)
- Documentation (book icon)
- Market data (globe icon)
- Wellness workflow (heart icon)

**Safety:** Each source must be accurate. Do not attribute a memory to on-chain data if it was manually entered by the user.

---

### 11. Privacy / Forget Center

Implement Screen 09: Privacy / Forget Center.

**Privacy notice banner (always visible):** "All memories are stored locally. Nothing is sent to external servers unless you explicitly share it."

**Toggle rows:**
- Memory enabled
- Remember Wellness data
- Remember workspace activity
- Remember chat preferences
- Cross-session memory

**Forget section:**
- Forget all protocol memories (button: danger style)
- Forget all wellness memories (button: danger style)
- Forget everything (button: danger + red background)
- Export all before forgetting (button: default — offer JSON download)

**Safety — NON-NEGOTIABLE:**
- The "Forget Everything" button must require a confirmation step (e.g. "Are you sure? This cannot be undone." + explicit confirm).
- Before any forget action, offer an export option.
- Do not forget receipts — receipts are evidence and should be preserved independently of memory preferences.

---

## Sprint 4: Chat Integration and Polish

### 12. Chat Memory Chips

Implement Screen 10: Chat Memory Chips in the context of the chat composer.

**Chip bar (inline above or below the chat composer):**
- "Using N memories" label when memories are active
- Active memory chips: accent-filled style, show memory title
- Count badge (×N) when multiple memories of the same type are in use
- "Remember this" chip: ghost style, user-triggered
- "Do not remember" chip: danger style
- "Forget related memories" chip: danger + trash icon

**Chip interactions:**
- Click active chip → inserts memory context into composer
- Click "Remember this" → saves current chat context as a new memory
- Click "Do not remember" → suppresses memory application for this turn
- Click "Forget related" → removes related memories with confirmation

**Safety:** "Remember this" must save only the user's explicit intent, not the full chat transcript. Do not save seed phrases, private keys, API secrets, or signed payloads from the chat.

---

### 13. Mobile Memory Screen

Implement Screen 11: Mobile Memory layout (390px wide).

**Layout:** Full-width, no sidebar. Top header with title + item count + search. Scrollable card list below.

**Mobile adaptations:**
- Cards: single column, reduced padding (10px), smaller type scale
- Action buttons: horizontal row below card body, Use/Edit/Forget (compact)
- Privacy notice: collapsed by default, expandable
- Navigation: bottom tab bar or hamburger for desktop nav items

**Both themes:** Dark and light mode must be fully implemented.

---

### 14. Empty / Loading / Error States

Implement Screens 12 and 13.

**Empty state (no memories):**
- Icon: 48px, 30% opacity, grid/blocks icon
- Title: "No memories yet"
- Body: "Matterhorn starts with a clean slate. Memories are created as you interact with markets, workflows, and chat."
- CTA: "Start Using Matterhorn" (primary)

**Loading skeleton:**
- 2-column grid of skeleton cards
- Skeleton line: animated pulse (opacity 1 → 0.4 → 1, 1.5s ease-in-out, infinite)
- Skeleton chips: rounded pill shapes
- No spinners or loading text — use skeleton only

**Secret-blocked state:**
- Amber left border strip
- Shield/lock icon (amber)
- Title: "Restricted memory"
- Body: "This memory contains sensitive information. Authenticate to view it."
- CTA: "Authenticate" button
- Card behind: blurred (CSS `filter: blur(4px)`) and non-interactive

**Memory disabled state:**
- Dashed border container
- Grid/blocks icon (30% opacity)
- Title: "Memory is disabled"
- Body: "Matterhorn is not learning from your activity. Enable memory in Privacy settings to let Matterhorn remember your preferences and context."
- CTA: "Enable Memory" button

**Source unavailable state:**
- Dashed border, italic text
- Warning icon (12px)
- 3 variants: on-chain unavailable, chat session archived, data removed
- "View source" link where available

---

### 15. Memory Badge System

Implement all badge variants used throughout the Memory UI.

| Badge | Colors (Dark) | Colors (Light) |
|-------|--------------|---------------|
| Type: Fact | `#D1F2FF` text, `rgba(209,242,255,0.10)` bg | `#2563EB` text, `rgba(37,99,235,0.08)` bg |
| Type: Preference | `#C084FC` text, `rgba(192,132,252,0.12)` bg | `#9333EA` text, `rgba(147,51,234,0.10)` bg |
| Type: Context | `#34D399` text, `rgba(52,211,153,0.12)` bg | `#059669` text, `rgba(5,150,105,0.10)` bg |
| Type: Protocol | `#60A5FA` text, `rgba(96,165,250,0.12)` bg | `#2563EB` text, `rgba(37,99,235,0.10)` bg |
| Type: Wellness | `#F472B6` text, `rgba(244,114,182,0.12)` bg | `#DB2777` text, `rgba(219,39,119,0.10)` bg |
| Sensitivity: Personal | `#D1F2FF` text, `rgba(209,242,255,0.10)` bg | `#2563EB` text, `rgba(37,99,235,0.08)` bg |
| Sensitivity: High | `#F59E0B` text, `rgba(245,158,11,0.12)` bg | `#D97706` text, `rgba(217,119,6,0.10)` bg |
| Sensitivity: Restricted | `#EF4444` text, `rgba(239,68,68,0.12)` bg | `#DC2626` text, `rgba(220,38,38,0.10)` bg |
| Scope: Workspace | `#D1F2FF` text, `rgba(209,242,255,0.10)` bg | `#2563EB` text, `rgba(37,99,235,0.08)` bg |
| Scope: Session | `#F59E0B` text, `rgba(245,158,11,0.12)` bg | `#D97706` text, `rgba(217,119,6,0.10)` bg |
| Scope: Global | `#8A8A8A` text, `#1E1E1E` bg | `#666666` text, `#EBEBEB` bg |

---

## Sprint 5: Compliance and Final Polish

### 16. Accessibility Audit

1. All interactive elements must be keyboard-navigable (Tab / Shift-Tab / Enter / Escape).
2. All badges and chips must have `aria-label` describing their meaning.
3. The confidence bar must have a numeric `aria-label` (e.g. "Confidence: 92%, high").
4. The memory detail panel must trap focus when open (Escape closes).
5. Color is not the only differentiator — badges use both color and text labels.
6. The "Forget" actions must have a confirmation step and clear undo path within 5 seconds.

### 17. Anti-Patterns Checklist

Verify the following do NOT exist in any Memory UI surface:

- Any field labeled "Seed phrase", "Private key", "API secret", "Raw signature"
- Any button labeled "Submit trade", "Place order", "Sign transaction", "Confirm"
- Any badge implying live execution capability (e.g. "Live", "Active trading")
- Any text implying Matterhorn stores or accesses wallet credentials
- Any wellness badge implying medical advice or diagnosis
- Any checkbox or toggle labeled "Share memories with [third party]"
- Any text claiming memories are encrypted in a way that implies Matterhorn holds keys
- Any passive-voice "Matterhorn remembers everything you do" messaging

If any of these are found, file a P0 and fix immediately.


---

## Sprint 6: Memory Producer V1 — Suggestion Inbox

### 18. Producer Bell Icon & Badge

Implement the bell icon entry point for the Memory Producer inbox.

**Location:** App header, far right, adjacent to profile menu.
**Icon:** Bell SVG (outline when empty, filled when unread). 24×24px.
**Badge:** Unread count badge. Positioned top-right of bell. Max display: "99+".
**Badge animation:** Pulse once (scale 1 → 1.15 → 1, 2s, non-intrusive) when a new suggestion arrives.

**States:**
- Empty: outline bell, no badge
- Has unread: filled bell, badge visible
- Panel open: filled bell, badge hidden
- Loading: outline bell, subtle spinner overlay on icon

**Layout:**
```
[Avatar] [Search] [🔔 3] [⚙]
```

**Responsive:**
- Desktop ≥ 1200px: header shows bell + badge inline
- Tablet 768–1199px: bell + badge inline
- Mobile < 768px: bell + badge inline, bell slightly smaller (20×20px)

**Safety:** The bell icon must not trigger any data collection. It is a read surface — it displays suggestions, it does not capture input.

---

### 19. Suggestion Inbox Slide-Over Panel

Implement the suggestion inbox panel as specified in `memory-producer-v1.md` §2.2.

**Panel anatomy:**
```
Header: "Memory Suggestions" + count + "Mark all read" link + close [×]
Filter bar: scope dropdown (All / Protocol / Wellness / Context / Preference)
Content: stacked suggestion cards
Footer: pagination ("Showing N of M · Load more")
```

**Animation:** Slide in from right. `transform: translateX(100%)` → `translateX(0)`. 250ms, `cubic-bezier(0.32, 0.72, 0, 1)`.
**Close:** X button, click outside panel, Escape key.
**Backdrop:** Content behind panel dims to `opacity: 0.3`, `pointer-events: none`.

**Widths:**
- Desktop ≥ 1200px: 480px
- Tablet 768–1199px: 100vw
- Mobile < 768px: 100vw × 100vh (full-screen overlay)

**Accessibility:**
- Focus traps inside panel when open (Tab cycles within panel)
- Escape closes panel
- Focus returns to bell icon on close

---

### 20. Suggestion Card — Display & Actions

Implement the suggestion card as specified in `memory-producer-v1.md` §3.

**Card structure:**
```
Metadata row: confidence bar + sensitivity badge + type badge
Title: max 2 lines, ellipsis
Body: max 3 lines, ellipsis (optional)
Why suggested: left-border accent (4px, --mm-accent), label + body
Source chip: icon + name + relative timestamp (read-only)
Action row: Confirm (primary) / Edit (default) / Dismiss (ghost/danger)
```

**Confidence bar:**
- 3 segments, filled = high (≥ 80%, green), amber = medium (50–79%), red = low (< 50%)
- Numeric label: "82%" right-aligned
- `aria-label`: "Confidence: 82%, high"

**Sensitivity badge:** Personal / High / Restricted — same color system as Memory cards.
**Type badge:** Protocol / Preference / Context / Wellness — same color system as Memory cards.

**Action behaviors:**
- Confirm: saves as memory, shows "Confirmed ✓" toast (3s), card animates out
- Edit: expands card in-place, shows editable fields (see Sprint 21)
- Dismiss: shows "Dismissed" toast (2s), card animates out. Dismissal is permanent for this suggestion.

**Hover state:** subtle `translateY(-1px)`, border color shifts to `--mm-accent`, `box-shadow: var(--shadow-sm)`.

---

### 21. Suggestion Card — Inline Edit Mode

Implement the inline edit mode as specified in `memory-producer-v1.md` §4.

**Trigger:** Click "Edit" on any suggestion card.

**Editable fields:**
- Title: textarea, 2 rows, live character count, max 80 chars
- Type: dropdown (Protocol / Preference / Context / Wellness)
- Sensitivity: dropdown (Personal / High / Restricted)
- Why suggested (body only): textarea, non-editable label, editable body

**Non-editable label:** The "Why suggested:" label itself cannot be edited — only the explanation body text.

**Validation (on save):**
- Title must not be empty → red border + "Title is required"
- Title must not contain seed phrases, private keys, API secrets, raw signatures, medical diagnoses, or financial guarantees → red border + "This memory contains sensitive or forbidden content and cannot be saved."

**Wellness type confirmation:** If changing type to Wellness, show confirmation dialog: "Wellness memories are stored locally only. Continue?"

**Footer actions:** "Save changes ✓" (primary) / "Cancel" (text link).

**Safety — NO HIDDEN SAVE:**
- No changes persist without clicking "Save changes"
- No changes persist if user navigates away
- No network request fires until "Save changes" is clicked

---

### 22. Producer Privacy Controls & Empty/Error States

Implement the privacy controls and state management as specified in `memory-producer-v1.md` §6.

**Privacy toggles (in Privacy & Forget Center):**
- "Allow memory suggestions" — default: on
- "Allow wellness memory suggestions" — default: off

**Wellness paused state:** If Wellness suggestions exist AND toggle is off, show:
```
🔒 Wellness suggestions are paused
─────────────────────────────
Wellness memory suggestions are currently disabled.
Enable them in Privacy & Forget Center → Wellness tab.
[Open Privacy settings]  [Dismiss]
```

**Empty state:** No suggestions at all:
```
🔔 No suggestions yet
─────────────────────────────
Matterhorn will suggest memories when it finds
patterns in your activity.
Suggestions appear here for you to review before
they're saved.
```

**Loading state:** Skeleton cards (3 cards), animated pulse. Filter bar disabled.
**Error state:** Amber banner: "Couldn't load suggestions. Try again." + Retry button.

---

## Sprint 7: Customer UX Overhaul — Navigation & Theme

### 23. Desk-First Navigation Sidebar

Implement the redesigned sidebar as specified in `customer-ux-overhaul.md` §2.

**Nav sections:**
```
[Matterhorn logo — top]
────────────────────
Desk:
  Bittensor          [⊗] (pink)
  Hyperliquid        [H]  (blue)
  Polymarket         [P]  (purple)
  Wellness           [♥]  (pink)
────────────────────
Memory:
  Memory             [M]  (green)  [+badge if unread]
  Sources & Provenance
  Watchlists
────────────────────
Tools:
  MCPs               [⚡]
  Workflows (future — disabled/coming soon)
────────────────────
Settings:
  Settings
  Profile
  Privacy & Forget Center
────────────────────
[Collapse sidebar —]
```

**"Services" removal:** The "Services" nav section must not exist. Its contents are redistributed as above. Audit all routes and redirects.

**Nav active state:** `--nav-bg-active` background, `--nav-text-active` color, left border accent (3px, `--brand-accent`).

**Collapsed state:** 56px wide, icon-only, tooltips on hover. "Collapse sidebar" button at bottom. Double-click sidebar edge also collapses.

**Responsive:**
- Desktop ≥ 1200px: always visible, 220px wide
- Tablet 768–1199px: 220px, collapsible
- Mobile < 768px: hidden, hamburger in header opens full-screen overlay

**Mobile overlay:** Full-screen, `--nav-bg` with `backdrop-filter: blur(8px)`. Slide in from left. Active item highlighted. X button to close.

---

### 24. Desk Surfaces — Protocol Headers

Implement the desk surface headers for Bittensor, Hyperliquid, Polymarket, and Wellness as specified in `customer-ux-overhaul.md` §3.

**Each desk surface has:**
- Protocol icon: 32×32px, `--desk-*` color background (tinted circle)
- Protocol name: `--brand-text`, 18px semibold
- Description: `--brand-text-secondary`, 14px
- "View [Protocol] ↗" link: opens external browser (never iframe)
- "Settings ⚙" link: opens protocol integration settings
- Stats row: Memories count / Protocol-specific stat / Avg confidence

**Protocol colors:**
- Bittensor: `--desk-bittensor` (pink `#F472B6` dark / `#DB2777` light)
- Hyperliquid: `--desk-hyperliquid` (blue `#60A5FA` dark / `#2563EB` light)
- Polymarket: `--desk-polymarket` (purple `#C084FC` dark / `#9333EA` light)
- Wellness: `--desk-wellness` (pink `#F472B6` dark / `#DB2777` light) + mandatory privacy notice
- Memory: `--desk-memory` (green `#34D399` dark / `#059669` light)

**Wellness privacy notice (mandatory):** Always visible at top of Wellness desk surface:
```
🔒 Wellness memories are stored locally only.
No wellness data is sent to external servers.
```

---

### 25. Semantic Color Token System

Implement the new semantic CSS token system as specified in `customer-ux-overhaul.md` §4.

**Token namespaces:**
```css
/* Brand — core palette */
--brand-bg: ...;
--brand-surface: ...;
--brand-elevated: ...;
--brand-accent: ...;
--brand-text: ...;
--brand-text-secondary: ...;
--brand-border: ...;

/* Action — buttons and interactive elements */
--action-primary: ...;         /* Primary CTA */
--action-primary-hover: ...;
--action-secondary: ...;        /* Secondary buttons */
--action-ghost: ...;            /* Ghost/icon buttons */
--action-ghost-hover: ...;
--action-danger: ...;           /* Forget, delete */

/* Status — indicators */
--status-success: ...;          /* Green */
--status-success-dim: ...;
--status-warning: ...;          /* Amber */
--status-warning-dim: ...;
--status-info: ...;             /* Blue — read-only, preview */
--status-info-dim: ...;
--status-danger: ...;          /* Red — errors */
--status-danger-dim: ...;

/* Desk — protocol branding */
--desk-bittensor: ...;          /* Pink */
--desk-hyperliquid: ...;         /* Blue */
--desk-polymarket: ...;         /* Purple */
--desk-wellness: ...;           /* Pink */
--desk-memory: ...;             /* Green */

/* Navigation */
--nav-bg: ...;
--nav-bg-hover: ...;
--nav-bg-active: ...;
--nav-text: ...;
--nav-text-active: ...;
--nav-border: ...;
```

**Migration approach:** Add new tokens alongside existing `--mm-*` tokens. Migrate components one at a time. Remove old tokens after full migration.

**Light mode:** All tokens have `[data-theme="light"]` overrides. See `customer-ux-overhaul.md` §4.4 for specific values and principles.

**Usage rules:**
- Protocol surfaces → `--desk-*`
- Action buttons → `--action-*`
- Status indicators → `--status-*`
- Navigation → `--nav-*`
- Core brand → `--brand-*`
- Never mix: `--desk-*` for status, or `--status-*` for protocol

---

### 26. Responsive Behavior — Sidebar, Cards, Producer Panel

Implement responsive behavior as specified in `customer-ux-overhaul.md` §5.

**Sidebar:**
- ≥ 1200px: 220px, always visible
- 768–1199px: 220px, collapsible
- < 768px: hidden, hamburger opens overlay

**Memory card grid (Memory Overview, desk surfaces):**
- ≥ 1200px: 3 columns, 20px card padding
- 768–1199px: 2 columns, 16px padding
- < 768px: 1 column, 12px padding

**Producer inbox panel:**
- ≥ 1200px: 480px, overlays content
- 768–1199px: 100vw
- < 768px: 100vw × 100vh, full-screen overlay

**Mobile Producer panel keyboard handling:** When a textarea in edit mode receives focus, the virtual keyboard must not push the panel off-screen. Use `visualViewport` API or `position: fixed` on the panel.

---

### 27. Anti-Patterns Checklist — Producer & Overhaul

Verify the following do NOT exist in any Producer or navigation surface:

**Memory Producer:**
- [ ] Auto-save on any field (Confirm or Save changes must always be explicit)
- [ ] Network request on field blur (saves only on button click)
- [ ] Wellness suggestions appearing when "Allow wellness memory suggestions" is off
- [ ] Restricted sensitivity Wellness suggestions auto-suggested without opt-in
- [ ] Any field accepting seed phrases, private keys, API secrets, raw signatures, medical diagnoses
- [ ] "Dismiss" not permanently dismissing the suggestion
- [ ] Suggestion count badge appearing when count === 0

**Customer Navigation:**
- [ ] "Services" section or nav item anywhere in the sidebar
- [ ] "Markets" as a primary nav section (replaced by Desk)
- [ ] Protocol brand colors (`--desk-*`) used for status indicators
- [ ] Status colors used for protocol branding
- [ ] `--mh-accent` used for anything other than links in new components (old tokens are deprecated)
- [ ] External links (Bittensor, Hyperliquid, Polymarket "View ↗") opening in iframe
- [ ] Wellness privacy notice absent from Wellness desk surface

If any of these are found, file a P0 and fix immediately.
