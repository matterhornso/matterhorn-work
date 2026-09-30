# Jev extension — design documentation

Date: 2026-09-30. Verdict: **Preserve the incumbent design system. No DESIGN.md or sidecar update is required for this extension.**

## Scope and authority

This is the Impeccable documenter handoff for an ordinary Operate extension: an optional Jev control above the existing chat composer, with explicit consent before first enablement. It is not a new visual world, navigation system, model selector, or replacement composer.

The authoritative files are the repository-root `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json`. There is no `apps/app/DESIGN.md`. The target-specific direction remains in `apps/app/.impeccable/surfaces/ains-session-surface-jev-chat-control-tsx-da74c6ed.md`; its task-local interaction requirements should not become global visual rules.

The Impeccable skill and document reference were read. The context launcher was run once for the named control target. Existing metadata drift reported by the finish review remains outside scope; no schema, register, brief-path, or unrelated documentation repair was made.

## Comparison with the incumbent system

- **Identity and hierarchy:** The labelled Jev on/off control and short status stay secondary to writing and sending a message. The real session surface mounts the control inside the composer shell, before the existing privacy notice and composer. No new navigation or competing answer-model control is introduced.
- **Components and states:** `JevChatControl` uses the existing Base UI-backed Button and Dialog primitives. The compact outline button exposes its state through both text and `aria-pressed`; the dialog retains the shared title, description, close control, footer, and explicit final-focus target. The consent action uses the existing primary button treatment.
- **Color, type, shape, and depth:** The extension consumes semantic text tokens and inherited text sizes. Shared button/dialog selectors supply the documented retro panel/ink, violet action, compact corners, outlines, and hard offsets. Legacy styling remains governed by the same primitives when retro is off. No local palette, font, shadow vocabulary, radius scale, or motion system was added.
- **Responsive behavior:** The control row wraps; supporting text can shrink and wrap. The consent popup adds a viewport-relative maximum height and vertical overflow. Its shared footer stacks actions at narrow widths and places them in a trailing row at wider widths. These are component-local accommodations, not new system breakpoints.
- **Product clarity:** Consent identifies TypeSafe as the classification recipient, states that the selected model still answers, explains the remembered account/workspace/browser choice, and says disabling cannot retract messages already shared. The hook defaults off, restores the consent-versioned scoped preference, provides a storage-failure notice, and reports classification, skip, and fallback states. This documentation comparison is not a security or provider-policy certification.

These findings match the existing system's inherited-type, scoped-retro, structural-depth, explicit-consent, and progressive-disclosure rules. The feature-specific consent and status copy belongs with the surface implementation and brief; it does not warrant another reusable system primitive or sidecar specimen.

## Evidence checked and limitations

Source inspection covered `jev-chat-control.tsx`, `use-jev-chat.ts`, the Jev injection in `session-surface.tsx`, shared `components/ui/button.tsx` and `components/ui/dialog.tsx`, relevant `styles/retro.css` tokens/selectors, the existing design contract and sidecar metadata, and `scripts/fixtures/jev-chat.tsx` under `apps/app`.

Four supplied captures were directly inspected under `.impeccable/review/jev/`: `composer-light-390.png`, `composer-dark-1280.png`, `consent-light-390.png`, and `consent-dark-1280.png`. They show inherited visual treatment, readable labels, visible focus, and contained consent content at those sampled sizes. The separate `finish-review.md` records the independent review of all twelve composer/consent captures across both themes at 390, 650, and 1280px widths, with a scoped **SHIP** verdict.

All twelve PNGs are synthetic local QA captures, not shipping image assets. The fixture imports the actual control, hook, shared primitives, and main stylesheet, explicitly enables retro, and labels itself as a local fixture with no live provider requests. It is not the complete production session surface. No new shipping raster asset was introduced, so no shipping-raster provenance record is needed for this extension.

Browser tests, live provider calls, installed-app acceptance, full session-layout coverage, legacy-theme captures, screen-reader testing, and motion behavior were not independently executed or certified by this documentation pass. The finish review's reported test results remain attributed to that review and its builder evidence. A still capture cannot establish animation or complete accessibility compliance.

## Disposition

The scoped control/consent extension fits the incumbent Matterhorn workbench system. Preserve repository-root `DESIGN.md` and `.impeccable/design.json` unchanged; do not regenerate tokens or repair preexisting metadata drift as a side effect. The independent finish-review **SHIP** disposition remains limited to its documented local control/hook and fixture scope, not deployment, live integration, or whole-application acceptance.

This pass writes only this evidence record and makes no implementation or system-file changes.
