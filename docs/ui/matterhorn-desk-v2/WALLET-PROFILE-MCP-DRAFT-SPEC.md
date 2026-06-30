# Wallet + Profile + MCP Cards + Draft State Polish

**Spec version:** 1.0
**Status:** QA Draft — for Codex implementation
**Branch:** `minimax/wallet-profile-mcp-draft`
**Scope:** Wallet panel, Profile panel, MCP card anatomy, Chat draft state
**Reference:** `docs/ui/matterhorn-desk-v2/index.html` (screens: `screen-wallet`, `screen-profile`, `screen-mcp-card`, `screen-chat-draft`)

This document defines the visual and behavioral quality standard for four surfaces that frequently confuse users: Wallet panel, Profile panel, MCP cards, and Chat draft state.

---

## Part 1 — Wallet Panel

### The Problem

Users are confused about:
1. Whether Matterhorn holds or controls their wallet/keys.
2. Whether a clicked Bittensor/Hyperliquid/Polymarket action sends a transaction automatically.
3. Whether "web wallets" (MetaMask, Rabby) and "desktop wallets" are the same thing.
4. What happens if they connect a wallet — does it persist, who stores it?

---

### Runtime Model

**Fundamental rule: Matterhorn never holds, stores, or transmits private keys, seed phrases, raw signatures, or signed payloads.**

| Runtime | Wallet mechanism | Browser extensions |
|---------|-----------------|-------------------|
| Web (browser) | Injected wallets via `window.ethereum` — MetaMask, Rabby, etc. appear if installed | Yes — standard EIP-1193 |
| Desktop (Electron) | No browser extension API — external signer required via MCP handoff or WalletConnect | No — extensions don't run in Electron |

The UI must make this distinction visible and honest at all times.

---

### Wallet Panel Layout

The wallet panel is a right-rail card (`260px`) and also a full Settings page (`/settings/wallet`). Both surfaces share the same information architecture.

```
┌─ Right Rail: Wallet Card ──────────────────────────────┐
│  [Wallet icon]  Wallet                                │
│  ┌─────────────────────────────────────────────────┐  │
│  │  5CfTC…3bX9   [Copy]                             │  │
│  │  ↗ Truncated · Ethereum mainnet                  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  Status: [emerald dot] Connected  ·  Synced 3s ago    │
│                                                        │
│  [Manage Wallet]  (ghost button)                       │
└────────────────────────────────────────────────────────
```

**Rules:**
- Wallet address always truncated: first 6 + last 4 chars → `5CfTC…3bX9`
- "Manage Wallet" → opens Settings / Wallet page (not a modal)
- No full address shown anywhere
- The rail card shows one connected wallet at a time

---

### Wallet Settings Page

`/settings/wallet` is a dedicated Settings page with the following sections:

#### 1. Web Wallet (Runtime: Browser)

```
┌─ Web Wallets ────────────────────────────────────────┐
│  Runtime supports injected wallets                    │
│  [MetaMask] [Rabby] [WalletConnect] [+]             │
│                                                       │
│  Status: [amber dot] Requires browser runtime         │
│  "Open Matterhorn in a browser with a wallet          │
│   extension to connect."                              │
└───────────────────────────────────────────────────────
```

- Shown when `isWebRuntime === true`
- Lists supported injected wallets (MetaMask, Rabby, WalletConnect)
- Each wallet option shows: icon, name, connection status
- **Honest copy**: "Requires browser runtime" — no claim that the app itself holds keys
- WalletConnect: "Planned" badge if not yet wired; disabled if not wired

#### 2. Desktop Wallet (Runtime: Electron)

```
┌─ Desktop Wallet ──────────────────────────────────────┐
│  [External signer]  MCP-based external signer         │
│                                                       │
│  Status: [emerald dot] Ready                          │
│  "Matterhorn sends intent to your signer.             │
│   Your signer broadcasts the transaction.             │
│   Matterhorn never sees your private key."            │
│                                                       │
│  [Open External Signer]  [Configure MCP]              │
└───────────────────────────────────────────────────────
```

- Shown when `isDesktopRuntime === true`
- No browser extensions available
- MCP-based external signer handoff pattern
- **Safety strip**: "Matterhorn sends intent to your signer. Your signer broadcasts the transaction. Matterhorn never sees your private key."

#### 3. Protocol Map

```
┌─ Protocol Connections ─────────────────────────────────┐
│                                                       │
│  [B] Bittensor                                        │
│      Subtensor API    [emerald] Active    [Browse]    │
│                                                       │
│  [H] Hyperliquid                                      │
│      Market data     [emerald] Active    [Browse]    │
│      Sign intent     [amber]   Ext signer [Set up]   │
│                                                       │
│  [P] Polymarket                                       │
│      Market data     [emerald] Active    [Browse]    │
│      Place market   [gray]   Planned     [—]        │
│                                                       │
└───────────────────────────────────────────────────────
```

**Column anatomy:**
1. **Protocol icon** (SVG, 20px, desk accent color)
2. **Action label** (13px, weight 600)
3. **Scope** (11px, `--v2-text-secondary`)
4. **Badge**: Active (emerald), Ext signer (amber), Planned (gray), Disabled (gray muted)
5. **Action button**: contextual — [Browse] / [Set up] / [—] / [View docs]

**Button copy rules:**
- `[Browse]` = opens read-only market/chain explorer (no transaction)
- `[Set up]` = navigates to configuration (no transaction)
- `[—]` = not wired yet, no action
- **Never**: "Confirm", "Sign", "Send", "Submit order"

#### 4. No-Custody Safety Strip

Always present at the top of the Wallet Settings page:

```
┌──────────────────────────────────────────────────────┐
│ 🔒  Matterhorn never holds your keys, seed phrases,  │
│     API secrets, or signed payloads.                  │
└──────────────────────────────────────────────────────┘
```

Style: `--v2-bg-elevated` background, `--v2-status-warning` accent border-left, amber icon.

---

### Desktop vs Web: Visual Differentiation

When the runtime context is ambiguous, the panel must show a runtime badge:

```
┌─ Wallet ─────────────────────────────────────────────┐
│  [badge: Web]  or  [badge: Desktop]                  │
│                                                       │
│  5CfTC…3bX9  [Copy]                                  │
│                                                       │
│  "Web runtime · Injected wallets available"           │
└───────────────────────────────────────────────────────
```

Badge colors: Web = `--v2-status-info` (blue), Desktop = `--v2-text-secondary` (gray).

---

### Forbidden Wallet Copy

| Phrase | Replacement |
|--------|------------|
| "Matterhorn controls your stake" | "Browse Subtensor via the Bittensor desk" |
| "Matterhorn manages your position" | "Browse your Hyperliquid account externally" |
| "Matterhorn holds your keys" | Never — never say this |
| "Place bet on your behalf" | Never — Polymarket is read-only in beta |
| "Sign transaction" | "Browse" or "Set up" |
| "Confirm trade" | Never |
| "Submit order" | Never |
| Full wallet address | Always truncate: `5CfTC…3bX9` |

---

## Part 2 — Profile Panel

### The Problem

Users cannot determine their sign-in state, cloud status, or where to find account details. The Profile panel must communicate the full account lifecycle honestly.

---

### Profile States

| State | Trigger | Avatar | Primary copy |
|-------|---------|--------|-------------|
| Signed out | No auth token | Placeholder icon | "Sign in to sync across devices" |
| Signed in, local only | Auth token, no cloud | User initials | "Signed in · Local only" |
| Signed in, cloud configured | Auth + cloud token | User photo/initials | "Signed in · Cloud active" |
| Cloud only | Cloud session, no local auth | User photo | "Cloud session" |

---

### Profile Rail Card (260px right rail)

```
┌─ Profile Rail Card ───────────────────────────────────┐
│  [Avatar]  Alex Chen                                  │
│            alex@example.com                           │
│                                                       │
│            [emerald dot] Cloud active                 │
│            Organization: Acme Corp                    │
│                                                       │
│  [View Profile]  [Settings]                          │
└───────────────────────────────────────────────────────
```

**Signed-out state:**
```
┌─ Profile Rail Card ───────────────────────────────────┐
│  [Avatar placeholder]  Not signed in                   │
│                                                       │
│            [gray dot] Local session                  │
│                                                       │
│  [Sign In]                                           │
└───────────────────────────────────────────────────────
```

**Cloud unconfigured state:**
```
┌─ Profile Rail Card ───────────────────────────────────┐
│  [Avatar]  Alex Chen                                  │
│            alex@example.com                           │
│                                                       │
│            [sky dot] Cloud not configured            │
│            "Set up cloud sync to use Matterhorn       │
│             across devices."                         │
│                                                       │
│  [Set Up Cloud]  [Settings]                          │
└───────────────────────────────────────────────────────
```

---

### Profile Settings Page (`/settings/profile` or `/settings/cloud-account`)

```
┌─ Account ─────────────────────────────────────────────┐
│  [Avatar]  alex@example.com                            │
│            Joined Jan 2024                            │
│                                                       │
│  ─────────────────────────────────────────────────  │
│                                                       │
│  Cloud Status                                         │
│  ┌────────────────────────────────────────────────┐  │
│  │  [emerald] Cloud active                        │  │
│  │  Last synced: 2 minutes ago                    │  │
│  │  [Sync Now]  [View Cloud Settings]             │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  Organization                                         │
│  Acme Corp  [emerald] Active                         │
│  3 seats used of 10                                   │
│  [Manage Team]                                        │
│                                                       │
│  Links                                                │
│  [Documentation]  [Support]  [Privacy Policy]        │
│                                                       │
│  Sign Out                                             │
│  [Sign Out]                                           │
└───────────────────────────────────────────────────────
```

---

### Brand Rules for Profile

**Forbidden links/labels in all profile surfaces:**
- "OpenWork" or "openwork" — never
- "OpenCode" or "opencodec" — never
- "lighthouse" — never
- "harness" — never

**Allowed:**
- "Matterhorn" (product name)
- "Matterhorn Docs" / "Documentation"
- "Support" / "Contact Support"
- "Privacy Policy"
- "Terms of Service"

---

## Part 3 — MCP Card Anatomy

### The Problem

Users cannot tell:
1. Whether an MCP is installed/configured or just listed as a catalog item.
2. Whether they can use an MCP outside of Matterhorn.
3. Whether clicking "Configure" sends any credentials or data.

---

### Two Card Types: Catalog vs Installed

#### Catalog Card (Marketplace / MCP Settings Page)

Shown when the MCP is available but not yet installed/configured.

```
┌─ MCP Catalog Card ────────────────────────────────────┐
│  [Icon]  memory-query                                 │
│          Read and write memories from the             │
│          Matterhorn memory store.                     │
│                                                       │
│  Tools:  3 tools supported                            │
│  Scope:  Local only · No credentials required         │
│  Runs:   Inside Matterhorn                            │
│                                                       │
│  ─────────────────────────────────────────────────   │
│  [Install]  [View Documentation]                      │
└───────────────────────────────────────────────────────
```

**Required fields on catalog card:**
1. **Name** (13px, weight 600)
2. **One-line description** (11px, `--v2-text-secondary`)
3. **Tools count**: "3 tools supported"
4. **Safety copy**: "Local only · No credentials required" or "Sends intent externally · External signer required"
5. **"Runs" statement**: "Inside Matterhorn" or "Outside Matterhorn" — answers "Can I use this outside?"
6. **Actions**: [Install] + [View Documentation]

---

#### Installed Card (Configured MCP)

Shown when the MCP is installed and connected.

```
┌─ MCP Installed Card ──────────────────────────────────┐
│  [Icon]  hyperliquid-sign                             │
│          Sign Hyperliquid intent via                  │
│          external signer.                              │
│                                                       │
│  Status:  [amber dot] Active · Ext signer required   │
│  Tools:   2 tools running                             │
│  Last used:  5 minutes ago                            │
│                                                       │
│  ─────────────────────────────────────────────────   │
│  [Test]  [Configure]  [Remove]                        │
└───────────────────────────────────────────────────────
```

**Required fields on installed card:**
1. **Name + description**
2. **Status badge**: Active (emerald), Error (red), Ext signer (amber)
3. **Tools count + "running"**
4. **Last used timestamp** (updates on each call)
5. **Actions**:
   - `[Test]` — runs a read-only smoke test if wired; disabled with tooltip if not wired
   - `[Configure]` — opens configuration panel
   - `[Remove]` — uninstalls the MCP

---

### "Can I use this outside Matterhorn?" Answer

Every MCP card must include one of these two statements, prominently:

| Statement | When | Badge color |
|-----------|------|-------------|
| `Runs: Inside Matterhorn` | Local MCPs, no external network | Emerald |
| `Runs: Outside Matterhorn` | Standalone CLI tools like `matterhorn-work` | Blue |
| `Sends intent externally` | Protocol MCPs with signer | Amber |

The **install command** on catalog cards must use the package manager label + inline code pattern (see MCP-DESK-V2-SPEC.md Section 3.2).

---

### Safety Boundaries on MCP Cards

Never appear on MCP cards:
- API key input field
- Secret/private key input field
- "Submit order", "Sign transaction", "Mint now", "Hire agent"
- Credentials storage copy that implies Matterhorn holds them

Always appear on protocol MCP cards:
- Safety statement: "Matterhorn sends intent. [Signer name] signs. Matterhorn never sees your private key."

---

## Part 4 — Chat Draft State

### The Problem

Users are unsure whether clicking a prompt action sends a message immediately. They also don't know if drafts persist across desk switches.

---

### Draft Prompt Actions

**Button copy rules:**

| Action | Button label | Behavior |
|--------|-------------|----------|
| "Send to composer" | `Draft in chat` | Opens composer with prompt pre-filled, cursor at end |
| "Insert prompt" | `Insert draft` | Same as above |
| Draft prefill | Composer shows draft chip + text | Draft is visible, editable, not sent |

**Correct copy (match exactly):**
- "Draft in chat" — not "Send", not "Submit", not "Execute"
- "Insert draft" — not "Insert prompt", not "Send"
- "Draft ready" — not "Ready to send", not "Prepared"

**Wrong copy (forbidden):**
- "Send message" — implies immediate send
- "Execute prompt" — implies execution
- "Run now" — implies auto-send
- Any copy that omits the word "draft"

---

### Composer Draft State

After clicking a draft action:

```
┌─ Composer (draft state) ──────────────────────────────┐
│  ┌─ draft-chip ──────────────────────────────────┐   │
│  │  📝 Draft ready · Bittensor desk  [× Clear]  │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  [User's draft text here — editable]                  │
│                                                       │
│  [Cancel]                           [Send →]          │
└───────────────────────────────────────────────────────
```

**Draft chip anatomy:**
- `📝 Draft ready` — label in `--v2-text-secondary`
- `· Bittensor desk` — desk context in `--v2-desk-bittensor` color
- `[× Clear]` — clears draft and returns to empty composer
- Chip background: `--v2-accent-dim` (subtle accent tint)

**Rules:**
- Draft is **always** visible in the composer — never hidden
- Draft is **always** editable — cursor starts at end of draft text
- Pressing Enter does **not** send — only clicking [Send →] sends
- `[Send →]` is the only trigger for submission

---

### No Hidden Auto-Send

**Absolute rule: No click anywhere in the app causes a message to be sent without explicit [Send] confirmation.**

This applies to:
- Prompt action buttons
- Desk quick actions
- MCP test buttons
- Any CTA anywhere

Test: open DevTools, click any action, verify no `fetch`/`POST` call to the agent endpoint was made until [Send] was explicitly clicked.

---

### Desk Context Preservation

When a draft is created in one desk (e.g., Bittensor) and the user switches desks before sending:

```
┌─ Composer ───────────────────────────────────────────┐
│  ┌─ draft-chip ──────────────────────────────────┐   │
│  │  📝 Draft from Bittensor  [× Clear]          │   │
│  │  [Switch to Bittensor to send]               │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  [draft text preserved]                               │
│                                                       │
│  [Cancel]                       [Go to Bittensor →]  │
└───────────────────────────────────────────────────────
```

The `[Send →]` button is replaced with `[Go to Bittensor →]` when the current desk does not match the draft's desk context.

---

### Draft Persistence (Across Sessions)

| Scenario | Behavior |
|----------|---------|
| User types draft, navigates away, returns | Draft is cleared (not persisted across navigation) |
| User types draft, switches desk | Draft persists with desk chip showing origin |
| User types draft, refreshes page | Draft is cleared |
| Draft sent, composer clears | Draft is cleared on send |

**Rule: Drafts are session-scoped. They do not survive page refresh or navigation away. They are not stored to disk or cloud.**

---

## Part 5 — Responsive Behavior

### Wallet Panel

| Viewport | Layout |
|----------|--------|
| Desktop ≥1200px | Right rail card (260px) + full Settings page |
| Tablet 768–1199px | Right rail card collapses to icon; tap expands |
| Mobile <768px | Wallet panel becomes a bottom sheet; no right rail |

**Mobile bottom sheet:**
- Triggered by avatar + wallet icon in top bar
- Swipe down to dismiss
- Full wallet address + Manage Wallet + Protocol Map
- No horizontal overflow

### Profile Panel

| Viewport | Layout |
|----------|--------|
| Desktop ≥1200px | Right rail card + full Settings page |
| Tablet 768–1199px | Compact rail card (name + avatar only); tap for details |
| Mobile <768px | Profile accessible via top bar avatar → sheet |

**Mobile profile sheet:**
- User name + email
- Cloud status badge
- Sign in/out button
- Settings shortcut
- No horizontal overflow, text fits at 390px

### MCP Cards

| Viewport | Layout |
|----------|--------|
| Desktop ≥1200px | 2-column grid of MCP cards |
| Tablet 768–1199px | 1-column list, full-width cards |
| Mobile <768px | Full-width cards, install command stacks vertically |

**Mobile card rules:**
- Name + description on first line
- Safety statement on second line
- Actions on third line (full width, 44px min tap target)
- No horizontal overflow

### Chat Composer (Draft)

| Viewport | Behavior |
|----------|----------|
| Desktop ≥1200px | Fixed bottom, 120px min height, auto-grows |
| Tablet 768–1199px | Fixed bottom, 80px min height |
| Mobile <768px | Fixed bottom, above keyboard; `visualViewport` API; draft chip scrolls into view when keyboard opens |

---

## Part 6 — Forbidden Patterns (All Four Surfaces)

| Pattern | Why Forbidden |
|---------|---------------|
| "Matterhorn holds your keys" | Custody lie — never true |
| "Sign transaction" | Implies automatic signing — never |
| "Submit order" | Implies order execution — never |
| "Confirm trade" | Implies trade execution — never |
| "Place bet on your behalf" | Implies Polymarket action — never in beta |
| "lighthouse" | Internal harness codename — never customer-facing |
| "harness" | Internal framework — never customer-facing |
| "openwork" | Brand forbidden in UI copy |
| "opencodec" | Brand forbidden in UI copy |
| Full wallet address | Privacy + truncation standard |
| Seed phrase input | Never in wallet panel |
| Private key input | Never in wallet panel |
| API secret input in MCP card | Credentials live in local MCP client |
| Auto-send on click | Absolute rule: always explicit [Send] |
| Draft persists after refresh | Drafts are session-scoped only |
| Hidden draft text | Draft is always visible in composer |

---

## Part 7 — QA Checklist

### Wallet Panel
- [ ] Web wallet section visible on browser runtime
- [ ] Desktop wallet section visible on Electron runtime
- [ ] No full wallet address shown (always truncated)
- [ ] No "sign transaction", "confirm trade", "submit order" in any copy
- [ ] Safety strip visible: "Matterhorn never holds your keys"
- [ ] Protocol map shows Bittensor, Hyperliquid, Polymarket rows
- [ ] Unwired protocol actions show "Planned" badge and disabled button
- [ ] No injected wallet claims on desktop runtime
- [ ] [Manage Wallet] opens Settings / Wallet page
- [ ] Wallet rail card shows truncated address + Copy button

### Profile Panel
- [ ] Signed-out state: placeholder avatar + "Sign in" CTA
- [ ] Signed-in local state: user initials + "Local only" badge
- [ ] Signed-in cloud state: user initials + "Cloud active" badge
- [ ] Cloud unconfigured: sky/blue badge + "Set up Cloud" CTA
- [ ] No "OpenWork", "OpenCode", "lighthouse", "harness" anywhere
- [ ] Documentation and Support links present
- [ ] No full wallet address shown on profile surface

### MCP Cards
- [ ] Catalog cards: "Inside Matterhorn" or "Outside Matterhorn" statement present
- [ ] Installed cards: status badge (Active/Ext signer/Error) visible
- [ ] No API key input, secret input, or private key input
- [ ] [Test] button: wired = functional, not wired = disabled with tooltip
- [ ] Protocol MCPs: "Matterhorn sends intent. [Signer] signs. Never sees your private key."
- [ ] No "submit order", "sign transaction", "mint now"
- [ ] No "lighthouse", "harness", "openwork", "opencodec" in card copy
- [ ] Install command: `label | code | Copy` inline row pattern

### Chat Draft State
- [ ] Prompt action says "Draft in chat" or "Insert draft" — not "Send"
- [ ] After click: composer shows draft chip + text
- [ ] Draft chip shows desk context (e.g., "Bittensor desk")
- [ ] Draft text is editable (cursor at end)
- [ ] Enter key does NOT send — only [Send →] sends
- [ ] No auto-send on any click (verify via DevTools network tab)
- [ ] [Clear] removes draft and resets composer
- [ ] Draft cross-desk: shows origin desk + [Go to X →] button
- [ ] Draft clears on page refresh
- [ ] Draft clears on send

### Responsive
- [ ] No horizontal overflow on 1280px desktop
- [ ] No horizontal overflow on 768px tablet
- [ ] No horizontal overflow on 390px mobile
- [ ] No right rail overflow on tablet (rail collapses cleanly)
- [ ] Mobile wallet panel is a bottom sheet with swipe-to-dismiss
- [ ] Mobile profile panel is a sheet with 44px min tap targets
- [ ] Composer: `visualViewport` API used for keyboard detection on mobile

### Screenshot Gates
- [ ] Wallet: 1280×800 dark
- [ ] Wallet: 1280×800 light
- [ ] Wallet: 768×1024 tablet dark
- [ ] Profile: 1280×800 dark
- [ ] Profile: 1280×800 light
- [ ] MCP catalog: 1280×800 dark
- [ ] MCP installed card: 1280×800 dark
- [ ] Chat draft state: 1280×800 dark
- [ ] Chat draft cross-desk: 1280×800 dark

### Gates
- [ ] `pnpm test:minimax-ui-system` — all PASS
- [ ] `pnpm test:market-execution-safety-gate` — all PASS
- [ ] `pnpm test:minimax-desk-v2` — all PASS
