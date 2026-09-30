---
name: Matterhorn
description: A focused, desk-first retro workbench with light, dark and system themes and a legacy rollback option.
colors:
  brand-ice: "#D1F2FF"
  brand-ink: "#0C0C0C"
  light-canvas: "#f6f9ff"
  dark-canvas: "#05070b"
  retro-light-paper: "#f7f5f0"
  retro-light-panel: "#ffffff"
  retro-light-ink: "#18171c"
  retro-light-muted: "#55505f"
  retro-light-line: "#24212c"
  retro-light-action: "#6d28d9"
  retro-light-action-hover: "#5b21b6"
  retro-selection: "#d1f2ff"
  retro-selection-text: "#18171c"
  retro-light-subtle: "#ece7f2"
  retro-light-danger: "#b91c1c"
  retro-light-warning: "#8a4b08"
  retro-light-success: "#166534"
  retro-dark-paper: "#18171c"
  retro-dark-panel: "#232128"
  retro-dark-ink: "#faf8f3"
  retro-dark-muted: "#d3cedb"
  retro-dark-line: "#aaa2b5"
  retro-dark-shadow: "#09080c"
  retro-dark-action: "#c4a0ff"
  retro-dark-action-hover: "#d4bcff"
  retro-dark-subtle: "#35313e"
  retro-dark-active: "#453657"
  retro-dark-danger: "#ffb4ad"
  retro-dark-warning: "#ffd583"
  retro-dark-success: "#86efac"
typography:
  body:
    fontFamily: "Aeonik, IBM Plex Sans, Geist, Avenir Next, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Apple Color Emoji, Segoe UI Emoji"
    fontSize: "0.875rem"
    lineHeight: 1.5
  sans:
    fontFamily: "Aeonik, Geist Variable, sans-serif"
  heading:
    fontFamily: "Aeonik, IBM Plex Sans Variable, sans-serif"
  public-auth:
    fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  retro-title:
    fontWeight: 700
    letterSpacing: "-0.02em"
  retro-public-heading:
    fontWeight: 750
    letterSpacing: "-0.03em"
  retro-button:
    fontSize: "0.875rem"
    fontWeight: 650
    lineHeight: "1.25rem"
rounded:
  control: "8px"
  dls-control: "10px"
  dls-panel: "12px"
  retro-control: "3px"
  retro-square: "0px"
  retro-switch-thumb: "1px"
spacing:
  tight: "4px"
  compact: "8px"
  control: "12px"
  panel-small: "16px"
  desk-inline: "20px"
  section: "24px"
components:
  retro-button-primary:
    backgroundColor: "{colors.retro-light-action}"
    textColor: "{colors.retro-light-panel}"
    typography: "{typography.retro-button}"
    rounded: "{rounded.retro-control}"
    height: "2.25rem"
    padding: "0 0.75rem"
  retro-button-primary-hover:
    backgroundColor: "{colors.retro-light-action-hover}"
  retro-button-primary-dark:
    backgroundColor: "{colors.retro-dark-action}"
    textColor: "{colors.retro-light-ink}"
  retro-button-primary-dark-hover:
    backgroundColor: "{colors.retro-dark-action-hover}"
  retro-button-outline:
    backgroundColor: "{colors.retro-light-panel}"
    textColor: "{colors.retro-light-ink}"
    rounded: "{rounded.retro-control}"
  retro-button-secondary:
    backgroundColor: "{colors.retro-selection}"
    textColor: "{colors.retro-selection-text}"
    rounded: "{rounded.retro-control}"
  retro-button-destructive:
    backgroundColor: "{colors.retro-light-panel}"
    textColor: "{colors.retro-light-danger}"
    rounded: "{rounded.retro-control}"
  retro-button-ghost:
    rounded: "{rounded.retro-control}"
    typography: "{typography.retro-button}"
  retro-button-link:
    textColor: "{colors.retro-light-action}"
    typography: "{typography.retro-button}"
  retro-input:
    backgroundColor: "{colors.retro-light-panel}"
    textColor: "{colors.retro-light-ink}"
    rounded: "{rounded.retro-control}"
    height: "2.25rem"
    padding: "0.25rem 0.75rem"
  retro-navigation-selected:
    backgroundColor: "{colors.retro-selection}"
    textColor: "{colors.retro-selection-text}"
    rounded: "{rounded.retro-control}"
  retro-card:
    backgroundColor: "{colors.retro-light-panel}"
    textColor: "{colors.retro-light-ink}"
    rounded: "{rounded.retro-control}"
  retro-badge:
    backgroundColor: "{colors.retro-light-action}"
    textColor: "{colors.retro-light-panel}"
    padding: "0.125rem 0.5rem"
---

# Design System: Matterhorn

## Overview

**Creative North Star: "Matterhorn workbench"**

Matterhorn is a focused, desk-first workspace for doing useful work through chat. Preserve the real logo, protocol marks, readable incumbent type, theme preferences and explicit review boundaries. The retro workbench uses flat paper/charcoal planes, ink outlines, violet actions, ice selection and hard offset depth; it is not a rebrand or a simulated trading game.

Retro is the approved release default as of 30 September 2026. Styling remains scoped to the root marker, with an explicit build-time legacy rollback; both interfaces use the same routes, persisted chats, model selections and draft stores. This source-backed contract documents implementation, not hosted deployment, installed-app typography acceptance or real agent/chain execution.

**Key Characteristics:**

- Familiar Matterhorn identity and compact operational typography.
- Default retro geometry with separately preserved incumbent rollback styling.
- One focused conversation and contextual tools on demand.
- Explicit focus, selection, unavailable states and reviewed-action boundaries.

The durable product contract remains in [PRODUCT.md](PRODUCT.md) and [docs/ui/matterhorn-design-system.md](docs/ui/matterhorn-design-system.md). The scoped retro implementation plan and direction are recorded in [docs/ui/retro-ui-plan-2026-09-28.md](docs/ui/retro-ui-plan-2026-09-28.md) and [qa-reports/retro-ui/2026-09-28/direction-contract.md](qa-reports/retro-ui/2026-09-28/direction-contract.md). This merge does not migrate PRODUCT metadata or imply that the separate incumbent design-system document has been rewritten.

## Colors

Frontmatter primitives are normative; `retro-light-*` and `retro-dark-*` are theme-specific alternatives, never unscoped replacements. Runtime source is [apps/app/src/styles/retro.css](apps/app/src/styles/retro.css); the incumbent semantic tokens remain in [apps/app/src/app/index.css](apps/app/src/app/index.css).

The sidecar's eight-step OKLCH tonal ramps are synthesized documentation swatches, not additional shipped palette tokens. Component specimens bind to root CSS variables with light-preview fallbacks; the explicitly labelled incumbent row remains a separate specimen.

### Primary

- **Incumbent brand ink and ice:** retain the existing logo, ink/ice brand anchors and blue/cyan-tinted semantic theme surfaces when retro is off.
- **Retro violet action:** light action/hover use the light violet pair; dark action/hover use the lighter violet pair with ink action text. Light action text uses the light panel color. Light focus uses the action color; dark focus uses ice.

### Secondary

- **Ice selection:** selected picker options, sidebar navigation, tabs and public navigation use ice with the fixed selection-text ink in both themes. Selected descendants inherit this pair; dark primary text must not leak onto ice.
- **Status:** danger, warning and success remain separately named semantic feedback. Their theme-specific tokens support readable error, transaction-warning and integration-readiness text; color never replaces a label or server evidence.

### Neutral

- **Paper / charcoal:** the page and sidebar plane; **panel:** the working plane; **ink / muted:** main and supporting text; **line:** structural boundaries; **subtle:** hover and quiet conversation surfaces.
- The separate full model-list selected row uses the subtle surface with an inset line; it is not the picker-option ice pair. Dark `dls-active` retains its explicit plum fallback. Do not infer that every active surface has the same background.
- Light hard shadows use the light line token; dark shadows use the dark-shadow token.

### Incumbent contract (retro off)

- Use light and dark themes. Do not make either theme a one-note black/cyan page.
- Desk colors are accents, not full-page floods: Bittensor cyan/violet, Hyperliquid blue/green, Polymarket purple/amber, Longevity coral/mint and Memory gold/slate. Retro preserves these existing desk/protocol accents rather than replacing the marks.
- Existing semantic `dls` tokens and theme preferences remain authoritative. The minimal-layout-only option introduces no new palette or decorative motion; retro is the separate, explicitly scoped alternative.

**The Scope Rule.** Apply retro values only under the retro root marker; flag-off surfaces keep the incumbent semantic system.

## Typography

No font is introduced by retro. The frontmatter records the existing main body stack, the separate sans/heading utility stacks, the existing public-auth stack, and only the weight/tracking overrides actually present in retro CSS. Main app body sizing remains relative to the user's root font-size preference; operational copy stays normal case. Large display type belongs on first-run welcome, not routine workspace controls or long chat/legal text.

Retro card/dialog titles use the compact title role; public page/auth headings use the heavier public-heading role. Buttons use the retro-button role, while shared sizing remains in the existing primitive. Headings do not require uppercase labels or pixel lettering.

Typography has two existing entry paths. The signed-out `PublicSigninBootstrap` intentionally does not load the main app stylesheet: it inherits the Avenir Next/system stack from the critical style in [apps/app/index.html](apps/app/index.html). Main app content and public Security load the main stylesheet, which imports Geist Variable and IBM Plex Sans Variable assets; its unlayered body stack also names non-Variable families. Do not inject main-app CSS into an auth fixture or change production font families to make fixtures agree.

Local fixture/distribution checks now compare the hydrated auth title's family, size, weight and line-height and verify that both bundled Variable faces load on public Security with matching body-family declarations. This is scoped local browser evidence, not a claim that a particular bundled face supplies every glyph or that installed/native text metrics are accepted; current results remain in the dated QA evidence.

**The Inherited Type Rule.** Preserve existing font assets, family preferences and readable text hierarchy; the retro flag changes geometry and emphasis, not font identity.

## Layout

### Rollout and rollback

Retro styling and the desk-first minimal layout are enabled when `VITE_MATTERHORN_RETRO_UI` is absent, empty, `1` or `true`. Set it explicitly to `0` or `false` and rebuild for legacy styling; other invalid values also remain off. `VITE_MATTERHORN_MINIMAL_UI=1` (or `true`) remains independently available for the minimal layout with incumbent styling. With both flags explicitly off, the existing layout and legacy right rail remain.

Settings → Appearance offers System, Light and Dark. System is the first-use default. The bootstrap reads the same canonical preference and legacy-key precedence as the hydrated app, before first paint. Existing choices are preserved on reload; the Settings sidebar inherits theme tokens instead of forcing a dark palette.

The app bootstrap and desktop overlay set `html[data-matterhorn-ui="retro"]`; the public auth build adds the same marker and critical retro CSS for first paint. Portals inherit root tokens. Disabling retro removes the marker and restores incumbent styling; a separately enabled minimal flag still keeps the minimal layout. These are build-time options, not stored account/workspace settings, and rollback does not migrate chats, drafts or model selections.

### Desk-first layout (minimal or retro enabled)

- One left navigation column with workspace, New chat, five desks, recent chats and Settings.
- Header: conversation or launcher title, model, Workspace tools. No permanent right rail in the minimal layout.
- Below 768px, navigation is a labelled drawer. Contextual tools are full-screen below 1024px, a sheet up to 1279px, and a docked pane from 1280px. Only one contextual tool opens at a time.
- Launcher uses open, divided rows. Secondary project information is collapsed. Chat suggestions fill drafts, never send.
- Models use a searchable list with a provider filter, pending/error feedback and server-persisted selection.
- The composer remains visible without overlapping content. Back to chat, Home, Profile and Settings stay discoverable.

### Retro adaptations

The desk launcher is one framed group, not a card per desk: rows have a minimum height of 76px, horizontal padding from `spacing.desk-inline`, and 5px trailing/bottom clearance for the panel shadow. Picker options have a minimum height of 44px. Wrapping conversation starters, integration actions and narrow transaction buttons retain a 44px minimum height; this is not a claim that every existing button is 44px tall.

At viewport widths up to 639px, transaction actions stack, ticket padding uses `spacing.panel-small`, and managed-tool headings wrap. Up to 480px, note filters become one column and Memory view navigation wraps with a 12px row gap. Settings item headers use a separate container query at a maximum of 40rem: actions move to the next row with an 8px top gap. These are distinct from the inherited shell breakpoints.

## Elevation & Depth

### Incumbent (retro off)

Keep the existing semantic shell/card/overlay shadows and soft tonal layering. The retro hard-shadow vocabulary does not replace these defaults globally.

### Retro enabled

Depth is structural and hard-edged: actions and the composer use a 3px by 3px zero-blur offset; overlays, the launcher and the transaction batch use a 5px by 5px zero-blur offset. Enabled non-ghost/non-link buttons compress to a 1px by 1px shadow on press with a 2px by 2px translation. Disabled/aria-disabled buttons have no shadow and no translation.

The shell/header, sheets, command dialog, Memory articles, user messages and protocol results stay shadowless where explicitly scoped. Do not add hard shadows to every plane. Exact shadow and motion expressions are in the sidecar extensions, not unsupported frontmatter groups.

**The Structural Depth Rule.** Use hard offsets to identify actions and raised work surfaces; keep reading and conversation planes quiet.

## Shapes

The incumbent contract remains gently curved (8–12px cards/controls), with existing semantic control/panel radii and component-specific values. Avoid giant pill cards except small badges.

Retro explicitly styled controls, cards, panels and selected navigation use `rounded.retro-control`. Tabs rails, note fields and the mobile sidebar keep square edges; the switch thumb uses its own small corner. Shared badges inherit the existing radius formula (`calc(var(--radius) * 0.8)`), not a fabricated universal 3px override. Structural outlines are 2px; transaction steps use 1px except the active step at 2px.

Page sections are not nested cards. Use cards only for repeatable items, previews, receipts, memory suggestions and focused tool panels.

## Components

### Buttons, fields and focus

Retro primary buttons use action colors; outline buttons use panel/ink; secondary buttons use ice/selection ink; destructive buttons use a panel surface with danger text and border. These four variants have hard borders and offset shadows. Ghost/link variants remain unraised. Outline/ghost hover uses the subtle surface; the primary hover uses its explicit theme token. Existing primitive dimensions, semantics, pending behavior and disabled opacity remain.

Fields/select triggers use a panel surface, ink text, muted placeholders, a 2px line border and no shadow. Invalid fields use the danger border. The composer changes its border on focus-within. Checkbox/switch checked state uses action/action-text; native checkboxes use the action accent.

Keyboard focus is independent of press feedback: the scoped focus-visible selector gives buttons, links, fields, summaries, role-buttons/tabs and editable content a 3px focus-color outline with 3px offset. Launcher rows inset that outline by 5px to keep it visible within the group. Preserve Base UI focus return, escape, ARIA and keyboard behavior.

Button background/shadow/translation transitions are 120ms ease-out. Reduced motion removes pressed translation and switch/sidebar transitions; the existing global reduced-motion policy collapses other transition/animation durations to 0.01ms and one iteration. Do not claim still captures prove motion behavior.

### Navigation, selection and overlays

Selected sidebar entries use ice/ink, 700 weight and a 2px inset line; selected tabs use ice/ink and a 2px action-colored underline. Picker options add a 2px inset outline and keep title, capability, identifier and checkmark on the same selection ink. Unavailable picker options stay disabled with 0.6 opacity and a not-allowed cursor. The full model list retains its separately scoped subtle selected treatment.

Dialogs, alert dialogs, popovers and menus use framed panels with panel depth. Sheets and command dialogs use the same geometry without that shadow. The mobile drawer keeps an explicit 44px close control. Shared badges remain compact inherited components, not invented readiness certifications.

### Public and secondary surfaces

Auth fields and mode controls share retro geometry; active auth modes use ice selection. In the retro auth surface, truthful Public beta status follows the description rather than appearing above the heading; flag-off disclosure placement is unchanged. Public trust navigation uses ice selection while article prose retains its reading hierarchy. Notes, Memory, integrations and settings inherit the scoped tokens without changing their capability gates or state contracts.

### Preserved product and interaction contract

The primary desks are Private AI, Bittensor, Hyperliquid, Polymarket, and Sui. Memory, notes, wallet and integrations are workspace tools. Longevity is standalone and outside the primary crypto experience. Capability descriptions below are not deployment-readiness evidence.

- **Home** is the launcher. It creates a session, opens a desk, or starts a workflow with an editable prompt. It never auto-sends.
- **Bittensor** supports public SS58 wallet reads, subnet discovery, validator comparison, watches, receipt import, and coldkey/hotkey explanations. TAO transfers, staking, and unstaking move from an agent-prepared draft into a separate Finney transaction ticket, where an installed Bittensor-compatible extension reviews, signs, and broadcasts the exact call. Delegation and advanced runtime calls remain unavailable until each adapter and review contract is audited.
- **Hyperliquid** supports account/orderbook/funding/open-order reads, watches, previews, receipt evidence, and manual connected-wallet execution in its dedicated trade ticket. Chat, MCP, CLI, and watches never auto-submit. Every order uses explicit review, a short-lived one-time intent, connected-wallet signing, and the deployment kill switch; testnet is the default and mainnet requires an additional typed confirmation.
- **Polymarket** supports market discovery, outcome probability context, liquidity/orderbook reads, compliance state, watches, reviewed buy and sell orders, cancellation, and receipt evidence. A complete, compliance-allowed EOA order continues in a separate Polygon wallet ticket for exact review and wallet-authorized submission. Proxy accounts, watch-triggered orders, and unattended execution are unsupported. Compliance-blocked previews must not show executable price, size, or share fields.
- **Longevity** is standalone. It is not Web3, not a market desk, and not medical care. It creates safe offline optimization workflows and client artifacts without diagnosis, prescription, treatment claims, guaranteed outcomes, live payment, live email, live hosting, or token-gating claims.
- **Memory** is visible and user-controlled. No hidden saves. Every suggestion shows why suggested, source, sensitivity, confidence, and confirm/edit/dismiss controls.
- **MCPs** explains how to use Matterhorn Desks tools outside the app in Codex, Claude Code, Claude Desktop, Cursor, and compatible MCP clients.

- Every serious action uses agent draft -> separate exact review -> connected-wallet approval -> public receipt. Matterhorn never hides signing or signs on behalf of users. The current reviewed wallet paths are Hyperliquid place/cancel/modify/close actions, compliance-allowed Polymarket buy/sell/cancel actions, Bittensor TAO transfer/stake/unstake actions, and Sui coin/object/batch transfers. Advanced protocol calls stay unavailable until they receive their own audited adapter and review contract.
- Empty, loading, degraded-provider, and no-wallet states must explain what still works and what to try next.
- Stable launch navigation includes only production-approved surfaces. Generated-media publishing, billing, and Matterhorn Cloud stay hidden unless their explicit build flags are enabled.

## Do's and Don'ts

### Do:

- Do preserve the Matterhorn logo, protocol marks, existing type, user font preferences and both themes.
- Do keep retro scoped to its release switch and distinguish minimal-only, retro and incumbent layouts.
- Do keep required consent, source/freshness, transaction terms, signer boundaries and unavailable states explicit.
- Do use server capability data rather than visual readiness assumptions.
- Do preserve keyboard focus, reduced-motion behavior, editable drafts and contextual tool navigation.

### Don't:

- Don't treat a local opt-in, a synthetic screenshot or this document as deployed rollout, installed-app typography acceptance or real execution proof.
- Don't enable the minimal or retro layout for production before live runtime acceptance.
- Don't introduce new fonts, pixel body text, decorative dashboards, gradients, duplicate navigation rails or fabricated statistics.
- Don't use customer-facing Crypto workspace, Services, Computer Use, OpenWork or unexplained OpenCode copy.
- Don't collect seed phrases, private keys, mnemonics, raw signatures, signed payloads, wallet exports, API secrets or exchange secrets in UI fields.
- Don't allow agent-initiated, watch-triggered, unattended or unreviewed submission; Polymarket submission without explicit allowed compliance; unsupported Bittensor write submission; or hidden signing claims.
- Don't ship trapped rails, horizontal overflow, nested scrolling inside cards, composer overlap, clipped button text or cards inside cards.
