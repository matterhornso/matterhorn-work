# Matterhorn Desk System — Stitch Prompt Pack

**Version:** 1.0
**Audience:** Stitch (design team)
**Purpose:** Guide production design for the Matterhorn Desk System.
**Context:** Based on `docs/ui/matterhorn-desk-system/index.html` (prototype), `README.md`, and the full Memory UI token system in `docs/ui/matterhorn-memory/styles.css`.

**Design system:** Dark mode primary. Brand: `#0C0C0C` / `#D1F2FF`. Fonts: JetBrains Mono + Aeonik-style sans-serif. Aeonik is the preferred sans-serif; fall back to system-ui if unavailable.

---

## Prompt 1: Desk Launcher (Home)

Design the desk launcher — the home screen showing all available desks as clickable cards.

**Requirements:**
- 3-column card grid on ≥1200px, 2-column on 768–1199px, 1-column on mobile
- Each card: desk icon (emoji, 40×40px), desk name, 1–2 sentence description, status indicator (green=active, amber=stale, gray=inactive), quick-stat badges
- Hover: lift (translateY -2px) + border color shifts to desk accent
- Active/current desk card: subtle accent border
- Bottom: no right rail — cards fill available space, no overflow

**Desk cards to include:**
1. Bittensor — subnet intelligence, validator preferences, stake planning
2. Hyperliquid — perpetual positions, margin preferences, funding alerts
3. Polymarket — tracked prediction markets, resolution criteria
4. Wellness — goals, streaks, check-ins, local-only
5. Memory — confirmed memories, context chips, suggestion inbox
6. MCP — tool registry, agent capability matrix

**Forbidden:**
- No "Crypto" or "DeFi" as a category label
- No "Services" as a primary customer desk
- No hidden signing, custody, or seed phrase UI

**Empty state:** All desks available — no empty state needed for launcher.
**Error state:** Amber banner "Some desk data is unavailable" + retry button.

---

## Prompt 2: Bittensor Desk

Design the Bittensor desk workspace.

**Requirements:**
- SubNav: Overview / Subnets / Validators / Delegations
- Content area: stat tiles (Total stake TAO, Active validators, Delegation ceiling, Last sync) + data table
- Safety strip: "🔗 Read-only. Public Subtensor data only. No private keys, seed phrases, or signing capabilities."
- Memory chip bar: active Bittensor memories applied to session
- Confidence bar: 3-segment (green ≥80%, amber 50–79%, red <50%)

**Data displayed:**
- Stat tiles: numerical values with label + sub-label
- Table: Subnet name, Your stake (TAO), Confidence, Delegation address, Status
- Wallet addresses: always truncated `5CfTC…3bX9` — never full address

**Forbidden:**
- "Matterhorn controls your stake"
- "Your hot key" / "your signing key"
- Full wallet address
- Seed phrase or private key fields
- "Sign" / "Submit" / "Execute" on-chain

**States:** Default, Loading (skeleton tiles), Error (amber banner "Subtensor data unavailable — showing cached values from N hours ago"), Empty (no subnets configured).

---

## Prompt 3: Hyperliquid Desk

Design the Hyperliquid desk workspace.

**Requirements:**
- SubNav: Positions / Alerts / Preferences
- Content: position tiles + stat tiles + confidence bars
- Safety strip: "📖 Preview only. Read-only account data via Hyperliquid Info API. No API keys, no signing, no order placement."
- Memory chip bar: active Hyperliquid memories

**Data displayed:**
- Position tile: asset (BTC-PERP), side (Long/Short), size, entry price, confidence bar
- Stat tiles: Leverage ceiling, Margin mode, Funding alert thresholds
- Alert list: asset, threshold, active/inactive

**Forbidden:**
- "Close position" / "Submit order" / "Place trade"
- Position values implying live execution
- Hyperliquid API key or secret key exposure
- "Matterhorn manages your position"

**States:** Default, Loading, Error, Empty (no positions — "No positions detected. Set a leverage ceiling to begin tracking.").

---

## Prompt 4: Polymarket Desk

Design the Polymarket desk workspace.

**Requirements:**
- Filter bar: All / Binary / Scalar / High volume
- Tracked market card grid: question text, probability, volume, confidence bar, source chip, "Why tracked" callout
- Safety strip: "📖 Preview only. Read-only browsing data. No bet placement, no CLOB credentials."
- Memory chip bar: active Polymarket memories

**Card anatomy:**
- Market question (title, 2-line max)
- Probability badge (%)
- Volume badge (e.g., "$1.2M")
- Source chip (⚡ Chat · 2 days ago)
- "Why tracked" block (left border accent, plain English, cites trigger + time window)
- Actions: View market (external), Remove from tracking

**Forbidden:**
- "Place bet on your behalf"
- CLOB credentials
- Bet amounts or "your position"
- Polymarket API secret

**States:** Default, Loading, Empty ("No markets tracked yet. Markets you view in Chat will appear here automatically."), Error.

---

## Prompt 5: Wellness Desk

Design the Wellness desk workspace — restricted, opt-in, local-only.

**Requirements:**
- Wellness toggle prominently at top: "Allow wellness memory suggestions" — default Off. Links to Privacy & Forget Center.
- Safety strip: "🔒 Stored locally only. Never sent to external servers. No wellness data in exports or receipts."
- Content: goal cards + streak display + check-in form
- Wellness disabled empty state (when toggle is off)
- Local-only notice on every Wellness card

**Wellness card anatomy:**
- Goal title (semibold, 2-line max)
- Streak badge: "7-day streak 🔥"
- Confidence bar
- "Why remembered" callout
- Actions: Check in, Edit, Forget (red ghost)
- Local-only notice: "🔒 Stored locally only"

**Safety constraints (non-negotiable):**
- Sensitivity: Personal or Restricted — never High
- No medical diagnoses ("diabetes", "hypertension", "depression")
- No prescription references
- No treatment recommendations ("try this medication")
- No "sync" or "cloud" language
- Educational framing only: "You completed 4 morning yoga sessions this week" — not "Your cortisol levels indicate burnout"

**States:** Default (toggle on), Disabled (toggle off — empty state with CTA to Privacy Center), Loading, Error.

---

## Prompt 6: Memory Desk

Design the cross-desk memory overview.

**Requirements:**
- Header: desk icon + title + bell badge (suggestion inbox count) + actions (New memory, Export)
- Memory chip bar: active memories applied to current session, per-desk color coding
- Filter chips: All / Bittensor / Hyperliquid / Polymarket / Wellness / General
- Card grid: memory cards sorted by recency

**Memory card anatomy:**
- Title (semibold, 2-line max)
- Type badge + Sensitivity badge + Source chip
- Confidence bar
- "Why remembered" callout (plain English, cites trigger + time window)
- Actions: Use, Edit, Export, Forget

**Wellness cards:** Local-only notice always visible. Export button absent.

**States:** Default, Loading (skeleton cards), Empty ("No memories yet. Start chatting and Matterhorn will surface suggestions."), Error.

---

## Prompt 7: MCP Desk

Design the MCP (Model Context Protocol) desk.

**Requirements:**
- Tool registry table: Tool name / Agent / Status / Scope / Actions
- Safety strip: "🔌 MCP tools run locally. No credentials stored in Matterhorn. Access scoped to configured permissions."
- Add MCP server button
- Status badges: Active (green), Inactive (gray), External signer required (amber)

**Scope column:** Describes exactly what the tool can read or do — never implies execution capability unless explicitly configured by the user.

**States:** Default, Loading, Empty ("No MCP servers configured. Add a server to extend Matterhorn's capabilities."), Error.

---

## Prompt 8: Settings & Profile

Design the Settings screen.

**Requirements:**
- Profile header: avatar, name, email, member since, memory count badge, desk count badge
- SubNav: Desk Preferences / Privacy & Forget / Memory Settings / Notifications / Security
- Desk preference toggles: one row per desk, toggle + desk name + brief state
- Privacy controls: Allow memory suggestions (global), Allow wellness memory suggestions (local-only)
- Forget all: red button → multi-step confirmation (Are you sure? / Cannot be undone / Type "FORGET" to confirm)
- No pre-filled confirmation fields

**Desk toggles:** All on by default except Wellness. Toggling a desk off hides it from the launcher and nav.

---

## Prompt 9: Mobile Desk Navigation

Design the mobile bottom tab bar and mobile-adapted desk layouts.

**Requirements:**
- Bottom tab bar: 5 tabs (Home, Bittensor, Hyperliquid, Wellness, More/Settings)
- Active tab: accent color icon + label
- Inactive: muted icon + label
- Fixed position, 56px height, above safe area
- No right-edge overflow on any card

**Mobile desk layouts:**
- Desk launcher: 1-column card list, full-width
- Desk content: 1-column, stat tiles stacked
- Tables: horizontal scroll with first column sticky
- Cards: no right rail trap — full-width, no content overflow
- Composer: always visible above keyboard (fixed position)

**Responsive breakpoints:**
- ≥1200px: full sidebar, 3-column grid
- 768–1199px: 180px sidebar, 2-column grid
- <768px: no sidebar, bottom tab bar, 1-column

---

## Prompt 10: Desk System — Visual System & Dark/Light Mode

Finalize the visual system for the desk system.

**Requirements:**
- Confirm all `--desk-*` CSS tokens from `styles.css` have clean `[data-theme="light"]` overrides
- Confirm the accent: `#D1F2FF` dark / `#2563EB` light
- Confirm all 6 desk type colors have consistent light mode tints
- No brand bleed: the desk accent never appears as a background on white in dark mode
- Wellness accent: `#F472B6` — confirm this meets 4.5:1 contrast on both `#0C0C0C` and `#FFFFFF`
- Confidence bars: confirm color meets accessibility requirements
- Focus rings: `:focus-visible` ring in `--desk-accent` on all interactive elements

**Confirm checklist:**
- [ ] All `--desk-*` tokens have light mode overrides
- [ ] Accent contrast ≥ 4.5:1 on both themes
- [ ] Wellness accent readable on both backgrounds
- [ ] Confidence bar colors readable on both backgrounds
- [ ] Focus rings present on all interactive elements
- [ ] No jarring color transitions between themes

---

## Anti-Patterns Checklist — Desk System

Before shipping, confirm:

**Navigation:**
- [ ] "Services" is NOT a primary customer-facing desk
- [ ] No "Crypto" or "DeFi" category labels anywhere
- [ ] Desk launcher has a Home entry (not just a logo)

**Bittensor:**
- [ ] No full wallet address shown
- [ ] No "Matterhorn controls your stake" or "Matterhorn manages delegation"
- [ ] No seed phrase or private key fields
- [ ] Safety strip present and accurate

**Hyperliquid:**
- [ ] No "close position", "submit order", "place trade" language
- [ ] No Hyperliquid API key or secret key fields
- [ ] Position data framed as context, not financial advice
- [ ] Safety strip present and accurate

**Polymarket:**
- [ ] No bet amounts, no "your position on Polymarket"
- [ ] No CLOB credentials or signed payloads
- [ ] "Tracked" means read-only browsing action
- [ ] Safety strip present and accurate

**Wellness:**
- [ ] Toggle default is Off
- [ ] No medical diagnoses, prescriptions, treatment advice
- [ ] Local-only notice on every Wellness card
- [ ] No "sync" or "cloud" language
- [ ] Wellness absent from exports unless explicit local-only export
- [ ] Sensitivity is Personal or Restricted (never High)

**Memory:**
- [ ] No "Crypto" category label
- [ ] No hidden saves (all memory is visible in the Memory desk)
- [ ] Forget is always available on every card

**MCP:**
- [ ] No credentials stored in Matterhorn — scoped to local environment
- [ ] Scope column accurately describes tool capabilities

**Responsive:**
- [ ] No right rail overflow on any viewport
- [ ] Mobile composer always visible above keyboard
- [ ] Bottom tab bar fixed, 56px, correct tabs
