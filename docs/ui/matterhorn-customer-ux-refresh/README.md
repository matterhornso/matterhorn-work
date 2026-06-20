# Matterhorn Work — Customer UX Refresh

**Version:** 1.0
**Purpose:** Production-ready design spec and HTML prototype for the Matterhorn Work customer-facing UI
**Brand:** `#0C0C0C` background · `#D1F2FF` accent · Aeonik-style font · Premium calm tone

---

## What This Is

This package delivers a complete customer-facing UI design refresh for Matterhorn Work's market execution features:

- **Product UI System** (`docs/ui/matterhorn-product-ui-system.md`) — the canonical design spec
- **HTML Prototype** (`index.html`) — a 16-screen interactive showcase
- **Design System CSS** (`styles.css`) — production-ready CSS with custom properties
- **Stitch Prompts** (`stitch-prompts.md`) — Stitch AI agent prompts for implementation

## The 16 Screens

| # | Screen | Key Safety States |
|---|---|---|
| 01 | Welcome / Onboarding | No execution UI |
| 02 | Main Dashboard | Safety mode badge in stats |
| 03 | Markets Browser | Green (Hyperliquid live) / Blue (Polymarket planned) |
| 04 | Market Detail | Orderbook + chart read-only, preview only |
| 05 | Order Preview | `canSubmit: false` badge · Handoff CTA only |
| 06 | External Signer Handoff | Public terms + handoff SHA + expiry |
| 07 | Portfolio / Positions | Read-only table, blue badges for Polymarket |
| 08 | Activity / Execution Log | Color-coded feed: green/amber/blue |
| 09 | Workflow Builder | Safety badges on every execution node |
| 10 | Workflow Run Panel | Step-by-step, amber for "awaiting user" |
| 11 | Settings: Markets | Safety mode selector, no credentials |
| 12 | Settings: Notifications | Toggle rows per alert type |
| 13 | Documentation Hub | Safety & Compliance section included |
| 14 | Market Safety Explainer | Architecture diagram + FAQ |
| 15 | Artifacts / Evidence Panel | Per-artifact safety badges |
| 16 | Settings: General | Wallet address, sign out |

## Safety States

The UI uses four safety badge variants throughout:

- **Green** (`--mh-green`, `#22C55E`) — External signer live. The user signs and submits using their own wallet. Matterhorn is non-custodial.
- **Amber** (`--mh-amber`, `#F59E0B`) — Compliance restricted or review needed. The action is blocked and the reason is shown.
- **Blue** (`--mh-blue`, `#3B82F6`) — Planned or not yet live. The feature exists in the UI but is not yet active.
- **Red** (`--mh-red`, `#EF4444`) — Error or receipt rejected. Used only for explicit failure states.

## What the UI Must Never Show

Per the design system anti-patterns:

1. No **"Submit Order"** or **"Confirm Trade"** buttons
2. No API key input fields for any venue
3. No private key, seed phrase, or mnemonic input fields
4. No **"Sign Transaction"** buttons that invoke Matterhorn as a signer
5. No custody messaging ("your funds are safe with Matterhorn")
6. No **"Connect to Exchange"** actions implying direct API connections
7. No **"Live Trading"** toggles that enable `canSubmit: true`
8. No OpenWork or OpenCode branding in any UI surface
9. No jurisdiction bypass fields
10. No signature paste fields in the receipt import UI

## Running the Prototype

Open `index.html` in a browser. The prototype is a self-contained showcase with navigation between all 16 screens. CSS is loaded via the `styles.css` relative path.

```bash
open docs/ui/matterhorn-customer-ux-refresh/index.html
```

## Design Tokens

See `styles.css` for the full CSS custom property system. Key values:

```css
--mh-bg-base: #0C0C0C
--mh-bg-surface: #141414
--mh-accent: #D1F2FF
--mh-green: #22C55E
--mh-amber: #F59E0B
--mh-blue: #3B82F6
--mh-red: #EF4444
--font-sans: 'Aeonik', system-ui, sans-serif
--font-mono: 'JetBrains Mono', ui-monospace, monospace
```

## Related Documents

- `docs/ui/matterhorn-product-ui-system.md` — full production UI system spec
- `docs/hyperliquid-read-preview.md` — Hyperliquid execution contract
- `docs/market-receipt-qa.md` — receipt import and verification spec
- `docs/market-execution-readiness-security-gate.md` — security gate documentation
- `scripts/market-execution-safety-gate.test.mjs` — safety gate test
