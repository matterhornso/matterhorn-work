# Matterhorn Memory UI System

Design specification for the Matterhorn Memory surface — a local-first, user-controlled memory layer that lets users see, understand, and manage what Matterhorn remembers.

**Brand:** `#0C0C0C` background · `#D1F2FF` accent · JetBrains Mono · Aeonik-style sans
**Tokens:** `docs/ui/matterhorn-memory/styles.css`
**Prototype:** `docs/ui/matterhorn-memory/index.html`

---

## Screens

| # | Screen | Description |
|---|--------|-------------|
| 01 | Memory Overview | App shell with sidebar nav, search, chip bar, card grid |
| 02 | Bittensor Memories | Protocol memories for Bittensor subnet/validator activity |
| 03 | Hyperliquid Memories | Protocol memories for Hyperliquid positions/margin |
| 04 | Polymarket Memories | Prediction market tracking and question memories |
| 05 | Wellness Memories | Goals, streaks, health preferences (Restricted) |
| 06 | Watchlists | Tracked markets, alerts, and bookmarked items |
| 07 | Receipts and Evidence | External signer receipts with SHA-256 fingerprints |
| 08 | Sources and Provenance | Memory attribution table, source legend |
| 09 | Privacy / Forget Center | Toggle controls, forget actions, export |
| 10 | Chat Memory Chips | Inline chip bar, chip variants, action buttons |
| 11 | Mobile Memory | Compact mobile layout (dark + light) |
| 12 | Empty / Loading States | Skeleton cards, empty state |
| 13 | Secret / Disabled States | Restricted memory, memory disabled, source unavailable |

---

## Required Memory Card Fields

Every memory card displays:

| Field | Description |
|-------|-------------|
| **Title** | Memory description (what is remembered) |
| **Type** | Fact · Preference · Context · Protocol · Wellness |
| **Scope** | Global · Workspace · Session |
| **Source** | On-chain · Chat · Documentation · Market data · Wellness workflow |
| **Confidence** | 3-segment bar (high ≥ 80%, medium 50–79%, low < 50%) |
| **Last updated** | Relative timestamp |
| **"Why remembered?"** | One-line explanation of the trigger |
| **Actions** | Use · Edit · Export · Forget |
| **Sensitivity badge** | Personal · High · Restricted |

---

## Safety / Forbidden Patterns

Matterhorn Memory is a **trust feature**. The following must NEVER appear in any UI surface:

- Implying hidden or background memory surveillance
- Storing or displaying seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports
- Storing medical diagnoses or PHI without explicit local-only disclosure
- Claiming memory is encrypted in a way that implies Matterhorn holds keys
- Implying memories are synced to cloud or shared with third parties without explicit user action
- Using "Remember" language that implies passive background recording without user action

---

## Chat Memory Chips

| Chip | Label | When Shown |
|------|-------|------------|
| Active | "Using N memories" | Memories are being applied to the current response |
| Memory | "[title]" | A single memory is referenced |
| Count | "×N" | Multiple memories of the same type are in use |
| Remember | "Remember this" | User action to save current context |
| Do Not Remember | "Do not remember" | User action to suppress memory |
| Forget | "Forget related" | User action to remove related memories |

---

## Design Token Reference

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--mm-bg-base` | `#0C0C0C` | `#F5F5F5` | Page background |
| `--mm-bg-surface` | `#141414` | `#FFFFFF` | Cards, panels |
| `--mm-bg-elevated` | `#1E1E1E` | `#EBEBEB` | Input backgrounds |
| `--mm-accent` | `#D1F2FF` | `#2563EB` | CTA, active states |
| `--mm-conf-high` | `#22C55E` | `#16A34A` | Confidence ≥ 80% |
| `--mm-conf-medium` | `#F59E0B` | `#D97706` | Confidence 50–79% |
| `--mm-conf-low` | `#EF4444` | `#DC2626` | Confidence < 50% |
| `--mm-type-fact` | `#D1F2FF` | `#2563EB` | Fact type badge |
| `--mm-type-preference` | `#C084FC` | `#9333EA` | Preference badge |
| `--mm-type-context` | `#34D399` | `#059669` | Context badge |
| `--mm-type-protocol` | `#60A5FA` | `#2563EB` | Protocol badge |
| `--mm-type-wellness` | `#F472B6` | `#DB2777` | Wellness badge |
| `--mm-sens-personal` | `#D1F2FF` | `#2563EB` | Personal sensitivity |
| `--mm-sens-high` | `#F59E0B` | `#D97706` | High sensitivity |
| `--mm-sens-restricted` | `#EF4444` | `#DC2626` | Restricted (Wellness) |
