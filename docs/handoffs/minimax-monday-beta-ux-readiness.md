# Monday Beta UI/UX Readiness Spec

**Spec version:** 1.0 — Monday Beta
**Date:** 2025-01-06
**Audience:** Codex (CEO agent), design engineers, frontend implementers, QA reviewers
**Scope:** 10 screens for the Monday beta release of Matterhorn Work
**Base SHA:** `26e98e34` (origin/dev)

---

## How to Read This Document

Each screen section follows the same 8-field structure:

| Field | What it means |
|---|---|
| **5-second test** | What the user understands within 5 seconds of landing on the screen |
| **Primary action** | The one main thing the user can and should do |
| **Secondary actions** | Supporting actions, always subordinate to the primary |
| **Copy improvements** | Exact copy changes vs. current app, with rationale |
| **Responsive notes** | Mobile / tablet / desktop behavior differences |
| **Empty / loading / error** | All three non-happy-path states, with copy |
| **Forbidden claims** | Language and patterns that must never appear on this screen |
| **QA screenshots** | Exact screenshots to capture in the beta pass |

Brand rules apply to all screens: Matterhorn mark only, `#0C0C0C` background, `#D1F2FF` accent, Aeonik-style sans-serif, JetBrains Mono for all data. No OpenWork / OpenCode copy in any customer-facing surface.

---

## Screen 1 — Welcome / Onboarding

**File:** `apps/app/src/domains/onboarding/welcome-page.tsx`

### 5-Second Test

The user sees "Matterhorn Work" in the top-left, a clean dark canvas, three numbered steps, and one "Get Started" button. The word "Matterhorn" is legible. No jargon, no explanation needed.

### Primary Action

Click **"Get Started"** → opens the Create Workspace modal (Screen 2).

### Secondary Actions

- Read the three onboarding steps (steps are collapsed by default on desktop, expanded by default on mobile).
- Click "Learn more" links (if present) — links must open in a new tab and go to `docs.matterhorn.work`, never to a marketing site.

### Copy Improvements

**Current copy:**
```
"Welcome to Matterhorn Work"
"Pick a folder where Matterhorn can save chats, artifacts, receipts,
 and workflow files."
```

**Proposed copy:**
```
"Welcome to Matterhorn Work"
"Your Web3 workspace. Browse markets, build workflows, and track
 portfolios — without connecting your keys."
```

**Rationale:** The current onboarding step 1 copy ("Pick a folder…") focuses on file management before the user understands the product's value. Lead with what Matterhorn *does*, not where it saves files. File location is explained in the workspace creation modal (Screen 2) — it doesn't need to be step 1 here.

**Onboarding step 1 — change from:**
```
"Create your workspace"
"Pick a folder where Matterhorn can save chats, artifacts,
 receipts, and workflow files."
```
**To:**
```
"Create your workspace"
"Matterhorn saves chats, artifacts, receipts, and workflow files
 locally on your device. Nothing is uploaded without your consent."
```

**Onboarding step 2 — change from:**
```
"Choose a product lane"
"Open Bittensor, Hyperliquid, Polymarket, wellness workflows,
 or a blank chat."
```
**To (keep the same — this is good):**
```
"Choose a product lane"
"Open Bittensor, Hyperliquid, Polymarket, wellness workflows,
 or a blank chat."
```

**Onboarding step 3 — keep, but add safety note:**
```
"Review before action"
"Inspect evidence, preview-only actions, and external-signer
 handoffs before anything sensitive happens. Matterhorn never
 holds your keys."
```

### Responsive Notes

- **Desktop:** Three steps in a vertical list, "Get Started" centered below. Max-width 480px centered on the canvas.
- **Mobile:** Steps are collapsed (single line + chevron to expand). "Get Started" is full-width. Padding is 24px on all sides.
- **Tablet:** Same as desktop.

### Empty / Loading / Error States

- **Loading:** Show a skeleton of the welcome card (3 skeleton rows + button skeleton). Never a spinner.
- **Error (network failure on first load):** Show a compact inline notice above the CTA: "Couldn't load. Check your connection." with a "Try again" link. Do not show a modal or interrupt the layout.
- **Empty:** N/A — this screen always has content.

### Forbidden Claims

- Do NOT say "your funds are safe with Matterhorn"
- Do NOT say "Matterhorn holds your assets"
- Do NOT say "submit", "sign", "execute", "trade", "live trading" anywhere on this screen
- Do NOT show OpenWork or OpenCode logos, names, or brand colors
- Do NOT promise features that are "planned" without a "Coming soon" badge
- Do NOT use the word "wallet" as a noun referring to a hot/custodial wallet — use "wallet address" or "watch-only address" when describing non-custodial reads

### QA Screenshots

1. `welcome-page--desktop.png` — Full welcome page on a 1440px viewport, dark theme.
2. `welcome-page--mobile.png` — Full welcome page on a 390px (iPhone 14) viewport.
3. `welcome-page--loading.png` — Skeleton loading state visible for ≥500ms before content appears.
4. `welcome-page--error.png` — Error notice shown after simulating a network failure.
5. `welcome-page--get-started-hover.png` — "Get Started" button in hover/focus state.

---

## Screen 2 — Create Workspace Modal

**File:** `apps/app/src/domains/workspace/create-workspace-modal.tsx`

### 5-Second Test

The user sees three options: **Local**, **Remote**, **Shared**. Each has a one-line description. "Local" is visually selected by default. A form appears on the right when an option is clicked. The "Create" / "Connect" button is disabled until required fields are filled.

### Primary Action

Select a workspace type, fill in the required fields, click **"Create workspace"** (local) or **"Connect remote"** (remote).

### Secondary Actions

- Switch between Local / Remote / Shared tabs.
- Cancel and return to the welcome page.
- Click "Learn more" on the Remote option (opens docs in a new tab).

### Copy Improvements

**Current copy:**
```
"Create a workspace on this device."
"Attach to a self-hosted Matterhorn worker using a URL and
 access token."
"Connect remote"
```

**Proposed copy (Local tab — keep mostly the same, tighten):**
```
"Create a workspace on this device"
"All files stay on your device. Matterhorn never uploads your
 chats or workspace data to a server."
```

**Proposed copy (Remote tab — tighten):**
```
"Attach to a self-hosted worker"
"Enter the server URL and access token for your self-hosted
 Matterhorn worker. Nothing is shared with third parties."
```

**Proposed copy (Token field label — change from):**
```
"Token"
```
**To:**
```
"Access token"
```

**Rationale:** "Access token" is more precise than "Token" and signals that this is a permission credential, not a cryptographic key. The field should not echo back the token value in any UI.

**Server URL field — add helper text:**
```
Helper text below field: "Example: https://worker.example.com"
```

**Display name field (Remote) — add placeholder:**
```
Placeholder: "My Matterhorn worker"
```

### Responsive Notes

- **Desktop:** 3-column card grid for workspace type, form appears in a centered modal (max-width 560px) with a backdrop.
- **Mobile:** Full-screen sheet sliding up from the bottom. Workspace type cards stack vertically. Form scrolls within the sheet. "Create" button is sticky at the bottom of the sheet.
- **Tablet:** Same as desktop but modal is 90% viewport width.

### Empty / Loading / Error States

- **Empty (no workspace type selected):** All three cards are visible, none are selected. The form area shows a placeholder: "Select a workspace type to continue."
- **Loading (creating workspace):** The "Create workspace" button shows a loading spinner and the label changes to "Creating…". The button is disabled. The form fields are disabled. Do NOT change the card selection state.
- **Loading (connecting remote):** Same pattern: "Connecting…" label, disabled fields.
- **Error (local workspace — path not writable):**
  ```
  "Can't create workspace here"
  "The selected folder is not writable. Choose a different location."
  [Choose different location]
  ```
- **Error (remote — invalid URL):**
  ```
  "Invalid server URL"
  "Check the URL and try again."
  ```
- **Error (remote — auth failed):**
  ```
  "Connection refused"
  "Check your access token and try again."
  ```
- **Error (remote — server unreachable):**
  ```
  "Can't reach server"
  "Check your network connection and the server URL."
  ```

### Forbidden Claims

- Do NOT pre-fill the token field with any placeholder value that looks like a real token.
- Do NOT say "your data is encrypted" unless you can specify end-to-end encryption with a documented key management scheme.
- Do NOT use "workspace" and "project" interchangeably — pick one term and use it consistently within this modal.
- Do NOT show a progress percentage when creating a local workspace (it's instantaneous — a spinner or percentage would be misleading).

### QA Screenshots

1. `create-workspace--local-selected.png` — Local tab selected, form visible.
2. `create-workspace--remote-selected.png` — Remote tab selected, URL + token fields visible.
3. `create-workspace--mobile.png` — Full-screen sheet on mobile viewport.
4. `create-workspace--loading.png` — Button in "Creating…" loading state.
5. `create-workspace--error-permission.png` — Permission error state.
6. `create-workspace--error-auth.png` — Auth failure error state.

---

## Screen 3 — Empty Session Launch Hub

**File:** `apps/app/src/domains/session/chat/session-page.tsx` (empty state)

### 5-Second Test

The user sees their workspace name in the top bar, a clean chat canvas, and a grid of **6 desk-launcher cards**: Bittensor, Hyperliquid, Polymarket, Wellness Workflow, Services (planned), and "New blank chat". The chat composer is visible at the bottom with "Describe your task…" placeholder.

### Primary Action

Click any desk-launcher card to open that desk in the right panel, or type in the composer to start a blank chat.

### Secondary Actions

- Click "New blank chat" → opens a blank chat in the main transcript area.
- Hover over desk-launcher cards → cards lift with a subtle shadow transition (150ms).
- Click the workspace name in the top bar → opens workspace settings.

### Copy Improvements

**Desk launcher grid — current copy:**

| Current | Proposed | Rationale |
|---|---|---|
| "Open Bittensor desk" | "Bittensor" | The card already has the icon; "Open" is redundant. |
| "Open Hyperliquid desk" | "Hyperliquid" | Same. |
| "Open Polymarket desk" | "Polymarket" | Same. |
| "Build wellness workflow" | "Wellness" | Consistent with desk naming above. |
| "Services" | "Services" (keep) | N/A |
| "New blank chat" | "New blank chat" (keep) | This is a clear action, keep as-is. |

**Desk launcher descriptions — tighten:**

| Current | Proposed |
|---|---|
| "TAO wallet reads, subnets, validators, watches, and staking previews." | "Read-only TAO wallet, subnet data, and validator previews." |
| "Account context, orderbook reads, funding watches, and preview-only orders." | "Read-only orderbook, funding rates, and preview-only orders." |
| "Market summaries, outcomes, compliance, receipts, and preview-only orders." | "Prediction market summaries and preview-only positions." |
| "Training plans, dietician packets, check-ins, and client follow-up artifacts." | "Wellness goal tracking, reminders, and evidence exports." |

**Rationale:** Desk descriptions are 2 lines of small text that users don't read on first visit. Keep to one concise line. Remove adjectives like "preview-only" from descriptions — the safety badge communicates that.

**Services card — change from:**
```
"Services"
"No services connected. Connect a service to extend Matterhorn."
```
**To:**
```
"Services"
"Planned — Extend Matterhorn with external services"
```
**Badge:** Add a blue "Coming soon" badge to the Services card. The card is non-interactive in beta (clicking it shows a tooltip: "Services integration is coming soon.").

### Responsive Notes

- **Desktop (≥1200px):** 2×3 grid of desk-launcher cards. Cards are equal width. Gap: 16px.
- **Tablet (640–1199px):** 2×3 grid, narrower cards.
- **Mobile (<640px):** 1-column vertical stack. Cards are full-width. Composer is at the bottom, sticky. Desk-launcher cards collapse to 2-column (Bittensor + Hyperliquid on row 1, Polymarket + Wellness on row 2, Services + blank on row 3).

### Empty / Loading / Error States

- **Loading (desk data fetching):** Each desk-launcher card shows a skeleton while data loads. The skeleton is a single row: `[icon] [title skeleton] [description skeleton]`. Loading must not block the composer.
- **Error (all desks unreachable):** Show a single amber banner above the grid: "⚠ Some desk data is unavailable. You can still use chat." The grid remains interactive.
- **Error (specific desk unreachable):** The affected card shows an amber dot and "Data unavailable" in place of the description. Clicking the card still opens the desk (the desk will show its own error state).
- **Empty (first visit, no sessions):** The grid is the primary content. No additional empty state needed — this is the "full" state of the hub.

### Forbidden Claims

- Do NOT call any desk "live trading", "live execution", or "submit orders" in the hub.
- Do NOT show a green "Live" badge on any desk-launcher card in beta. All desks are either "Read-only" (blue) or "Coming soon" (blue).
- Do NOT mention "API keys" or "credentials" in any hub copy.
- Do NOT display a live price or market data ticker in the hub — keep it clean and calm.

### QA Screenshots

1. `session-hub--desktop.png` — Full hub on 1440px, all 6 cards visible.
2. `session-hub--mobile.png` — Full hub on 390px mobile viewport.
3. `session-hub--loading.png` — Cards showing skeleton state.
4. `session-hub--services-coming-soon.png` — Services card with "Coming soon" badge and hover tooltip.
5. `session-hub--desk-hover.png` — One card in hover state (shadow lift).

---

## Screen 4 — Bittensor Desk

**File:** `apps/app/src/domains/wallet/pages/BittensorPanel.tsx` (Bittensor tab)

### 5-Second Test

The user sees the Matterhorn mark, "Bittensor" as the venue label, a **blue "Read-Only" badge**, and their watched wallet address (truncated, mono). Below: TAO balance, subnet stats, validator list. No order form, no submit button anywhere.

### Primary Action

Read wallet state and subnet/validator data. Click "Preview" on any listed item to see a preview card with an external signer handoff option.

### Secondary Actions

- Switch between Overview / Subnets / Wallet / Actions tabs.
- Click "Try in chat" → opens the chat composer with a pre-filled Bittensor prompt.
- Click the wallet address → copies it to clipboard. Show a brief "Copied" toast.

### Copy Improvements

**Header — current:**
```
"Bittensor"
"Can submit: External signer / No"
"Live submission: External signing required / Off"
```
**Proposed:**
```
"Bittensor"
Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready
```

**Rationale:** Consistent with the safety strip format used in the UI system spec. Lowercase, mono, compact. Always visible.

**Overview tab — add a clear safety callout at the top:**
```
┌─ Read-Only Boundary ─────────────────────────────────────────
│ Matterhorn reads your wallet and subnet data. It never
│ signs, submits, or holds keys. All actions require your
│ external wallet.
└──────────────────────────────────────────────────────────────
```

**Validator list — change empty state from:**
```
"No validators found for this wallet."
```
**To:**
```
"No validators registered"
"Your wallet is not registered as a delegate on any subnet.
 Delegation can be previewed in the Actions tab."
```

**Actions tab — change section header from:**
```
"Actions"
```
**To:**
```
"Preview Actions"
```

**Rationale:** The Actions tab currently shows a list of previews (staking, redelegation), not live executions. "Preview Actions" is more accurate and reduces the risk of users thinking they can execute here.

**"Try in chat" copy — change from:**
```
"Try in chat"
```
**To:**
```
"Ask in chat →"
```

**Rationale:** "Ask" is more natural than "Try" for a chat interface. The arrow signals navigation.

### Responsive Notes

- **Desktop:** 3-column layout: [wallet sidebar 240px] | [main content] | [context panel 320px].
- **Tablet:** 2-column: [sidebar collapses to 64px icon rail] | [main content + context panel as slide-over].
- **Mobile:** Single column. Context panel slides up from bottom as a sheet. The safety strip (`Can Submit: No…`) is sticky at the top of the desk.

### Empty / Loading / Error States

- **Loading:** Skeleton rows for wallet balance, subnet list, and validator list. Each skeleton is a single row with `[icon] [label] [value]` layout. Must not block interaction with the chat composer.
- **Error (wallet not set):**
  ```
  ┌─ Wallet Not Set ─────────────────────────────────────────────
  │ No wallet address entered. Enter a public wallet address
  │ to read your Bittensor state.
  │
  │ [Enter wallet address]
  └──────────────────────────────────────────────────────────────
  ```
- **Error (subnet data unavailable):**
  ```
  ┌─ Subnet Data Unavailable ─────────────────────────────────────
  │ Could not reach the Bittensor network. Showing cached data.
  │ Last updated: [timestamp]
  │
  │ [Refresh]
  └──────────────────────────────────────────────────────────────
  ```
- **Empty (no positions/validators):** See copy improvements above — this state should now show a helpful message with a CTA, not just an empty list.

### Forbidden Claims

- Do NOT show a green "Live" badge on any Bittensor tab.
- Do NOT show "Submit", "Stake", "Delegate" as button labels. Use "Preview staking" / "Preview delegation" / "Preview registration".
- Do NOT show a form field for private keys, seed phrases, or hot wallet imports.
- Do NOT show API key input anywhere on this desk.
- Do NOT show real-time orderbook (Bittensor has no orderbook).

### QA Screenshots

1. `bittensor-desk--overview.png` — Full Bittensor desk, Overview tab.
2. `bittensor-desk--subnets.png` — Subnets tab with data.
3. `bittensor-desk--actions.png` — Actions tab showing preview cards.
4. `bittensor-desk--mobile.png` — Desk on mobile viewport with bottom sheet.
5. `bittensor-desk--safety-strip.png` — Close-up of the `Can Submit: No` safety strip.
6. `bittensor-desk--error-wallet.png` — Wallet-not-set error state.
7. `bittensor-desk--loading.png` — Skeleton loading state.

---

## Screen 5 — Hyperliquid Desk

**File:** `apps/app/src/domains/wallet/pages/BittensorPanel.tsx` (Hyperliquid tab)

### 5-Second Test

The user sees "Hyperliquid" as the venue, a **blue "Read-Only" badge**, current BTC/ETH/SOL prices (mono font), funding rates, open interest. No order form visible. The chat composer is accessible below.

### Primary Action

Browse market prices, read the orderbook, and click "Preview" on any listed market to see an order preview card.

### Secondary Actions

- Switch between BTC-PERP / ETH-PERP / SOL-PERP / All Markets tabs.
- Click "Ask in chat →" → pre-fills chat with a Hyperliquid prompt.
- Click a price → copies it to clipboard.

### Copy Improvements

**Header safety strip — change from:**
```
"Can submit: External signer / No"
"Live submission: External signing required / Off"
```
**Proposed:**
```
Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready
```

**"Ask in chat" — change from:**
```
"Try in chat"
```
**To:**
```
"Ask in chat →"
```

**Market card — add a persistent safety badge:**
Each market card (BTC-PERP, ETH-PERP, SOL-PERP) should carry a small blue "Read-Only" badge in the top-right corner of the card, visible at all times. Currently this badge may only appear on hover.

**Orderbook copy — add a header note:**
```
┌─ Orderbook — BTC-PERP ────────────────────────────────────────
│ Read-only. Prices are indicative. No order placement.
│ Spread: $1.00 (0.0016%)  ·  Mid: $64,249.50
└──────────────────────────────────────────────────────────────
```

**Rationale:** Users scanning the orderbook may assume they can interact with it. The "Read-only. Prices are indicative. No order placement." line must be prominent, not buried in a tooltip.

### Responsive Notes

- Same as Screen 4 (Bittensor Desk).
- On mobile: the orderbook scrolls horizontally with the first 5 rows visible, with a "Show more" expansion.

### Empty / Loading / Error States

- **Loading:** Skeleton for market card rows (price, change, funding). Do not show a full-page loader — the desk shell must remain visible.
- **Error (Hyperliquid API unreachable):**
  ```
  ┌─ Hyperliquid Unavailable ────────────────────────────────────
  │ Could not reach Hyperliquid. Market data may be stale.
  │ Last updated: [timestamp]
  │
  │ [Try Again]
  └──────────────────────────────────────────────────────────────
  ```
  This is a banner at the top of the desk. The desk remains interactive.
- **Error (specific market data missing):** The affected market row shows "—" for missing values and an amber dot. The row remains clickable.

### Forbidden Claims

- Do NOT show a green "Live" badge on any Hyperliquid market.
- Do NOT show "Submit Order", "Confirm Trade", or "Execute" anywhere on this desk.
- Do NOT show any input field for API keys, private keys, or wallet imports.
- Do NOT show a "Place Order" button or a "Size" + "Price" form.

### QA Screenshots

1. `hyperliquid-desk--all-markets.png` — All Markets tab showing BTC/ETH/SOL.
2. `hyperliquid-desk--btc-perp.png` — BTC-PERP detail with orderbook.
3. `hyperliquid-desk--mobile.png` — Desk on mobile, orderbook sheet.
4. `hyperliquid-desk--safety-strip.png` — Close-up of safety strip.
5. `hyperliquid-desk--error-unavailable.png` — API unreachable banner.
6. `hyperliquid-desk--loading.png` — Skeleton state.

---

## Screen 6 — Polymarket Desk

**File:** `apps/app/src/domains/wallet/pages/BittensorPanel.tsx` (Polymarket tab)

### 5-Second Test

The user sees "Polymarket" as the venue, a **blue "Coming Soon" badge**, a list of prediction markets with YES/NO prices. The chat composer is accessible. No order form.

### Primary Action

Browse markets and click "Preview" on any market to see a position preview card.

### Secondary Actions

- Filter markets by category (Crypto, Politics, Tech, All).
- Click "Ask in chat →" to pre-fill the chat composer.
- Click a market question to expand details (volume, liquidity, resolution date).

### Copy Improvements

**Header badge — change from:**
```
"Beta-ready"
```
**To:**
```
"Planned — Preview Only"
```

**Rationale:** "Beta-ready" implies the feature is live and usable. "Planned — Preview Only" is honest: this is a preview-only feature that is not yet live.

**Market card — add a consistent header:**
Each Polymarket card should show the market question verbatim (exact text from the API — no rephrasing) as the title, followed by:
```
YES $0.XX  ▲/▼  NO $0.XX  ·  Vol: $XM  ·  Resolves: YYYY-MM-DD
```

**Category filter — change "Demo" tab to:**
The current "Demo" tab should be removed or renamed to "Trending". "Demo" implies the data is fake.

**"Ask in chat" — change from:**
```
"Try in chat"
```
**To:**
```
"Ask in chat →"
```

### Responsive Notes

- Same as Screen 4 (Bittensor Desk).
- On mobile: market cards stack vertically, YES/NO bars scale to full width.

### Empty / Loading / Error States

- **Empty (no markets in category):**
  ```
  ┌─ No markets in this category ───────────────────────────────
  │ No prediction markets found for this filter.
  │ Try "All" to see trending markets.
  └──────────────────────────────────────────────────────────────
  ```
- **Loading:** Skeleton market cards (3 rows).
- **Error (Polymarket API unreachable):**
  ```
  ┌─ Polymarket Unavailable ────────────────────────────────────
  │ Could not reach Polymarket. Market data may be stale.
  │ [Try Again]
  └──────────────────────────────────────────────────────────────
  ```

### Forbidden Claims

- Do NOT show "Buy YES", "Buy NO", or any purchase/sell affordance.
- Do NOT show a green "Live" badge.
- Do NOT show a position size or price input field.
- Do NOT imply that using this desk constitutes a prediction market trade.

### QA Screenshots

1. `polymarket-desk--trending.png` — Trending tab with market cards.
2. `polymarket-desk--crypto-filter.png` — Crypto category filter active.
3. `polymarket-desk--mobile.png` — Mobile layout.
4. `polymarket-desk--loading.png` — Skeleton state.
5. `polymarket-desk--empty-category.png` — Empty category state.

---

## Screen 7 — Wellness Workflow Entry

**File:** `apps/app/src/domains/session/chat/session-page.tsx` (Wellness desk-launcher) + `apps/app/src/domains/wellness/` (wellness domain, if it exists)

### 5-Second Test

The user clicks "Wellness" in the hub and sees a dedicated desk. No market execution UI. The desk shows: streak counter (prominent number), today's goals list, and a weekly overview. No `canSubmit` strip — wellness has no market execution.

### Primary Action

View current goals and streak. Click "+ New Goal" to add a wellness goal.

### Secondary Actions

- Click any goal row to expand it.
- Click "Workflow Builder →" to open the workflow builder with a wellness workflow template pre-loaded.
- Export the wellness artifact to the evidence log.

### Copy Improvements

**Desk header — change from:**
```
"Wellness Workflow"
```
**To:**
```
"Wellness"
```

**Rationale:** "Wellness Workflow" is the domain name internally, but the user-facing label should be just "Wellness". "Workflow" is visible in the CTA button.

**Streak display — change from:**
```
"14 day streak"
```
**To:**
```
"14-day streak"
```
(Use a hyphen. "14 day streak" reads as "fourteen day streak"; "14-day streak" reads as a number.)

**Goal status — change from:**
```
"not done"
```
**To:**
```
"Not started"
```

**Rationale:** "Not started" is warmer and more actionable than "not done", which implies failure.

**Empty goal list — change from (if applicable):**
```
"No goals yet"
```
**To:**
```
"No goals set for today"
"Add your first wellness goal to get started."
[+ Add goal]
```

**Wellness artifact export — add a clear description:**
```
"Wellness Artifact"
"A signed summary of your wellness activity. Export it for
 your records. The artifact is signed with your wallet address
 and includes a SHA-256 hash for tamper evidence."
```

### Responsive Notes

- **Desktop:** 2-column layout: [streak + weekly overview 280px] | [goals list + artifact card].
- **Mobile:** Single column. Streak is a full-width card at top. Goals list below. Artifact card at bottom.

### Empty / Loading / Error States

- **Loading:** Skeleton for goal rows (2–3 skeleton rows).
- **Empty (no goals):** See copy improvements above.
- **Error (wellness data unavailable):**
  ```
  ┌─ Wellness Data Unavailable ──────────────────────────────────
  │ Could not load your wellness data. Your existing goals
  │ and streak are saved locally.
  │
  │ [Try Again]
  └──────────────────────────────────────────────────────────────
  ```

### Forbidden Claims

- Do NOT add a `canSubmit` strip to the Wellness desk.
- Do NOT link Wellness data to any market execution or trading outcome.
- Do NOT promise that using the Wellness desk will improve trading performance.
- Do NOT use "therapy", "medical", "diagnosis", or "treatment" language without explicit medical disclaimer.

### QA Screenshots

1. `wellness-desk--overview.png` — Full wellness desk on desktop.
2. `wellness-desk--mobile.png` — Mobile layout.
3. `wellness-desk--empty.png` — Empty goal list state.
4. `wellness-desk--loading.png` — Skeleton state.
5. `wellness-desk--artifact-export.png` — Artifact export card visible.

---

## Screen 8 — Services Planned-Not-Live Entry

**File:** `apps/app/src/domains/session/chat/session-page.tsx` (Services desk-launcher card)

### 5-Second Test

The user clicks the Services card in the hub and sees a "Coming Soon" landing state. No error, no blank screen — a clean, branded empty state that clearly communicates this feature is planned.

### Primary Action

Read the "Coming Soon" message and return to the hub or browse existing desks.

### Secondary Actions

- Click "Learn more" to open a documentation page in a new tab.
- Dismiss the panel and return to the hub.

### Copy Improvements

**Landing state — current (assumed):**
```
"No services connected. Connect a service to extend Matterhorn."
```
**Proposed:**
```
┌─ Services ─────────────────────────────────────────────────────
│ Coming Soon
│
│ Services let you connect Matterhorn to external platforms and
│ extend your workspace. Integration is not yet available.
│
│ Want early access?
│ [Join the waitlist →]
│
│ [← Back to hub]
└──────────────────────────────────────────────────────────────
```

**Rationale:** "No services connected" implies the feature exists but needs configuration. "Coming Soon" is honest. Adding a waitlist CTA turns a dead-end screen into a funnel entry point.

**If a waitlist CTA is not yet implemented, use:**
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

**Rationale:** No dangling promise. No waitlist link if the form doesn't exist yet.

### Responsive Notes

- **Desktop:** Centered panel, max-width 480px, centered in the main content area.
- **Mobile:** Full-width, full-viewport height. Content is vertically centered.
- **Tablet:** Same as desktop.

### Empty / Loading / Error States

- **Loading:** Skeleton placeholder (single card skeleton, not a spinner).
- **Error:** N/A — this screen should never show an error state. If data fetching fails, fall back to the "Coming Soon" state.

### Forbidden Claims

- Do NOT list specific services by name unless they are confirmed for the beta.
- Do NOT say "coming soon" without a badge or visual indicator.
- Do NOT show a configuration form for services.
- Do NOT link to a signup form that doesn't exist.

### QA Screenshots

1. `services-coming-soon--desktop.png` — Coming Soon state on desktop.
2. `services-coming-soon--mobile.png` — Coming Soon state on mobile.
3. `services-coming-soon--hub-badge.png` — Services card in hub with "Coming soon" badge visible.

---

## Screen 9 — Chat Composer and Transcript Cards

**Files:**
- `apps/app/src/domains/session/surface/composer/composer.tsx`
- `apps/app/src/domains/session/surface/message-list.tsx`

### 5-Second Test

The user sees a text input at the bottom of the screen with "Describe your task…" placeholder. Above it, a chat transcript is visible. New messages appear with a typewriter animation. Tool output renders in styled cards below user messages.

### Primary Action

Type in the composer and press Enter or click the send button to submit a message.

### Secondary Actions

- Click `/` to open the slash command menu.
- Click the attachment button to attach files.
- Click the tool button to browse available commands, skills, and MCPs.
- Click any message to expand tool outputs.
- Click "Copy" on any tool output card.

### Copy Improvements

**Composer placeholder — current:**
```
"Describe your task..."
```
**Proposed (keep, but ensure it updates contextually):**
```
"Describe your task…"
```

**When a desk is open (Bittensor, Hyperliquid, Polymarket), update the placeholder:**
- Bittensor desk open: `"Ask about your TAO wallet, subnets, or validators…"`
- Hyperliquid desk open: `"Ask about market prices, orderbook, or preview an order…"`
- Polymarket desk open: `"Ask about prediction markets or preview a position…"`
- Wellness desk open: `"Ask about your wellness goals or create a workflow…"`
- No desk open: `"Describe your task…"`

**Rationale:** Contextual placeholders reduce friction. When the user is already in a Bittensor context, they shouldn't have to type "bittensor" to get relevant responses.

**Slash command menu — "Try in chat" → "Ask in chat →":**
Change all "Try in chat" labels in the slash command menu to "Ask in chat →". Apply this consistently across all venue sections of the slash command menu.

**Tool output card — add a "Read-Only" badge to market-related cards:**
Market-related tool output cards (Bittensor reads, Hyperliquid data, Polymarket data) should show a small blue "Read-Only" badge in the top-right of the card.

**Transcript card — "Matterhorn Work" in message headers:**
User messages show "You" as the sender. AI messages show the model name ("MiniMax-M2.7"). Change this to:
```
"Matterhorn"
```
**Rationale:** "MiniMax-M2.7" is a model name, not a product name. Users see "Matterhorn" as the brand. The model name can stay in a tooltip or settings debug view.

**Stop button — change from:**
```
"Stop"
```
**To:**
```
"Stop generating"
```

**Rationale:** "Stop" alone is ambiguous — does it stop the app? The session? "Stop generating" is unambiguous.

### Responsive Notes

- **Desktop:** Composer is full-width of the main content area. Sticky at the bottom. Tool output cards are max-width 640px, centered within the transcript.
- **Tablet:** Same as desktop, composer height increases slightly (48px → 56px).
- **Mobile:** Composer is full-width, sticky at the bottom, above the bottom tab bar. Message list scrolls above it. Tool output cards are full-width.

### Empty / Loading / Error States

- **Empty (no messages yet):** Show a welcome message in the transcript area:
  ```
  Matterhorn: Hi. What would you like to do today?
              I can help you browse markets, preview orders, build
              wellness workflows, and more — without touching your keys.
  ```
- **Loading (waiting for model response):** Show 3 animated skeleton dots (pulsing circles, not a spinner). After 5s, add a secondary notice: "This is taking longer than expected. You can continue in chat."
- **Error (model unavailable):**
  ```
  ┌─ Couldn't reach the model ───────────────────────────────────
  │ Check your network connection and try again.
  │ [Try again]
  └──────────────────────────────────────────────────────────────
  ```
- **Error (wallet action failed):**
  The tool output card shows an amber "Failed" badge with the error message:
  ```
  [Amber badge: Failed]
  "Couldn't read wallet data. Check the address and try again."
  ```

### Forbidden Claims

- Do NOT show a "Copy code" button for tool output that includes seed phrases, private keys, or API keys (if any such output accidentally appears, it must be redacted before display).
- Do NOT show the raw model API token or internal tool names in the transcript.
- Do NOT show a "Submit" or "Execute" button inside any tool output card.
- Do NOT render HTML from model output without sanitization.

### QA Screenshots

1. `chat--composer-empty.png` — Empty composer with placeholder.
2. `chat--composer-desk-context.png` — Composer with Bittensor desk open and contextual placeholder.
3. `chat--slash-menu.png` — Slash command menu open.
4. `chat--transcript-market-card.png` — Transcript with market tool output card showing Read-Only badge.
5. `chat--loading-state.png` — Skeleton dots loading state.
6. `chat--error-model.png` — Model unavailable error.
7. `chat--mobile-composer.png` — Composer on mobile with keyboard open.

---

## Screen 10 — Error / Degraded Readiness States

**File:** Global — all screens should handle these states

### 5-Second Test

When a critical failure occurs (network error, wallet disconnected, service unreachable), the user sees a branded error card that explains what happened in plain language, what they can do, and what is still working. The error is never a blank screen, a raw exception, or a red wall of text.

### Primary Action

Read the error message. Click "Try Again" or take the suggested action.

### Secondary Actions

- Dismiss the error panel (where safe — non-critical errors only).
- Open the documentation for the affected feature.
- Report the issue via the feedback button.

### Copy Standards for All Error States

Every error state must include:

1. **Heading** — What failed (in ≤6 words)
2. **Body** — What the user should do (in ≤2 sentences)
3. **Action** — One primary CTA button
4. **Severity** — Visual weight proportional to severity

**Error severity levels and visual treatment:**

| Severity | When | Visual |
|---|---|---|
| **Ambient** | Non-critical, one desk/data source affected | Amber banner at top of affected panel. Amber left border on card. Amber dot on status bar. |
| **Modal** | Critical but recoverable | Centered card overlay, amber accent, "Try Again" CTA. |
| **Fatal** | Full app failure | Full-screen branded error, "Report issue" CTA. |

**Ambient errors** (recoverable, one component):
```
⚠ [Amber] Some data is unavailable
This desk's market data couldn't be refreshed. Showing
cached values. [Refresh]
```
Do NOT show ambient errors as modal overlays. They must not interrupt the user's flow.

**Modal errors** (recoverable, requires action):
```
┌─ [Icon] Unable to reach [Service] ───────────────────────────
│ Check your connection and try again. If the problem persists,
│ visit the status page.
│
│ [Try Again]  [Status page →]
└──────────────────────────────────────────────────────────────
```

**Fatal errors** (full app failure):
```
┌─ Something went wrong ─────────────────────────────────────────
│ Matterhorn Work encountered an error and needs to restart.
│ Your workspace data is safe.
│
│ [Restart Matterhorn]  [Report issue]
└──────────────────────────────────────────────────────────────
```

### Wallet Disconnection — Specific Copy

**When wallet is disconnected during a session:**
```
┌─ Wallet Disconnected ─────────────────────────────────────────
│ Your wallet has been disconnected.
│ Reconnect to continue using market desks and chat.
│
│ [Reconnect Wallet]
└──────────────────────────────────────────────────────────────
```
Do NOT show the raw Web3 provider error message. Do not show a stack trace.

### Network Error — Specific Copy

**When the server is unreachable:**
```
┌─ Can't reach Matterhorn ───────────────────────────────────────
│ Check your network connection and the server URL
│ (if using a remote worker).
│
│ [Try Again]
└──────────────────────────────────────────────────────────────
```

### Responsive Notes

- **Mobile:** Error cards are full-width. "Try Again" is full-width button. Scroll to ensure the CTA is above the fold.
- **Desktop:** Error cards are centered, max-width 400px.

### Forbidden Claims

- Do NOT show raw HTTP status codes, error codes, or stack traces to users.
- Do NOT say "your data is safe" unless you can confirm it (e.g., workspace data is local — say that specifically).
- Do NOT use the word "error" in headings. Use "Unable to…", "Couldn't…", or "Something went wrong".
- Do NOT show ambient errors as modal overlays.
- Do NOT show password, token, or credential fields in error states.

### QA Screenshots

1. `error--ambient-market.png` — Amber banner on a market desk.
2. `error--modal-service.png` — Modal error for a service.
3. `error--wallet-disconnected.png` — Wallet disconnection error card.
4. `error--network.png` — Network error card.
5. `error--fatal.png` — Fatal full-screen error.
6. `error--mobile-modal.png` — Modal error on mobile viewport.

---

## Stitch Prompts

Use these prompts with Stitch AI to implement the UI improvements documented above.

---

### Stitch Prompt 1: Protocol Desk Layout (Bittensor / Hyperliquid / Polymarket)

```
Implement a consistent protocol desk shell for Matterhorn Work.

The shell appears in the right panel of the session page (320px on desktop, slide-over on mobile/tablet).
Every desk uses this shell structure:

┌─ [Venue Logo + Name] ────────────────── [Safety Badge] ────────┐
│ Can Submit: No  ·  Live Submission: Off  ·  External Signer: Ready │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  [Venue-specific content: market cards, orderbook, etc.]      │
│                                                               │
│  [Ask in chat →]                                              │
└───────────────────────────────────────────────────────────────┘

Design tokens from docs/ui/matterhorn-customer-ux-refresh/styles.css:
- --mh-bg-base: #0C0C0C
- --mh-accent: #D1F2FF
- --mh-green: #22C55E (for "Ready" state)
- --mh-amber: #F59E0B (for "Connecting" or "Stale" state)
- --mh-blue: #3B82F6 (for "Coming soon" or "Read-Only" badge)
- --mh-red: #EF4444 (for "Unavailable" state)

Constraints:
- The safety strip ("Can Submit: No · Live Submission: Off · External Signer: Ready") is ALWAYS visible and never collapses.
- The venue name is in the header. The venue logo is the Matterhorn mark only.
- "Ask in chat →" is a ghost button that pre-fills the composer with a relevant prompt.
- No submit, confirm, sign, execute, or place-order buttons anywhere in the desk shell.
- Font: JetBrains Mono for all data, Aeonik-style sans for all prose.
- Brand: Matterhorn logo only. No OpenWork/OpenCode.
```

---

### Stitch Prompt 2: Chat Transcript Card Polish

```
Polish the chat transcript card system in Matterhorn Work.

Files: apps/app/src/domains/session/surface/message-list.tsx and related components

Changes required:

1. AI message sender label: Change from "MiniMax-M2.7" to "Matterhorn".
   The model name stays in a tooltip: "Responded by MiniMax-M2.7".

2. Market-related tool output cards: Add a small blue "Read-Only" badge
   (--mh-blue, pill shape) in the top-right corner of any card that
   displays Bittensor, Hyperliquid, or Polymarket data.

3. Contextual composer placeholder:
   - No desk open: "Describe your task…"
   - Bittensor desk open: "Ask about your TAO wallet, subnets, or validators…"
   - Hyperliquid desk open: "Ask about market prices, orderbook, or preview an order…"
   - Polymarket desk open: "Ask about prediction markets or preview a position…"
   - Wellness desk open: "Ask about your wellness goals or create a workflow…"

4. Loading state (waiting for model response): Show 3 animated skeleton dots
   (pulsing circles, 150ms stagger). After 5 seconds, show a secondary notice:
   "This is taking longer than expected. You can continue in chat."

5. Stop button: Rename from "Stop" to "Stop generating".

Design tokens from styles.css: same as Stitch Prompt 1.
All text is left-aligned. Cards are max-width 640px, centered in transcript.
Brand: Matterhorn logo only. No OpenWork/OpenCode.
```

---

### Stitch Prompt 3: Welcome / Launcher Page

```
Implement the Welcome / Launcher page for Matterhorn Work.

File: apps/app/src/domains/onboarding/welcome-page.tsx

Structure:
- Full dark canvas (#0C0C0C), centered content, max-width 480px.
- Matterhorn mark + "Matterhorn Work" wordmark at top.
- Three onboarding steps (collapsible on mobile).
- "Get Started" CTA button (full-width on mobile, auto-width on desktop).

Onboarding steps (exact copy):
1. "Create your workspace" / "Matterhorn saves chats, artifacts, receipts, and workflow files locally on your device. Nothing is uploaded without your consent."
2. "Choose a product lane" / "Open Bittensor, Hyperliquid, Polymarket, wellness workflows, or a blank chat."
3. "Review before action" / "Inspect evidence, preview-only actions, and external-signer handoffs before anything sensitive happens. Matterhorn never holds your keys."

Design tokens from styles.css:
- --mh-bg-base: #0C0C0C
- --mh-accent: #D1F2FF (for CTA button background)
- --mh-text-primary: #F0F0F0
- --mh-text-secondary: #8A8A8A
- --mh-border: #2A2A2A

Responsive:
- Desktop: Steps in a vertical list, centered, max-width 480px.
- Mobile: Steps collapsed by default (single line + chevron to expand).
  "Get Started" button is full-width.

Loading state: Skeleton of the welcome card (3 step skeletons + button skeleton).
Error state: Inline notice above CTA: "Couldn't load. Check your connection." + "Try again" link.

Constraints:
- No OpenWork/OpenCode branding anywhere.
- No "submit", "sign", "trade", "live trading" language.
- No live market data ticker.
```

---

### Stitch Prompt 4: Right Rail Protocol Navigation

```
Implement the right rail protocol navigation for Matterhorn Work.

The right rail is the 320px contextual panel that opens when a user clicks a desk-launcher card
(Bittensor, Hyperliquid, Polymarket, Wellness) in the session hub.

Layout structure:
┌─────────────────────────────────────────┐
│ [← Back to hub]         [Pin] [Close] │  ← rail header
├─────────────────────────────────────────┤
│                                         │
│  [Desk content — venue-specific]        │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  [Ask in chat →]                        │  ← sticky CTA
└─────────────────────────────────────────┘

Behavior:
- Opens with a 250ms slide-in from the right (cubic-bezier(0.32, 0.72, 0, 1)).
- "← Back to hub" returns to the session hub without closing the session.
- "Pin" (icon: 📌) keeps the rail open when switching between desks.
- "Close" (icon: ✕) closes the rail and returns focus to the chat.
- The rail can be opened alongside the chat — it does not replace the chat.
- On tablet (640–1199px): rail is a 380px slide-over.
- On mobile (<640px): rail is a full-height bottom sheet (80vh, draggable handle).

Constraints:
- The safety strip is always visible at the top of the desk content.
- No submit, confirm, sign, or execute buttons in the rail header.
- "Ask in chat →" CTA is sticky at the bottom of the rail.
- Brand: Matterhorn mark only. No OpenWork/OpenCode.
```

---

### Stitch Prompt 5: Mobile Responsive Protocol Desk

```
Implement the mobile-responsive layout for all protocol desks in Matterhorn Work.

Viewport: < 640px (iPhone and Android phones)

Layout structure for each desk on mobile:

┌─────────────────────────────────┐
│ [≡]  Bittensor  [Safety]  [◈] │  ← top bar (sticky, 48px)
├─────────────────────────────────┤
│ Can: No · Live: Off · Ready    │  ← safety strip (sticky, 36px)
├─────────────────────────────────┤
│                                 │
│  [Desk content — scrollable]    │
│  (market cards, orderbook,      │
│   wallet data, etc.)             │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│  [← Back to hub]  [Ask in chat]│  ← sticky footer CTA (56px)
└─────────────────────────────────┘

Key mobile-specific requirements:

1. Safety strip: Condensed to "Can: No · Live: Off · Ready" (abbreviated from
   "Can Submit: No · Live Submission: Off · External Signer: Ready").
   Always sticky below the top bar.

2. Market cards: Single column, full-width (no 2-column grid on mobile).

3. Orderbook: Show first 5 rows. "Show more ↓" expands the rest.
   Horizontal scroll with sticky price column.

4. Context panel (where applicable): Slides up from bottom as a sheet
   (80vh height, draggable handle at top). No swipe-to-dismiss on
   safety-critical panels (order preview, handoff card).

5. Bottom CTA: "Ask in chat" is a full-width button, 48px tall minimum.
   Positioned above the chat composer (if chat is open) or as the
   primary action (if chat is not open).

6. Touch targets: All interactive elements are minimum 44×44px.
   Badge labels can be smaller (22px height).

7. Font scaling: --text-base → 14px, --text-sm → 12px on mobile.
   --text-xs stays at 11px.

Design tokens: same as Stitch Prompt 1.
Brand: Matterhorn logo only. No OpenWork/OpenCode.
```
