# Monday Beta UI Implementation Punch List

**Doc version:** 1.0
**Date:** 2025-01-06
**Source:** `docs/handoffs/minimax-monday-beta-ux-readiness.md`
**Base SHA:** `185269c` (origin/dev)
**Audience:** Codex, Claude Code, Kimi, Minimax, human implementers

---

## How to Use This Document

Each item is one implementable unit of work. Fields:

| Field | Description |
|---|---|
| **Screen** | Which screen(s) this item affects |
| **Current issue** | What is wrong or missing right now |
| **Desired behavior** | What should be true after the fix |
| **Exact copy** | The literal string(s) to implement. Copy in `code fences` is exact; copy without fences is the intent. |
| **Owner** | Suggested implementation agent |
| **QA screenshot** | File name to capture from the implemented app |
| **Acceptance test** | One-sentence manual or automated verification |

Items are grouped P0 / P1 / P2:

- **P0 — Must fix before Monday customer demos.** These are safety issues, misleading claims, or first-impression blockers.
- **P1 — Should fix during beta.** Polish, clarity, and consistency improvements.
- **P2 — Polish.** Nice-to-have, can land after the Monday beta.

---

## P0 — Must Fix Before Monday Customer Demos

---

### P0-01 — Wrong Safety Badge Color on Protocol Desks

**Screen:** Bittensor Desk (Screen 4), Hyperliquid Desk (Screen 5), Polymarket Desk (Screen 6)

**Current issue:** One or more desks show a green "Live" badge. This is a critical safety misrepresentation — green means external signer is live and Matterhorn is non-custodial. Beta desks are preview-only.

**Desired behavior:** All desks show a blue badge:
- Bittensor: `"Read-Only"`
- Hyperliquid: `"Read-Only"`
- Polymarket: `"Planned — Preview Only"`

**Exact copy:**
```
Badge color: --mh-blue (#3B82F6)
Label (Bittensor/Hyperliquid): "Read-Only"
Label (Polymarket): "Planned — Preview Only"
```

**Owner:** Kimi
**QA screenshot:** `bittensor-desk--safety-strip.png`, `hyperliquid-desk--safety-strip.png`, `polymarket-desk--badge.png`
**Acceptance test:** Open each desk. Verify the badge color is `#3B82F6` (not green). No green badge appears anywhere on any desk.

---

### P0-02 — "Beta-Ready" Badge on Polymarket

**Screen:** Polymarket Desk (Screen 6)

**Current issue:** The Polymarket desk header shows "Beta-ready" — implying the feature is live and usable. It is not live.

**Desired behavior:** Show `"Planned — Preview Only"` in blue.

**Exact copy:**
```
Badge: "Planned — Preview Only"
Color: --mh-blue (#3B82F6)
```

**Owner:** Kimi
**QA screenshot:** `polymarket-desk--badge.png`
**Acceptance test:** Open Polymarket desk. Badge reads "Planned — Preview Only" in blue. Not "Beta-ready".

---

### P0-03 — Safety Strip Absent or Inconsistent on All Desks

**Screen:** Bittensor Desk (Screen 4), Hyperliquid Desk (Screen 5), Polymarket Desk (Screen 6)

**Current issue:** The current header shows multi-line "Can submit: External signer / No" / "Live submission: External signing required / Off". This format is verbose and inconsistent. It may be hidden, collapsed, or absent on some desks.

**Desired behavior:** A single-line, always-visible safety strip in every desk header. Format:
```
Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready
```
This strip must never be hidden, collapsed, or abbreviated on desktop. On mobile, it abbreviates to:
```
Can: No · Live: Off · Ready
```

**Exact copy:**
```
Desktop: "Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready"
Mobile:  "Can: No · Live: Off · Ready"
```
Font: JetBrains Mono, 11px, `--mh-text-tertiary` for labels, `--mh-amber` for "No" and "Off", `--mh-green` for "Ready".

**Owner:** Kimi / Claude
**QA screenshot:** `bittensor-desk--safety-strip.png`, `hyperliquid-desk--safety-strip.png`, `polymarket-desk--safety-strip.png`
**Acceptance test:** Load each desk. The safety strip is visible without scrolling on a 1440px viewport. The strip matches the exact format above. Mobile abbreviation is `Can: No · Live: Off · Ready`.

---

### P0-04 — "Try in Chat" → "Ask in Chat →" (All Venues)

**Screen:** Bittensor Desk (Screen 4), Hyperliquid Desk (Screen 5), Polymarket Desk (Screen 6), Slash Command Menu (Screen 9)

**Current issue:** The CTA to open chat from a desk reads "Try in chat". "Try" implies the feature might not work.

**Desired behavior:** All venue CTAs read "Ask in chat →". Consistent across desks, slash command menu, and any related surface.

**Exact copy:**
```
Label: "Ask in chat →"
Type: Ghost button, right-aligned in the desk shell footer
```

**Owner:** Kimi
**QA screenshot:** `bittensor-desk--actions.png`, `slash-command-menu--venue-section.png`
**Acceptance test:** Open each desk and the slash command menu. Search for any "Try in chat" text. All instances are "Ask in chat →".

---

### P0-05 — AI Sender Label Shows Model Name

**Screen:** Chat Composer and Transcript Cards (Screen 9)

**Current issue:** AI messages display "MiniMax-M2.7" as the sender name. Users see the model name, not the product.

**Desired behavior:** AI messages show "Matterhorn" as the sender. The model name is moved to a tooltip or settings debug view.

**Exact copy:**
```
Sender label (visible): "Matterhorn"
Tooltip / aria-label: "Responded by MiniMax-M2.7"
```

**Owner:** Claude
**QA screenshot:** `chat--transcript-market-card.png`
**Acceptance test:** Send a message in chat. The AI response header reads "Matterhorn", not "MiniMax-M2.7".

---

### P0-06 — "Stop" Button Is Ambiguous

**Screen:** Chat Composer and Transcript Cards (Screen 9)

**Current issue:** The stop button reads "Stop". Ambiguous — does it stop the app? The session?

**Desired behavior:** Button reads "Stop generating". Clear and unambiguous.

**Exact copy:**
```
Label: "Stop generating"
```

**Owner:** Kimi
**QA screenshot:** `chat--loading-state.png`
**Acceptance test:** Trigger a long-running model response. The stop button reads "Stop generating". Hover tooltip, if any, does not say just "Stop".

---

### P0-07 — Services Card Shows "No Services Connected" (Wrong Message)

**Screen:** Empty Session Launch Hub (Screen 3), Services Planned-Not-Live (Screen 8)

**Current issue:** The Services card in the hub shows "No services connected. Connect a service to extend Matterhorn." This implies a configuration action exists when it does not.

**Desired behavior:** Services card shows a blue "Coming soon" badge. Clicking it opens a "Coming Soon" landing state (not an error, not a blank screen).

**Exact copy (hub card):**
```
Card title: "Services"
Card description: "Planned — Extend Matterhorn with external services"
Badge: "Coming soon" (blue, --mh-blue)
Hover tooltip: "Services integration is coming soon."
```

**Exact copy (landing state):**
```
┌─ Services ─────────────────────────────────────────────────────
│ Coming Soon
│
│ Services let you connect Matterhorn to external platforms.
│ Integration is not yet available in this beta.
│
│ [← Back to hub]
└──────────────────────────────────────────────────────────────
```

**Owner:** Kimi
**QA screenshot:** `session-hub--services-coming-soon.png`, `services-coming-soon--desktop.png`
**Acceptance test:** Hover over Services card. Tooltip reads "Services integration is coming soon." Click Services card. Landing state reads "Coming Soon" with no error or blank screen.

---

### P0-08 — Submit / Sign / Confirm Buttons Present in Protocol Desks

**Screen:** Bittensor Desk (Screen 4), Hyperliquid Desk (Screen 5), Polymarket Desk (Screen 6)

**Current issue:** Any submit, sign, confirm, place-order, execute, or live trading button appearing anywhere in a protocol desk is a P0 failure.

**Desired behavior:** Zero such buttons on any desk. All actionable buttons are preview-only ("Preview staking", "Preview redelegate", etc.).

**Exact copy:** N/A — removal. Any button with these labels must be changed or removed:
- "Submit Order" / "Submit" / "Confirm" / "Execute" / "Place Order" / "Sign Transaction" / "Live Trading" → Change to "Preview [action]"
- "Stake" / "Delegate" → Change to "Preview staking" / "Preview delegation"

**Owner:** Kimi / Claude
**QA screenshot:** `bittensor-desk--actions.png`, `hyperliquid-desk--btc-perp.png`, `polymarket-desk--trending.png`
**Acceptance test:** Open each desk. Use browser devtools to search for the strings "submit", "confirm trade", "sign transaction", "place order", "execute" in the desk DOM. Zero matches.

---

### P0-09 — API Key or Seed Phrase Input Fields Present

**Screen:** All screens — global check

**Current issue:** Any input field labeled "API Key", "API Secret", "Private Key", "Seed Phrase", "Mnemonic", or "Wallet Import" in the customer-facing UI is a P0 security and safety failure.

**Desired behavior:** Zero such input fields in any UI surface.

**Exact copy:** N/A — removal. Any `<input>`, `<select>`, or `<textarea>` with these labels must be removed or changed.

**Owner:** Kimi / Claude
**QA screenshot:** `create-workspace--remote-selected.png`, `bittensor-desk--wallet-panel.png`
**Acceptance test:** Search all UI surface code for `api[_-]?key`, `private[_-]?key`, `seed`, `mnemonic`, `wallet[_-]?import` in input field labels. Zero matches in customer-facing surfaces.

---

### P0-10 — Wellness Desk Has a `canSubmit` Strip

**Screen:** Wellness Desk (Screen 7)

**Current issue:** If the Wellness desk incorrectly shows a `canSubmit` safety strip, it implies market execution occurs there. It does not.

**Desired behavior:** Wellness desk has no `canSubmit` strip. No safety strip at all on this desk.

**Exact copy:** N/A — absence. The desk header is:
```
"Wellness"
[Streak counter] [Today's goals] [Weekly overview]
```
No safety strip.

**Owner:** Kimi
**QA screenshot:** `wellness-desk--overview.png`
**Acceptance test:** Open Wellness desk. Search the DOM for "canSubmit", "Can Submit", "Live Submission". Zero matches.

---

## P1 — Should Fix During Beta

---

### P1-01 — Safety Callout Absent on Bittensor Overview Tab

**Screen:** Bittensor Desk (Screen 4) — Overview tab

**Current issue:** The Bittensor Overview tab lacks an explicit Read-Only Boundary callout. Users may not understand that wallet reads are non-custodial and previews require an external signer.

**Desired behavior:** A "Read-Only Boundary" callout card appears at the top of the Overview tab.

**Exact copy:**
```
┌─ Read-Only Boundary ─────────────────────────────────────────
│ Matterhorn reads your wallet and subnet data. It never
│ signs, submits, or holds keys. All actions require your
│ external wallet.
└──────────────────────────────────────────────────────────────
```
Border-left: 3px solid `--mh-blue`. Background: `--mh-blue-dim`.

**Owner:** Kimi
**QA screenshot:** `bittensor-desk--overview.png`
**Acceptance test:** Open Bittensor Overview tab. The Read-Only Boundary callout is visible at the top of the tab content without scrolling.

---

### P1-02 — Orderbook Lacks "Read-Only" Header Notice

**Screen:** Hyperliquid Desk (Screen 5) — orderbook panel

**Current issue:** The orderbook shows bid/ask data with no explicit "read-only" notice. Users may assume they can interact with it.

**Desired behavior:** An orderbook header note makes the read-only nature explicit.

**Exact copy:**
```
┌─ Orderbook — BTC-PERP ────────────────────────────────────────
│ Read-only. Prices are indicative. No order placement.
│ Spread: [live value]  ·  Mid: [live value]
└──────────────────────────────────────────────────────────────
```
Font: 11px, `--mh-text-secondary`. Spread and mid values are live mono data.

**Owner:** Kimi
**QA screenshot:** `hyperliquid-desk--btc-perp.png`
**Acceptance test:** Open BTC-PERP detail. The orderbook header contains "Read-only. Prices are indicative. No order placement."

---

### P1-03 — Bittensor "Actions" Tab → "Preview Actions"

**Screen:** Bittensor Desk (Screen 4) — Actions tab

**Current issue:** The tab is labeled "Actions", implying live execution capability.

**Desired behavior:** Tab label is "Preview Actions" to accurately reflect that it shows preview cards, not live executions.

**Exact copy:**
```
Tab label: "Preview Actions"
```

**Owner:** Kimi
**QA screenshot:** `bittensor-desk--actions.png`
**Acceptance test:** On the Bittensor desk, the fourth tab reads "Preview Actions". Not "Actions".

---

### P1-04 — Bittensor Validator Empty State Is Unhelpful

**Screen:** Bittensor Desk (Screen 4) — Overview tab, validator section

**Current issue:** When no validators are registered, the empty state reads something like "No validators found" with no guidance.

**Desired behavior:** Empty state provides a helpful message and CTA.

**Exact copy:**
```
"No validators registered"
"Your wallet is not registered as a delegate on any subnet.
 Delegation can be previewed in the Actions tab."
[Link or button: "Go to Preview Actions →"]
```

**Owner:** Kimi
**QA screenshot:** `bittensor-desk--overview.png` (empty validator state)
**Acceptance test:** Open Bittensor desk with a wallet that has no validators. The empty state provides the text above with a link to Preview Actions.

---

### P1-05 — Desk Launcher Card Headers: Remove "Open" Prefix

**Screen:** Empty Session Launch Hub (Screen 3)

**Current issue:** Cards read "Open Bittensor desk", "Open Hyperliquid desk", "Open Polymarket desk", "Build wellness workflow".

**Desired behavior:** Headers are the venue name only. Icon carries the "open" affordance.

**Exact copy:**
```
"Bittensor"              (was: "Open Bittensor desk")
"Hyperliquid"            (was: "Open Hyperliquid desk")
"Polymarket"             (was: "Open Polymarket desk")
"Wellness"               (was: "Build wellness workflow")
"New blank chat"         (keep — this is an action)
```

**Owner:** Kimi
**QA screenshot:** `session-hub--desktop.png`
**Acceptance test:** Open the session hub. The six desk-launcher card titles are: Bittensor, Hyperliquid, Polymarket, Wellness, Services, New blank chat. No card begins with "Open".

---

### P1-06 — Desk Launcher Descriptions: Tighten to One Line

**Screen:** Empty Session Launch Hub (Screen 3)

**Current issue:** Desk descriptions are two lines of small text. Most users scan the icon + title.

**Desired behavior:** Each description is one concise line (≤80 chars).

**Exact copy:**
```
Bittensor:       "Read-only TAO wallet, subnet data, and validator previews."
Hyperliquid:     "Read-only orderbook, funding rates, and preview-only orders."
Polymarket:     "Prediction market summaries and preview-only positions."
Wellness:       "Wellness goal tracking, reminders, and evidence exports."
```
Current descriptions are 2 lines and longer. After: 1 line, ≤80 chars, `--mh-text-secondary`.

**Owner:** Kimi
**QA screenshot:** `session-hub--desktop.png`
**Acceptance test:** Hover over each desk-launcher card. Description text is a single line, ≤80 chars. No description wraps to a second line.

---

### P1-07 — Welcome Page: Improve Onboarding Step 1 Copy

**Screen:** Welcome / Onboarding (Screen 1)

**Current issue:** Onboarding step 1 leads with "Pick a folder where Matterhorn can save chats…" — file management before product value.

**Desired behavior:** Step 1 leads with what Matterhorn does, not where it saves files.

**Exact copy:**
```
Step 1 title:   "Create your workspace"
Step 1 body:   "Matterhorn saves chats, artifacts, receipts, and workflow
                files locally on your device. Nothing is uploaded
                without your consent."
```
(Remove: "Pick a folder where Matterhorn can save chats, artifacts, receipts, and workflow files.")

**Owner:** Kimi
**QA screenshot:** `welcome-page--desktop.png`
**Acceptance test:** On the welcome page, onboarding step 1 body begins with "Matterhorn saves chats, artifacts…" not "Pick a folder".

---

### P1-08 — Welcome Page: Step 3 Lacks Safety Disclaimer

**Screen:** Welcome / Onboarding (Screen 1)

**Current issue:** Onboarding step 3 ("Review before action") lacks an explicit "Matterhorn never holds your keys" statement.

**Desired behavior:** Step 3 body includes the explicit non-custodial statement.

**Exact copy:**
```
Step 3 title: "Review before action"
Step 3 body:  "Inspect evidence, preview-only actions, and external-signer
                handoffs before anything sensitive happens. Matterhorn never
                holds your keys."
```

**Owner:** Kimi
**QA screenshot:** `welcome-page--desktop.png`
**Acceptance test:** On the welcome page, onboarding step 3 contains "Matterhorn never holds your keys."

---

### P1-09 — Workspace Modal: "Token" → "Access Token"

**Screen:** Create Workspace Modal (Screen 2) — Remote tab

**Current issue:** The Remote workspace form labels the credential field "Token". "Token" could mean a cryptographic key to non-technical users.

**Desired behavior:** Label is "Access token". Clearer and more accurate.

**Exact copy:**
```
Field label:   "Access token"
Placeholder:   (empty — never pre-filled)
Helper text:   "Your Matterhorn worker access token."
```

**Owner:** Kimi
**QA screenshot:** `create-workspace--remote-selected.png`
**Acceptance test:** Open the Remote tab of the workspace modal. The field label reads "Access token". Not "Token".

---

### P1-10 — Workspace Modal: Remote Tab Needs Helper Text

**Screen:** Create Workspace Modal (Screen 2) — Remote tab

**Current issue:** The Server URL field lacks an example.

**Desired behavior:** Helper text below the Server URL field.

**Exact copy:**
```
Field label:   "Server URL"
Helper text:  "Example: https://worker.example.com"
Placeholder:  "https://"
```

**Owner:** Kimi
**QA screenshot:** `create-workspace--remote-selected.png`
**Acceptance test:** In the Remote tab, the Server URL field has helper text starting with "Example:".

---

### P1-11 — Wellness: "Wellness Workflow" → "Wellness"

**Screen:** Wellness Desk (Screen 7)

**Current issue:** The desk header reads "Wellness Workflow". "Workflow" is visible in the CTA; the header should be concise.

**Desired behavior:** Desk header reads "Wellness".

**Exact copy:**
```
Desk header: "Wellness"
CTA button:  "Workflow Builder →"   (keep — this is the CTA)
```

**Owner:** Kimi
**QA screenshot:** `wellness-desk--overview.png`
**Acceptance test:** Open the Wellness desk. The header reads "Wellness". Not "Wellness Workflow".

---

### P1-12 — Wellness: "14 Day Streak" → "14-Day Streak"

**Screen:** Wellness Desk (Screen 7)

**Current issue:** Streak display reads "14 day streak" (or "14 Day Streak").

**Desired behavior:** Use a hyphen in the numeral form.

**Exact copy:**
```
Streak display: "14-day streak"
```
The hyphen makes it read as a number, not fourteen separate days.

**Owner:** Kimi
**QA screenshot:** `wellness-desk--overview.png`
**Acceptance test:** Open the Wellness desk. The streak label reads "14-day streak". Not "14 day streak".

---

### P1-13 — Wellness: Goal Status "Not Done" → "Not Started"

**Screen:** Wellness Desk (Screen 7)

**Current issue:** Pending goals show "not done" as the status label.

**Desired behavior:** Pending goals show "Not started".

**Exact copy:**
```
Pending status: "Not started"
Complete status: "✓ complete"
```

**Owner:** Kimi
**QA screenshot:** `wellness-desk--overview.png`
**Acceptance test:** On the Wellness desk, any goal that is not complete shows "Not started". Not "not done".

---

### P1-14 — Polymarket: "Demo" Tab → "Trending"

**Screen:** Polymarket Desk (Screen 6)

**Current issue:** The default filter tab reads "Demo". "Demo" implies the data is fake or not real.

**Desired behavior:** Tab reads "Trending". Real data, real markets.

**Exact copy:**
```
Default tab label: "Trending"
```

**Owner:** Kimi
**QA screenshot:** `polymarket-desk--trending.png`
**Acceptance test:** Open Polymarket desk. The first/active filter tab reads "Trending". Not "Demo".

---

### P1-15 — Ambient Error Banner on Hub When Desk Data Is Unavailable

**Screen:** Empty Session Launch Hub (Screen 3)

**Current issue:** When a desk's data fails to load, the hub either shows no indication or shows a modal error.

**Desired behavior:** An amber ambient banner appears above the grid. The hub remains interactive.

**Exact copy:**
```
Banner: "⚠ Some desk data is unavailable. You can still use chat."
[Refresh]
```
Color: amber left border, `--mh-amber` text. The desk grid remains fully interactive below the banner.

**Owner:** Claude
**QA screenshot:** `session-hub--error-ambient.png`
**Acceptance test:** Simulate a desk data fetch failure. An amber banner appears above the grid. The grid is still interactive.

---

### P1-16 — Wallet Disconnection Error State

**Screen:** Global — triggered from any desk that requires a wallet

**Current issue:** When a wallet disconnects mid-session, the error shown may be a raw Web3 provider error or a generic network error.

**Desired behavior:** A branded error card with clear copy.

**Exact copy:**
```
┌─ Wallet Disconnected ─────────────────────────────────────────
│ Your wallet has been disconnected.
│ Reconnect to continue using market desks and chat.
│
│ [Reconnect Wallet]
└──────────────────────────────────────────────────────────────
```
Color: amber left border, `--mh-amber` accent. No raw Web3 error messages. No stack traces.

**Owner:** Claude
**QA screenshot:** `error--wallet-disconnected.png`
**Acceptance test:** Disconnect the wallet while a session is open. The error card reads "Wallet Disconnected" with "Reconnect Wallet" button. No technical error messages visible.

---

### P1-17 — Network Error: "Can't Reach Matterhorn"

**Screen:** Global — server unreachable

**Current issue:** Server connection failures show generic errors or raw HTTP status codes.

**Desired behavior:** A branded error card with clear recovery guidance.

**Exact copy:**
```
┌─ Can't reach Matterhorn ───────────────────────────────────────
│ Check your network connection and the server URL
│ (if using a remote worker).
│
│ [Try Again]
└──────────────────────────────────────────────────────────────
```

**Owner:** Claude
**QA screenshot:** `error--network.png`
**Acceptance test:** Disconnect network access while the app is running. The error card reads "Can't reach Matterhorn". No HTTP status codes or technical messages visible.

---

## P2 — Polish

---

### P2-01 — Contextual Composer Placeholder Per Open Desk

**Screen:** Chat Composer (Screen 9)

**Current issue:** The chat composer always shows "Describe your task…" regardless of which desk is open.

**Desired behavior:** The placeholder updates contextually when a desk is active.

**Exact copy:**
```
No desk open:          "Describe your task…"
Bittensor open:        "Ask about your TAO wallet, subnets, or validators…"
Hyperliquid open:      "Ask about market prices, orderbook, or preview an order…"
Polymarket open:        "Ask about prediction markets or preview a position…"
Wellness open:          "Ask about your wellness goals or create a workflow…"
```

**Owner:** Claude
**QA screenshot:** `chat--composer-desk-context.png`
**Acceptance test:** Open Bittensor desk. The chat composer placeholder changes to "Ask about your TAO wallet, subnets, or validators…". Close the desk. Placeholder returns to "Describe your task…".

---

### P2-02 — Market Tool Output Cards: "Read-Only" Badge

**Screen:** Chat Transcript Cards (Screen 9)

**Current issue:** Market-related tool output cards (Bittensor reads, Hyperliquid data, Polymarket data) have no visible safety indicator.

**Desired behavior:** Any tool output card that displays market data carries a blue "Read-Only" badge in the top-right corner.

**Exact copy:**
```
Badge: "Read-Only"
Color: --mh-blue (#3B82F6)
Position: top-right corner of the card, absolute
Size: pill, height 22px, font-size 10px
```

**Owner:** Claude
**QA screenshot:** `chat--transcript-market-card.png`
**Acceptance test:** Ask the chat to display Hyperliquid market data. The resulting tool output card has a blue "Read-Only" badge in the top-right.

---

### P2-03 — Welcome Page Skeleton Loading State

**Screen:** Welcome / Onboarding (Screen 1)

**Current issue:** The welcome page may show a spinner or nothing while loading.

**Desired behavior:** A skeleton loader (3 skeleton rows + button skeleton) is shown while content loads.

**Exact copy:** N/A — visual state only.
```
Skeleton: 3 rows of varying width + 1 button-shaped skeleton
Animation: opacity pulse, 1.5s ease-in-out, infinite
Color: --mh-bg-elevated
```

**Owner:** Kimi
**QA screenshot:** `welcome-page--loading.png`
**Acceptance test:** Throttle network to slow 3G. The welcome page shows skeleton rows before content appears. No spinner visible in the main content area.

---

### P2-04 — Wellness Desk: Empty Goal List State

**Screen:** Wellness Desk (Screen 7)

**Current issue:** If no goals are set, the empty state may show nothing or unhelpful copy.

**Desired behavior:** A helpful empty state with a CTA.

**Exact copy:**
```
"No goals set for today"
"Add your first wellness goal to get started."
[+ Add goal]
```

**Owner:** Kimi
**QA screenshot:** `wellness-desk--empty.png`
**Acceptance test:** Open Wellness desk with no goals. The empty state reads "No goals set for today" with an "+ Add goal" button.

---

### P2-05 — Wellness Artifact Export Card: Missing Description

**Screen:** Wellness Desk (Screen 7)

**Current issue:** The wellness artifact export card lacks a clear description of what the artifact is.

**Desired behavior:** Add a description to the artifact export card.

**Exact copy:**
```
Title:  "Wellness Artifact"
Body:   "A signed summary of your wellness activity. Export it for
         your records. The artifact is signed with your wallet address
         and includes a SHA-256 hash for tamper evidence."
```

**Owner:** Kimi
**QA screenshot:** `wellness-desk--artifact-export.png`
**Acceptance test:** Open Wellness desk. The artifact card contains the body text above. The SHA-256 hash and signer address are visible below the description.

---

### P2-06 — Chat Empty State: Welcome Message

**Screen:** Chat Composer and Transcript (Screen 9)

**Current issue:** When the transcript is empty, the canvas is blank or shows only the composer.

**Desired behavior:** A welcome message in the transcript area guides the user.

**Exact copy:**
```
Matterhorn: Hi. What would you like to do today?
            I can help you browse markets, preview orders, build
            wellness workflows, and more — without touching your keys.
```

**Owner:** Claude
**QA screenshot:** `chat--composer-empty.png`
**Acceptance test:** Open a new chat session. The transcript area shows the welcome message above the composer.

---

### P2-07 — Chat Loading State: Skeleton Dots + Timeout Notice

**Screen:** Chat Composer and Transcript (Screen 9)

**Current issue:** Waiting for a model response shows nothing or a spinner.

**Desired behavior:** Three animated skeleton dots. After 5 seconds, add a secondary notice.

**Exact copy:**
```
Initial (0–5s):  Three pulsing dots (150ms stagger)
After 5s:        "+ This is taking longer than expected. You can continue in chat."
```

**Owner:** Claude
**QA screenshot:** `chat--loading-state.png`
**Acceptance test:** Send a message that takes >5s to respond. After 5s, the secondary notice appears below the dots.

---

### P2-08 — Polymarket Market Question: Verbatim Display

**Screen:** Polymarket Desk (Screen 6)

**Current issue:** Market questions may be rephrased, shortened, or truncated in ways that change meaning.

**Desired behavior:** Each Polymarket market card shows the question exactly as it appears in the Polymarket API. No rephrasing.

**Exact copy:** N/A — constraint, not copy. The market question title on each card is the raw `question` field from the Polymarket API response.

**Owner:** Kimi
**QA screenshot:** `polymarket-desk--trending.png`
**Acceptance test:** Compare a Polymarket market card's question text to the live Polymarket API `question` field for that market. They match exactly.

---

### P2-09 — Mobile: Orderbook "Show More" Expansion

**Screen:** Hyperliquid Desk (Screen 5) — mobile only

**Current issue:** On mobile, the full orderbook table may overflow the viewport.

**Desired behavior:** Only the first 5 rows are visible on mobile. A "Show more ↓" button expands the rest.

**Exact copy:**
```
Collapsed: 5 rows visible, "Show more ↓" button at bottom
Expanded:  All rows visible, "Show less ↑" button at bottom
```

**Owner:** Claude
**QA screenshot:** `hyperliquid-desk--mobile.png`
**Acceptance test:** On a 390px mobile viewport, open the Hyperliquid desk. The orderbook shows 5 rows and a "Show more ↓" button.

---

### P2-10 — Right Rail: Pin and Close Buttons

**Screen:** Bittensor Desk (Screen 4), Hyperliquid Desk (Screen 5), Polymarket Desk (Screen 6)

**Current issue:** The right rail (context panel) may not have explicit Pin/Close controls.

**Desired behavior:** The rail header has Pin and Close buttons.

**Exact copy:**
```
Pin icon:   (📌) — keeps the rail open when switching between desks
Close icon: (✕)  — closes the rail and returns focus to chat
```

**Owner:** Claude
**QA screenshot:** `bittensor-desk--overview.png` (rail header visible)
**Acceptance test:** Open a desk. The rail header shows Pin and Close controls. Pin keeps the rail open when navigating between desks.

---

## Codex First Implementation Batch

The top 5 app UI changes to implement immediately — highest confidence, highest impact.

### 1. [P0-03] Safety Strip — All Three Desks
Add the consistent `Can Submit: No · Live Submission: Off · External Signer: Ready` strip to Bittensor, Hyperliquid, and Polymarket desks. This is the single most important safety UI element. Do this first.

### 2. [P0-01] Remove All Green "Live" Badges from Desks
Audit every desk for green badges. Replace with blue. Green is reserved for when the external signer is actually live and the user is in a handoff flow.

### 3. [P0-07] Services Card: "Coming Soon" State
Fix the Services card in the hub. Add the blue "Coming soon" badge. Add the landing state. Remove any implication that Services can be configured in beta.

### 4. [P0-05] AI Sender Label: "Matterhorn" Not "MiniMax-M2.7"
Search the message-list component for "MiniMax-M2.7". Replace with "Matterhorn". Move the model name to a tooltip.

### 5. [P1-07 + P1-08] Welcome Page: Onboarding Copy
Fix onboarding step 1 ("Matterhorn saves chats, artifacts…") and step 3 (add "Matterhorn never holds your keys."). This is the first thing a new user reads.

---

## Forbidden Claims Checklist

Regardless of P0/P1/P2, the following must NEVER appear in any UI surface. These are zero-tolerance items:

| Forbidden phrase | Why |
|---|---|
| "your funds are safe with Matterhorn" | Custody implication |
| "Matterhorn holds your assets" | Custody implication |
| "submit order" / "submit" (as button) | Live execution implication |
| "confirm trade" | Live execution implication |
| "sign transaction" | Matterhorn is never a signer |
| "live trading" | Feature does not exist in beta |
| "connect to exchange" | Implies direct exchange connection |
| "API key" as field label | Security risk |
| "seed phrase" / "mnemonic" as field label | Security risk |
| OpenWork / OpenCode branding | Wrong brand |
| Green badge on Bittensor/Hyperliquid/Polymarket (beta) | Safety misrepresentation |
| "Beta-ready" on Polymarket | Misleading |

If any of these are found, file a P0 and fix immediately.

---

## QA Screenshot Inventory

All screenshots to capture from the implemented app:

### Welcome Page (Screen 1)
1. `welcome-page--desktop.png` — 1440px viewport
2. `welcome-page--mobile.png` — 390px viewport
3. `welcome-page--loading.png` — skeleton state
4. `welcome-page--error.png` — error notice
5. `welcome-page--get-started-hover.png` — hover state

### Create Workspace Modal (Screen 2)
6. `create-workspace--local-selected.png`
7. `create-workspace--remote-selected.png` — with helper text and "Access token" label
8. `create-workspace--mobile.png`
9. `create-workspace--loading.png`
10. `create-workspace--error-permission.png`
11. `create-workspace--error-auth.png`

### Session Hub (Screen 3)
12. `session-hub--desktop.png`
13. `session-hub--mobile.png`
14. `session-hub--loading.png`
15. `session-hub--services-coming-soon.png`
16. `session-hub--desk-hover.png`
17. `session-hub--error-ambient.png`

### Bittensor Desk (Screen 4)
18. `bittensor-desk--overview.png` — with Read-Only Boundary callout
19. `bittensor-desk--subnets.png`
20. `bittensor-desk--actions.png` — tab reads "Preview Actions"
21. `bittensor-desk--mobile.png`
22. `bittensor-desk--safety-strip.png`
23. `bittensor-desk--error-wallet.png`
24. `bittensor-desk--loading.png`

### Hyperliquid Desk (Screen 5)
25. `hyperliquid-desk--all-markets.png`
26. `hyperliquid-desk--btc-perp.png` — with read-only orderbook header
27. `hyperliquid-desk--mobile.png`
28. `hyperliquid-desk--safety-strip.png`
29. `hyperliquid-desk--error-unavailable.png`
30. `hyperliquid-desk--loading.png`

### Polymarket Desk (Screen 6)
31. `polymarket-desk--trending.png` — badge reads "Planned — Preview Only", tab "Trending"
32. `polymarket-desk--crypto-filter.png`
33. `polymarket-desk--mobile.png`
34. `polymarket-desk--loading.png`
35. `polymarket-desk--empty-category.png`

### Wellness Desk (Screen 7)
36. `wellness-desk--overview.png` — header "Wellness", "14-day streak", no canSubmit strip
37. `wellness-desk--mobile.png`
38. `wellness-desk--empty.png`
39. `wellness-desk--loading.png`
40. `wellness-desk--artifact-export.png`

### Services (Screen 8)
41. `services-coming-soon--desktop.png`
42. `services-coming-soon--mobile.png`
43. `services-coming-soon--hub-badge.png`

### Chat (Screen 9)
44. `chat--composer-empty.png` — with welcome message
45. `chat--composer-desk-context.png` — contextual placeholder
46. `chat--slash-menu.png`
47. `chat--transcript-market-card.png` — "Read-Only" badge on market card
48. `chat--loading-state.png` — dots + timeout notice
49. `chat--error-model.png`
50. `chat--mobile-composer.png`

### Error States (Screen 10)
51. `error--ambient-market.png`
52. `error--modal-service.png`
53. `error--wallet-disconnected.png`
54. `error--network.png`
55. `error--fatal.png`
56. `error--mobile-modal.png`

**Total: 56 screenshots**
