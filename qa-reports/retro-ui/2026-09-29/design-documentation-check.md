# Design documentation check — core model controls

Date: 29 September 2026. Role: Impeccable documenter. Scope: ordinary extension of the approved Matterhorn workbench, not a rebrand, token redesign, or deployment review.

## Disposition

**No design-system rewrite is required. Preserve `DESIGN.md` and `.impeccable/design.json` unchanged.** The finished changes extend the documented shared field, button, selection, focus, and recovery behavior with existing tokens. Grouped fields are an application of the existing field contract, not a new palette, type scale, radius, shadow, or signature component family. Model-specific loading, search, selected state, and provider disclosure belong to the surface implementation and dated evidence, not new global design rules.

This check does not run the document playbook's regeneration steps: the assignment explicitly preserves the incumbent artifacts, and there is no newly chosen visual world to extract. No implementation, product record, surface brief, configuration, or design-system file was edited by this pass.

## Checked evidence

Read the repository `AGENTS.md`, `PRODUCT.md`, complete `DESIGN.md`, complete schema-version-2 sidecar, the Impeccable skill and document reference, the dated `WORKLOG.md`, `docs/ui/retro-platform-inventory-2026-09-29.md`, and `apps/app/.impeccable/surfaces/apps-app-src-components-model-select-tsx.md`. Compared the current uncommitted diffs for all five assigned production files against HEAD; also read the shared Input/InputGroup ownership and relevant regression source.

| Current implementation evidence | Incumbent contract | Result |
| --- | --- | --- |
| `apps/app/src/components/model-select.tsx`: labelled search, visible selected check, disabled selection guard, loading/error/retry and empty guidance | Explicit focus/selection/unavailable states; status is never readiness evidence | Ordinary functional extension; no new visual vocabulary |
| `apps/app/src/react-app/domains/settings/pages/minimal-models.tsx`: shared Input; displayed-name and trimmed-query search | Shared Base UI controls; searchable model list; readable normal-case copy | Reuses the existing field family and improves expected matching |
| `apps/app/src/react-app/domains/session/modals/model-picker-modal.tsx`: shared Input; chat/default-specific explanation; current-provider expansion after catalog arrival; expansion cleared when closed | Shared controls and clear session/default scope; visible current selection | Existing behavior made reliable; no system token update |
| `apps/app/src/components/ui/button.tsx`: stable `data-matterhorn-button` marker | One shared Button variant family, including composed controls | Composition targeting repair, not a new variant API |
| `apps/app/src/styles/retro.css`: grouped field border/focus/error boundary; borderless inner control; command option height, selected outline, highlighted ice/ink; composed Button selectors | Panel/ink fields, 2px structural borders, 3px focus outline/offset, small corners, 44px picker options, existing action-depth and press behavior | Uses existing variables and dimensions; all new styling is beneath the retro root marker |

The CSS diff changes no token declarations. The inspected light/dark tokens remain paper/charcoal, violet action, ice/ink selection, 3px control corners, and hard offset shadows. No font, logo, protocol mark, or palette asset is introduced. `apps/app/src/app/lib/retro-ui.ts` still enables retro only for exact `1` or `true`; there is no flag/default change in this delivery diff. Shared Input adoption and picker behavior are not themselves flag-exclusive, but the added retro styling is scoped and does not replace flag-off tokens.

`git diff -- DESIGN.md .impeccable/design.json` was empty. SHA-256 fingerprints recorded before writing this report:

- `DESIGN.md`: `1ea3807bd68212e6ba352f8fcda56e8913151d9e555b0ae19f8a6401010e5e4d`
- `.impeccable/design.json`: `e977ac095d0a4a4acd7ce4959104a8cfe33a6b4db69d4fcbfb2fd18a447f0db2`

## Review, assets, and acceptance limits

The independent `finish-review.md` now ends with `disposition: ship` for its sole scored P2: stale provider expansion on reopening. This pass inspected the corrected effect and the regression named `reopened picker reveals the model selected outside the dialog`, which changes the selected provider outside the closed dialog and checks the reopened selected row plus preserved draft. The reviewer and builder report Chromium/Firefox/WebKit coverage; this documentation pass did not rerun those browsers or the detector. The builder additionally reports final frontend tests (1,234 passes), typecheck, and public-web build passing. Those are attributed execution results, not fresh executions by this documenter.

The twelve PNGs listed under `.impeccable/review/retro-core-2026-09-29/` are labelled component-fixture QA captures: models at 390px, dialog picker at 650px, controls at 1280px, and header picker at 390/650/1280px, each in light and dark. The independent reviewer inspected all twelve and their recaptures. They are non-shipping evidence, not generated application artwork or authenticated full-page captures. No new shipping raster appears in the scoped implementation diff, so no production-raster provenance manifest is required for this extension.

The actual model → desk → successful-answer journey remains **blocked, not accepted**. WORKLOG records persisted ASI1 Mini selection, all five desks, and Private AI opening with the chosen model, followed by a real send returning Unexpected server error. Its read-only diagnosis records unlinked local usage-accounting store files; that invalid local environment is a likely cause, not a captured exact exception or proof of a hosted defect. This report neither authorizes accounting repair nor certifies hosted/native behavior, live-chain responses, settled usage, or all-five-desk completion. Keep the release flag default-off.

## Pre-existing documentation drift — reported, not repaired

- The context tool flags PRODUCT's deprecated `Register` and legacy schema. The obsolete register was ignored. A user-requested `init` refresh can reconcile the record; no inference-based migration was performed.
- The context tool reports an unset build-path preference and three apparently orphaned surface briefs. The named source files exist repository-relative; the resolver selected `apps/app` as project root while the briefs store repository-relative paths. Treat the orphan report as a path-resolution mismatch requiring confirmation, not permission to delete or repoint the briefs. The delivery contract already calls this extension code-led; no configuration choice or rewrite is needed for this check.
- PRODUCT's older first-class desk list and AGENTS' general brand-color guidance predate the more specific approved five-desk/opt-in-retro contract in DESIGN and the dated direction brief. This scoped extension does not reconcile those existing records or change their product/brand claims.
- The surface brief still says fixes are in progress; WORKLOG and the finish-review verdict carry the newer delivery state. This stale progress note does not change the preserved world. Existing model-dialog small-font advisories remain reviewer-noted background, not a request for typography redesign.

The sidecar's static specimens and synthesized tonal ramps remain illustrative extensions of the normative DESIGN frontmatter, not additional shipping tokens or application-state demonstrations. Nothing in this ordinary extension invalidates their documented role.
