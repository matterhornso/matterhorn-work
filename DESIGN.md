---
name: Matterhorn
description: The approved restored workspace with semantic light and dark themes, compact controls, conversation navigation and desktop tool rails.
colors:
  brand-ice: "#D1F2FF"
  brand-ink: "#0C0C0C"
  light-canvas: "#f6f9ff"
  light-panel: "#ffffff"
  light-sidebar: "#f5fbff"
  light-muted-surface: "#eaf4ff"
  light-secondary-text: "#41495a"
  light-muted-text: "#4c5566"
  light-border: "#b9dceb"
  light-input: "#9fcad9"
  light-accent: "#e0f7ff"
  dark-canvas: "#05070b"
  dark-surface: "#0b0f14"
  dark-sidebar: "#101720"
  dark-panel: "#151d26"
  dark-overlay: "#1d2834"
  dark-muted-surface: "#263442"
  dark-text: "#fafcff"
  dark-secondary-text: "#dbe4ee"
  dark-muted-text: "#d2dbe5"
  dark-accent: "#172434"
  focus-sky: "#38bdf8"
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
  button:
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  card-title:
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: "1.5rem"
  label:
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
rounded:
  base: "0.45rem"
  control: "calc(0.45rem * 0.8)"
  small: "calc(0.45rem * 0.6)"
  dls-control: "10px"
  dls-panel: "12px"
  soft-button: "0.5rem"
  soft-panel: "0.75rem"
spacing:
  tight: "0.25rem"
  compact: "0.5rem"
  control: "0.75rem"
  panel-small: "1rem"
  wide-control: "1.25rem"
  section: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.brand-ink}"
    textColor: "{colors.brand-ice}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "2.25rem"
    padding: "0 0.75rem"
  button-primary-dark:
    backgroundColor: "{colors.brand-ice}"
    textColor: "{colors.brand-ink}"
  button-outline:
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.light-muted-surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  button-ghost:
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  button-destructive:
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  button-link:
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.light-canvas}"
    rounded: "{rounded.control}"
    height: "2.25rem"
    padding: "0.25rem 0.75rem"
  navigation-selected:
    backgroundColor: "{colors.light-muted-surface}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.light-panel}"
    rounded: "{rounded.base}"
    padding: "1.5rem 0"
  badge:
    backgroundColor: "{colors.brand-ink}"
    textColor: "{colors.brand-ice}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.125rem 0.5rem"
---

# Design System: Matterhorn

## Overview

**Creative North Star: "Matterhorn workbench"**

Matterhorn is a focused workspace for doing useful work through chat. The approved restored interface keeps the real logo, protocol marks, compact sans-serif type, softly separated surfaces and visible work controls. Conversation navigation and desktop tool rails frame the main workspace; mobile uses the existing menus and overlays.

The restored interface is the only supported layout. The retired retro and minimal UI switches, alternate branches and retro stylesheet are removed; old environment values do not select another design. This restores the approved visual language associated with PR #1027 without resetting later runtime, security, consent, accounting or stored user data. System, Light and Dark preferences remain available.

**Key Characteristics:**

- Familiar Matterhorn ink and ice identity with semantic light and dark surfaces.
- Restored workspace navigation, main content and desktop tool rails.
- Compact rounded controls, subtle borders and component-specific soft depth.
- Visible focus, selection, unavailable states and explicit review boundaries.

This is an implementation contract, not hosted, accessibility or real-inference certification. [PRODUCT.md](PRODUCT.md) retains product context; the [implementation companion](docs/ui/matterhorn-design-system.md) maps controls to source and current checks. Historical redesign plans are superseded and must not be treated as implementation instructions.

## Colors

The frontmatter records literal active values from [index.css](apps/app/src/app/index.css). Runtime semantic variables remain authoritative; theme-specific entries are alternatives, not a second palette. [colors.css](apps/app/src/styles/colors.css) supplies Radix scales, including display-P3 overrides: preserve these native bindings rather than replacing them with approximate hex colors.

### Primary

Ink actions with ice text in light mode invert to ice actions with ink text in dark mode. Shared controls use `--primary` and `--primary-foreground`; the older soft-button wrapper uses `--dls-accent` and `--dls-accent-fg`. Their hover expressions differ, so do not replace one with the other merely because their resting colors match.

### Secondary

Muted surfaces, accent surfaces and the sky focus token provide selection and interaction feedback. The active sidebar uses `--sidebar-accent`, not a universal ice fill. Desk and status accents retain their named source variables; color must accompany truthful labels, source/freshness and capability state.

### Neutral

Canvas, sidebar, working panel and overlay have distinct roles. Light primary text binds to `--slate-12`; dark primary text uses the explicit dark-text value. Dark secondary text and muted text are distinct current values, not the older guide's cached palette. Dark borders and inputs retain their source alpha expressions over the ice RGB token.

The Settings sidebar deliberately keeps its existing fixed ink palette through `SETTINGS_SIDEBAR_STYLE`, including in Light mode. Do not claim that this sidebar follows every main-canvas theme change.

The sidecar's eight-step tonal ramps are synthesized documentation swatches, not shipped tokens. Its component snippets bind to native CSS variables; literal fallbacks support isolated light previews and do not override the application theme.

**The Semantic Color Rule.** Use the existing semantic variable for the component and theme; do not replace the palette or infer runtime readiness from color.

## Typography

The body remains the existing Aeonik-first fallback stack at the relative body size and line height in frontmatter. Root sizing reads the user's `--openwork-font-size` preference. Sans and heading utilities separately reference the bundled Geist Variable and IBM Plex Sans Variable families. No new font, uppercase-label system or pixel typography is introduced.

Shared buttons use the button role, card titles use the card-title role, and compact badges use the label role. Shared inputs use 1rem text below the 768px utility breakpoint and 0.875rem at or above it. These are existing component values, not a claim that every control meets a universal target size.

Signed-out auth is a separate entry path: [index.html](apps/app/index.html) supplies its critical Avenir Next/system stack, while the main app/public-content stylesheet imports the bundled Variable faces. Preserve that separation and saved font choices; do not inject main-app CSS into auth solely to make fixtures look identical.

**The Inherited Type Rule.** Preserve existing font assets, user sizing and readable hierarchy; document the actual entry path rather than inventing a universal rendered face.

## Layout

The workspace retains its left conversation/project navigation, central header and content, and right-side desktop tool/desk access. Home contains the existing model setup/status row, desk choices, workflow/project controls and activity areas. Suggestions populate an editable draft and never send automatically. Model, Profile, Account, wallet and Settings access must remain available through supported paths.

The active mobile hook switches below 1024px. Context panels are full-screen below 1024px, sheets from 1024 through 1279px and docked from 1280px. Shared Sidebar has 16rem desktop, 18rem mobile and 3rem icon defaults; the workspace can supply persisted width overrides. Do not confuse a component's 768px Tailwind utility breakpoint with the shell's 1024px mobile policy.

Keep the composer inside its content column, preserve draft/request ownership on navigation, and allow long content to wrap or use its intentional bounded scroller. Settings action headers reflow under their 40rem container query. The compact tool menu has a separate maximum-height 420px viewport adaptation.

System is the first-use theme preference; startup and hydration use the same saved preference precedence. Public auth, guides and portals use the restored styling without a retired root marker. Theme changes do not migrate chats, drafts or model selections.

## Elevation & Depth

The active depth vocabulary is soft semantic layering: `--dls-shell-shadow`, `--dls-card-shadow` and `--dls-overlay-shadow` have separate light/dark definitions recorded in the sidecar. Shared Card explicitly uses card depth; its outline variant is shadowless.

Do not apply those shadows to every similarly named wrapper. The later `.ow-soft-card` declaration resolves its shadow to `--dls-glow`, currently none. In a right-side panel that wrapper is also borderless, square and transparent. Shared buttons have no hard offset shadow; ordinary focus rings are interaction feedback, not decorative elevation.

**The Component Depth Rule.** Follow the active component and CSS cascade; a shared shadow token does not make every workspace surface raised.

## Shapes

The shared radius base is 0.45rem; medium controls use the source 0.8 multiplier and shared cards use the base. Keep the source formulas rather than documenting every control as 8px. Existing DLS wrappers separately retain 10px/12px values, and soft-button/panel classes retain their rem radii.

Borders are ordinarily subtle single-pixel boundaries. Rounded badges stay compact. Preserve the existing distinction between open workspace sections, shared cards, overlays and tools; do not add nested card shells or hard-outline geometry.

## Components

### Buttons

The shared [Button](apps/app/src/components/ui/button.tsx) keeps six variants: primary, outline, secondary, ghost, destructive and link. Outline is a tinted muted surface with a transparent border, not an outlined white card. Destructive uses semantic danger text/border and a tinted hover, not a solid danger fill.

Default buttons are 2.25rem high with compact inline padding. Focus changes the border to the ring color and adds a 2px ring at 35% opacity. Existing enabled press feedback scales to 0.98; reduced motion removes that scale and transition. Disabled controls retain pointer suppression and 0.5 opacity. Preserve Base UI semantics when composing triggers.

### Inputs and fields

The shared [Input](apps/app/src/components/ui/input.tsx) has a one-pixel input border, semantic background/text, medium radius and labelled placeholder. Dark mode uses the background at 40% opacity. Focus uses the same 2px ring vocabulary; invalid and disabled states remain independent. Do not replace field labels with placeholders.

### Navigation and overlays

[Sidebar](apps/app/src/components/ui/sidebar.tsx) selected rows use the sidebar accent and medium weight; focus remains separately visible. Preserve current-page semantics, menu keyboard behavior, Escape and focus return. Account and sign-out access do not depend on optional Cloud. Dialogs, sheets and popovers keep their current Base UI behavior and theme inheritance; the documentation specimens are not substitutes for those interactive primitives.

### Cards and badges

[Card](apps/app/src/components/ui/card.tsx) uses a 45%-opacity semantic border, card background, card shadow and default 1.5rem vertical spacing; headers/content use matching inline padding. Its smaller variant uses 1rem spacing. [Badge](apps/app/src/components/ui/badge.tsx) is a compact text label with the shared medium radius, not proof of readiness or execution.

The sidecar contains ten source-backed, self-contained specimens: six button variants, input, selected sidebar row, badge and card. They expand the existing utilities into scoped CSS for the documentation panel, preserve theme-variable bindings, and intentionally contain no application actions.

### Preserved interaction boundaries

Keep provider consent, account/workspace isolation, model persistence, attachment preparation, request cancellation and safe retry behavior intact. Jev remains optional and revocable; it is not authorization. Protocol actions retain exact review, supported signer boundaries and honest source/freshness. Memory saves remain explicit and user-controlled. Feature gates and actual server capability data determine availability, not the appearance of an example.

## Do's and Don'ts

### Do:

- Do preserve the approved restored layout, Matterhorn marks, existing fonts, user preferences and both themes.
- Do reuse active semantic tokens and shared components, including their component-specific radius and depth.
- Do keep model, Profile, Account, wallet and Settings access available at supported widths.
- Do preserve consent, keyboard focus, reduced motion, editable drafts and explicit review boundaries.
- Do distinguish local UI evidence from hosted, packaged-desktop and real-provider acceptance.

### Don't:

- Don't reintroduce the removed retro/minimal flags, alternate layouts, hard shadows or obsolete component examples.
- Don't invent readiness, statistics, signing success or permission from a visual state.
- Don't introduce new fonts, decorative dashboards, nested cards or a replacement visual direction.
- Don't hide errors, transaction terms, consent controls or account recovery to simplify the layout.
- Don't ship trapped rails, unintended horizontal overflow, composer overlap or clipped action labels.
