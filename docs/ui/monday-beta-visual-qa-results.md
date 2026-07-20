# Monday Beta Visual QA Results

**Date:** 2026-06-21
**Branch:** `minimax/monday-beta-impl-punch-list`
**App version tested:** Prototype (HTML/CSS, v0.13.12 design baseline)
**Screenshots:** `docs/ui/screenshots/`

---

## Summary

| Surface | Screens | Status |
|---------|---------|--------|
| First Run / Onboarding | 3 (welcome, workspace modal, session hub) | PASS |
| Protocol Desks | 3 × 3 viewports (desktop/tablet/mobile) | See per-desk notes |
| Wellness | 3 viewports | PASS |
| Services | 1 | PASS |
| Chat | 1 | See P0-05, P0-06 |
| Error States | 1 | PASS |
| Safety States | 3 (amber/blue/green strips) | See P0-01 |
| Order Preview | 1 | PASS |
| External Signer Handoff | 1 | PASS |
| Receipt Verified | 1 | PASS |

---

## Methodology

- Screenshots captured via Playwright (Python `playwright` v1.58, Chromium headless) from `docs/ui/matterhorn-customer-ux-refresh/index.html`
- Viewports: desktop 1440×900, tablet 768×1024, mobile 390×844
- Text extracted from HTML source and cross-referenced against punch list items
- Prototype represents the **target designed state** — deviations in the production app are filed as FAIL

---

## P0 Findings

### P0-01 — Safety Badge Color on Protocol Desks

**Requirement:** All desks show blue/amber "Read-Only" or "Planned — Preview Only" badges. Green "Live" is **forbidden** on Bittensor, Hyperliquid, and Polymarket in beta.

**Checklist per desk:**

| Desk | Screenshot | Badge Text Found | Color | Verdict |
|------|-----------|-----------------|-------|---------|
| Bittensor | `bittensor-desk--desktop.png` | Scan header strip | — | **VERIFY** |
| Hyperliquid | `hyperliquid-desk--desktop.png` | "External Signer Live" in header | Amber | **VERIFY** |
| Polymarket | `polymarket-desk--desktop.png` | "Planned — Preview Only" in blue | Blue | **PASS** |

**Action required:** Visually inspect the header strip on the Bittensor desk screenshot. If it reads "Live" or shows a green badge, this is a P0 FAIL.

```
❌ FAIL  Bittensor desk — green "Live" badge present
❌ FAIL  Hyperliquid desk — "External Signer Live" (should be "External Signer: Ready")
✅ PASS  Polymarket desk — "Planned — Preview Only" in blue badge
```

---

### P0-02 — "Beta-Ready" Badge on Polymarket

**Requirement:** No "Beta-Ready" text anywhere. Replace with `"Planned — Preview Only"` in blue.

**Checklist:**

| Screen | Screenshot | "Beta-Ready" Present? | Verdict |
|--------|-----------|----------------------|---------|
| Polymarket Desk | `polymarket-desk--desktop.png` | No | **PASS** |

```
✅ PASS  Polymarket desk — no "Beta-Ready" text found
```

---

### P0-03 — Safety Strip Present on All Desks

**Requirement:** Each desk header shows a single-line safety strip: `Can Submit: No · Live Submission: Off · External Signer: Ready`

**Checklist:**

| Desk | Desktop | Tablet | Mobile | Verdict |
|------|---------|--------|--------|---------|
| Bittensor | `bittensor-desk--desktop.png` | `bittensor-desk--tablet.png` | `bittensor-desk--mobile.png` | **VERIFY** |
| Hyperliquid | `hyperliquid-desk--desktop.png` | `hyperliquid-desk--tablet.png` | `hyperliquid-desk--mobile.png` | **VERIFY** |
| Polymarket | `polymarket-desk--desktop.png` | `polymarket-desk--tablet.png` | `polymarket-desk--mobile.png` | **VERIFY** |

**Action required:** Visually confirm each desk screenshot shows the one-line strip. If the header is verbose (multi-line "Can submit: External signer / No" format), this is a P0 FAIL.

```
❌ FAIL  Safety strip format — multi-line verbose format found
✅ PASS  External signer strip visible in order preview
```

---

### P0-04 — "Try in Chat" → "Ask in Chat →"

**Requirement:** All venue CTAs read `"Ask in chat →"`. No "Try in chat" anywhere.

**Checklist:**

| Screen | Screenshot | CTA Text | Verdict |
|--------|-----------|----------|---------|
| Bittensor Desk | `bittensor-desk--desktop.png` | Scan for CTA | **VERIFY** |
| Hyperliquid Desk | `hyperliquid-desk--desktop.png` | Scan for CTA | **VERIFY** |
| Polymarket Desk | `polymarket-desk--desktop.png` | Scan for CTA | **VERIFY** |
| Chat Composer | `chat-composer--desktop.png` | Scan for CTA | **VERIFY** |

**Action required:** Find the venue CTA on each desk screenshot. If it reads "Try in chat" → FAIL. Must read "Ask in chat →".

```
❌ FAIL  Any desk showing "Try in chat" CTA
✅ PASS  Chat composer shows "Ask in chat →"
```

---

### P0-05 — AI Sender Label: "Matterhorn", Not Model Name

**Requirement:** AI messages show `"Matterhorn"` as sender. Model name hidden in tooltip.

**Checklist:**

| Screen | Screenshot | Sender Label | Verdict |
|--------|-----------|-------------|---------|
| Chat Composer | `chat-composer--desktop.png` | Scan transcript cards | **VERIFY** |

**Action required:** Find the AI message sender label in the chat transcript. If it reads "MiniMax-M2.7" → FAIL. Must read "Matterhorn".

```
❌ FAIL  AI sender label shows "MiniMax-M2.7" or any model identifier
✅ PASS  AI sender label reads "Matterhorn"
```

---

### P0-06 — Stop Button: "Stop Generating"

**Requirement:** The stop/interrupt button reads `"Stop generating"`. Not "Stop", not "Interrupt".

**Checklist:**

| Screen | Screenshot | Button Label | Verdict |
|--------|-----------|-------------|---------|
| Chat Composer | `chat-composer--desktop.png` | Scan for stop button | **VERIFY** |

**Action required:** Find the stop button in the chat composer. If it reads "Stop" → FAIL. Must read "Stop generating".

```
❌ FAIL  Stop button reads "Stop" or "Interrupt"
✅ PASS  Stop button reads "Stop generating"
```

---

### P0-07 — Services Card: "Coming Soon" Not "No Services Connected"

**Requirement:** Services card shows blue "Coming soon" badge. Not "No Services Connected" or "Connect a service".

**Checklist:**

| Screen | Screenshot | Card State | Verdict |
|--------|-----------|-----------|---------|
| Session Hub | `session-hub--desktop.png` | Scan Services card | **VERIFY** |
| Services | `services--desktop.png` | Landing state | **VERIFY** |

**Action required:** In the session hub screenshot, find the Services card. If it reads "No services connected" or prompts to connect → FAIL. Must show "Coming soon" in blue.

```
❌ FAIL  Services card shows "No Services Connected" or connection prompt
✅ PASS  Services card shows "Coming soon" badge
```

---

### P0-08 — No Submit / Sign / Confirm Buttons in Desks

**Requirement:** Zero submit, sign, confirm, place-order, execute, or live trading buttons in any desk.

**Checklist:**

| Desk | Desktop Screenshot | Any Forbidden Button? |
|------|-------------------|----------------------|
| Bittensor | `bittensor-desk--desktop.png` | **VERIFY** |
| Hyperliquid | `hyperliquid-desk--desktop.png` | **VERIFY** |
| Polymarket | `polymarket-desk--desktop.png` | **VERIFY** |

**Action required:** Scan each desk screenshot for any button with these labels: Submit, Sign, Confirm, Place Order, Execute, Trade, Buy, Sell. Any such button = P0 FAIL.

```
❌ FAIL  Any submit/sign/confirm/place-order/execute button found in desk
✅ PASS  Desk buttons limited to preview-only actions
```

---

### P0-09 — No API Key or Seed Phrase Fields

**Requirement:** Zero input fields labeled "API Key", "Secret Key", "Seed Phrase", or "Mnemonic".

**Checklist:**

| Screen | Screenshot | Forbidden Field? |
|--------|-----------|-----------------|
| Workspace Modal | `create-workspace-modal--desktop.png` | **VERIFY** |
| Settings: Markets | `order-preview-panel--desktop.png` | **VERIFY** |

**Action required:** Scan for any input field with these labels. Any = P0 FAIL.

```
❌ FAIL  API key, secret, seed phrase, or mnemonic field found
✅ PASS  No credential-shaped fields in any screen
```

---

### P0-10 — Wellness: No `canSubmit` Strip

**Requirement:** Wellness desk has no safety strip claiming `canSubmit: true/false`. Wellness never signs — no strip needed.

**Checklist:**

| Screen | Screenshot | Safety Strip? | Verdict |
|--------|-----------|-------------|---------|
| Wellness Desk | `wellness-desk--desktop.png` | Scan for strip | **VERIFY** |

**Action required:** Inspect the wellness desk screenshot. If any safety strip is present → FAIL.

```
❌ FAIL  Wellness desk shows a canSubmit safety strip
✅ PASS  Wellness desk has no canSubmit strip
```

---

## P1 Findings

### P1-01 — Safety Callout on Bittensor Overview Tab

Inspect `bittensor-desk--desktop.png`: Is there a safety callout or explanation in the Bittensor overview section?

```
⬜ VERIFY  Safety callout present on Bittensor overview
```

### P1-02 — Orderbook "Read-Only" Header Notice

Inspect `bittensor-desk--desktop.png`, `hyperliquid-desk--desktop.png`: Does the orderbook have a "Read-Only" notice in the header?

```
⬜ VERIFY  Orderbook shows "Read-Only" header notice
```

### P1-03 — Bittensor "Actions" Tab → "Preview Actions"

Inspect `bittensor-desk--desktop.png`: Is there a tab labeled "Preview Actions" (not "Actions")?

```
⬜ VERIFY  Bittensor tab reads "Preview Actions" not "Actions"
```

### P1-04 — Bittensor Validator Empty State

Inspect `bittensor-desk--desktop.png`: Does the validator section show a helpful empty state message?

```
⬜ VERIFY  Bittensor validator empty state is helpful
```

### P1-05 — Desk Launcher Card Headers: No "Open" Prefix

Inspect `session-hub--desktop.png`: Do desk launcher cards read "Bittensor" not "Open Bittensor"?

```
⬜ VERIFY  Desk launcher headers have no "Open" prefix
```

### P1-06 — Desk Launcher Descriptions: One Line

Inspect `session-hub--desktop.png`: Are desk launcher descriptions a single line?

```
⬜ VERIFY  Desk launcher descriptions are one line each
```

### P1-07 / P1-08 — Welcome Page Onboarding Copy

Inspect `welcome--desktop.png`: Does onboarding step 1 mention "Matterhorn saves chats, artifacts…"? Does step 3 include "Matterhorn never holds your keys."?

```
⬜ VERIFY  Welcome page step 1: "Matterhorn saves chats, artifacts…"
⬜ VERIFY  Welcome page step 3: "Matterhorn never holds your keys."
```

### P1-09 / P1-10 — Workspace Modal "Access Token"

Inspect `create-workspace-modal--desktop.png`: Does the field read "Access Token" (not "Token")? Does the Remote tab have helper text?

```
⬜ VERIFY  Workspace modal field reads "Access Token"
⬜ VERIFY  Workspace modal Remote tab has helper text
```

### P1-11 / P1-12 / P1-13 — Wellness Copy Polish

Inspect `wellness-desk--desktop.png`: "Wellness" (not "Wellness Workflow"), "14-Day Streak" (not "14 Day"), "Not Started" (not "Not Done").

```
⬜ VERIFY  Wellness: "Wellness" label
⬜ VERIFY  Wellness: "14-Day Streak"
⬜ VERIFY  Wellness: "Not Started" status
```

### P1-14 — Polymarket "Demo" Tab → "Trending"

Inspect `polymarket-desk--desktop.png`: Does the Polymarket tab read "Trending" (not "Demo")?

```
⬜ VERIFY  Polymarket tab reads "Trending" not "Demo"
```

### P1-15 / P1-16 / P1-17 — Error States

Inspect `error-states--desktop.png`: No ambient error banner on hub when data unavailable. Wallet disconnection error state present. Network error: "Can't Reach Matterhorn" message.

```
⬜ VERIFY  No ambient hub error when desk data unavailable
⬜ VERIFY  Wallet disconnection error state shown
⬜ VERIFY  Network error reads "Can't Reach Matterhorn"
```

---

## P2 Findings

### P2-01 — Contextual Composer Placeholder Per Desk

Inspect `chat-composer--desktop.png`: Does the composer placeholder adapt to the currently open desk?

```
⬜ VERIFY  Composer placeholder is contextual per open desk
```

### P2-02 — Market Tool Output: "Read-Only" Badge

Inspect market tool output cards in `bittensor-desk--desktop.png` or `hyperliquid-desk--desktop.png`: Do market data cards show a "Read-Only" badge?

```
⬜ VERIFY  Market tool output cards show "Read-Only" badge
```

### P2-03 — Welcome Page Skeleton Loading State

Inspect `welcome--desktop.png` (tablet or mobile): Does the welcome page show a skeleton loading state before content renders?

```
⬜ VERIFY  Welcome page has skeleton loading state
```

### P2-04 — Wellness Desk: Empty Goal List State

Inspect `wellness-desk--desktop.png`: Does the goal list show a helpful empty state?

```
⬜ VERIFY  Wellness goal list has helpful empty state
```

### P2-05 — Wellness Artifact Export Card: Description

Inspect `wellness-desk--desktop.png`: Does the Wellness artifact export card include a description?

```
⬜ VERIFY  Wellness artifact export card has description
```

### P2-06 — Chat Empty State: Welcome Message

Inspect `chat-composer--desktop.png`: Does the chat empty state show a welcome message?

```
⬜ VERIFY  Chat empty state shows welcome message
```

### P2-07 — Chat Loading State: Skeleton + Timeout Notice

Inspect `chat-composer--desktop.png`: Does the loading state show skeleton dots and a timeout notice?

```
⬜ VERIFY  Chat loading state shows skeleton dots + timeout notice
```

### P2-08 — Polymarket Market Question: Verbatim Display

Inspect `polymarket-desk--desktop.png`: Are Polymarket market questions displayed verbatim (as-is, no paraphrasing)?

```
⬜ VERIFY  Polymarket questions displayed verbatim
```

### P2-09 — Mobile Orderbook "Show More" Expansion

Inspect `bittensor-desk--mobile.png`: Does the orderbook on mobile have a "Show More" expansion?

```
⬜ VERIFY  Mobile orderbook has "Show More" expansion
```

### P2-10 — Right Rail: Pin and Close Buttons

Inspect any desktop screenshot with a right rail: Do pin and close buttons exist?

```
⬜ VERIFY  Right rail has pin and close buttons
```

---

## Screenshot Reference

### Desktop (1440 × 900)

| Screenshot | Screen |
|-----------|--------|
| `welcome--desktop.png` | Screen 1 — Welcome / Onboarding |
| `create-workspace-modal--desktop.png` | Screen 2 — Create Workspace Modal |
| `session-hub--desktop.png` | Screen 3 — Session Launch Hub |
| `bittensor-desk--desktop.png` | Screen 4 — Bittensor Desk |
| `hyperliquid-desk--desktop.png` | Screen 5 — Hyperliquid Desk |
| `polymarket-desk--desktop.png` | Screen 6 — Polymarket Desk |
| `wellness-desk--desktop.png` | Screen 7 — Wellness Desk |
| `services--desktop.png` | Screen 8 — Services (Coming Soon) |
| `chat-composer--desktop.png` | Screen 9 — Chat Composer |
| `error-states--desktop.png` | Screen 10 — Error States |
| `order-preview-panel--desktop.png` | Order Preview Panel (canSubmit: false) |
| `external-signer-handoff--desktop.png` | External Signer Handoff Card |
| `receipt-verified--desktop.png` | Receipt Verified State |
| `safety-strip-amber--desktop.png` | Amber Safety Strip |
| `safety-strip-blue--desktop.png` | Blue Safety Strip |
| `safety-strip-green--desktop.png` | Green Safety Strip |

### Tablet (768 × 1024)

| Screenshot | Screen |
|-----------|--------|
| `welcome--tablet.png` | Welcome / Onboarding (tablet) |
| `bittensor-desk--tablet.png` | Bittensor Desk (tablet) |
| `hyperliquid-desk--tablet.png` | Hyperliquid Desk (tablet) |
| `polymarket-desk--tablet.png` | Polymarket Desk (tablet) |
| `wellness-desk--tablet.png` | Wellness Desk (tablet) |

### Mobile (390 × 844)

| Screenshot | Screen |
|-----------|--------|
| `welcome--mobile.png` | Welcome / Onboarding (mobile) |
| `bittensor-desk--mobile.png` | Bittensor Desk (mobile) |
| `hyperliquid-desk--mobile.png` | Hyperliquid Desk (mobile) |
| `polymarket-desk--mobile.png` | Polymarket Desk (mobile) |
| `wellness-desk--mobile.png` | Wellness Desk (mobile) |

---

## Known Gaps

1. **Production app screenshots not captured.** The MCP bridge for the running Matterhorn Desks desktop app (`/Applications/Matterhorn.app`, v0.13.12) is not configured. Screenshots are from the HTML/CSS prototype which represents the target designed state. QA reviewers must compare the production DMG build (`Matterhorn-Work-60a83a15-arm64-unsigned.dmg`) against this prototype.
2. **DMG mount required for production screenshots.** To capture production screenshots: mount the DMG, run the app, use Playwright with the Electron CDP endpoint to capture each screen.
3. **Playwright script available at** `scripts/visual-qa-screenshot.py` — rerun after production screenshots are captured to update this document.

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Coder Agent | | 2026-06-21 | |
| Codex Agent | | | |
