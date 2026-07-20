# Settings Product Truth — Visual QA Spec

**Spec version:** 1.0
**Status:** QA Draft — for Codex implementation
**Scope:** All settings pages in `apps/app/src/react-app/domains/settings/`
**Reference:** `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`

This document defines the Settings Product Truth — which features are live, which are preview, which are developer-only, and how they are communicated visually. Codex ships settings UI against this document.

---

## 1. Settings Pages Inventory

Every settings page falls into one of three product tiers:

| Tier | Badge | Color | Meaning |
|------|-------|-------|---------|
| **Ready** | `tone="ready"` | Emerald | Live, stable, customer-facing |
| **Needs setup** | `tone="setup"` | Sky/blue | Installed but not configured |
| **Preview** | `tone="preview"` | Amber | Live but incomplete — no live submission, no payment |
| **Desktop only** | `tone="desktop"` | Default gray | Not available in web/cloud |
| **Cloud only** | `tone="cloud"` | Violet | Web/cloud only, not available in desktop |
| **Developer** | none — demoted section | — | Internal feature, not customer-facing |

### Settings Pages

| Page | Route | Tier | Notes |
|------|-------|------|-------|
| **Overview** | `/settings` | — | Landing page, no tier badge |
| **Preferences** | `/settings/preferences` | Ready | Thinking, auto-compact context |
| **Wallet** | `/settings/wallet` | Needs setup | Web3 workspace binding |
| **MCPs** | `/settings/mcp` | Ready | Local MCP servers |
| **Cloud Account** | `/settings/cloud-account` | Needs setup / Ready | Auth status |
| **Agent Marketplace** | `/settings/marketplace` | Preview | Beta, no live deployment |
| **Cloud Workers** | `/settings/cloud-workers` | Cloud only | |
| **Cloud Providers** | `/settings/cloud-providers` | Cloud only | |
| **Extensions** | `/settings/extensions` | Preview | Installed extensions |
| **Skills** | `/settings/skills` | Preview | MCP tool registry |
| **Environment** | `/settings/environment` | Developer | Not customer-facing |
| **Appearance** | `/settings/appearance` | Ready | Theme, language, window |
| **Updates** | `/settings/updates` | Ready | App version, auto-update |
| **Recovery** | `/settings/recovery` | Ready | Desktop-only |
| **AI / Model Controls** | `/settings/ai` | Preview | Model selection |
| **Permissions** | `/settings/permissions` | Ready | Authorized folders |
| **General** | `/settings/general` | Ready | Diagnostics |
| **Advanced** | `/settings/advanced` | Developer | Not customer-facing |
| **Debug** | `/settings/debug` | Developer | Not customer-facing |

---

## 2. Status Badge System

### Badge Component

```tsx
function StatusBadge(props: {
  children: ReactNode;
  tone?: "ready" | "setup" | "preview" | "desktop" | "cloud";
}) {
  const tone =
    props.tone === "ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : props.tone === "setup"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
        : props.tone === "preview"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : props.tone === "cloud"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
            : "border-dls-border bg-background text-dls-secondary";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {props.children}
    </span>
  );
}
```

### Badge Labels

| `tone` prop | Label | Color | Usage |
|------------|-------|-------|-------|
| `"ready"` | `Ready` | Emerald | Stable, live feature |
| `"setup"` | `Needs setup` or context-specific ("Signed out", "Wallet setup") | Sky/blue | Installed but not configured |
| `"preview"` | `Preview only` or `Beta ready` | Amber | Live but incomplete |
| `"desktop"` | `Desktop only` | Gray | Not available in web |
| `"cloud"` | — | Violet | Not available in desktop |
| (none) | — | Gray | Default, informational |

### Badge Rules

1. Every capability row in Overview must have a badge
2. Badge labels must be specific: "Signed out" not "Needs setup" on Account, "Wallet setup" not "Needs setup" on Wallet
3. Badges use `border-X/30 bg-X/10 text-X` pattern — translucent, not solid fills
4. No badge uses a solid background color
5. Badge text is sentence case: "Preview only", "Beta ready", "Desktop only", "Needs setup", "Signed out"

---

## 3. Hiding and Demoting Non-Working Surfaces

### Rules

**Hide entirely** (not rendered) for non-working features:
- Cloud Workers, Cloud Providers: show only on `isCloudRuntime()`
- Recovery: show only on `isDesktopRuntime()`

**Demote** (render but badge as Preview/Developer):
- Agent Marketplace: show with `tone="preview"`, copy says "Preview-only in this beta"
- Skills: show with `tone="preview"` if MCP tools are not configured
- Advanced, Debug, Environment: show in nav but label section as "Developer" — no badge, section uses muted styling

**Never show** without a badge or clear demotion copy:
- API key input fields (use placeholders, not real inputs)
- Secret or private key inputs
- Full wallet addresses (always truncated)

### Section Demotion Pattern

```tsx
// Developer sections: muted header, no badge
<section>
  <div className="text-xs font-medium text-dls-tertiary uppercase tracking-wider">
    Developer
  </div>
  {/* section content */}
</section>
```

**Forbidden**: Developer sections must not use Ready/Setup/Preview badges. They use muted text labels only.

---

## 4. Per-Page Truth

### 4.1 Settings Overview

**Route:** `/settings`

Overview is the settings landing page. It shows a summary of every major capability with a badge.

**Page structure:**
```
Settings
  Account          [Badge]     → /settings/cloud-account
  Theme            Ready       → /settings/appearance
  Matterhorn accent
  Text density
  Wallet setup     Needs setup → /settings/wallet
  Web3 Workspaces  Ready       → /settings/wallet
    Bittensor       Beta ready
    Hyperliquid     Preview only
    Polymarket     Preview only
  MCPs             Ready       → /settings/mcp
  Extensions       Ready       → /settings/extensions
  Skills           Ready       → /settings/skills
  Agent Marketplace Preview     → /settings/marketplace
  Environment      (muted, no badge — Developer)
  App version     v1.2.3
  Diagnostics     Ready       → /settings/general
  Updates         Ready       → /settings/updates
```

**Badge rules for Overview:**
- Every row with a capability must have a badge
- Rows without a capability (accent color, density): no badge
- Developer rows (Environment): no badge, muted text
- "Beta ready" label used only for Bittensor (early customer access)

**Forbidden on Overview:**
- "Services" or "Crypto workspace" as section labels
- Full wallet addresses
- API key or secret inputs
- "lighthouse" or "harness" in any label or description

### 4.2 Preferences

**Route:** `/settings/preferences`

**Status:** Ready

**Toggles:**
- Thinking: on/off (default: on)
- Auto-compact context: on/off (default: off)

No badge needed — page-level "Ready" implied by being in the navigation without a non-Ready badge.

### 4.3 Wallet

**Route:** `/settings/wallet`

**Status:** Needs setup (when no wallets bound) / Ready (when wallets present)

**Content:**
- Connected wallets list
- Each wallet: truncated address (`0x7a3B…F9d2`) + copy button
- Web3 workspace binding per desk (Bittensor, Hyperliquid, Polymarket)

**Badge rules:**
- No wallets: `tone="setup"` + "Wallet setup"
- Wallets present: `tone="ready"` + "Ready"

**Forbidden:**
- Full wallet addresses anywhere
- Seed phrase or private key inputs

### 4.4 MCPs

**Route:** `/settings/mcp`

**Status:** Ready

See `docs/ui/matterhorn-desk-v2/MCP-DESK-V2-SPEC.md` for the full V2 spec.

### 4.5 Account

**Route:** `/settings/cloud-account`

**Status:** Needs setup (signed out) / Ready (signed in)

**Badge rules:**
- Signed out: `tone="setup"` + "Signed out"
- Signed in: `tone="ready"` + "Ready"

### 4.6 Environment

**Route:** `/settings/environment`

**Status:** Developer (never customer-facing)

**Rules:**
- No badge
- Section header uses muted developer label
- Visible only in desktop build (hidden in cloud/web)
- No customer-facing copy

**Forbidden in any copy:**
- "lighthouse", "harness", "openwork", "opencodec"
- API keys or secrets

### 4.7 Agent Marketplace

**Route:** `/settings/marketplace`

**Status:** Preview — no live deployment

**Badge:** `tone="preview"` on the section header

**Required copy:** Every marketplace section must include "Preview-only in this beta" or "Hiring, payment, and deployment are not live in this beta."

**Marketplace agent cards** (if implemented):
- Each agent template shows its status: Preview, Live, Deprecated
- Preview agents: `tone="preview"` badge
- Live agents: `tone="ready"` badge
- Deprecated agents: shown in muted gray, no badge, sorted last

**Forbidden:**
- "hire agent" as a primary CTA (use "Preview" or "Generate preview")
- "mint now", "buy now", "subscribe now"
- Payment or subscription UI
- "lighthouse", "harness" in any marketplace copy

### 4.8 Recovery

**Route:** `/settings/recovery`

**Status:** Desktop only — Ready

**Badge:** `tone="desktop"` — "Desktop only" badge visible

**Content:**
- Local data recovery options
- Desktop-only notice

**Forbidden:** Cloud-based recovery options (not available in desktop build)

### 4.9 Appearance

**Route:** `/settings/appearance`

**Status:** Ready

**Sections:**
- Theme (Light / Dark / System)
- Language
- Window (frame behavior)

No badges needed.

### 4.10 Extensions

**Route:** `/settings/extensions`

**Status:** Preview

**Badge:** `tone="preview"` on section header

**Content:** Installed extensions with enable/disable toggles

### 4.11 Skills

**Route:** `/settings/skills`

**Status:** Preview

**Badge:** `tone="preview"` if MCP tools not configured; `tone="ready"` if configured

### 4.12 AI / Model Controls

**Route:** `/settings/ai`

**Status:** Preview

**Badge:** `tone="preview"` on section header

---

## 5. Brand and Copy Rules

### Forbidden in All Settings Copy

| Pattern | Why |
|---------|-----|
| `openwork` or `OpenWork` | Internal brand name |
| `opencodec` or `OpenCode` | Internal brand name |
| `lighthouse` | Internal harness name |
| `harness` | Internal framework name |
| "submit order" | Live trading — forbidden |
| "sign transaction" | Live trading — forbidden |
| "mint now" | NFT minting — forbidden |
| Full wallet address | Always truncate |
| Seed phrase input | Never |
| Private key input | Never |

### Allowed Replacement Copy

| Instead of | Use |
|-----------|-----|
| "OpenWork" as a feature name | "Matterhorn Desks" |
| "OpenCode" as a feature name | "Matterhorn" |
| "live trading" | "preview only" or "read-only" |
| Generic "Services" section | Protocol-specific desk names |

---

## 6. Visual Design: Reducing Boxy Outlines in Settings

Settings pages tend toward dense bordered rows. V2 rules:

### Surface Fill Over Borders

Use `--v2-bg-surface` (`#111111` dark / `#FFFFFF` light) as row background. Replace `border: 1px solid` with subtle dividers (`--v2-border-subtle`, `#1F1F1F` dark / `#EBEBEB` light).

```css
/* V2 settings row */
.settings-row {
  background: var(--v2-bg-surface);   /* surface fill, not border */
  border-bottom: 1px solid var(--v2-border-subtle); /* subtle divider only */
  padding: 12px 16px;
}
/* No border-left, border-right, or border-top on row containers */
```

### Card Hierarchy in Settings

Settings pages that use cards (Overview, Marketplace) follow the desk V2 card pattern:
- Card: `--v2-bg-surface` fill
- Card border: `--v2-border-subtle` (`#1F1F1F`)
- No card border weight > 1px
- No `border-radius > 4px`

### Status Badge Positioning

Badges go on the right side of a settings row, aligned with the last content item. They should not be nested inside bordered boxes.

```
CORRECT:  [Icon]  Label text                          [Badge]
WRONG:    [Icon]  Label text [Badge]
           ──────── border: 1px solid ────────────────
```

### No Nested Bordered Boxes

Settings pages must not nest a bordered box inside another bordered box. If a sub-section needs a visual boundary, use a subtle background tint or a `border-left` accent, not a full bordered container.

### Badge Colors Must Match Brand Tokens

Use the existing status color tokens:
- Emerald: `--v2-status-success` (`#22C55E`)
- Sky/blue: `--v2-status-info` (`#60A5FA`) or custom sky tones
- Amber: `--v2-status-warning` (`#F59E0B`)
- Violet: `--v2-desk-mcp` or custom violet (`#8B5CF6`)
- Gray: `--v2-text-tertiary`

---

## 7. QA Checklist for Codex

### Badge System
- [ ] Every capability row in Overview has a badge
- [ ] Badge labels match the defined labels above
- [ ] Badge colors match the tone system (emerald/sky/amber/violet)
- [ ] No page uses a hard-coded solid-color badge
- [ ] Developer sections have no badge — muted developer label only

### Status Accuracy
- [ ] Wallet: shows "Wallet setup" (setup badge) when no wallets bound
- [ ] Account: shows "Signed out" (setup badge) when signed out
- [ ] Agent Marketplace: shows "Preview only" everywhere with amber badge
- [ ] Recovery: shows "Desktop only" badge
- [ ] Environment: visible only in desktop build

### Copy Rules
- [ ] No "openwork", "opencodec", "lighthouse", "harness" in any settings copy
- [ ] No "submit order", "sign transaction", "mint now" anywhere
- [ ] No full wallet addresses — always truncated
- [ ] No seed phrase or private key input fields

### Visual Design
- [ ] No `border: 1px solid` as primary row structure in Overview or Marketplace
- [ ] Settings rows use surface fill (`--v2-bg-surface`) + subtle divider
- [ ] No `border-radius > 4px` on any settings row or card
- [ ] No nested bordered boxes
- [ ] No `backdrop-filter: blur()` in settings pages

### Screenshot Gates
- [ ] Overview: 1280×800 dark
- [ ] Overview: 1280×800 light
- [ ] Preferences: 1280×800 dark
- [ ] Wallet (with wallets bound): 1280×800 dark
- [ ] Wallet (no wallets): 1280×800 dark
- [ ] Agent Marketplace: 1280×800 dark
- [ ] Recovery: 1280×800 dark
- [ ] Settings mobile: 390×844 dark (nav collapses to bottom tab)

### Gates
- [ ] `pnpm test:minimax-ui-system` — all PASS
- [ ] `pnpm test:market-execution-safety-gate` — all PASS
