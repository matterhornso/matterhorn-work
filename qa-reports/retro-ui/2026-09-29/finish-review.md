disposition: fix

Scope: independent review of the current uncommitted production-component changes and twelve supplied, labelled fixture captures; no approved comp, new-world roll, or separate QUALITY BAR card was supplied or required by this ordinary-extension contract. No browser, detector rerun, implementation edits, or live requests were performed by this reviewer.

## persistence

Pass for this extension: AGENTS.md, PRODUCT.md, DESIGN.md, and the dated WORKLOG direction contract exist. The examined changes retain the incumbent token system and scope all new retro CSS beneath `html[data-matterhorn-ui="retro"]`; no rollout flag change appears in the diff. DESIGN.md's paper/charcoal, violet action, ice selection, inherited type, small corners, and hard-depth contract remains applicable. No generated production raster assets are introduced.

All twelve required captures exist and were opened: models light/dark at 390; dialog picker light/dark at 650; controls light/dark at 1280; header picker light/dark at 390, 650, and 1280. They show their named, settled isolated components. Empty fixture canvas and intentionally bare draft scaffolding are not production-page defects. This is not full-page shell or authenticated acceptance evidence.

## fidelity

| Element or promise | Result | Evidence / limit |
| --- | --- | --- |
| TYPE | match | Existing compact operational sans, normal-case labels, and relative hierarchy remain; no replacement display face. Existing 10–13px model-dialog metadata advisories remain outside the introduced change. |
| MATERIAL | match | Framed flat panels and hard offset control/overlay depth follow the established retro world; no simulated physical material is added. |
| GROUND | match | Light paper and dark charcoal fields with separate panel surfaces match DESIGN.md's named palette across the supplied captures. |
| Shared controls | match | Button composition marker retains raised outline/default treatment; grouped inputs show one structural border, with distinct invalid treatment. Focused picker search is clearly outlined in both themes. |
| Model search and selection | match | Display-name matching is added to the full list; compact search is labelled and selected model has a checkmark. Captured ice selection retains readable ink text in both themes. |
| Initial provider disclosure | match | Dialog fixture shows current provider and its model rows expanded, with unavailable model explicitly disabled. |
| Reopening provider disclosure | contradicted | `model-picker-modal.tsx:188–196` preserves any nonempty old expansion set, replacing the previous on-open expansion of the current provider. A current model changed outside this modal can be hidden under a collapsed provider when the modal next opens. |
| Recovery states | adaptation | New compact loading/error/retry and empty guidance in `model-select.tsx:292–297` follow PRODUCT.md's explicit-recovery requirement. These states are source-reviewed, not depicted in the supplied captures. |
| STORY / FIRST VIEWPORT | outside scoped acceptance | Fixtures cannot prove the five-desk shell or a real answer. Builder reports persisted ASI1 Mini selection, five desks, and Private AI opening with that model, followed by a real request failing with a generic server error. The successful-conversation promise remains unfulfilled. |

## ceiling

Reached for the depicted component visual language: established frame, depth, selection, focus, and compact typography are used without a new decorative layer. Motion, all state permutations, screen-reader operation, and every production placement cannot be certified by these stills. Reported frontend/build/browser/composer passes are builder-supplied evidence, not rerun by this reviewer. The single detector pass reported no primary findings and ten existing typography advisories. No additional visual expansion is requested.

## material_fixes

1. [P2] Restore current-provider visibility on each modal opening while retaining the first-enabled-provider fallback for an unselected or asynchronously loaded catalogue (`apps/app/src/react-app/domains/session/modals/model-picker-modal.tsx:188–196`): the unconditional nonempty-set early return keeps stale expansion from an earlier session. Add a regression that opens/closes with provider A current, changes current to B outside the modal, then reopens and verifies B's selected row is visible. Preserve intentional accordion changes during an open interaction.

## keep

Keep the default-off rollout, shared Base UI controls, visible selection/focus/disabled states, preserved drafts, and explicit synthetic-evidence labels; do not present this component review as completion of the blocked real model → desk → successful-conversation journey or as hosted/native approval.

---

## verdict

Resolved — sole P2, stale provider expansion on reopen. `model-picker-modal.tsx:188–199` now clears the expansion set while closed, so reopening derives it from the current provider; the first-enabled fallback remains available when there is no current match or options arrive later. The open-state branch continues preserving intentional expansion changes. The added `reopened picker reveals the model selected outside the dialog` browser regression closes with ASI1 Mini current, changes the provider externally to Venice, reopens, checks the selected row is visible and pressed, and confirms the unsent draft remains intact. Builder reports the new regression passing Chromium, Firefox, and WebKit and final typecheck passing; this reviewer inspected implementation and regression source, not a fresh browser execution. All twelve same-path recaptures were reopened and remain valid, with no depicted visual regression introduced by this correction. The static captures alone do not establish the reopening transition.

## remaining

Clear for the one scored fix. This verdict covers that fix, not the whole application or successful-conversation acceptance. The reported real-response server error remains outside this component verdict and still prevents claiming the user's complete journey is finished.

disposition: ship
