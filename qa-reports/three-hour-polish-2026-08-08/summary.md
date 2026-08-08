# Matterhorn three-hour polish sprint

Date: 2026-08-08

Branch: `codex/task-first-redesign`

Base commit: `a51ac94dc12004e4bac04b1f8ddb1293542ae248`

Pull request: <https://github.com/matterhornso/matterhorn-work/pull/842>

## Result

The combined UI/UX, responsive/accessibility, frontend, backend, and security pass found and closed all locally reproducible P0-P2 issues in scope. The exact local candidate is green. Hosted beta remains an operational no-go until the same-origin backend/proxy and managed engine are attached and production account acceptance is available.

The polish followed the Matterhorn product/design contracts and the restrained Impeccable/Uncodixfy standard: familiar controls, clear hierarchy, 8-12px operational radii, no decorative redesign, no launch-policy expansion, and no reviewed wallet action exposed in Public Beta.

## Changes

### Reliability and security

- Made response Retry transactional. If replacement dispatch fails after revert, Matterhorn restores the original conversation before surfacing the error.
- Disabled the legacy CoW live-order endpoint until it has the dedicated reviewed-wallet approval flow required by the current action model. The wallet UI is explicitly preview-only and does not request a signature.
- Disabled the legacy Bittensor sidecar-submit endpoint so raw signatures remain inside the connected wallet; Matterhorn accepts only public receipt evidence after broadcast.
- Aligned saved-chat-response request bounds with the existing 5 MB output-file contract.
- Replaced customer-visible internal engine names in response recovery and workspace privacy/export descriptions.

### Desktop product polish

- Moved focused-desk task actions below their descriptions so Polymarket and Sui cards retain full-width, readable copy.
- Reworded Longevity as a guided workflow instead of inaccurately calling its in-app workflow offline.
- Normalized response files/links to the product control vocabulary, with clear grouping, visible focus, and 44px mobile hit areas.

### Responsive and accessibility

- Fixed real Privacy/Support clipping at the 320px launch floor with a bounded grid track and wrapped 44px navigation targets.
- Fixed MCP plugin-row clipping for long names during narrow route transitions.
- Corrected serious Settings sidebar contrast and remaining light/dark status, composer placeholder, perspective, agent, and reasoning-control contrast findings.
- Marked decorative provider SVGs as hidden from assistive technology.

## Live evidence

- [Polymarket before](../desktop-polish-2026-08-08/04-polymarket-before.png) → [after](../desktop-polish-2026-08-08/17-polymarket-after.png)
- [Sui before](../desktop-polish-2026-08-08/05-sui-before.png) → [after](../desktop-polish-2026-08-08/18-sui-after.png)
- [Privacy at 320px after fix](../responsive-a11y-polish-2026-08-08/screenshots/320-privacy-fixed.png)
- [MCP transition at 320px after fix](../responsive-a11y-polish-2026-08-08/screenshots/320-mcp-route-transition-fixed.png)
- [Settings contrast after fix](../responsive-a11y-polish-2026-08-08/screenshots/settings-1440-contrast-fixed.png)
- [Composer after simulated mobile keyboard collapse](../responsive-a11y-polish-2026-08-08/screenshots/320-session-keyboard-collapse.png)

Live audits covered 320, 375, 768, 1024, and 1440px. Final axe WCAG 2.2 AA scans reported zero violations on audited 320px and 1440px routes. No document overflow, unnamed controls, duplicate IDs, missing main landmark, missing visible H1, or composer overlap remained.

## Exact-tree verification

- App: 853 passed, 0 failed, 5,493 expectations across 118 files.
- Server: 803 passed, 0 failed, 5,629 expectations across 68 files.
- App typecheck: pass.
- Server build: pass.
- Public Beta production web build: pass.
- Matterhorn platform safety gate: all 10 stages pass.
- Matterhorn design-system gate: pass.
- Task-first bundle gate: pass.
  - Public entry graph: 431,765 bytes.
  - Public trust graph: 299,740 bytes.
  - Session route: 150,893 bytes.
  - Session page: 575,407 bytes.
  - Settings route: 256,102 bytes.
  - Largest wallet family: 896,388 bytes.
- Release secret scan: 981 files, zero findings.
- Dependency audit: 1,406 locked versions, zero low-or-higher advisories.
- Production CORS readiness: pass.
- `git diff --check`: pass.

## External gates

The code sprint cannot close the existing hosted blocker. Before beta GO, attach the authenticated same-origin control plane and managed engine, configure production deployment variables/secrets, deploy the exact approved commit with build identity, provide two ordinary verified accounts, and run hosted auth, real desk completion, tenant-isolation, cookie/CSRF/CORS, health, monitoring, backup/restore, rollback, Lighthouse, physical-device safe-area/keyboard, VoiceOver, and TalkBack acceptance.
