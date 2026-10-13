# PR #1027 interface restoration

## Scope

- Historical UI reference: PR #1027 merge `ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`.
- Implementation base: `f6a0e07b47f87237f4c79b27568b65f3f7e0a170`.
- Branch: `codex/restore-pr1027-ui-2026-10-12`.
- Restore the retained legacy layout and styling by default. Do not reset the repository to the historical commit.
- Later backend, security, model persistence, account access, privacy, accounting and chat-recovery code is preserved. Jev controls remain visible because a remembered opt-in must still be inspectable and removable.
- Existing user checkout, preview configuration, accounts, chats and files were not changed. No push, merge, deployment, production configuration change or provider call.

## Verification

Commands run from the branch checkout with pinned pnpm 10.27.0; `pnpm exec bun` used Bun 1.3.11.

| Check | Result | Evidence scope |
| --- | --- | --- |
| `env -u VITE_MATTERHORN_RETRO_UI -u VITE_MATTERHORN_MINIMAL_UI pnpm exec bun --no-env-file test apps/app/tests` | 1,579 passed, 0 failed; 9,138 assertions across 205 files | Complete frontend test directory. Three loopback-bind sandbox failures in the first run were confirmed environmental; the complete rerun with listener permission passed. |
| Explicit retro preview: sidebar parity, AI-settings render and privacy-notice render tests | 21 passed, 0 failed; 116 assertions | Optional retro UI remains usable in the tested component contracts. |
| `node --test apps/app/scripts/build-public-guides.test.mjs` | 11 passed, 0 failed | Default legacy guides, explicit retro opt-in, escaping, metadata and public/private crawl boundaries. |
| `pnpm --filter @matterhorn-work/app typecheck` | Passed | App typecheck and prerequisite package builds. |
| `env -u VITE_MATTERHORN_RETRO_UI -u VITE_MATTERHORN_MINIMAL_UI pnpm --filter @matterhorn-work/app build:web` | Passed | Production web bundle and public guides. Existing chunk-size, circular-chunk and dependency annotation warnings remain. |
| Inspect built `index.html` and `learn/index.html` | Passed | No retro root marker; build-attestation metadata retained. This pre-commit build identifies the base SHA, not a deployed rollback release. |
| `pnpm exec bun --no-env-file test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'default legacy layout'` with both UI flags unset | 1 passed, 0 failed; 18 assertions | Chromium, synthetic same-origin account/runtime services, isolated browser context. Model picker, visible desktop Profile/Wallet/Tools, retained draft, light/dark at 1440 and 390px, no page errors or horizontal page overflow. No inference or auth acceptance claim. Other 158 tests in this browser file were filtered out. |
| `git diff --check` | Passed | Whitespace and patch integrity. |
| Independent Impeccable finish review | **ship** | Four supplied synthetic-shell captures and narrow production diff. No newly introduced material visual regression found. This is not whole-app, hosted or WCAG certification. |
| Independent documentation pass | Passed | Updated `DESIGN.md` and `.impeccable/design.json` rollout/narrative only; token definitions, extensions and 11 component specimens preserved. JSON parsing and narrative consistency checked. Legacy Settings' fixed sidebar palette explicitly retained. |

The browser fixture now uses the actual release flag instead of always applying retro styling. The new legacy test supplies an explicit synthetic server-default model; it does not rely on an invented available model or modify a real workspace. The first diagnostic attempts used an outdated model-button label and a fixture without a selected model; those fixture issues were corrected before the passing run.

## Captures

Synthetic production-shell fixtures, not a logged-in production account or a live model response:

- [Light desktop](../../../.impeccable/review/restore-pr1027-2026-10-12/legacy-light-1440.png)
- [Dark desktop](../../../.impeccable/review/restore-pr1027-2026-10-12/legacy-dark-1440.png)
- [Light mobile](../../../.impeccable/review/restore-pr1027-2026-10-12/legacy-light-390.png)
- [Dark mobile](../../../.impeccable/review/restore-pr1027-2026-10-12/legacy-dark-390.png)

Capture command additionally sets `LEGACY_ROLLBACK_CAPTURES=.impeccable/review/restore-pr1027-2026-10-12`.

One successful batched capture round. The light desktop capture includes a transient pending Ask state after model selection; later captures show the settled action. The reviewer did not treat it as a runtime-readiness claim. Legacy mobile breadcrumb truncation, compact icons and small supporting copy remain inherited limitations for separate accessibility work.

## Deployment handoff — not executed

1. Review the rollback branch. Retain later runtime/security code; do **not** reset or force-push `dev` to #1027.
2. For the web build, remove stale overrides or explicitly set **both** `VITE_MATTERHORN_RETRO_UI=0` and `VITE_MATTERHORN_MINIMAL_UI=0`. They are build-time settings: a backend restart alone does not change an existing frontend bundle.
3. Build from the approved rollback commit and record that exact SHA. Docker's retro build argument now defaults to `0`; explicit old build arguments still override it.
4. Deploy only after separate approval. Verify the hosted build attestation and absence of `html[data-matterhorn-ui="retro"]`.
5. With normal test accounts, verify existing chats and drafts, model selection, every desk, Profile/Settings, workspace controls, wallet-review safety and mobile navigation. No data migration is required or authorized.

## Limits

This is the earlier layout/theme with later functional and safety additions, not a pixel-for-pixel whole-repository #1027 reset. Browser evidence is Chromium fixture coverage only; Safari/Firefox, hosted login, real responses across desks, deployment and new-head remote CI were not run for this UI-only rollback. It does not resolve or re-certify previously recorded runtime or remote-CI blockers.

The existing local preview endpoints were not listening during this turn; they were not restarted or reconfigured. Current browser ambient URL alone is not proof a server is running.

Pre-existing Impeccable surface-registry/build-path metadata warnings are outside this rollback. They were reported by context loading and were not repaired as a side effect. The current design-default contract is updated separately without regenerating tokens.
