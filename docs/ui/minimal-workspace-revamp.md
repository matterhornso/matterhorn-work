# Minimal workspace — staged implementation

Release flag: `VITE_MATTERHORN_MINIMAL_UI=1`. Default off. No data migration.

## Direction contract

THESIS: One navigation column, one conversation, contextual tools only when requested. Refuse duplicate rails and an operational dashboard before users can chat.

OWN-WORLD: Preserve Matterhorn marks, the existing sans-serif stack and semantic light/dark palette. Use open sections, restrained accent, 8px controls and subtle dividers.

STORY: Choose a model, see all five desks, open a composer and send an intentional request. Suggestions create drafts, never submissions.

FIRST VIEWPORT: Workspace switcher and desks above recent chats in the left sidebar. Conversation title, model and Workspace tools in the main header. Desk launcher in the main canvas until a conversation is opened. No permanent right rail.

FORM: User-approved one-sidebar composition from the implementation brief; no new visual identity or concept selection needed. Operate mode; non-expert crypto users.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

Keep routes, drafts, conversations, permissions and wallet approvals. Production rollout is separate. Runtime readiness must come from the server; no UI claim establishes live model/tool acceptance. Five real desk responses plus live crypto reads remain a release gate.

## Delivery status — 24 September 2026

This is the first staged, reviewable implementation, not completion of the entire revamp or public-beta acceptance. It is stacked on PR #1023 (`codex/desk-first-home`). Keep the release flag off in hosted deployments.

Implemented behind the flag:

- One sidebar, five ordered desks, recent conversations and settings; no permanent right rail.
- Header model selector and contextual workspace tools. Compact contextual views use a focus-managed dialog with Back; larger layouts retain the existing docked panel.
- Open-row desk launcher, direct unsent desk sessions, three draft-only crypto starters and blank Private AI composer.
- Searchable connected-model list and provider filter. Workspace selection is acknowledged only after the server returns the saved selection. Later settings changes return to the originating conversation and retain its draft.
- Known embedding/reranking IDs and the catalog-only provider are excluded. This ID fallback is not a substitute for authoritative modality metadata.
- Concise privacy summary where sending is allowed; blocked-policy and required-consent states retain explicit warnings.
- Four settings groups and Saved/Review memory views, reusing existing storage and confirmation controls.
- Existing chats, workspace selections and draft persistence remain shared with the legacy layout; no migration.

Related pre-existing local UI corrections are included: truthful read-only protocol/wallet copy and MCP tool visibility, accurate managed-model count, and the project-goal icon replacement. Other untracked reports and local demo files are excluded.

## Verification

| Check | Result / scope |
| --- | --- |
| Frontend suite | 1,175 passed across 171 files after updated layout contracts. Includes source-contract tests; not 1,175 browser journeys. |
| Typecheck | Passed (`tsc -p tsconfig.json --noEmit`). |
| Flag-on production build | Passed; existing large-chunk warnings remain. |
| Platform safety gate | Passed. Does not establish hosted operational readiness. |
| Responsive screenshots | Inspected 390×844, 650×735 actual preview, 1024×768 and 1440×900. Launcher did not show clipped controls or page overflow at these sizes. |
| All five desk entry routes | Opened in local authenticated preview. Four crypto composers showed three suggestions; Private AI opened blank. |
| Model save + draft | Saved ASI1 through the real workspace API from Bittensor settings; returned to the same conversation with draft intact. Header change and reload also preserved draft. |
| Draft-only starters | Clicked Bittensor starter; populated editor without sending. Existing draft prevents replacement by another starter. |
| Memory panel | Saved/Review switching verified. Compact dialog exposed only panel controls in accessibility tree and focused Back. |
| Flag rollback | Legacy launcher restored with flag off, then minimal preview restored with flag on. Complete cross-layout draft/state acceptance remains pending. |
| Real execution | Bittensor send failed with missing-agent/provisioning error. Draft survived; error now explains setup blocker. No five-desk live acceptance claim. |
| Browser coverage | Codex in-app browser only. Safari, Firefox, screen reader, 200% zoom and full keyboard traversal unverified. |

## Remaining work before enabling

1. Complete the agent-repair dependency and expose its authoritative per-desk readiness contract. Show the actual blocker/recovery on each unavailable desk; do not compute readiness independently in this UI.
2. Complete real responses on all five desks and live reads on all four crypto desks through the redesigned interface, including correct billing reconciliation.
3. Add behavioral component/browser tests for first-time selection, save failures, return navigation and rollback; current new automated layout tests are primarily contracts. Confirm capability metadata and actual owner/member-specific recovery.
4. Complete request-state and tool-result presentation against real streaming, cancellation, approvals, denied permission, retry, offline and expired-session behavior. Preserve wallet review terms and approval separation.
5. Complete secondary-page redesign: wallet, notes/save feedback, integration capability states and account/public/recovery flows. The four settings groups reorganize navigation but do not fully redesign all underlying pages.
6. Finish light/dark, keyboard/focus, screen reader, contrast, reduced motion, 200% zoom and Chromium/Safari/Firefox acceptance. Broaden responsive coverage from launcher to all states and secondary screens.

## Evidence

- [Before at actual preview width](../../.impeccable/review/before-user-650.png)
- [After at actual preview width](../../.impeccable/review/user-650.png)
- [Desktop](../../.impeccable/review/desktop.png), [tablet](../../.impeccable/review/tablet.png), [mobile](../../.impeccable/review/mobile.png)
- [Finish review](../../.impeccable/review/finish-review.md)

These are local preview captures with test conversations, not hosted release evidence. No production configuration, signup switch, credentials or deployment was changed.
