---
version: 1
slug: "apps-app-src-components-model-select-tsx"
primary_target: "apps/app/src/components/model-select.tsx"
related_targets: ["apps/app/src/react-app/domains/settings/pages/minimal-models.tsx","apps/app/src/react-app/domains/session/modals/model-picker-modal.tsx"]
---

# Retro platform delivery — foundation and core journey

Started 29 September 2026. User approved inventory/shared components followed immediately by model → desk → successful conversation. Work stays local on `codex/retro-ui-2026-09-28`, starting at `d941e234843ab0e6c5832bc34e315016e0a1d6f2`. Existing unrelated untracked handoffs are preserved. No merge, push or deployment is implied.

## Direction contract

THESIS: extend the approved Matterhorn workbench; the product is a functioning conversation, not a template dashboard.

OWN-WORLD: retain paper/charcoal, violet actions, ice selection, small corners and hard offset shadows from DESIGN.md. One shared Base UI control family.

STORY: select a persisted workspace model, see all five desks, open one, edit a prompt and receive a real answer. Changing models must preserve the current draft.

FIRST VIEWPORT: anchored navigation when space permits; labelled drawer at narrow widths; compact title/model/tools header; five desk rows on entry; conversation and composer once opened. Working and failure states belong to the real request.

FORM: code-led extension of the user-approved retro UI; no new world or concept roll. Existing reference: `.impeccable/review/retro-2026-09-28/` and the authenticated 650px-wide preview inspected at start. Two batched visual inspection rounds maximum for this delivery.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Evidence classes

- Component fixtures: isolated synthetic network, no model/chain/account acceptance.
- Authenticated local: normal disposable-account session on frontend 58437, backend proxy 50368. Never claim hosted deployment from this evidence.
- Hosted/native: not tested by this delivery unless separately recorded.

## Progress

- Read repository and design instructions, approved rollout plan and existing controls.
- Paid MCP read-only metadata compared for Base UI input-group, command and alert. No paid source copied, dependency installed or token persisted.
- Inventory: `docs/ui/retro-platform-inventory-2026-09-29.md`.
- Found model display-name search mismatch, unlabelled compact search, no visible selected check in compact picker, and missing compound-field retro treatment. Fixes and regressions in progress.
- Next: finish shared-control tests, then perform normal-user model selection and real read-only requests on every desk; document exact failures instead of substituting fixtures.

## 6 October 2026 visibility refinement

Mode: Operate. The user requested findable controls across all five desks, not a visual redesign. The compact header now visibly names Model, Desks and Workspace tools. Below 768px, two bounded header rows preserve those controls alongside long chat/model names; the compact footer retains Profile text. Model selection, connected-provider filtering, disabled state, draft preservation and capability gates are unchanged. The selected model remains in the trigger's accessible name and the popup is viewport-bounded.

The confirmation batch also found that Profile restored the last Settings section and that selecting a mobile Settings section left its drawer open. The minimal footer now opens the existing profile panel directly; the Settings drawer trigger is named and section selection closes only the mobile drawer. Legacy/back navigation remains unchanged.

Source and rendered-fixture evidence is recorded in `qa-reports/web-desks/2026-10-06/VISIBILITY-INVENTORY.md`. The root task owns the authenticated desktop/mobile captures and final screenshot-based finish verdict. No new raster assets or replacement visual world were introduced.
