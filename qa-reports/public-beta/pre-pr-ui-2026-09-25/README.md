# Pre-PR UI and runtime regression review — 25 September 2026

## Decision

Ready for a **reviewable, stacked PR**, not production launch certification.
Branch: `codex/desk-agent-runtime-repair`, based on
`e6617234827776d80d531c7d042b82eab28fce92` (`codex/minimal-workspace-revamp`).
Merge order remains desk-first home (#1023), minimal workspace (#1024), then
this repair. The minimal-UI release flag remains default-off.

This report supersedes the historical design-gate failure in
`../code-review-2026-09-24.md`. All ten safety stages now pass, including after
the UI changes below. Neither production nor signup configuration was changed.

## Scope and method

Used the existing disposable local account, restored preview on port 58435,
and a temporary flag-on frontend on port 58436 sharing that local backend.
Inspected the default and minimal layouts in the Codex in-app browser, using
screenshots, rendered accessibility/DOM state and real user-facing controls.
Impeccable guided a bounded audit/fix/confirmation pass; Uncodixfy constrained
changes to existing design patterns. No broad redesign was added here.

Checked widths: default preview approximately 650px, mobile 390×844,
minimal tablet 768×1024, minimal desktop 1280×720 and default desktop 1440×960.
Temporary viewport overrides and the isolated flag-on frontend were cleaned
up; the user's original local preview remains available.

## Journey results

1. **Models — corrected.** Both chat pickers previously exposed embedding
   models when the minimal flag was off. They now apply the same chat-model
   filter in both layouts. Verified ten chat models, search, keyboard choice,
   selected model, and draft preservation. Added the settings picker's missing
   search label. Selecting ASI1 in minimal settings showed Saving and returned
   to the desk launcher. This was an existing account, not fresh-account
   onboarding. Before: [picker](03-model-picker-before.png).
   After: [picker](12-model-picker-after.png), [minimal models](15-minimal-models.png).
2. **Settings return and promotions — corrected.** Close settings previously
   returned to Home. It now restores the originating conversation in either
   layout, retaining the same-workspace guard. Confirmed the exact chat URL
   and draft after closing. Managed-provider settings no longer promote
   Subscribe or cloud-provider imports; self-managed desktop paths remain.
   [Before](04-settings-before.png), [after](13-settings-after.png).
3. **Desk entry and suggestions — corrected.** Default-layout Bittensor
   suggestions previously created a new session and sent immediately. The
   reproduced request was stopped; it is not counted as a completed response.
   Suggestions now fill an editable draft in the current session and refuse
   to overwrite an existing draft. Verified same session, populated composer,
   Ask available and no running request. Minimal-layout navigation opened all
   five desk composers; each crypto desk showed three starters, Private AI
   showed a blank composer. These are navigation checks, not proof of live
   agent execution. [Launcher](14-minimal-launcher.png),
   [Bittensor](16-minimal-bittensor.png).
4. **Workspace tools — checked within stated limits.** Opened Memory, Notes,
   integrations/tools and Wallet, then returned to chat with the draft intact.
   Memory empty/review state loaded; an existing synthetic note opened in the
   editor. One contextual panel was visible at a time. Wallet information and
   review boundaries remain separate from chat. No wallet connection, signing,
   note mutation, integration installation or account change was performed.
   [Memory](08-memory-desktop.png), [Notes](09-notes-desktop.png),
   [Tools](10-tools-desktop.png), [Wallet](11-wallet-desktop.png).
5. **Responsive layout — checked views pass.** No horizontal document overflow
   at the measured 390px default and 390px/768px minimal views. Composer and
   primary controls remained visible without overlap in the captured states.
   [Default mobile](07-mobile-chat.png), [minimal mobile](17-minimal-mobile.png),
   [minimal tablet](18-minimal-tablet.png). The legacy layout intentionally
   retains its existing rail; the flag-on layout uses one sidebar.

## Automated verification after changes

| Check | Result |
| --- | --- |
| `pnpm exec bun test apps/app/tests` | 1,178 passed, zero failures; 7,546 assertions, 171 files |
| `pnpm --dir apps/app typecheck` | Passed |
| `pnpm --dir apps/server exec tsc --noEmit` | Passed |
| `pnpm --dir apps/app build` | Passed; existing large-chunk warnings remain |
| `pnpm test:matterhorn-platform-safety` | All ten stages passed |
| Focused server/agent suite below | 414 passed, zero failures; 2,318 assertions |
| `pnpm --dir packages/bittensor-subtensor-sidecar test` | All five suites passed |
| `pnpm release:secret-scan` | 1,201 files; zero findings, zero oversized files |
| `git diff --check` | Passed |

Focused server suite:

```sh
pnpm --dir apps/server exec bun test \
  src/backend-security.e2e.test.ts \
  src/managed-opencode-mcp.test.ts src/managed-opencode.test.ts \
  src/workspace-init.test.ts src/guarded-agent-runtime.test.ts \
  src/tools/sui.test.ts src/tools/bittensor.test.ts \
  src/tools/hyperliquid.test.ts src/tools/polymarket.test.ts
```

These suites overlap with safety-gate coverage; do not sum them as unique tests.
Local output logs are under `/tmp/matterhorn-pr-*`; raw logs and private preview
diagnostics are deliberately excluded from the PR.

## Runtime/security changes packaged with the UI corrections

- Canonical release-owned desk agent prompts/permissions are provisioned in
  trusted managed runtime configuration, independently of user project config.
- Bittensor readiness requires a verified SDK chain head. Missing SDK/chain
  reads report degraded availability instead of fabricated live evidence.
- Compact discovery results preserve chain evidence and warnings within the
  existing model-context budget; secret validation remains before projection.
- Sui's public Move coin-type syntax no longer trips the crypto-key detector;
  the exception is restricted to that field and exact qualified syntax.
- Sidecar requests, depth, process concurrency, duration and stdout are bounded;
  diagnostics are not exposed to callers. The service must remain private.
- Main API rejects non-object JSON with 400; bounded dev-log reading is shared;
  Python files are included in secret scanning.
- The design contract now checks the approved five-desk navigation independently
  in both design documents, without removing the other safety checks.

## Unverified or remaining release work

- This is not a review of every rendered state or a WCAG certification. Safari,
  Firefox, screen-reader output, 200% zoom, light theme, reduced motion and the
  complete offline/expired-session matrix were not re-certified in this pass.
- A scoped design detector produced 43 existing font-size advisories (10–13px
  metadata versus the documented 14px floor); no other detector categories
  fired. Small metadata and measured contrast still merit a separate accessibility
  pass. PRODUCT.md also uses an older design-context schema/desk list; it was
  not silently rewritten as part of this bounded repair.
- Existing production-build chunk-size warnings remain. A successful build is
  not a live performance acceptance result.
- No new completed five-desk model-response batch was run here. Earlier local
  September 24 agent evidence used session-scoped host approval and the local
  runtime rollout guard off; it is not production acceptance. Rerun against the
  exact deployed release with intended permissions before launch.
- Hosted signup/recovery/email delivery, backup restore, two-account isolation,
  real-wallet acceptance, private-provider setup and crypto-app installation
  were not tested end to end in this UI pass. Do not mark them green from these
  screenshots or fixture tests.
- CI results belong to the PR and must be checked separately. This task does
  not authorize merge, deployment, feature-flag activation or public launch.
