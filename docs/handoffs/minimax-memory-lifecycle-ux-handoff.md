# Memory Suggestion Lifecycle UX — CEO Handoff

**Author:** Coder (minimax)
**Date:** 2026-06-24
**Original PR:** [#532](https://github.com/matterhornso/matterhorn-work/pull/532) → `dev`
**Status:** Cleaned by Codex into a conflict-free docs/test replacement branch after `dev` moved ahead with the production lifecycle contract. Awaiting Stitch copy guidance and visual QA review.

---

## What This Delivers

Three new sections added to the Memory UI Production Handoff (`docs/ui/matterhorn-memory/production-handoff.md`):

1. **§7 — Six Suggestion Lifecycle States** — every state a Memory Suggestion card can be in, from the moment it surfaces to the moment it is confirmed, dismissed, or blocked.
2. **§8 — "Why Suggested" Copy Guidance** — rules for the most important sentence in the inbox: the plain-English explanation of why Matterhorn surfaced this suggestion.
3. **§9 — QA Visual Review Checklist** — a 12-part checklist for reviewing every state in dark mode, light mode, desktop, tablet, and mobile.

---

## §7 — Six Lifecycle States

This work was driven by PR #529 (Codex shipped the card states). The spec now maps every state precisely.

### What Each State Means

| State | Customer Sees | What Happens |
|-------|--------------|-------------|
| **New** | Card in inbox with `[New]` badge | Needs review. Expires in 14 days if ignored. |
| **Edited** | Card shows user's edited title with `[Edited]` badge | User clicked Edit, changed something, clicked Save. Only Confirm button remains. |
| **Confirmed** | Card disappears from inbox, reappears in Memory Overview | Memory is saved. Shows `[Confirmed ✓]` badge in Memory Overview. |
| **Dismissed** | Card animates out | User said no. Reappears in 30 days (Producer pipeline enforces). |
| **Expired** | Card with `[Expired]` badge + amber warning | Stale. Source context changed or 14 days passed. Only Dismiss button shown. |
| **Blocked** | Locked card — no content visible | Policy prevented it. Single dismiss action. Never re-suggested. |

### State Transition Diagram

```
New (pending)
  ├─ Confirm → Confirmed → Memory Overview
  ├─ Edit → Edit form → Save → Edited
  │                   └─ Confirm → Confirmed
  │                   └─ Cancel → New
  ├─ Dismiss (30 days) → gone
  └─ 14 days no action → Expired
                          ├─ Dismiss → gone
                          └─ Producer re-evaluates → fresh New

Blocked
  └─ Dismiss → gone (no 30-day rule)
```

### One Critical Distinction

The inbox spec §3.6 ("Card States") covers **interaction** states — Hover, Confirming, Editing, Dismissing. This §7 covers **lifecycle** states — New, Edited, Confirmed, Dismissed, Expired, Blocked. These are independent axes. A card in "New" lifecycle state still has Hover and Confirming interaction states. This distinction prevents confusion during implementation.

---

## §8 — "Why Suggested" Copy Guidance

The "Why suggested" block is the most important UX element in the inbox. It determines whether users trust the suggestion system. Poor copy ("Context detected") drives dismissals. Specific, plain-English copy drives confirmations.

### Six Rules (All Suggestions)

1. **Plain English always** — no jargon, no field names, no internal terminology
2. **Cite the visible trigger** — user must recognize the action that caused this
3. **State the inference, not just the fact** — tell them what Matterhorn concluded
4. **Include the time window** — "in the past 2 weeks", "this month", "3 times"
5. **Max 200 characters** — write tight, truncate with ellipsis
6. **Below 50% confidence** — acknowledge uncertainty explicitly

### Per-Desk Safety Boundaries

| Desk | Allowed | Forbidden |
|------|---------|-----------|
| **Bittensor** | Truncated SS58 addresses (`5CfTC…3bX9`), public Subtensor data, validator preferences | Full addresses, custody claims ("Matterhorn controls your stake"), security advice |
| **Hyperliquid** | User-initiated settings, public on-chain position history, leverage ceiling changes | Position values, execution claims ("Matterhorn will close your position"), API key exposure |
| **Polymarket** | Markets viewed or asked about in chat, prediction preferences, sentiment notes | Bet amounts, CLOB credentials, execution claims ("Matterhorn placed a bet on your behalf") |
| **Wellness** | Check-ins, streaks, wellness workflow interactions | Medical diagnoses, prescriptions, treatment recommendations, PHI |

**Wellness additionally requires**: local-only notice on every card ("Stored locally only. Never sent to external servers.").

---

## §9 — QA Visual Review Checklist

12 sub-sections covering every state across all three viewport widths. Key items:

- **New card**: confidence bar segments, state badge, hover lift, Why block specificity, source chip, "Will be saved as" preview collapsed by default, all three action buttons visible (no hidden save)
- **Wellness card**: Personal or Restricted sensitivity (never High), no clinical language, local-only notice, export button absent
- **Edited card**: user's edited title displayed, only Confirm visible after save
- **Confirmed card**: absent from inbox, present in Memory Overview with `producerSuggestionId`
- **Dismissed**: card animates out (opacity 0 + slide up), "Dismissed" toast, badge decrements
- **Expired**: amber warning block, only Dismiss button (Confirm and Edit hidden)
- **Blocked**: no title/body/source rendered, lock icon, single dismiss action
- **Edit flow**: expands in-place (no new panel), character count, forbidden content detection on blur, Wellness confirmation dialog before save
- **Panel**: bell badge (0 = absent, ≤99 = count, >99 = 99+), focus trap, empty/error/loading states
- **Mobile**: swipe-down dismiss, visualViewport keyboard handling, buttons stacked vertically, 12px padding, no right-edge overflow

**Review requirement:** dark mode AND light mode on all three viewport widths (≥1200px desktop / 768–1199px tablet / <768px mobile).

---

## What Codex Needs to Know

- The six lifecycle states (§7) are the contract that PR #529 implemented. Confirm alignment with the inbox entry schema — `status` field must be one of: `pending | edited | confirmed | dismissed | expired | blocked`.
- Dismissed suppression is 30 days, enforced by the Producer pipeline. Expired is 14 days without user action.
- Blocked suggestions are never re-suggested (no 30-day rule).
- The `MatterhornMemorySuggestionInboxEntry` type carries `resolvedAt`, `lastAction`, `recordId`, `markdownPath`, `policyWarnings`. Confirmed memories reference `producerSuggestionId`.

## What Stitch Needs to Confirm

- §8 copy examples are copydeck, not final UI strings. Stitch should review and finalize the tone.
- §9 QA checklist is for visual QA pass before ship. Stitch signs off on the checklist items.

## Open Design Questions (4)

1. **Dismissed duration** — 30 days is the current default. Should it be configurable per desk or globally?
2. **Blocked-state copy variants** — two body-text variants documented (forbidden secrets / wellness clinical). Are there additional blocked subtypes?
3. **Expired refresh UX** — should the Producer regenerate a fresh suggestion immediately after expiry, or wait for fresh context?
4. **Wellness skip-reappearance** — dismissed Wellness suggestions follow the 30-day rule. Should dismissed Wellness suggestions skip re-appearance entirely (since the toggle may be off)?

---

## Files Changed

| File | Change |
|------|--------|
| `docs/ui/matterhorn-memory/production-handoff.md` | +641 lines: §7 (lifecycle), §8 (copy guidance), §9 (QA checklist) |
| `scripts/minimax-memory-ui.test.mjs` | +207 lines: §11 (lifecycle assertions), §12 (copy guidance assertions), §13 (QA assertions) |

## Gates

| Gate | Result |
|------|--------|
| `pnpm test:minimax-memory-ui` | ✅ |
| `pnpm test:market-execution-safety-gate` | ✅ |
