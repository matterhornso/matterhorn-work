# Workspace visibility inventory — 6 October 2026

Scope: the existing retro/minimal web workspace, with small label and responsive fixes. No redesign, new protocol capability, launch-gate relaxation, account mutation, provider request, signing or deployment was performed by this source pass. Earlier real-chat evidence remains in [RESULTS.md](RESULTS.md); it is not replaced by fixtures below.

## Entry points and boundaries

| Destination | Desktop and mobile entry | Boundary |
| --- | --- | --- |
| Private AI | Five-desk launcher; Desks navigation → Private AI | Starts an editable chat; does not auto-send |
| Bittensor | Five-desk launcher; Desks navigation → Bittensor | Same shared navigation on mobile; existing readiness/permission checks |
| Hyperliquid | Five-desk launcher; Desks navigation → Hyperliquid | Public read/research flow; wallet execution stays gated |
| Polymarket | Five-desk launcher; Desks navigation → Polymarket | Existing public-read and compliance boundaries unchanged |
| Sui | Five-desk launcher; Desks navigation → Sui | Balance/object public reads; no new prepare or submit action |
| Model selection | Visible Model + selected name in chat header; Models setup from launcher | Connected prompt-ready models only; selection does not bypass send consent |
| Run history | Workspace tools → Run history | Existing workspace-scoped history route |
| Integrations | Workspace tools → Integrations | Existing configured/readiness surfaces; unavailable connectors are not promoted |
| Memory | Workspace tools → Memory | Existing reviewed save, sensitivity/export policy and account isolation |
| Notes | Workspace tools → Notes / Jot a note when Notes is available | Existing workspace-scoped state and save behavior |
| Wallet | Workspace tools → Wallet | Entry visibility does not enable signing, transaction execution or custody |
| Profile/account | Visible Profile footer; Workspace tools → Profile & account | Both open the existing exact profile/account panel; no auth bypass |
| Settings sections | Sidebar → Settings; visible Settings navigation trigger on compact settings screen | Choosing a section closes only the mobile drawer; all gated destination groups remain unchanged |
| Files/coworkers, browser, voice, outputs | Existing conditional Workspace tools entries | Retain launch/runtime/availability predicates; do not claim these are enabled everywhere |

The shared `PRIMARY_DESKS` inventory contains exactly Private AI, Bittensor, Hyperliquid, Polymarket and Sui. Mobile reuses this same navigation inside the drawer; it does not maintain a separate reduced list.

## Verified issues and bounded fixes

1. P2: Workspace tools was visually ellipsis-only despite a correct accessible label. It now has persistent visible text in the minimal header.
2. P2: The model picker displayed only the selected name, hiding the action's purpose. The header now renders Model plus the selected name; the accessible name includes that selection. Only the model name truncates, not the label/chevron.
3. P2: The mobile navigation trigger and Profile footer were icon-only. The minimal trigger now reads Desks; compact Profile remains visible. Legacy sidebar callers keep their original icon-only behavior and accessible text.
4. P2: Long title/model names competed in one fixed-height mobile header. Below 768px the header uses two bounded rows and a viewport-bounded model popup; desktop retains one row. No composer or footer positioning was rewritten.
5. P2: Public Beta banners claimed watches/monitoring were available through the chat flow. Copy now says watch planning, matching the exposed capability; separate watch/receipt starter corrections are owned by the desk-matrix pass.
6. P2: The footer's Profile label restored the last Settings section, which could be Models. Minimal sessions now open the same existing profile/account panel used by Workspace tools; legacy settings and Back behavior are retained.
7. P2: Choosing Account in the mobile Settings drawer changed the URL but left the drawer covering the destination. All existing section-selection handlers now close the mobile drawer after selection. The Settings trigger is visibly named; desktop open state and section gates are unchanged.
8. P2: The compact hosted profile's Account settings link led to the public website instead of the app's existing account controls. Web now uses a normal in-app Link to the encoded workspace-scoped account route, or global `/settings/cloud-account` without a workspace. Desktop retains its external Cloud account link.

No unconditional display was added for gated actions. The original predicates for coworkers/files, Notes, native Browser, voice and artifacts remain. No provider filters, permission checks, account APIs, model persistence or wallet controls changed.

## Automated evidence

Commands from the repository root, with automatic environment-file loading disabled:

```sh
env -i PATH="$PATH" pnpm exec bun --no-env-file test apps/app/tests/workspace-chrome-visibility.test.tsx apps/app/tests/responsive-a11y-regressions.test.ts apps/app/tests/responsive-a11y-polish-contract.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts apps/app/tests/sidebar-parity-render.test.tsx apps/app/tests/session-layout-policy.test.ts
env -i PATH="$PATH" pnpm --dir apps/app typecheck
env -i PATH="$PATH" pnpm exec bun --no-env-file test apps/app/tests
```

Targeted result: **79 passed, 0 failed, 6 files, 1,063 assertions**. The new tests render the named/default sidebar trigger and verify all-five desk inventory, visible Model/Workspace tools/Profile labels, mobile row constraints and disabled-state preservation. App typecheck passed, including the existing dependency-build prerequisites.

After adding the explicit banner-truth guard, the final visibility file alone passed **7 tests / 33 assertions**. `git diff --check` passed.

After the Profile destination and Settings-drawer corrections, this focused pass succeeded with **73 tests / 1,088 assertions across 4 files**:

```sh
env -i PATH="$PATH" pnpm exec bun --no-env-file test apps/app/tests/workspace-chrome-visibility.test.tsx apps/app/tests/responsive-a11y-regressions.test.ts apps/app/tests/settings-minimal-navigation.test.ts apps/app/tests/shared-primitives-ui-contract.test.ts
```

The independent approval/runtime reviewer found no authorization or dataflow issue in either navigation batch. SettingsSidebar remains under SidebarProvider; all settings section buttons use the existing tab handler and close only mobile state. Browser completion is a separate acceptance check.

**Final complete frontend result after both navigation batches: 1,576 passed, 0 failed, 205 files, 9,131 assertions (23.33 seconds).** One stale tablet source assertion initially expected the previous icon-only Settings trigger; only the exact expected labelled trigger was updated, retaining its 1024px breakpoint and desktop/mobile visibility assertions. Current app `tsc --noEmit` and `git diff --check` also passed.

The later root-owned combined frontend/MCP/token-budget/Bittensor run passed **1,646 tests across 208 files / 9,824 assertions**; this is combined coverage, not a frontend-only count. The final Account settings link correction then passed **42 account-render/lifetime/availability tests across 4 files / 148 assertions**, including rendered hosted workspace/global hrefs and preserved desktop external behavior. Its post-change app typecheck also passed. An independent read-only review confirmed that both internal destinations resolve to the existing full account surface, with no routing/identity regression found. No authentication, sign-out or account-security behavior was changed by the link fix.

```sh
env -i PATH="$PATH" pnpm exec bun --no-env-file test apps/app/tests/account-cloud-independent-render.test.ts apps/app/tests/cloud-account-availability-contract.test.ts apps/app/tests/account-security-client-lifetime.test.ts apps/app/tests/account-security-render.test.tsx
env -i PATH="$PATH" pnpm --dir apps/app exec tsc -p tsconfig.json --noEmit
```

The full platform safety run exposed three stale exact onboarding-tooltip expectations for `watches`. Updated only those three strings to the shipped `watch planning` wording; the isolated clean-environment onboarding gate passed. The failed full-run summaries are retained in `platform-safety-before-visibility-assertion-fix.log` and its result JSON. No capability/permission assertion was removed or weakened.

The next full run passed all 52 offline crypto-smoke checks, including customer onboarding, then stopped later in desk.depth on Bun `EINTR` while importing a viem dependency file. Its failure is retained in `platform-safety.log`/result. The exact three-file fixture group reproduced the import interruption on a different local source file, while the other 12 tests passed. No product assertion, timeout or gate was changed for this. Ten direct Node reads and ten direct Bun reads succeeded for each implicated file; the account-link app typecheck also completed successfully. After that concurrent typecheck ended, the unchanged fixture group passed **26 tests / 266 assertions across 3 files**. This timing does not establish the cause of the interruption.

The final clean-environment rerun of both complete requested stages **passed**, exit 0, from **00:56:30 to 01:03:52 UTC**:

```sh
env -i PATH="$PATH" pnpm exec node qa-reports/web-desks/2026-10-06/run-platform-safety.mjs --only desk.depth,product.readiness
```

Desk depth passed all **52 offline crypto smoke checks**, the crypto tool authority gate, and Bun groups of **61 tests / 402 assertions** and **26 tests / 266 assertions**. Product readiness passed its script/CORS contracts and eight Bun groups totalling **1,078 tests / 8,107 assertions**. All groups had zero failures. Exact per-group counts and sanitized stage output are in `platform-safety-desk.depth-product.readiness.log`; timestamps, clean-environment policy and exit status are in its result JSON. This is a successful final-source rerun of two complete stages, not a claim that the interrupted eleven-stage invocation completed or that fixture readiness establishes hosted/live acceptance.

The isolated production-mode public-beta web bundle passed in **22.58 seconds**, with output only in `/tmp/matterhorn-visibility-web-build.ONp4LF`; no active preview was replaced. Run from `apps/app` after the typecheck prerequisites:

```sh
qa_visibility_web_build=$(mktemp -d /tmp/matterhorn-visibility-web-build.XXXXXX)
env -i PATH="$PATH" QA_WEB_BUILD_OUTPUT="$qa_visibility_web_build" VITE_MATTERHORN_DEPLOYMENT=web VITE_MATTERHORN_PUBLIC_BETA=1 VITE_MATTERHORN_REQUIRE_SIGNIN=true VITE_MATTERHORN_CLOUD_ENABLED=true pnpm exec node --input-type=module -e 'import { build } from "vite"; await build({ envDir: false, build: { outDir: process.env.QA_WEB_BUILD_OUTPUT, emptyOutDir: true } }); console.log(JSON.stringify({ isolatedBuildOutput: process.env.QA_WEB_BUILD_OUTPUT }));'
```

The build reports >500kB chunks, an account-security-response/den circular-chunk warning, a Polkadot annotation warning and a Node registration deprecation. A successful bundle is not a runtime performance or cross-browser acceptance claim.

The initial complete frontend run passed 1,562 tests and failed three HTTP fixtures before their assertions because sandboxed `Bun.serve` could not bind `127.0.0.1:0`. An isolated reproduction confirmed the same `listen` failure. The complete suite then passed with approved localhost fixture binding: **1,567 passed, 0 failed, 203 files, 9,091 assertions**. No product change was made for this environment issue. A later full run including the banner guard and concurrent approval-status integration passed **1,575 tests, 0 failed, 205 files, 9,125 assertions**. The final Profile/Settings-drawer navigation corrections landed after that full run and have separate focused evidence below.

## Visual evidence and limits

The root task owns browser use and captures. Its first batch confirmed all five launcher desks and footer at 390×844; it identified the missing compact Profile label. After the bounded label/layout batch, root confirmed the 390×568 chat: visible model dropdown, Escape returning focus to the model trigger, document width 390 and height 568 without overflow, visible Profile footer and non-overlapping composer controls. These are authenticated local browser observations relayed by the root, not a screenshot inspection performed by this source agent.

Root-owned captures: [desktop tools before](visibility-before-desktop-tools.png), [mobile launcher before](visibility-before-mobile-launcher.png), [mobile model picker after](visibility-after-mobile-model-picker.png).

Additional root-owned inspection captures: [mobile Memory](visibility-after-mobile-memory.png), [mobile Wallet](visibility-after-mobile-wallet.png), [mobile Account](visibility-after-mobile-account.png), [tablet Account](visibility-after-tablet-account.png), [desktop dark chat](visibility-after-desktop-dark-chat.png). The Account captures preceded the final direct-footer/drawer-dismissal correction; they establish the account content was present, not that the corrected click path had already been rechecked.

The later [final mobile Profile](visibility-final-mobile-profile.png) capture records root's confirmation that the visible Profile footer opens `?panel=profile` with Sign out present. The hosted Account settings link correction has rendered regression and typecheck evidence above; its final browser click remains root-owned and is not inferred from this earlier capture.

Final desktop/tablet/dark confirmation and the screenshot-based finish verdict remain with the root review. This inventory does not certify full WCAG compliance, Safari/Firefox, every zoom level, a real mobile keyboard, hosted deployment or every provider/tool combination. Source constraints and fixture passes are not substitutes for those checks.

## Design review record

Impeccable context, audit, harden, polish and craft-floor guidance plus Uncodixfy were used to preserve the approved retro workbench and make only functional, named-control refinements. The automatic design hook was active and reported no deterministic issue on the sidebar and visibility-test changes; no duplicate manual detector pass was run. DESIGN.md and the model-select surface brief document the new control/layout contract. The hook reports that DESIGN.md is now newer than the existing design.json sidecar; that documentation-refresh warning is recorded rather than silently regenerating unrelated design artifacts. No raster assets were added. Final screenshot-based disposition must be recorded by the root after its bounded confirmation round.
