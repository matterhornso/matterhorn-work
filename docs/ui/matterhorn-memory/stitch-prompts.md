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

## Sprint 6: Memory Producer V1

### 18. Producer Bell Icon

Add a bell icon to the app header for pending memory suggestions.

**Behavior:**
- Shows an unread badge when safe memory suggestions are waiting for review.
- Opens the suggestion inbox when clicked.
- Never saves memory by itself.
- Badge count only reflects suggestions that the user can review.
- Wellness suggestions stay hidden unless the user has enabled wellness memory suggestions.

**States:**
- Empty: no badge, neutral icon.
- Has suggestions: badge with count, accessible label "Memory suggestions waiting".
- Loading: subtle skeleton badge, no spinner.
- Error: amber badge and tooltip explaining that suggestions could not be loaded.

---

### 19. Suggestion Inbox Slide-Over Panel

Design a right-side panel titled "Memory suggestions".

**Layout:**
- Header with title, count, close button, and privacy shortcut.
- Intro line: "Review what Matterhorn thinks may be useful later. Nothing is saved until you confirm."
- Scrollable stack of suggestion cards.
- Footer with a link to Memory Privacy settings.

**Rules:**
- The panel must not block the main chat.
- Escape closes the panel.
- Focus is trapped while the panel is open.
- Empty state explains that Matterhorn has not found anything useful to suggest yet.

---

### 20. Suggestion Card

Each card must show the suggestion clearly enough for the user to accept, edit, or reject.

**Required content:**
- Title.
- Body.
- Type badge.
- Sensitivity badge.
- Source chip.
- Confidence bar.
- "Why suggested" explanation in plain English.
- Suggested scope.
- Timestamp.

**Actions:**
- Confirm.
- Edit.
- Dismiss.

**Safety copy:**
- "Nothing is saved until you confirm."
- "Matterhorn never stores seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports."

---

### 21. Inline Edit Mode

When the user clicks Edit, keep the card in place and switch title/body fields to editable controls.

**Behavior:**
- Save changes.
- Cancel.
- Preserve the original "Why suggested" explanation.
- Re-run forbidden-content validation before saving.
- Show inline validation errors for secret-shaped or clinical content.

**NO HIDDEN SAVE:**
- Do not save on blur.
- Do not save on typing.
- Do not save on panel close.
- Only save on explicit "Save changes".

---

### 22. Producer Privacy Controls

Add privacy controls to the suggestion inbox and Memory settings.

**Required controls:**
- Enable/disable memory suggestions globally.
- Enable/disable suggestions by source.
- Enable/disable protocol-address suggestions.
- Enable/disable receipt suggestions.
- Enable/disable wellness suggestions.

**Wellness default:**
- Wellness suggestions are off by default.
- Wellness suggestions are restricted and local-first.
- The UI must explain that wellness memory is optional and user-confirmed.

---

### 23. Empty/Error States

Design complete empty, loading, and error states for the producer flow.

**Empty state:**
- Title: "No suggestions right now"
- Body: "Matterhorn will suggest memories only when they may help future work. Nothing is saved automatically."

**Error state:**
- Title: "Suggestions unavailable"
- Body: "Memory suggestions could not be loaded. Existing memories are unaffected."
- Action: Retry.

**Blocked state:**
- Title: "Suggestion blocked"
- Body: "This candidate looked like a secret, credential, signed payload, or restricted wellness data, so Matterhorn refused to save it."

---

### 24. Anti-Patterns Checklist — Producer

The producer UI must never include:

- Auto-save claims.
- Hidden memory writes.
- Seed phrase fields.
- Private key fields.
- API secret fields.
- Raw signature fields.
- Signed payload fields.
- Wallet export fields.
- Medical diagnosis memories without explicit opt-in and review.
- Any button that says "Remember everything".
- Any suggestion that bypasses Confirm.

---

## Sprint 7: Customer UX Overhaul

### 25. Desk-First Navigation Sidebar

Replace internal-category navigation with a customer-facing desk model.

```text
Desk
  Bittensor
  Hyperliquid
  Polymarket
  Wellness
Memory
Tools
Settings
```

**Rules:**
- Do not show Services as a primary customer nav item.
- Each desk has its own icon and color accent.
- The selected desk must be visually obvious.
- Mobile uses a bottom tab or compact drawer, not a trapped right rail.

---

### 26. Desk Surfaces

Create first-class desk surfaces instead of a generic crypto workspace.

**Bittensor desk:**
- Wallet, subnets, validators, watches, receipts, unsigned staking previews.
- SS58/coldkey/hotkey language.
- External signer required for actions.

**Hyperliquid desk:**
- Read-only account/orderbook/preview.
- Can submit: No.
- Live submission: Off.
- External signer/client required.

**Polymarket desk:**
- Market discovery, outcome context, compliance state, preview.
- Can submit: No.
- Live submission: Off.
- Compliance-blocked previews must not show executable price, size, or share fields.

**Wellness desk:**
- Plain workflow surface, not Web3.
- Training, yoga, dietician, client workflow, progress check-in, offer builder.
- Educational only, non-medical, no live payments/email/hosting/access claims.

---

### 27. Semantic Color Token System

Use semantic tokens instead of one global accent.

**Required namespaces:**
- `--brand-*`
- `--action-*`
- `--status-*`
- `--desk-*`
- `--nav-*`

**Desk accents:**
- Bittensor: energetic pink.
- Hyperliquid: electric blue.
- Polymarket: violet.
- Wellness: warm rose.
- Memory: cyan.

**Matterhorn brand:**
- Keep `#0C0C0C` and `#D1F2FF` for primary brand moments, primary buttons, and selected states.
- Use brighter supporting colors for protocols, alerts, and workflow categories.

---

### 28. Responsive Behavior

Every desk and memory screen must work at desktop, tablet, and mobile sizes.

**Desktop:**
- Left navigation, central chat/workspace, optional right context panel.

**Tablet:**
- Collapsible side panels.
- Cards use two columns only when width allows.

**Mobile:**
- One-column content.
- Bottom navigation or drawer.
- No horizontal overflow.
- Composer remains reachable.
- Right rail never traps content off-screen.

---

### 29. Anti-Patterns Checklist

The customer UX must not include:

- Services as a top-level customer desk.
- Computer Use as a customer-facing default.
- OpenWork or OpenCode copy on customer-facing screens.
- Buttons implying live market submission.
- Buttons implying Matterhorn signs or holds custody.
- Credential entry fields.
- Hidden memory saves.
- Wellness copy that implies diagnosis, treatment, prescription, or guaranteed outcomes.
