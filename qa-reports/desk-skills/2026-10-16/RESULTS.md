# Desk skills preload verification

Historical feature-only record. The [combined release candidate verification](../../launch-candidate/2026-10-16/RESULTS.md) supersedes the preview, live-response and final-gate limitations below; it includes subsequent review corrections and all five local real responses. Keep the original evidence scope below intact.

## Candidate and scope

Local working-tree changes on `codex/post1036-five-desk-qa-2026-10-15`, based on merged PR #1036 commit `c5f326b2a38ecc49817adcce5922ba5ad95991eb`. This report covers the new skill guidance, catalog, authenticated skill endpoints and view-only UI. It does not certify the pre-existing uncommitted chat QA fixes or hosted release.

Seven original Matterhorn guidance documents are available through a release-owned virtual catalog. Each managed core desk receives common safety guidance plus its relevant workflow guidance, not all seven documents. Thirteen connector recommendations distinguish five existing adapter groups, seven optional connections and one future adapter group. No optional adapter, OAuth account, key, wallet permission, native slash command or third-party package was installed by this change.

Existing custom skill files retain precedence in the displayed list. They remain untrusted workspace context and cannot replace canonical public guidance. Listing or viewing built-ins writes no workspace files. Existing managed-agent bootstrap still updates its release-owned agent templates; custom generic-agent instructions are preserved.

The user's authenticated CUDOS preview was not restarted, modified or used for inference. Existing chats and data were not migrated or deleted. No push, merge, deployment, production configuration, provider call or real-chain transaction was performed.

## Automated verification

| Check | Result |
| --- | --- |
| `bun test apps/app/tests` | 1,382 passed, zero failed, 8,396 assertions across 193 files |
| `bun test apps/app/tests/builtin-skills-view.test.tsx apps/app/tests/extensions-responsive-contract.test.ts apps/server/src/builtin-workspace-skills.test.ts` | 11 passed, zero failed, 127 assertions; overlaps the frontend suite |
| Final backend suite: built-in catalog/routes/content, workspace import/init, skills, managed MCP, agent privacy, session read model, auth, token budget and provider privacy | 263 passed, zero failed, 2,534 assertions across 12 files, including export/import preservation |
| `pnpm --dir apps/app typecheck` | Passed |
| `pnpm --dir apps/server exec tsc -p tsconfig.json --noEmit` | Passed |
| `pnpm --dir apps/app build:web` | Passed; existing circular-chunk, large-chunk, annotation and Node deprecation warnings remain |
| `pnpm --dir apps/server build` | Passed on the final export/import correction |
| `node scripts/matterhorn-platform-safety-gate.mjs --only money.path.security,desk.depth` | Both selected stages passed; this is not a full safety-gate run |
| `git diff --check` | Passed |

The restricted frontend run first passed 1,379 tests and failed three because their disposable HTTP servers could not bind loopback ports. The complete rerun with loopback permission passed all 1,382. Two nullable test assertions and one malformed mutation-test fixture were corrected before backend checks passed; no test was skipped to obtain a pass.

Security coverage includes exact built-in identifier matching, malformed/traversal identifiers, no skill-directory writes, immutable virtual updates/deletes, custom-file preservation, authenticated reads, denied cross-workspace access, credential-free exports, private-context consent, per-user isolation, token budgets and unchanged deny-by-default managed tool profiles. Public canonical prompt matching and generated/runtime prompt equality are tested. Built-ins are non-invocable documents, not unguarded skill execution.

The final backend command used a clean environment and disposable `OPENWORK_DATA_DIR`/`MATTERHORN_WORK_TOKEN_STORE`, with `bun --no-env-file test` over: `builtin-skill-catalog`, `builtin-skill-routes.e2e`, `builtin-workspace-skills`, `workspace-import-preview`, `workspace-init`, `skills`, `managed-opencode-mcp`, `agent-privacy`, `session-read-model.e2e`, `auth.e2e`, `agent-token-budget` and `provider-privacy` test files under `apps/server/src`, with `--timeout 15000`. The export regression now proves that release-owned built-ins are excluded, automatically available at a fresh destination, and ordinary custom copies survive explicit preview/fingerprint/host-approved imports without changing canonical guidance.

Independent scoped finish review found no remaining actionable blocker. Its final focused run passed 30 tests and 376 assertions, overlapping the primary suite. It checked exact virtual ID dispatch, read-only UI, optional connection claims and the authorized import path. This is not a full-platform security certification.

Local raw logs: `/private/tmp/matterhorn-skill-final.WCsACJ/tests.log`, `/private/tmp/matterhorn-desk-skills-frontend-tests-final.log`, `/private/tmp/matterhorn-desk-skills-app-build-final.log`, `/private/tmp/matterhorn-desk-skills-server-build-final.log`, `/private/tmp/matterhorn-desk-skills-safety-final.log`.

## Browser fixture

Command: `bun apps/app/scripts/builtin-skills-fixture.ts`.

The fixture bundles the production Skills component and release catalog, uses synthetic state, rejects mutations and blocks outbound connections. It uses a separate temporary loopback port; it does not use the user's account or preview runtime.

Two bounded screenshot rounds:

1. 1,280px light mode: seven built-in entries, View guidance controls, no built-in Edit/Remove/Share actions, no page overflow, readable guidance opened successfully. The initial screenshot precedes a small copy correction clarifying that built-ins are available without desktop skill-management access.
2. 390×844 dark mode on the final fixture: search narrows to the connector catalog; Enter opens View guidance; the textarea is labelled and `readOnly: true`; no Save button is present; catalog text includes OAuth requirements; document width equals viewport width with no overflow. Escape initiates dialog dismissal. Browser viewport overrides were reset afterward.

Evidence: [desktop light](skills-light.png), [mobile dark guidance](skills-mobile-dark.png). Both temporary fixture servers were stopped and the test browser tab closed. This is local synthetic UI verification, not normal-user hosted or real-provider acceptance.

The Impeccable/Uncodixfy guidance kept the restored component design and limited UI edits to truthful labels, read-only controls and capability copy. The detector reported existing font-ramp advisories; no new font size or layout system was introduced. The design documentation sidecar is stale and was not regenerated as part of this feature.

## Release limits and next checks

- Optional connections are researched recommendations, not implemented or connected integrations. Each still needs the approved credential flow, least-privilege tool set, isolation/revocation tests, provider policy review and successful authorized live read.
- The user's running preview has not picked up this code. A separately approved candidate refresh should preserve its data directory and reload release-owned managed agents before real-response acceptance.
- Five-desk live responses, Stop/Retry and model selection were not rerun for the new guidance. Prior QA evidence must not be relabelled as acceptance of these changed prompts. This turn does not close earlier live QA gaps or authorize a higher test allowance.
- Safari/Firefox, full screen-reader/contrast/200% zoom coverage and full-platform safety gates were not rerun for this candidate.
- Workspace export/import preservation passed locally. Keep these regressions in release CI; virtual guidance must not become user-editable exported files.
- PR review, CI, deployment and hosted acceptance remain separate actions. Nothing in the catalog proves that a connector is configured or available in a deployment.

See the [research and rollout handoff](../../../docs/architecture/desk-skills-connectors-2026-10-16.md) for official sources, connector scope and required operator actions.
