# Matterhorn Desks Platform QA Report

**Date:** 2026-07-28
**Branch:** `codex/public-launch-acceptance-rc4`
**Baseline:** `88a84b18` (`fix(support): publish updates contact`)
**Test surface:** Local web app with controlled Matterhorn backend, fake OpenCode provider, and fake Walrus storage
**App URL tested:** `http://127.0.0.1:5183/workspace/ws_9d76fd6566f5/session`

## Release Assessment

**Local candidate health: PASS**

The current candidate passed the full app, backend, type, production build, smoke-contract, and ten-stage Matterhorn platform-safety gates. The major desktop web journeys were also exercised as user workflows rather than click-only checks.

**Public production release: CONDITIONAL**

No local P0 or P1 code defect remains from this pass. Production deployment, real identity isolation, real wallet/signer acceptance, live-provider credentials, and macOS clean-machine acceptance still require owner-controlled environments and accounts.

## Journey Health

1. **Project home and navigation — Healthy**
   - Project actions, desk navigation, settings navigation, side panels, and return paths worked.
   - No duplicate element IDs, unnamed buttons, or horizontal document overflow were found in the checked settings routes.
   - Evidence: `01-project-home.png`, `02-settings-home.jpg`.

2. **Chat and run controls — Healthy after fix**
   - Fresh prompts entered the waiting state, exposed Stop immediately, and recovered after cancellation.
   - Discuss, Plan, and Work modes remained selectable.
   - Commands, Skills, Extensions, MCPs, agent selection, model selection, and perspective controls opened and restored state.
   - Fixed a race where the accepted prompt could be waiting while the composer incorrectly appeared idle and removed Stop.

3. **Notes — Healthy**
   - Create, edit, tag, autosave, search, open, output-to-note, and delete flows worked.
   - Temporary QA data was cleaned up after verification.
   - Evidence: `08-session-notes-panel.jpg`.

4. **Memory — Healthy**
   - Filters, validation, explicit private-memory creation, search, forget, export controls, and deletion worked.
   - Nothing was saved without explicit user action.
   - Temporary QA data was cleaned up.
   - Evidence: `09-session-memory-panel.jpg`.

5. **Outputs — Healthy**
   - Receipt browsing, structured details, copying, note creation, and safe deletion worked.
   - OS-level download, reveal-in-folder, and external-open actions were not invoked in this local browser pass.
   - Evidence: `10-session-output-panel.jpg`.

6. **Profile and local workspace — Healthy**
   - Local profile truth, preference navigation, workspace access messaging, and unavailable Cloud state were coherent.

7. **Wallet settings and protocol truth — Healthy after fix**
   - Wallet errors, policy persistence, disclosures, and protocol capability labels worked.
   - Bittensor, Hyperliquid, and Polymarket now derive customer-visible submission claims from runtime readiness.
   - Unsupported execution paths present prepare-only guidance and do not offer a false active submission path.
   - Real MetaMask, Phantom/Sui, wrong-chain, cancellation, and signer acceptance remain owner-controlled tests.
   - Evidence: `03-wallet-settings.jpg`.

8. **Bittensor desk — Healthy**
   - Ten desk actions rendered.
   - Public-address validation and no-input handoff behavior worked.
   - Unsigned preparation and external-signer boundaries were represented truthfully.

9. **Hyperliquid desk — Healthy after fix**
   - Research and preparation workflows worked.
   - The earlier contradiction between execution copy and runtime availability was removed.
   - Real wallet-authorized submission still requires a controlled eligible account and small test assets.

10. **Polymarket desk — Healthy for preparation**
    - Empty market validation and staged prompt creation worked.
    - Runtime readiness now controls whether submission is presented or preparation-only guidance is shown.
    - Real eligible-account submission remains an owner-controlled acceptance test.

11. **Sui desk — Healthy for the tested empty state**
    - Empty wallet state and preparation boundaries rendered correctly.
    - Real Phantom/Sui wallet connection and transfer preview need owner-controlled browser-extension acceptance.

12. **Longevity workflow — Healthy**
    - Seven stages rendered and the first stage staged the expected chat prompt.

13. **Model settings — Healthy**
    - Included model catalog and picker worked.
    - External provider setup surfaced validation without exposing secrets.
    - Evidence: `04-model-settings.jpg`.

14. **MCP settings — Healthy**
    - Refresh, client selection, configuration copy, setup disclosure, custom-MCP validation, and muted coming-soon connectors worked.
    - Runtime status remained distinguished from catalog availability.
    - Evidence: `05-mcp-settings.jpg`.

15. **Generated media — Mostly healthy**
    - Readiness refresh, diagnostics state, media counts, and provider setup worked.
    - A launch-gated Billing feature no longer exposes a dead “Open billing” action.
    - Legacy manifest names are sanitized before customer display.
    - Residual P2: “Generate image” currently opens the project workspace instead of directly staging a new image prompt.
    - Evidence: `06-generated-media.jpg`, `13-image-provider-setup.jpg`.

16. **Preferences and reload — Healthy after fix**
    - Preferences persisted.
    - The controlled fake engine now implements the reload/dispose contract without destroying synthetic QA sessions.
    - Evidence: `07-preferences.jpg`.

17. **Customization and appearance — Healthy**
    - Task-suggestion visibility persisted and was restored.
    - Light, dark, and system appearance selections persisted; System was restored after the visual check.
    - Evidence: `11-customization.jpg`.

18. **Updates — Healthy after copy fix**
    - Web builds no longer claim the app is up to date when desktop update checks are unavailable.
    - Evidence: `12-updates-web.jpg`.

## Defects Fixed

1. **Stop control disappeared during the accepted-prompt waiting gap**
   - Unified active-run state across polling, transcript, cancellation, status, and composer.
   - Preserved Stop while allowing a separate queued follow-up action.

2. **Protocol execution copy could overstate runtime capability**
   - Runtime readiness now controls venue copy, metrics, warnings, and Polymarket submission availability.

3. **Preferences reload timed out in the controlled QA engine**
   - Added the OpenCode-compatible `/instance/dispose` test route.

4. **Web updates displayed false “up to date” language**
   - Replaced it with truthful desktop-update availability messaging.

5. **Legacy OpenWork labels leaked through extension manifest resources**
   - Added a customer-visible manifest label sanitizer.

6. **Generated media exposed a dead Billing action**
   - Billing navigation is now present only when the launch feature is enabled.

## Automated Verification

| Gate | Result |
| --- | --- |
| App unit/contract tests | **726 passed, 0 failed** |
| Backend tests | **759 passed, 0 failed** |
| TypeScript typecheck | **Passed** |
| Production UI build | **Passed** |
| Generated-media smoke launcher contract | **Passed** |
| Matterhorn platform safety gate | **10/10 stages passed** |
| Diff whitespace check | **Passed** |

The first sandboxed backend and safety runs failed because the sandbox denied ephemeral localhost listeners (`EPERM` at `127.0.0.1:0`). Both suites passed unchanged when run with their required loopback permission. These were test-environment failures, not product regressions.

## Visual and UX Review

- Inspected all 13 screenshots captured during this run.
- Checked information hierarchy, control contrast, empty states, status truth, text wrapping, panel layout, and action discoverability.
- No visible overlap, cropped primary control, broken icon, or incoherent divider pattern remained in the captured desktop states.
- The candidate retains progressive disclosure for technical and safety details.
- Production build warnings identify large chunks, especially wallet, Shiki, session, and settings bundles. This is a performance optimization opportunity, not a functional release blocker.

## Accessibility Risks

This pass does **not** claim accessibility conformance.

- DOM checks found no unnamed buttons or duplicate IDs in the checked routes.
- Keyboard/focus behavior was exercised for major overlays and controls, but a full screen-reader matrix was not run.
- Fixed desktop screenshots do not certify mobile, zoom, high-contrast, reduced-motion, or every localization state.
- Real OS dialogs, browser-wallet extension windows, and native macOS permission dialogs require separate manual checks.
- A dedicated VoiceOver pass and 200% zoom pass remain recommended before a general-availability release.

## Production and Owner-Controlled Acceptance Still Required

1. Production signup, sign-in, sign-out, password/recovery, and two-user workspace isolation.
2. Production CORS, HSTS, rate limiting, logs, monitoring, backup, restore, and rollback.
3. MetaMask connection, cancellation, wrong-chain correction, approval, and rejected-signature recovery.
4. Phantom/Sui connection, transfer preview, cancellation, and wrong-network handling.
5. Hyperliquid controlled review/sign/submit using an eligible test account and small assets.
6. Polymarket controlled prepare/handoff or eligible wallet-authorized flow, according to production readiness.
7. Bittensor unsigned preparation and external signer acceptance.
8. Real external model-provider credentials and response behavior.
9. macOS clean-account install, first run, upgrade, permissions, wallet handoffs, uninstall, and checksum.
10. Dependency vulnerability audit. Networked lockfile submission was not approved in this environment and was not bypassed.

## Release Recommendation

Freeze the current scope, review and commit only the intentional tracked fixes and new contract tests, then perform the production and owner-controlled acceptance list against that exact commit. Do not add new features before those checks close.
