# Google Stitch Prompts — Matterhorn Work UX Refresh

Use these prompts with Google Stitch to generate redesign proposals for each surface. Each prompt is self-contained, references the design system, and includes the safety constraints that must be preserved in any redesign.

---

## Design System Reference (include in every prompt)

**Brand:**
- Name: Matterhorn Work
- Font: Aeonik-style (geometric, clean sans-serif; fallback: Inter)
- Colors: `#0C0C0C` background, `#D1F2FF` accent (Matterhorn blue), `#F0F0F0` text
- Tone: premium, calm, trustworthy, non-custodial, chat-first
- Logo mark: geometric mountain peak SVG

**Design principles:**
- Chat is the primary surface — panels, cards, and artifacts are secondary
- Every preview/action card must show a "No submit" or "External signer required" safety marker
- Wellness cards must show the mandatory fitness disclaimer
- No aggressive trading-terminal aesthetic — no dense grids, no flashing data

---

## 1. Chat Composer + Transcript

**Prompt:**

> Redesign the main chat interface for Matterhorn Work, a chat-first desktop app.
>
> **What it does:** Users send prompts and receive responses. Responses may include inline data cards (wallet info, market data, wellness plans). The composer is at the bottom of the screen.
>
> **Design system:** Dark theme. Background `#0C0C0C`, surface `#141414`, accent `#D1F2FF` (Matterhorn blue). Font: Aeonik-style geometric sans-serif. Premium, calm, trustworthy — not a Bloomberg terminal.
>
> **Requirements:**
> - Chat transcript is the primary area — clean, readable, with good line-height
> - User messages on the right (accent-tinted bubble), assistant on the left
> - Composer has a text input and send button — minimal, not cluttered
> - When a data card appears in the transcript, it should flow naturally between messages, not feel like a popup interrupt
> - The sidebar on the left shows: Chat, Crypto (Beta), Wellness, Workflows, History, Settings
> - Sidebar shows a green "All systems ready" status dot at the bottom
> - Prompt chips at the top of a new session: "Show my TAO", "Compare validators", "BTC orderbook", "Polymarket market", "Training plan", "Customer workflow" — these are clickable suggestions, not a command bar
>
> **Safety:** No submit buttons in the chat area. Cards may show preview-only badges. No aggressive "trade now" CTAs.
>
> Generate a desktop-width layout (1280px).

---

## 2. Crypto Side Panel

**Prompt:**

> Redesign the crypto side panel for Matterhorn Work, a chat-first desktop app.
>
> **What it does:** The panel slides in from the right and gives structured access to Bittensor, Hyperliquid, and Polymarket. It is a secondary surface — it should complement the chat, not replace it.
>
> **Design system:** Dark theme. Background `#0C0C0C`, surface `#141414`, elevated `#1C1C1C`. Accent `#D1F2FF`. Font: Aeonik-style geometric sans-serif. Premium and calm.
>
> **Requirements:**
> - Four tabs at the top: Bittensor (📡), Hyperliquid (📊), Polymarket (🔮), Workflows (⚡)
> - Each tab shows: a one-line readiness status (green = beta ready, yellow = preview-only, gray = planned), and a small set of "Ask" prompt chips
> - Bittensor tab: show a mini wallet card with balance, staked amount, and a "Read-only" badge
> - Hyperliquid tab: show position summary with "Preview only" badge
> - Polymarket tab: show market summary with "US compliance informational" amber callout
> - Workflows tab: show the wellness creator and other workflow cards with "Planned" badges on service hooks
> - A persistent footer: "Matterhorn is non-custodial. Preview only. No live trading."
>
> **Safety:** Every venue tab must show its execution boundary (beta-ready, preview-only, or planned). No submit buttons. No "trade now" copy.
>
> Generate a 300px-wide panel layout.

---

## 3. Empty Session Starter

**Prompt:**

> Redesign the empty session screen for Matterhorn Work, a chat-first desktop app.
>
> **What it does:** When a user opens a new workspace or clears their chat, this screen appears. It greets the user and helps them discover what to ask — without requiring any prior knowledge of Web3.
>
> **Design system:** Dark theme. Background `#0C0C0C`, surface `#141414`. Accent `#D1F2FF` (Matterhorn blue). Font: Aeonik-style geometric sans-serif. Premium and calm.
>
> **Requirements:**
> - Greeting area: "Good afternoon. What would you like to explore?" with a subtle time-of-day greeting
> - Prompt chips section: 6 chips with icons — "📡 Show my TAO", "⚖️ Compare validators on subnet 14", "📊 Show Hyperliquid BTC orderbook", "🔮 Summarize a Polymarket market", "💪 Create a 4-week training plan", "🔗 Build a customer onboarding workflow"
> - Quick-start grid: 4 cards — Bittensor, Hyperliquid, Polymarket, Wellness — each with an icon, title, and one-line description
> - A subtle safety callout box at the bottom: "🔒 Matterhorn never asks for your seed phrase, private key, or API secret."
> - The chat composer is visible at the bottom, ready for input
> - The sidebar shows: Chat, Crypto, Wellness, Workflows, History, Settings
>
> **Safety:** The safety callout must be present and clearly visible. No "start trading" language.
>
> Generate a full desktop-width layout (1280px).

---

## 4. Workflow Artifact Cards

**Prompt:**

> Redesign the workflow artifact card for Matterhorn Work, a chat-first desktop app.
>
> **What it does:** When a user completes a wellness creator workflow (e.g., "Create a 4-week strength plan"), Matterhorn generates a card that lists the produced artifacts: weekly plan, video script, checklist, progress tracker, etc. The card appears inline in the chat transcript.
>
> **Design system:** Dark theme. Background `#0C0C0C`, surface `#141414`, elevated `#1C1C1C`. Accent `#D1F2FF`. Font: Aeonik-style geometric sans-serif. Premium and calm.
>
> **Requirements:**
> - Card header: icon (💪), title ("4-Week Strength Plan — Client: Alex"), and an "Artifact Generated" blue badge
> - Artifact list: each row shows an icon, artifact name, file type, generation timestamp, and a "View" ghost button
> - Artifacts should feel like files — not actions
> - A "Service Hooks" section below the artifacts, with 4 rows (Storage, Email, Payments, Token Gating) — each with an icon, name, one-line description, and a "Planned" muted badge
> - A mandatory disclaimer banner at the bottom in blue-tinted info style: "⚠ This content is for general fitness education only. It is not medical advice, diagnosis, or treatment. Consult a qualified healthcare professional."
> - The card should feel calm and trustworthy — not like a checkout flow
>
> **Safety:** No payment processing UI. No "buy now" or "subscribe" buttons. The service hooks are labeled "Planned." The disclaimer must be present and styled as informational — not alarming.
>
> Generate a card layout ~480px wide.

---

## 5. Bittensor Data Cards

**Prompt:**

> Redesign the Bittensor wallet and validator comparison card for Matterhorn Work, a chat-first desktop app.
>
> **What it does:** Appears inline in the chat transcript. Shows wallet balance, stake breakdown, validator comparison, and a staking preview — all read from public chain data.
>
> **Design system:** Dark theme. Background `#0C0C0C`, surface `#141414`, elevated `#1C1C1C`. Accent `#D1F2FF`. Font: Aeonik-style geometric sans-serif. Premium and calm — not a trading terminal.
>
> **Requirements:**
> - Card header: "📡 Bittensor Wallet" with a green "Beta Ready" badge and the SS58 address in monospace
> - Stat grid: 3 cells — "312.4 TAO" balance (large, accent colored), "148.2 TAO" staked, "+2.1%" 30-day return (green)
> - Validator comparison table below: columns — Validator (truncated address), Trust (badge: High/Med), Stake, 30d Return, Commission. Rows styled cleanly with hover state.
> - A prominent "⚠ External signer required" green banner at the bottom: "Read-only. Staking requires your external wallet signer. Matterhorn will not sign, submit, or broadcast."
> - The banner should be styled as a confirmation, not a warning — it's a feature, not a limitation
>
> **Safety:** The "External signer required" banner must be prominent and green/success-tinted. No submit button. No "Stake now" CTA. No seed phrase fields.
>
> Generate a card layout ~500px wide.

---

## 6. Hyperliquid + Polymarket Preview Cards

**Prompt:**

> Redesign the Hyperliquid and Polymarket preview cards for Matterhorn Work, a chat-first desktop app.
>
> **What it does:** Two cards that appear in the chat transcript. Hyperliquid shows position data and an orderbook snapshot. Polymarket shows market data, odds, and a bet preview. Both are preview-only — no submission.
>
> **Design system:** Dark theme. Background `#0C0C0C`, surface `#141414`, elevated `#1C1C1C`. Accent `#D1F2FF`. Font: Aeonik-style geometric sans-serif. Premium and calm.
>
> **Hyperliquid card requirements:**
> - Header: "📊 BTC/USDC — Your Position" with a "Long" yellow badge and a "Preview Only" green badge
> - Stat grid: Size (0.15 BTC), Entry ($64,280), Unrealized PnL (+$312 in green), Margin (18.4%)
> - Orderbook section: visual bid/ask bars with prices and sizes — clean, not cluttered. Spread indicator between bids and asks.
> - "Can Submit: No · External signer required for any order" green banner at bottom
> - No API key prompt. No submit button.
>
> **Polymarket card requirements:**
> - Header: "🔮 Polymarket Market" with the market question in bold
> - Stat grid: Yes price (42¢), No price (58¢), Volume ($2.4M)
> - Liquidity, end date, market ID rows
> - Amber compliance block: "🌐 US Compliance — Informational Only. This market may not be accessible to US persons. Compliance status is not legal advice."
> - Bet preview section: Stake, Price, Est. fee, Potential payout — with a "Preview only" warning badge
> - "No Polymarket API key required · Preview only in beta" green banner at bottom
>
> **Safety:** No "Place bet" or "Submit order" button. Compliance is informational amber, not red-blocker. Beta/preview badges on all action-oriented elements.
>
> Generate two side-by-side cards ~480px each.

---

## How to Use These Prompts

1. Open [Google Stitch](https://stitch.withgoogle/) (or the equivalent Google AI design tool)
2. Paste the design system reference block at the top of the prompt
3. Paste one surface prompt below it
4. Review the generated design — check that:
   - Safety banners are present and styled positively (green/blue, not red alerts)
   - No submit buttons appear on preview-only cards
   - The disclaimer appears on the Wellness card
   - Compliance blocks are informational amber, not blocking red
   - Chat remains the primary surface in the full-layout screens
5. Export the design as PNG/SVG and save to `docs/ui/matterhorn-customer-ux-refresh/stitch-output/`
6. Note any deviations from the design system in a `NOTES.md` file in the same directory
7. Report the output to the Matterhorn team for review before any production code is written

---

## Constraints for All Prompts

- No submit buttons, "place bet" CTAs, or "trade now" language on any card
- Wellness disclaimer must appear on every wellness artifact card
- "External signer required" / "Preview only" banners must be green-tinted (success/info, not danger)
- Compliance blocks must be amber-tinted (informational, not blocking)
- Service hooks in Wellness must always be labeled "Planned" — never "Available" or "Live"
- No seed phrase, private key, or API secret input fields in any screen
- Font: Aeonik-style geometric sans-serif — no decorative fonts, no script fonts
- No aggressive data visualization (no candlestick charts, heatmaps, or terminal-style grids)
