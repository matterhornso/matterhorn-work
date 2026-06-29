# MCPs Desk V2 — Visual QA Punch List

**Spec version:** 1.0
**Status:** QA Draft — for Codex implementation
**Scope:** MCPs desk (`/desks/mcp`) in `apps/app/domains/session/chat/session-page.tsx`
**Reference:** `docs/ui/matterhorn-desk-v2/index.html` (screen: `screen-mcps`)

This document defines the V2 visual quality standard for the MCPs desk. It targets: fewer outlined boxes, grouped sections, compact command rows, and mobile-safe layout. Codex ships production code against this document.

---

## 1. The Problem: Current MCPs Desk Is Too Boxy

V1 and the current MCPs implementation use:

- **Bordered table** as the primary tool layout — every row has a bottom border that competes visually
- **Nested bordered boxes** inside each command section — the install command block is a bordered card inside another bordered card
- **No grouping** — all tools are listed in one undifferentiated table, even though they serve different audiences
- **No surface hierarchy** — the background is `#0C0C0C` and tool rows use the same surface, making the whole page feel flat and monotone
- **Unreadable install commands** — `npm install` commands are trapped in small monospace boxes that overflow on mobile

---

## 2. V2 Solution: Grouped Surface Rows

### Layout Architecture

The V2 MCPs desk replaces the bordered table with **4 grouped sections**, each using a surface fill + subtle divider pattern. No card borders around individual tools. No nested bordered boxes.

```
┌─ Safety strip (emerald) ───────────────────────────────────────────┐
│  🔌 MCP tools run locally. No credentials stored in Matterhorn.  │
└────────────────────────────────────────────────────────────────────┘

Use Matterhorn outside the app
─────────────────────────────
[Logo] matterhorn-work          [Local-only]  [npm install]
[Logo] Desktop MCP client       [Local-only]  [Download]

Install by client
────────────────
npm   npx matterhorn-work hyperliquid handoff    [Copy]
brew  brew install matterhornso/tap/matterhorn  [Copy]
pip   pip install matterhorn-work               [Copy]

Protocol MCPs
─────────────
[B] bittensor-subnet     Read-only Subtensor API   [Active]   [Configure]
[H] hyperliquid-info     Read-only market data     [Active]   [Configure]
[H] hyperliquid-sign     External signer required  [Ext signer] [Configure]
[P] polymarket           Browse markets            [Active]   [Configure]

Workflow · Memory · UI
──────────────────────
[M] memory-query     Read own memories   [Local-only]   [Configure]
[+] Add MCP server   Connect your own tools            [Add server]
```

### Section Anatomy

Each section has:
- **Section label**: 10px, uppercase, letter-spacing 0.1em, `--v2-desk-mcp` color (`#34D399`)
- **Divider**: 1px `--v2-border-subtle` line below label
- **Tool rows**: `--v2-bg-surface` fill, 1px `--v2-border-subtle` bottom divider
- **No card border** around the section container

### Tool Row Anatomy (V2)

Each tool row contains:
1. **Icon/logo** (28–32px, `--v2-bg-elevated` fill, `--v2-desk-mcp` or desk accent color)
2. **Name** (13px, weight 600, `--v2-text-primary`)
3. **Description** (11px, `--v2-text-secondary`, max 1 line, ellipsis overflow)
4. **Safety badge** (10px pill, color-coded: Active=green, Ext signer=amber, Local-only=emerald)
5. **Action** (ghost button or text button, `--v2-accent` color)

**Forbidden**: No nested bordered box inside the row. No `border: 1px solid` as the primary row structure. No `border-radius > 4px`.

---

## 3. Section Groupings

### 3.1 Use Matterhorn outside the app

**Audience**: Developers who want to run Matterhorn as a CLI tool.

Tools: `matterhorn-work` (npm), `Desktop MCP client` (download link).

Safety badge: **Local-only** (emerald pill). These tools run entirely locally.

Copy button: `npm install` or `Download` — not a modal, not a popover.

### 3.2 Install by client

**Audience**: Developers integrating via npm, brew, or pip.

**Pattern**: `label | code block | Copy button` — all on one row.

```html
<!-- V2 pattern: no bordered box around the command -->
<div class="mcp-install-row">
  <span class="mcp-install-row__label">npm</span>
  <code class="mcp-install-row__code">npx matterhorn-work hyperliquid handoff</code>
  <button class="mcp-install-row__copy">Copy</button>
</div>
```

CSS:
```css
.mcp-install-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--v2-bg-surface);
  border-bottom: 1px solid var(--v2-border-subtle);
  padding: 10px 16px;
}
.mcp-install-row__label {
  font-family: var(--v2-font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--v2-text-secondary);
  width: 80px; /* label never wraps */
  flex-shrink: 0;
}
.mcp-install-row__code {
  flex: 1;
  font-family: var(--v2-font-mono);
  font-size: 11px;
  color: var(--v2-text-secondary);
  background: var(--v2-bg-elevated);
  padding: 2px 6px;
  border-radius: 3px;
  /* Allow horizontal scroll on overflow */
  overflow-x: auto;
  white-space: nowrap;
}
.mcp-install-row__copy {
  padding: 3px 8px;
  font-size: 11px;
  background: var(--v2-bg-elevated);
  border: 1px solid var(--v2-border-subtle);
  border-radius: var(--v2-radius); /* 4px */
  color: var(--v2-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}
```

**Mobile**: On `<768px`, the label drops above the code block (stacked layout). The Copy button stays on the same row. No horizontal overflow.

### 3.3 Protocol MCPs

**Audience**: Users working with Bittensor, Hyperliquid, or Polymarket.

These tools are tied to a specific desk's accent color for visual grouping:

| Tool | Icon background | Badge |
|------|----------------|-------|
| bittensor-subnet | `--v2-desk-bittensor` (`#FF7C43`) | Active (green) |
| hyperliquid-info | `--v2-desk-hyperliquid` (`#C084FC`) | Active (green) |
| hyperliquid-sign | `--v2-desk-hyperliquid` (`#C084FC`) | Ext signer (amber) |
| polymarket | `--v2-desk-polymarket` (`#FBBF24`) | Active (green) |

Each row: logo in desk accent color + tool name + one-line scope description + badge + Configure button.

### 3.4 Workflow · Memory · UI

**Audience**: Users managing core Matterhorn capabilities.

Tools: `memory-query`, `+ Add MCP server`.

`memory-query` gets a **Local-only** badge. The "Add server" row has no badge — it is the entry point for adding new tools.

---

## 4. Safety Strip

Always visible at the top of the MCPs desk:

```
🔌 MCP tools run locally. No credentials stored in Matterhorn.
```

Style: `--v2-bg-elevated` background, `--v2-desk-mcp` accent border-left, `--v2-desk-mcp` icon and text.

---

## 5. Responsive Behavior

### Desktop ≥1200px

- Full 4-section layout
- Install rows: label + code + Copy button on one line
- Protocol tool rows: icon + name + description + badge + Configure on one line

### Tablet 768–1199px

- Install rows: label + code wraps within the row (horizontal scroll on code block)
- No right rail overflow
- Section labels remain uppercase 10px

### Mobile <768px

- Install rows stack: label on top, code below, Copy button right-aligned
- Protocol tool rows: description truncates with ellipsis
- No horizontal overflow — `overflow-x: auto` on code blocks only
- Bottom tab bar: 5 tabs (Home, Bittensor, Hyperliquid, Polymarket, Wellness) + More (Settings, Memory, MCPs)
- No right rail

---

## 6. Light Mode

Light mode shifts the surface hierarchy:

| Token | Dark | Light |
|-------|------|-------|
| Background | `#0C0C0C` | `#F5F5F5` |
| Surface (tool rows) | `#111111` | `#FFFFFF` |
| Elevated | `#1A1A1A` | `#FAFAFA` |
| Border subtle | `#1F1F1F` | `#EBEBEB` |
| Desk accent (MCP) | `#34D399` | `#059669` |

Light mode badge fills use 15% opacity for Active, 12% for Ext signer.

---

## 7. Forbidden Patterns

These patterns must never appear in the MCPs desk:

| Pattern | Why |
|---------|-----|
| `border: 1px solid` as primary row structure | Creates outlined-box feel — use surface fills instead |
| Nested bordered boxes inside command blocks | V1 problem — install commands should be flat rows |
| `border-radius > 4px` on tool rows | V2 rule: sharp corners on data rows |
| API key input field | Never in MCPs desk — credentials live in the local MCP client |
| `api secret` input field | Never in MCPs desk |
| Secret or private key input field | Never |
| "submit order", "sign transaction", "mint now", "hire agent" | Forbidden in all desks |
| "lighthouse", "harness" (internal names) | Never customer-facing |
| "openwork", "opencodec" | Brand name forbidden in UI copy or CSS |
| Full wallet address anywhere | Always truncate: `5CfTC…3bX9` |
| Medical diagnosis, prescription, treatment recommendation | Not relevant to MCPs but forbidden globally |

---

## 8. Before / After

### Before: Bordered table (V1)

```tsx
<table class="data-table">
  <thead>
    <tr>
      <th>Tool</th><th>Agent</th><th>Status</th><th>Scope</th><th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid var(--border)">bittensor-subnet</td>
      <!-- nested bordered sub-box for install command -->
      <td style="border: 1px solid var(--border)">
        <div style="border: 1px solid var(--border)">
          npm install bittensor-subnet
        </div>
      </td>
```

### After: Surface fill rows (V2)

```tsx
<div class="mcp-section">
  <div class="mcp-section__label">Protocol MCPs</div>
  {protocolTools.map(tool => (
    <div class="mcp-tool-row">
      <div class="mcp-tool-row__icon" style={{ background: tool.deskColor }}>
        <ToolIcon />
      </div>
      <div class="mcp-tool-row__body">
        <div class="mcp-tool-row__name">{tool.name}</div>
        <div class="mcp-tool-row__desc">{tool.scope}</div>
      </div>
      <SafetyBadge status={tool.status} />
      <button class="mcp-tool-row__action">Configure</button>
    </div>
  ))}
</div>
```

```css
.mcp-tool-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--v2-bg-surface);
  border-bottom: 1px solid var(--v2-border-subtle); /* not a border */
  padding: 12px 16px;
  /* no border-radius > 4px */
  border-radius: var(--v2-radius);
}
.mcp-tool-row__icon {
  width: 32px;
  height: 32px;
  border-radius: var(--v2-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(var(--desk-rgb), 0.12);
  color: var(--desk-color);
}
.mcp-tool-row__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--v2-text-primary);
}
.mcp-tool-row__desc {
  font-size: 11px;
  color: var(--v2-text-secondary);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

## 9. QA Checklist for Codex

Before shipping the MCPs desk polish, all of the following must pass:

### Visual quality
- [ ] No `border: 1px solid` as primary row structure (use surface fills)
- [ ] No nested bordered boxes inside command sections
- [ ] No `border-radius > 4px` on tool rows
- [ ] `border-radius: 4px` max on icon containers and badges
- [ ] No `backdrop-filter: blur()` anywhere in the MCPs desk

### Responsive
- [ ] No horizontal overflow on 1280px desktop
- [ ] No horizontal overflow on 768px tablet
- [ ] No horizontal overflow on 390px mobile
- [ ] Install command code blocks scroll horizontally on overflow (`overflow-x: auto`), not wrap or clip
- [ ] Copy button fits on the same row as the command on tablet and desktop
- [ ] On mobile, section label above code block, Copy button on the right

### Content
- [ ] Safety strip visible at top: "MCP tools run locally. No credentials stored in Matterhorn."
- [ ] No API key input, secret input, or private key input field anywhere in MCPs desk
- [ ] No "submit order", "sign transaction", "mint now", or "hire agent" in MCPs desk copy
- [ ] All safety badges correct: Active (green), Ext signer (amber), Local-only (emerald)
- [ ] No "lighthouse", "harness", "openwork", or "opencodec" in UI copy or CSS
- [ ] No full wallet addresses displayed

### Screenshot gates
- [ ] 1280×800 dark (primary)
- [ ] 1280×800 light
- [ ] 768×1024 tablet dark
- [ ] 390×844 mobile dark
- [ ] 390×844 mobile light

### Gates
- [ ] `pnpm test:minimax-desk-v2` — all PASS
- [ ] `pnpm test:minimax-ui-system` — all PASS
- [ ] `pnpm test:market-execution-safety-gate` — all PASS
