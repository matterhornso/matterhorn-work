# Desk V2 Boxiness — Visual QA Punch List

**Based on:** PR #590 (`a8a5cfa0`) merged to `dev` — "soften desk home surfaces"
**Status:** QA Draft — for Codex implementation
**Scope:** `apps/app/domains/session/chat/session-page.tsx` and related CSS

This document reviews the PR #590 changes against the V2 spec and existing `docs/ui/matterhorn-desk-v2/SPEC.md`. It lists what is confirmed fixed, what is partially fixed, and what remains for Codex to address.

---

## Summary: What PR #590 Delivered

PR #590 made these changes to `session-page.tsx`:

| Change | Status |
|--------|--------|
| `HomeCapabilityOverview` replaces `HomeCapabilityStatus` | ✅ Fixed |
| Divider-based rows (`.matterhorn-capability-overview`, `.matterhorn-capability-row`) | ✅ Fixed |
| `DeskLauncherButton` + `HomeDeskLaunchers` desk card grid | ✅ Fixed |
| Surface fill backgrounds on desk cards (no outlined borders) | ✅ Fixed |
| `DeskBrandMark` component with `ProtocolBrandLogo` + icon fallback | ✅ Fixed |
| 1px top gradient bar on desk cards | ✅ Fixed |
| Copy tightened: "What works today", "Choose a desk", "No auto-send" | ✅ Fixed |

---

## Dark Mode

Dark mode is the primary review target (Gate S1). V2 dark mode uses:
- Background: `#0C0C0C`; Surface cards: `#111111`; Elevated: `#1A1A1A`
- Border subtle: `#1F1F1F`; Text primary: `#F0F0F0`; Brand accent: `#D1F2FF`
- Per-desk accents: Bittensor `#FF7C43`, Hyperliquid `#C084FC`, Polymarket `#FBBF24`, Wellness `#F472B6`, Memory `#67E8F9`, MCP `#34D399`

## Light Mode

Light mode shifts accent colors for legibility on white:
- Background: `#F5F5F5`; Surface cards: `#FFFFFF`; Brand accent: `#2563EB`
- Per-desk accents: Bittensor `#EA580C`, Hyperliquid `#7C3AED`, Polymarket `#D97706`, Wellness `#DB2777`, Memory `#0891B2`, MCP `#059669`
- All text/background pairs must meet 4.5:1 contrast ratio (WCAG AA)

## Desktop Responsive

Desktop ≥1200px: 3-column desk card grid, 260px right rail, 56px left nav rail. No horizontal overflow. Right rail fixed (does not scroll with main content). Composer always visible above content.

## Mobile Responsive

Mobile <768px: 1-column desk card stack, bottom tab bar (5 tabs), no right rail, profile in top bar, composer above keyboard via `visualViewport` API.

## Tablet Responsive

Tablet 768–1199px: 48px left nav (icons only), right rail hidden, FAB toggles overlay. No horizontal overflow from overlay.

## P0 — Must Fix Before Ship

### Home Launcher Visual Hierarchy

The home launcher should have a clear visual hierarchy from the active desk (hero, full-width) down to the grid of desk cards. PR #590 uses:
- `HomeCapabilityOverview` → "What works today" section (divider rows, not bordered cards)
- `HomeDeskLaunchers` → "Choose a desk" grid (`lg:grid-cols-3` for desktop)
- Each `DeskLauncherButton` → surface fill card with 1px top gradient bar

**Dark mode:** Background `#0C0C0C`, surface cards `#111111`, accent bars in per-desk color.
**Light mode:** Background `#F5F5F5`, surface cards `#FFFFFF`, accent bars shift to light-mode palette (e.g., `#EA580C` for Bittensor).

### P0-1: Capability Overview — Add Left Accent Bar to Each Row

**Reference:** V2 SPEC §2 (Surface & Card System) — cards need a 3px top accent bar.
**Status:** Partial. PR #590 uses divider lines (`.divide-y`) which is cleaner than V1's outlined boxes, but does not add a per-desk accent bar.

**Before (current after PR #590):**
```
┌─────────────────────────────────────────────────────┐
│  ██  Bittensor        [Live Preview]                │
│       Public reads · SS58 · External signing         │
│       TAO reads, no signing, no key storage.         │
└─────────────────────────────────────────────────────┘
```

**After (target):**
```
┌─(3px orange bar)────────────────────────────────────┐
│  ██  Bittensor        [Live Preview]                │
│       Public reads · SS58 · External signing         │
│       TAO reads, no signing, no key storage.         │
└─────────────────────────────────────────────────────┘
```

**Implementation:** Add a 3px left border or top border on each `.matterhorn-capability-row` using `--matterhorn-desk-color`. The desk color CSS variable is already set via `style={deskToneStyle(item.id)}` on the row — apply it to a border.

```tsx
// In matterhorn-capability-row, add to className:
// border-l-[3px] border-solid border-[var(--matterhorn-desk-color)]
```

**Acceptance:** Each capability row has a visible 3px accent in the desk's accent color. Light mode uses the light-mode accent (e.g., orange `#EA580C` for Bittensor).

---

### P0-2: Capability Overview — Remove Any Remaining Card Outlines

**Reference:** V2 SPEC §2, P1
**Status:** Likely fixed — PR #590 uses `.divide-y` dividers instead of bordered cards. Verify.

**Check:** Screenshot the home surface at 1280×800 dark. If any card has a visible 1px border as its primary visual structure, add `border-0` or replace with a surface fill.

**Implementation:** Ensure no `border` utility classes on `.matterhorn-capability-row`. The dividers come from Tailwind's `.divide-y` — that is correct.

---

### P0-3: Logo Treatment — Enforce Consistent Size

**Reference:** V2 SPEC §5 (Nav), desk-v2 SPEC §4 (Right Rail)
**Status:** PR #590 introduces `DeskBrandMark` with `size` prop. Currently used as `size={34}` on desk cards and `size={28}` on capability rows.

**Check:** Verify all three logo use points are consistent:
- Nav rail icons: `size={20}` or icon-only
- Capability overview: `size={28}` per row
- Desk launcher cards: `size={34}` per card

**Rule:** A desk's primary logo on a card should be ≥ the nav rail icon. The capability overview can use the smaller mark. Do not mix `ProtocolLogo` variants arbitrarily.

**Acceptance:** All three logo contexts are visually consistent in weight and scale. Protocol wordmarks are not cropped or distorted.

---

## P1 — Polish Before Ship

### P1-1: "Insert Editable Prompt" CTA — Ensure It's a Real Button

**Reference:** PR #590 diff — CTA text changed from "Open desk with editable prompt" to "Insert editable prompt".
**Status:** Confirmed changed in PR #590.

**Check:** Verify "Insert editable prompt" is inside a `<button>` element, not just styled text. It should have hover/focus states and be clearly tappable on mobile.

**Before:**
```tsx
<span className="mt-auto pt-5 text-[12px] font-semibold text-[var(--matterhorn-desk-color)]">
  Insert editable prompt
</span>
```

**After:**
```tsx
<button
  type="button"
  className="mt-auto flex w-full items-center justify-between rounded-md bg-[rgba(var(--matterhorn-desk-rgb),0.12)] px-3 py-2 text-left text-[12px] font-semibold text-[var(--matterhorn-desk-color)] hover:bg-[rgba(var(--matterhorn-desk-color),0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)] transition-colors"
>
  Insert editable prompt
  <ArrowRight className="size-3" />
</button>
```

**Acceptance:** CTA is a real button with hover state, focus ring, and pointer cursor.

---

### P1-2: Right Rail — Verify Wallet Card Has Copy Button

**Reference:** V2 SPEC §3 (Right Rail), P3
**Status:** PR #590 removed "Matterhorn Wallet lives in the right rail" from the copy, but the actual wallet card implementation in the right rail was not changed in this PR.

**Check:** Open the right rail on desktop. Verify:
- Avatar + truncated wallet address: `5CfTC…3bX9`
- Copy button next to address
- Quick stats below (Total Stake, Active Subnets, Delegation Ceiling)
- "No key storage" badge on wallet card

**Acceptance:** Right rail wallet card shows truncated address with copy. Full addresses never shown.

---

### P1-3: Capability Overview — Light Mode Accent Colors

**Reference:** V2 SPEC §1 (Light Mode), desk-v2 SPEC §1 (Light Mode overrides)
**Status:** `--matterhorn-desk-color` CSS variable must shift to light-mode accent on light background.

**Check:** Take a screenshot at 1280×800 light mode. Verify:
- Bittensor accent: `#EA580C` (not `#FF7C43`)
- Hyperliquid: `#7C3AED` (not `#C084FC`)
- Polymarket: `#D97706` (not `#FBBF24`)
- Capability rows have sufficient contrast on white background

**Acceptance:** Light mode desk accents are visible and meet 4.5:1 contrast ratio against white.

---

## P2 — Responsive States

### P2-1: Tablet (768–1199px) — Right Rail Overlay

**Reference:** V2 SPEC §10 (Responsive Behavior)
**Status:** Not changed in PR #590. Verify existing implementation.

**Check:** Open home at 768×1024. Verify:
- Left nav: 48px, icons only (no labels)
- Right rail: hidden by default, FAB in bottom-right corner
- FAB toggles right rail as overlay panel (not reflowing main content)
- No horizontal overflow from overlay panel

**Acceptance:** Right rail overlay does not cause horizontal scroll or content reflow.

---

### P2-2: Mobile (<768px) — Home Launcher Grid → Stack

**Reference:** V2 SPEC §10
**Status:** PR #590 uses `lg:grid-cols-3` and `sm:grid-cols-2`. Need to verify mobile behavior.

**Check:** Open home at 390×844. Verify:
- Desk cards: 1-column stack (not 2-column)
- Cards maintain surface fill styling, not outlined boxes
- Bottom tab bar: 5 tabs (Home, Bittensor, Hyperliquid, Polymarket, Wellness) + More
- Profile: in top bar, not bottom bar
- No right rail (confirmed absent on <768px)

**Acceptance:** Mobile home is a clean 1-column list of desk cards. No horizontal overflow.

---

### P2-3: Composer — Above Keyboard on Mobile

**Reference:** V2 SPEC §10
**Status:** Not changed in PR #590.

**Check:** On mobile, tap the chat input. Verify:
- Composer does not overlap with desk cards or capability overview
- Uses `visualViewport` API to detect keyboard open/close
- Bottom tab bar is hidden or compressed when keyboard is open

**Acceptance:** Composer is always visible and accessible above the keyboard.

---

## P3 — Before/After: Specific Codex Implementations

### B/A-1: Home Capability Overview — From Section to Editorial Rows

**Before (V1):**
- Section heading: "Current capability status"
- Bulleted list with icon + text
- Generic "Live boundaries visible" badge

**After (PR #590, target refinements):**
- Heading: "What works today"
- Rows with divider lines (`.divide-y`) — cleaner than bulleted list
- Per-desk accent bar on each row (P0-1)
- "Wallet stays external" + "No hidden auto-send" badges
- Sub-copy: "Every desk keeps its own context, wallet needs, previews, and safety boundary visible."

**CSS class:** `.matterhorn-capability-overview` + `.matterhorn-capability-row`

---

### B/A-2: Desk Launcher Cards — From Flat List to Accented Cards

**Before (V1):**
- Flat `<button>` rows, full-width, stacked
- Heavy `rounded-md border` as primary visual structure
- Small 24px icons, no desk color brand presence
- "Open desk with editable prompt" in small text

**After (PR #590):**
```
┌─────────────────────────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ ← 1px gradient bar (desk color)
│                                                         │
│  [████ Logo]  Bittensor                                 │
│               [Live Preview]                            │
│                                                         │
│  An AI companion for subnet intelligence...             │
│                                                         │
│  ● Public reads   ● TAO delegation   ● Validator pref   │
│                                                         │
│  Insert editable prompt →                               │
└─────────────────────────────────────────────────────────┘
```

**CSS classes:** `.matterhorn-desk-board` + `.matterhorn-desk-launcher`

---

### B/A-3: Capability Row — From Outlined Card to Surface Row

**Before:**
```tsx
<div className="flex items-start gap-3 rounded-lg px-1.5 py-1.5 border border-[var(--dls-border)] bg-dls-surface">
```

**After (PR #590 + P0-1 refinement):**
```tsx
<div
  style={deskToneStyle(item.id)}
  className="matterhorn-capability-row grid gap-3 py-4 text-left
    transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.045)]
    sm:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)]
    border-l-[3px] border-solid border-[var(--matterhorn-desk-color)]"
>
```

---

### B/A-4: Nav Rail — From Emoji to Official Logo

**Before:**
```tsx
<span>⚡</span> {/* emoji as protocol icon */}
```

**After (PR #590, via DeskBrandMark):**
```tsx
const visual = getCustomerProtocolDeskVisual(id);
const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[id];
if (visual) return <ProtocolBrandLogo id={visual.id} visual={visual} size={size} />;
return <Icon className="size-4" />;
```

**Rule:** Logo size in nav rail: `size={20}` (icon-only context). If a `ProtocolMark` variant exists (icon-only mark), prefer it in nav. Use `ProtocolWordmark` only in the Home desk hero or desk header.

---

## Checklist for Codex

Before marking any desk implementation complete:

- [ ] Screenshot at 1280×800 dark (Gate S1)
- [ ] Screenshot at 1280×800 light (Gate S2)
- [ ] Screenshot at 768×1024 tablet dark (Gate S3)
- [ ] Screenshot at 390×844 mobile dark (Gate S4)
- [ ] Screenshot at 390×844 mobile light (Gate S5)
- [ ] No horizontal overflow on any viewport
- [ ] No `border-radius > 4px` on data cards
- [ ] No `backdrop-filter: blur()` anywhere
- [ ] No nested bordered card grids
- [ ] No full wallet addresses (always truncated)
- [ ] No live submission language on Hyperliquid or Polymarket
- [ ] Bittensor Beginner/Expert toggle visible
- [ ] Right rail wallet card: truncated address + copy button
- [ ] Logo: official SVG, not emoji, consistent size per context
- [ ] Light mode: desk accent colors shift per V2 light palette
- [ ] `pnpm test:minimax-desk-v2` — all PASS
- [ ] `pnpm test:minimax-ui-system` — all PASS
- [ ] `pnpm test:market-execution-safety-gate` — all PASS
