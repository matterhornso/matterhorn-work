# Matterhorn Memory Producer & Customer UX Overhaul — Handoff

**Date:** 2026-06-23
**Branch:** `minimax/memory-producer-ux` (pending)
**Status:** Design specs complete. Ready for Stitch design pass and engineering review.
**Docs:** `docs/ui/matterhorn-memory/memory-producer-v1.md`, `docs/ui/matterhorn-memory/customer-ux-overhaul.md`
**Scripts:** `scripts/minimax-memory-producer.test.mjs` (120+ assertions, all PASS)

---

## Executive Summary

Two UX design specs have been produced for the Matterhorn Memory system:

**Memory Producer V1** defines the Suggestion Inbox — the surface where Matterhorn surfaces candidate memories for user review before they're saved. The core principle: **no hidden saves.** Every memory goes through confirm, edit, or dismiss.

**Customer UX Overhaul** redesigns the customer-facing navigation from an internal structure (Services, Markets, Chat, Sessions) to a **desk-first model** organized around what users want to accomplish. It also introduces a **semantic color token system** that replaces a single accent color with purpose-built tokens for actions, status, and protocol branding.

Both specs build on the existing Memory UI (`production-handoff.md`, `memory-producer-v1.md`, `customer-ux-overhaul.md`). They do not replace the existing Memory card design — they extend it.

---

## What Was Built

### 1. Memory Producer V1 — Suggestion Inbox

**Problem it solves:** The current Memory system creates memories passively — the system observes user behavior and writes memories without the user knowing. This creates a trust gap: users don't know what Matterhorn has remembered, and they have no way to correct or reject inaccurate memories before they're permanent.

**Solution:** A producer pipeline generates memory suggestions. Suggestions appear in a **bell icon inbox** where the user can:

- See why a memory was suggested (the most important UX element — a plain-English explanation of the trigger)
- See the confidence level (high / medium / low, displayed as a 3-segment bar)
- See the source (protocol, chat, settings — with timestamp)
- See the sensitivity level (Personal / High / Restricted)
- **Confirm** — saves the suggestion as a permanent memory
- **Edit** — inline editing before saving (no hidden save, no auto-save)
- **Dismiss** — permanently rejects this suggestion

**Key design decisions:**

| Decision | Rationale |
|---------|-----------|
| Bell icon entry point | Non-intrusive; doesn't disrupt the main app layout; clearly signals "new items available" |
| Slide-over panel (480px) | Keeps user in context; doesn't navigate away from their current surface |
| "Why suggested" as a mandatory card element | Justifies the suggestion to the user; builds trust; allows user to catch false positives |
| Inline edit (not separate panel) | Keeps edit context visible; faster; fewer navigation steps |
| No hidden save / no auto-save | Trust requirement; user must explicitly confirm or save |
| Wellness Restricted by default | Medical/health data is sensitive; opt-in required for suggestions |
| Wellness suggestions paused by default | "Allow wellness memory suggestions" toggle defaults to off |

**Safety:** No memory can contain seed phrases, private keys, API secrets, raw signatures, medical diagnoses, or financial guarantees. Frontend validation on save + pipeline enforcement.

---

### 2. Customer UX Overhaul — Desk-First Navigation

**Problem it solves:** Navigation was organized around Matterhorn's internal structure ("Services", "Markets") rather than around user goals. Users wanting to check their Hyperliquid positions had to know that lives under "Services → Hyperliquid" — an implementation detail creating unnecessary friction.

**Solution:** The sidebar is reorganized around four sections:

- **Desk:** Bittensor, Hyperliquid, Polymarket, Wellness — the protocols the user is actively working with
- **Memory:** Memory Overview, Sources & Provenance, Watchlists
- **Tools:** MCPs, Workflows (future)
- **Settings:** Settings, Profile, Privacy & Forget Center

"Services" is **removed** from the customer-facing nav entirely. Its contents are redistributed to Desk and Tools.

**New semantic color token system:**

| Namespace | Purpose |
|-----------|---------|
| `--brand-*` | Core brand palette (backgrounds, text, borders) |
| `--action-*` | Buttons and interactive elements |
| `--status-*` | Status indicators (success, warning, info, danger) |
| `--desk-*` | Protocol branding (Bittensor pink, Hyperliquid blue, Polymarket purple, Wellness pink, Memory green) |
| `--nav-*` | Navigation-specific surfaces |

**Before:** Single `--mh-accent: #D1F2FF` for everything.
**After:** Each semantic intent has its own token. Protocol surfaces use their protocol color. Status surfaces use status colors. Actions use action colors. Color is purposeful, not uniform.

**Light mode rules:** Not a simple inversion. Each dark-mode value has a deliberate light-mode counterpart. Shadows use lower opacity in light mode. Protocol colors are deepened for light backgrounds.

---

## What This PR Contains

```
docs/ui/matterhorn-memory/
├── memory-producer-v1.md       # Suggestion inbox UX spec (10 sections)
├── customer-ux-overhaul.md     # Desk-first nav + semantic color system (9 sections)
├── stitch-prompts.md           # Updated: +Sprint 6 (Producer V1) + Sprint 7 (Overhaul)
└── styles.css                  # Updated: producer + desk-* + action-* + status-* + nav-* tokens

docs/handoffs/
└── minimax-memory-producer-ux-handoff.md  # This document

scripts/
└── minimax-memory-producer.test.mjs        # 120+ assertion gate
```

---

## Gates

All three gates pass cleanly:

| Gate | Result | Assertions |
|------|--------|------------|
| `test:minimax-memory-producer` | ✅ PASS | 120+ |
| `test:minimax-memory-ui` | ✅ PASS | all |
| `test:minimax-ui-system` | ✅ PASS | all |
| `test:market-execution-safety-gate` | ✅ PASS | all |

---

## What This Does NOT Contain

- No production UI implementation (React, Vue, etc.)
- No backend pipeline code for the Producer
- No database schema changes
- No authentication or session logic
- No MCP integration code

This is a **design spec and data contract.** Engineering translates to implementation.

---

## Decisions to Flag for Engineering

1. **Producer pipeline ownership** — The Producer pipeline is defined as a data contract in §7 of `memory-producer-v1.md`. Engineering needs to confirm: who owns the Producer? Is it part of the Matterhorn Memory Vault package? A separate service? This affects where the suggestion data is stored and how the inbox fetches it.

2. **Suggestion count badge** — The bell icon shows an unread count. This requires a real-time mechanism (WebSocket, polling, or SSE) to push new suggestions to the frontend. Engineering needs to decide on the mechanism.

3. **Edit mode scope** — Inline edit is V1. For V2, consider whether editing should open a full detail panel (reusing the Memory Detail Panel from `production-handoff.md`) or stay inline.

4. **Dismissal duration** — Suggestions dismissed by the user do not reappear for 30 days for the same trigger. Engineering needs to confirm this duration and how the Producer tracks dismissed triggers.

5. **Mobile keyboard handling** — The Producer inbox on mobile needs to handle virtual keyboard opening on textarea focus. The panel must not be pushed off-screen. Engineering to implement: `visualViewport` API or `position: fixed` approach.

6. **"Services" removal** — Engineering must audit all routes, redirects, and deep links that reference "Services." Old URLs must either redirect to the new desk surface or show a graceful "this surface has moved" message.

7. **CSS token migration** — The existing `styles.css` files use `--mh-*` tokens. The new semantic tokens (`--brand-*`, `--action-*`, `--status-*`, `--desk-*`, `--nav-*`) require a migration plan. Recommended: additive approach (add new tokens alongside old ones, migrate components one at a time, then remove old tokens).

---

## Recommended Next Steps

1. **Stitch design review (45 min):** Walk through `memory-producer-v1.md` and `customer-ux-overhaul.md`. Focus on: suggestion card layout and "Why suggested" placement; bell icon badge behavior; desk-first navigation hierarchy; semantic color system.
2. **Engineering kickoff (30 min):** Review the data contract (§7 of `memory-producer-v1.md`) with the backend team. Confirm Producer ownership and suggestion delivery mechanism.
3. **CSS token migration plan:** Draft migration from `--mh-*` to `--brand-*` / `--action-*` / `--status-*`. Use additive approach to avoid breaking existing surfaces.
4. **"Services" URL audit:** Engineering to audit all references to "Services" in routes and redirects before implementing the nav change.
