# Responsive restored chat — 15 October 2026

## Scope and evidence boundary

Follow-up to [draft PR #1036](https://github.com/matterhornso/matterhorn-work/pull/1036), on `codex/cudos-model-selection-2026-10-14`. This repairs the restored chat layout, not a new design or product capability. Source and regression commit: `fdaa1550a0576876b5c78b0893c7a24c92e23d89`, following parent `43d0a01e16ca266cfa2386fd59e66c8607586dfc`. Resolve the subsequent evidence commit and exact published-head checks on the PR. No merge or deployment was performed.

The reported page was inspected read-only at **523 × 725 CSS pixels** in the Codex browser. Its provider-backed preview remains at `59c6dac3ac1f5c289509639206ff2eca6d21b601`, with its account, chats, drafts, settings, data and listening ports unchanged. After captures use an isolated loopback fixture rendering the actual `SessionPage`, `SessionSurface`, composer and model picker with explicit synthetic data. They are **not** a fresh CUDOS request, logged-in acceptance, hosted acceptance or proof that every desk/model works.

## Reproduced problems and corrections

- The fixed composer and notices consumed most of the narrow window. Container-based spacing now follows the available chat-column width, including when desktop rails are open; all warnings and actions remain.
- Workspace and chat names competed for one header line. They now stack within narrow columns while sidebar, Home, Rename, Note and workspace-menu buttons retain their space and accessible names.
- Floating Start/Latest buttons covered the response receipt. Navigation now occupies its own stable row. The obsolete invisible completed-response status spacer was removed; active waiting/streaming states remain.
- Receipt metadata could overrun its row. Summary and metadata now wrap without dropping the token count, duration, status or expandable details.
- An absolutely positioned placeholder could wrap over attachment/send controls. Placeholder and editor now share a grid cell that participates in sizing; long drafts scroll inside the editor.
- Short-height layouts hid composer controls in a horizontal strip and could clip menus. Controls now wrap and the chat surface scrolls vertically below 540px height. Tools, Agent and Chat options use the existing bounded dialog primitive in constrained columns/windows, with a Close action and focus restoration.
- A separate functional check reproduced clipped Tools actions at 320px width and inside a 360px desktop chat column. Menu adaptation must follow the actual composer width, not merely the browser viewport. Raw engineering commands remain intentionally unavailable; menu reachability tests use the supported Skills catalog.
- Independent review caught Tab selecting an Agent in the compact dialog. Compact dialogs now preserve native Tab/Shift+Tab and Enter/Space behavior; the anchored picker's existing shortcuts remain unchanged.
- The minimum chat-panel width no longer forces 360px when no secondary pane is docked.

No colors, fonts, logo assets, desk order, privacy policy, approvals, usage limits, account state, inference routing or server authorization were changed. Impeccable and Uncodixfy guided responsive adaptation while preserving the approved restored UI. The pre-existing design-sidecar freshness warning was not repaired as a side effect.

## Verification

| Check | Result |
| --- | --- |
| `bun test apps/app/tests` | 1,340 passed; 0 failed; 8,180 assertions. Initial restricted-sandbox run could not open three loopback HTTP fixtures; the complete permitted rerun passed. |
| `pnpm --filter @matterhorn-work/app typecheck` | Passed. |
| Isolated web-mode Vite build | Final source passed in 9.85s; output only in `/private/tmp/matterhorn-responsive-chat-2026-10-15-dist`. Existing large-chunk warning remains. This working-tree build was not installed into the user's preview. |
| `bun test apps/app/scripts/responsive-chat.browser.test.ts apps/app/scripts/composer-submit.browser.test.ts` | Chromium: 16 passed, 1 optional screenshot-capture test skipped, 0 failed; 1,010 assertions; 46.48s. Includes existing composer regressions and the new responsive/menu tests. |
| `UI_QA_BROWSER=webkit bun test apps/app/scripts/responsive-chat.browser.test.ts` | WebKit: 5 passed, 903 assertions; 39.11s. WebKit automation is not real Safari/iPhone certification. |
| `UI_QA_BROWSER=firefox bun test apps/app/scripts/responsive-chat.browser.test.ts` | Unverified: browser startup exceeded the 60s setup deadline; no tests ran. No layout pass or failure inferred. |
| `pnpm release:secret-scan` | 1,235 source files, zero findings, zero oversized skips. |
| `pnpm test:matterhorn-customer-onboarding-ui` / `pnpm smoke:customer-ready-crypto` | Passed after updating the stale floating-navigation assertion; every offline smoke stage passed with loopback fixture permission. This runner's `READY` label is offline contract evidence, not launch or live-chain acceptance. |
| Independent source review / `git diff --check` | Passed after the Agent keyboard and narrow-column menu corrections; no remaining blocking findings. |
| New-head CI | Pending at report commit; final status belongs to the exact head recorded on the PR, not the earlier green checkpoint. |

The responsive suite exercises Light/Dark at 320×740, 390×844, 523×725, 768×900, 1280×900, 640×450 and 844×390. It checks page overflow, real header hit targets, readable transcript space, receipt/navigation separation, reachable model/privacy/private-mode/options/attachment/Tools controls, draft retention through disclosures and resize, and one synthetic dispatch followed by one abort. It also checks empty placeholder sizing and a 30-line draft with 200% root text. Additional tests cover a tall 320px viewport and a 360px chat column in a 1280px desktop window, including resizing 360→700→360 with the menu open, first/last menu actions, native Tab/Shift+Tab/Enter/Space, Escape/outside dismissal and focus restoration. 640×450 models the CSS viewport of a 1280×900 window at 200% browser zoom; these are not physical-device or OS-keyboard tests. Reduced motion is enabled in the matrix.

Privacy/private-setup callbacks in this layout fixture deliberately open labelled fixture dialogs. Model-picker data and network responses are synthetic and loopback-only. Production behavior and prior real-provider evidence remain documented separately in the [CUDOS report](../../cudos-model-selection/2026-10-15/RESULTS.md).

Initial published-head CI on `f283da5e490d9fc03c439a4af9a6346a6c93301d` exposed two outdated onboarding source assertions requiring the old floating jump-control overlay. The assertion correction requires the labelled nonshrinking navigation row and explicitly prohibits that overlay; browser receipt/non-overlap coverage remains unchanged. Independent review and the complete local offline customer-crypto smoke passed afterward. Final exact-head CI must supersede that failed checkpoint, not silently relabel it as green.

## Visual evidence

Two bounded screenshot rounds were reviewed, including the full restored shell, both themes, the narrow preview and short-height options. An incomplete fixture asset allowlist initially omitted protocol logos; the test server now serves the existing public logo files without changing production assets. Temporary browser dimensions were reset and the isolated capture tab/listener were closed.

- [Before: existing local preview, 523px](screenshots/before-local-preview-523.png)
- [After: synthetic full-shell chat, dark 523px](screenshots/after-dark-preview-523.png)
- [After: synthetic full-shell chat, light 390px](screenshots/after-light-mobile-390.png)
- [After: synthetic full-shell chat, dark 1280px](screenshots/after-dark-desktop-1280.png)
- [After: short-height Chat options, 640×450](screenshots/after-short-height-options-640.png)

## Remaining release limits

The existing logged-in preview intentionally does not contain these source changes. An authorized preview rebuild/restart or deployment must preserve its data and use the reviewed commit. No stale screenshot or old CI result should be presented as that acceptance. Physical iPhone/Android testing, real browser zoom/keyboard behavior, Firefox, screen-reader review and hosted authenticated replay remain unverified here.

All release, privacy, unknown-usage reservation, backup and hosted five-desk gates in the [deployment handoff](../../../docs/handoffs/cudos-model-selection-and-desk-reads-2026-10-15.md) remain in force. This layout repair does not resolve those operator gates or authorize a merge/deployment.
