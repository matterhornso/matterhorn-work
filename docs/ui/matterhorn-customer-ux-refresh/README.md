# Matterhorn Work — Customer UX Refresh Prototype

A static UI/UX prototype for the Matterhorn Work customer-facing desktop app. This prototype lives under `docs/ui/matterhorn-customer-ux-refresh/` and does not touch production app code.

## What's Here

```
matterhorn-customer-ux-refresh/
├── README.md          — UX direction, design system, and screen inventory
├── index.html         — Interactive multi-screen static prototype
├── styles.css         — Design system styles (no build tooling required)
└── stitch-prompts.md  — Prompts for Google Stitch to redesign key surfaces
```

Open `index.html` directly in a browser to explore all screens. Use browser DevTools to test desktop (1280px) and narrow (375px) viewports.

---

## UX Direction

**Chat-first, calm, premium.** Matterhorn Work is not a trading terminal. It is a trusted companion for people who want to explore Web3 and real-world workflows without needing to understand the internals. The UI should feel like a premium writing tool crossed with a thoughtful assistant — not a Bloomberg terminal.

**Core principle:** every action a user takes begins and ends with chat. Cards, panels, and artifacts are secondary surfaces that clarify and confirm, never the primary interface.

---

## Design System

### Colors

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#0C0C0C` | App background |
| `--bg-surface` | `#141414` | Card / panel background |
| `--bg-elevated` | `#1C1C1C` | Hover, selected, elevated surfaces |
| `--border` | `#2A2A2A` | Subtle dividers |
| `--border-accent` | `#D1F2FF33` | Accent-tinted borders |
| `--accent` | `#D1F2FF` | Matterhorn blue — CTAs, links, highlights |
| `--accent-dim` | `#D1F2FF40` | Accent at 25% — glows, fills |
| `--text-primary` | `#F0F0F0` | Primary text |
| `--text-secondary` | `#888888` | Secondary / metadata |
| `--text-muted` | `#555555` | Placeholders, disabled |
| `--success` | `#34D399` | Ready states, confirmations |
| `--warning` | `#FBBF24` | Caution, partial states |
| `--danger` | `#F87171` | Errors, safety alerts |

### Typography

- **Primary font:** `Inter` (substitute: `Aeonik` when available — load via `@font-face` if bundled)
- **Weights:** 400 body, 500 medium, 600 semibold, 700 bold
- **Scale:** 11px caption, 13px small, 15px body, 18px heading-sm, 24px heading, 32px display

### Spatial System

- Base unit: 4px
- Component padding: 12–16px
- Card padding: 20–24px
- Section gap: 32–48px
- Border radius: 8px cards, 12px modals, 24px pills/chips

### Motion

- Transition duration: 150ms ease-out (micro), 250ms ease-out (panels), 400ms ease-out (modals)
- No gratuitous animation — motion communicates state, not personality
- Entrance: fade + translate-y(8px → 0)

---

## Screen Inventory

| Screen | File location | Description |
|---|---|---|
| First-run welcome | `index.html` — screen 1 | Brand hero, value prop, safety copy, CTA |
| Create workspace | `index.html` — screen 2 | Session naming, icon picker, template gallery |
| Empty session starter | `index.html` — screen 3 | Prompt library chips, recent sessions, quick actions |
| Main chat | `index.html` — screen 4 | Full-width chat with crypto side panel open |
| Crypto side panel | `index.html` — screen 5 | Bittensor/Hyperliquid/Polymarket tabs, ready status |
| Bittensor wallet card | `index.html` — card 1 | Balance, stake, validator table |
| Hyperliquid preview card | `index.html` — card 2 | Exposure, preview-only, no submit badge |
| Polymarket compliance card | `index.html` — card 3 | Market summary, compliance state, bet preview |
| Wellness artifact card | `index.html` — card 4 | Program plan with disclaimer, artifact list |

---

## Prompt Chips

These chips appear in the empty session starter and guide users toward the most valuable first experiences:

| Chip | Prompt |
|---|---|
| `📡` Show my TAO | `Show my TAO for 5DSf...` |
| `⚖️` Compare validators | `Compare validators on subnet 14` |
| `📊` Hyperliquid orderbook | `Show the BTC orderbook on Hyperliquid` |
| `🔮` Polymarket market | `Summarize this Polymarket market: <market-id>` |
| `💪` Training plan | `Create a 4-week strength plan for my client` |
| `🔗` Workflow | `Build a customer onboarding workflow` |

---

## Safety Boundaries in the UI

The prototype includes visual markers for safety states that must be preserved in production:

- **No-submit badge** — every Hyperliquid and Polymarket card shows "Can Submit: No" or "External Signer Required"
- **Safety disclaimer** — every Wellness artifact card shows the mandatory non-medical disclaimer
- **Beta banner** — first-run and empty-session screens show the desktop beta boundary
- **No secrets warning** — the empty session starter shows copy explaining that Matterhorn never asks for seed phrases or private keys

---

## Constraints

- This prototype is design/spec only — it does not connect to any backend, API, or wallet
- No live submission, custody, signing, or secret handling is depicted or implied
- Hyperliquid and Polymarket flows are labeled preview-only throughout
- Wellness flows are labeled artifact-only with planned-not-live service hooks
- Decentralized services are labeled future-contract only
- No real font files are bundled — the prototype uses Inter from Google Fonts as a stand-in for Aeonik

---

## Verification

```bash
# Open in browser (no server needed):
open docs/ui/matterhorn-customer-ux-refresh/index.html

# Market safety gate:
pnpm test:market-execution-safety-gate
```

---

## Handoff to Next Agent

The next agent should:
1. Use `stitch-prompts.md` to generate redesign proposals from Google Stitch
2. Integrate approved Stitch output into the production app at `apps/app/src/`
3. Ensure all cards and panels match the safety markers in this prototype
4. Preserve the chat-first hierarchy — chat is the primary surface, panels are secondary
