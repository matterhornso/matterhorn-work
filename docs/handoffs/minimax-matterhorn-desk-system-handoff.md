# Matterhorn Desk System — Production Handoff

**From:** Desk System Agent
**To:** Kimi (CEO)
**Date:** 2025-07-01
**Branch:** `minimax/matterhorn-desk-system`
**Status:** Spec complete, gate writing in progress

---

## What This Is

The Matterhorn Desk System is the top-level navigation and workspace layer for the Matterhorn app. Each desk is a specialized, protocol-aware workspace that aggregates context, memories, and tools into a unified surface.

**This spec covers:**
- 9 screens: Desk Launcher + 6 protocol desks + MCP + Settings
- Full dark + light mode token system (`--desk-*` namespace)
- Safety and forbidden-pattern constraints per desk
- Responsive behavior (desktop / tablet / mobile)
- A Stitch prompt pack for production design
- A gate script that enforces spec compliance in CI

---

## What Ships in This Spec

### 9 Screens

| Screen | Route | Status |
|--------|-------|--------|
| Desk Launcher | `/desks` | Spec + prototype |
| Bittensor Desk | `/desks/bittensor` | Spec + prototype |
| Hyperliquid Desk | `/desks/hyperliquid` | Spec + prototype |
| Polymarket Desk | `/desks/polymarket` | Spec + prototype |
| Wellness Desk | `/desks/wellness` | Spec + prototype |
| Memory Desk | `/desks/memory` | Spec + prototype |
| MCP Desk | `/desks/mcp` | Spec + prototype |
| Settings & Profile | `/settings` | Spec + prototype |
| Mobile Nav | — | Spec + prototype |

### Safety Per Desk

| Desk | Safety Constraint |
|------|------------------|
| Bittensor | Read-only Subtensor data. No signing, no custody, no seed phrases. |
| Hyperliquid | Preview only. No order placement, no API secrets. |
| Polymarket | Read-only browsing. No bet placement, no CLOB credentials. |
| Wellness | Local-only. No network transmission. Not medical advice. |
| MCP | Local tools. No credentials stored in Matterhorn. Scoped permissions. |
| Memory | No hidden saves. All memories visible. Forget always available. |

### Forbidden Patterns — Confirmed Absent

- ❌ "Crypto workspace", "DeFi", "Trading" as category labels
- ❌ "Services" as a primary customer-facing desk
- ❌ Full wallet addresses (enforced: `5CfTC…3bX9` truncation)
- ❌ "Matterhorn controls your stake / manages your position"
- ❌ Seed phrase, private key, API secret, signed payload in any field
- ❌ "Close position", "Submit order", "Sign transaction" as actions
- ❌ Medical diagnoses, prescriptions, treatment recommendations in Wellness
- ❌ Wellness data in standard exports
- ❌ Hidden memory saves

### Design Tokens

`--desk-*` namespace — 7 categories: backgrounds, borders, brand, text, type (per-desk), sensitivity, status, confidence, actions, nav, layout, shadows, radius, fonts. Full `[data-theme="light"]` overrides confirmed.

### Responsive Behavior

| Viewport | Sidebar | Grid | Tables |
|----------|---------|------|--------|
| ≥1200px | 220px fixed | 3-column | Full |
| 768–1199px | 180px icon+label | 2-column | Scroll |
| <768px | None (bottom tab bar) | 1-column | Scroll + sticky col |

### Wellness Restrictions (Non-Negotiable)

- Toggle default: **Off**
- Sensitivity: Personal or Restricted only — never High
- No medical diagnoses, prescriptions, or treatment recommendations
- No PHI in any field
- No "sync" or "cloud" language
- Local-only notice on every Wellness card
- Wellness excluded from standard exports unless explicit local-only export with warning

---

## What Does NOT Ship in This Spec

The spec deliberately excludes:

- **Server routes and API contracts** — desks are read-only today; execution hooks are future-tense and must not appear in V1 UI
- **Account creation, onboarding, or auth flows** — separate effort
- **Multi-wallet or multi-exchange support** — single-address framing only
- **On-chain transaction simulation or previews** — forbidden for V1
- **Real-time position or price feeds** — data freshness indicators only

---

## Files Delivered

```
docs/ui/matterhorn-desk-system/
├── README.md              ← spec index (screen inventory, tokens, states, forbidden patterns)
├── index.html             ← 9-screen prototype (dark + light theme toggle)
├── styles.css             ← --desk-* token system (dark + light mode)
└── stitch-prompts.md      ← Stitch prompt pack (10 prompts)

docs/handoffs/
└── minimax-matterhorn-desk-system-handoff.md   ← this file

scripts/
└── minimax-desk-system.test.mjs   ← gate: existence + 9 screens + tokens + safety + forbidden patterns + responsive
```

**Gate coverage:**
- File existence (5 files)
- All 9 screen IDs present
- Token namespace coverage (--desk-bg, --desk-type-bittensor, etc.)
- Safety strip presence per desk
- Forbidden pattern absence (11 patterns)
- Responsive rules (3 breakpoints)
- Light mode toggle functional

---

## Open Questions for Kimi

1. **Wellness opt-in timing** — Wellness defaults Off. When should the first prompt to enable it appear? After first wellness-related chat? Never in-app (Settings only)?

2. **Memory desk first-run state** — "No memories yet" empty state suggests a tooltip tour. Should that be in V1 or backlog?

3. **MCP desk scope** — The MCP desk shows tools and their scope. Does "External signer required" (amber status) need a tooltip explaining what that means for the user?

4. **Delegation address truncation** — We enforce `5CfTC…3bX9` SS58 truncation. Is there a policy decision needed on whether the user can expand to see the full address in a copy-able field (with a warning), or is truncation permanent?

---

## Prior Art

- PR #522/524: Memory Suggestion Lifecycle UX spec — merged to dev
- PR #532: Memory Suggestion Lifecycle + QA checklist — open
- `docs/ui/matterhorn-memory/styles.css` — Memory UI token system (merged)
- `docs/ui/matterhorn-memory/index.html` — Memory UI prototype (merged)
- Gate pattern: `scripts/minimax-memory-ui.test.mjs` — all PASS

---

## Gate Status

`pnpm test:minimax-desk-system` → **Pending** (gate written, not yet run)

---

## What Happens Next

1. This PR reviewed and merged
2. Stitch picks up `stitch-prompts.md` for production design
3. Codex implements each desk against the gate + Stitch prompts
4. Gate runs in CI on each desk PR
5. Desk system ships desk-by-desk, not all-at-once
