# Chat extension — design documentation check

Date: 29 September 2026. Outcome: **ordinary existing-surface extension; preserve the incumbent design documentation**. This check adds only this report. `DESIGN.md`, `.impeccable/design.json`, product context, surface briefs and product code were not edited.

The independent finish review in `chat-finish-review.md` says **ship** for the narrow conversation extension. This documentation outcome does not expand that verdict into hosted, native, live-mobile or whole-platform acceptance.

## Authority and scope

Read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, both direction-contract sections in `WORKLOG.md`, the existing retro workspace surface brief, and Impeccable's document reference. Ran Impeccable context once against `session-surface.tsx`. This is an Operate surface inside the already approved Matterhorn workbench, not a new visual world or a request to regenerate the design system. No new surface brief is necessary for this documentation-only check; the existing shared-system brief and the dated follow-up contract describe the extension.

The approved boundary is truthful pending copy, readable known tool labels, only the latest finalized run receipt, shared retry controls and a semantic, usable error panel. The fresh configured-provider runtime is a separate operational workstream; preservation of the old preview/chats is a required boundary, not something these screenshots independently establish. No credentials or backend evidence JSON were read.

## Implementation-to-system comparison

| Extension | Checked implementation | Documentation outcome |
| --- | --- | --- |
| Preparing request | `session-surface.tsx` uses this label while sending before assistant output, ahead of the existing activity labels. | Task-local state clarification; no typography or global copy rule added. |
| Readable tools | `tool-display-name.ts` maps six known tool identifiers to descriptive labels and handles the existing prefix; `app/utils/index.ts` uses the result for presentation. Unknown tools retain the existing fallback. `message-list.tsx` retains structured Request/Result disclosure. | Labels improve non-expert comprehension without redefining tool identity or payload. No new component family. |
| Latest run receipt | `latest-run-receipt.ts` selects only the first/newest receipt and returns none while that receipt is pending. `session-surface.tsx` consumes it. | A truthfulness/state rule, not a new visual receipt design. The source explicitly assumes API newest-first ordering; this pass did not independently test that API. |
| Retry | `SessionErrorCard` uses the shared `Button`, preserving the handler, pending label and disabled state. | Existing action colors, small corners, hard action shadow and independent focus apply. No new button token. |
| Error/recovery panel | Scoped retro CSS uses panel/ink, destructive title/border, existing radius and no shadow. Existing alert/status semantics remain. | Consistent with semantic status colors and quiet reading planes. Error detail stays readable normal text, not a new colored surface palette. |
| Tool/error actions | Retro-only selectors set 44px minimum tool-disclosure/error-button height; dismiss also has 44px minimum width. Native disclosure button retains expanded/disabled behavior. | Local target-size adaptation, not a claim that every app control is 44px or that a new global spacing scale exists. |

The scoped CSS consumes existing tokens and stays under `html[data-matterhorn-ui="retro"]`. Pending/label/receipt behavior is shared application behavior; it should not be described as retro-only. The reviewed extension introduces no new font, primitive palette, breakpoint, elevation family or identity. It therefore does not justify regenerating `DESIGN.md` or its sidecar. The existing palette, inherited type, shared controls and quiet conversation contract already cover it.

## Rendered evidence inspected

Opened all seven required images under `apps/app/.impeccable/review/retro-chat-2026-09-29/`:

- `chat-light-390.png`, `chat-dark-390.png`
- `chat-light-650.png`, `chat-dark-650.png`
- `chat-light-1280.png`, `chat-dark-1280.png`
- `desktop-dark.png`

The six component captures visibly identify themselves as synthetic. Their transcript and recovery card are separate fixture scenarios, not evidence that a completed live response still timed out. They show inherited compact type, paper/charcoal grounds, small outlined user-message planes, a quiet tool row, semantic errors and violet retry actions without visible text clipping at the supplied widths. The actual local desktop capture shows a Hyperliquid conversation, named disclosures, completed usage, source/fetch copy, selected-chat ice treatment, explicit provider/privacy disclosure and the composer. Its answer extends below the visible transcript region; it does not prove complete-answer visibility, mobile-shell behavior or source freshness.

`desktop-dark-repeat.png` was excluded as a duplicate, not an additional required capture. These QA captures are evidence, not shipping raster assets; this extension introduces no shipping raster requiring new provenance. Tests and detector were not rerun by this documentation pass. Still images do not certify computed contrast, screen-reader operation, focus travel, motion or provider/accounting correctness.

## Context drift — reported, not repaired

Impeccable reported the pre-existing deprecated Product Register section, legacy product-record schema, unset build-path preference and three orphaned surface-brief targets. Register was ignored for decisions. A future requested `init` can refresh the legacy product record while preserving confirmed facts; removing Register and recording a comp-first/code-first preference require a separate authorized change, not this extension.

The orphan-target diagnosis conflicts with read-only filesystem evidence: all three listed repository-relative targets exist (`apps/app/src/app/index.css`, `apps/app/src/components/model-select.tsx`, and `apps/app/src/react-app/domains/settings/pages/stm-settings.tsx`). The context command resolved its project root to `apps/app` while the briefs use repository-relative targets. Treat this as a possible path-resolution/configuration issue to investigate, not grounds to delete or repoint briefs. No repair was performed.

## Preservation evidence

SHA-256 values recorded before this report and confirmed afterward:

- `DESIGN.md`: `1ea3807bd68212e6ba352f8fcda56e8913151d9e555b0ae19f8a6401010e5e4d`
- `.impeccable/design.json`: `e977ac095d0a4a4acd7ce4959104a8cfe33a6b4db69d4fcbfb2fd18a447f0db2`

No design-system refresh is required for this scoped extension. Retain the default-off release boundary and the independent review's evidence limits.

## Post-review note — numeric timestamp preservation

Rechecked the bounded `surface/markdown.tsx` correction and its new case in `tests/markdown-security-contract.test.tsx`. Emoji alias construction now excludes names containing only digits, preserving factual timestamp fragments such as `07:12:05` instead of interpreting `:12:` as a clock emoji. Named aliases remain supported. The regression case checks a full fractional-second timestamp, a duration, literal numeric aliases and continued named-alias conversion. The builder reports reproduction before the correction and a passing 3-test/14-assertion run afterward; this documentation pass inspected source and test changes but did not rerun them.

This is a factual-content rendering correction, not a new typography, layout, palette or component rule. The documentation outcome remains **ordinary extension; no design-system refresh required**. Existing captures predate this bounded correction and are not claimed as post-correction timestamp evidence. `DESIGN.md` and `.impeccable/design.json` retain the SHA-256 values above. Only this scoped note was appended; no design files or product code were edited by the documentation pass.
