# Shared web regression evidence

Validated on 6 October 2026 Singapore time against the dirty usability checkout based on `a5dba9649975f33e6eda614cdf88a81767e20a66`. The complete frontend fixture suite, typecheck, isolated web bundle, and QA safety tests passed. These checks do not establish that every desk works in a hosted deployment.

## Final validation

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Complete frontend suite | 1,552 passed, 0 failed; 202 files; 8,968 assertions | Unit, source-contract, rendered-component, and localhost HTTP fixtures |
| App typecheck | Passed | Includes crypto SDK and shared UI dependency builds |
| Production-mode web bundle | Passed in 13.43 seconds | Fresh temporary output; no deployment or preview replacement |
| Launcher and QA script safety | 18 passed, 0 failed | 6 launcher, 4 read-only API, 8 approval-review tests; synthetic or mocked requests |
| Native workspace configuration | 6 passed, 0 failed | Temporary filesystem fixtures and handler contract |
| Account isolation script syntax | Passed | Syntax check only; live result described below |

The bundle still reports chunks larger than 500 kB. This is a non-blocking build warning, not a performance acceptance result. Output was written to `/tmp/matterhorn-final-web-build.Kblvwh`; the existing previews were not restarted or replaced.

The first frontend run passed 1,549 tests but could not start the three HTTP-client fixtures because sandbox loopback binding was blocked. The complete suite passed after approved loopback escalation. No product change was needed.

Commands from the repository root:

```sh
env -i PATH="$PATH" bun --no-env-file test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
env -i PATH="$PATH" node --test qa-reports/launch/2026-10-05/provider-functional/launch.test.mjs qa-reports/web-desks/2026-10-06/readonly-api-smoke.test.mjs qa-reports/web-desks/2026-10-06/review-approval.test.mjs
env -i PATH="$PATH" node --test apps/desktop/electron/workspace-config.test.mjs
env -i PATH="$PATH" node --check qa-reports/web-desks/2026-10-06/account-isolation.mjs
```

Isolated web build command, run from `apps/app` after typecheck built its dependencies:

```sh
qa_build_output=$(mktemp -d /tmp/matterhorn-final-web-build.XXXXXX)
env -i PATH="$PATH" QA_WEB_BUILD_OUTPUT="$qa_build_output" VITE_MATTERHORN_DEPLOYMENT=web VITE_MATTERHORN_PUBLIC_BETA=1 VITE_MATTERHORN_REQUIRE_SIGNIN=true VITE_MATTERHORN_CLOUD_ENABLED=true pnpm exec node --input-type=module -e 'import { build } from "vite"; await build({ envDir: false, build: { outDir: process.env.QA_WEB_BUILD_OUTPUT, emptyOutDir: true } }); console.log(JSON.stringify({ isolatedBuildOutput: process.env.QA_WEB_BUILD_OUTPUT }));'
```

This checks the production web application bundle with explicit web settings and disabled automatic environment-file loading. It does not run the public-guide generator or deploy a release.

## Earlier shared feature fixtures

The earlier targeted pass completed 501 tests across 50 files with 3,194 assertions: 267 frontend shared-feature tests, 98 shared server tests, 45 integration and rendered-account tests, 23 authentication-isolation tests, and 68 Jev and cancellation gateway tests. Frontend coverage overlaps the final complete suite; these totals must not be added as unique coverage.

That pass covered Notes save races and CRUD; reviewed Memory capture, search, export and deletion; encrypted files and path boundaries; integration connection lifecycle; account and workspace isolation; wallet consent and recovery; Jev disabled or missing-configuration zero-egress behavior; cancellation; and exact usage accounting. Provider, OAuth, and wallet behavior in these tests used fixtures rather than live credentials or signing.

An initial wrapper incorrectly shared `MATTERHORN_WORK_DATA_DIR` across otherwise isolated session fixtures, producing 31 false failures. Both representative cases passed alone, and all 68 selected cases passed after the wrapper stopped overriding per-test storage. This was a test invocation error, not a product regression.

## Local live account isolation

The [sanitized account isolation result](account-isolation-results.json), recorded at `2026-10-05T22:52:40.758Z`, contains 19 passing observations against the isolated local runtime. A second normal account signed up through the public endpoint, completed the local console-email verification fixture, and received a separate workspace. Its Notes, workspace Memory, and account Memory lists were empty.

Ten foreign-scope probes returned HTTP 404, covering workspace configuration, Notes and the exact first-account note, sessions and an exact snapshot, Memory, files, integrations, usage, and a first-account note ID transplanted into the second workspace route. The first account's UI-created note remained readable and unchanged afterward.

The [account isolation script](account-isolation.mjs) used no operator credentials or authentication bypass. Only necessary second-account signup and verification requests were writes; subsequent probes were GET requests. Its private second-account credentials stayed in the temporary runtime directory with mode `0600`, outside this evidence directory. It sent no model requests and performed no wallet actions.

## Acceptance limits

Fixture passes establish deterministic behavior in the checked source. The two-account result establishes normal-account isolation in the specified local runtime, not production isolation or real inbox delivery. This section provides no hosted deployment, live inference, connector OAuth, wallet-signing, transaction, or end-to-end browser acceptance claim. Those require their own evidence.

The initial validation pass above changed no product source, made no commits or pushes, and did not change existing preview configuration or lifecycle. The later bounded Sui addition below is a separately authorized implementation.

## Bounded Sui object read follow-up

The initial real chat correctly reported that object inspection was unavailable despite the desk's advertised capability. Added `matterhorn_sui_get_object`, the `sui_object_read` action, and authenticated GET `/api/sui/object/:objectId`. The installed Mysten 2.20.1 SDK's `core.getObjects` requests exactly one object's metadata from fixed mainnet/testnet endpoints; no content/BCS/JSON/display include flags are used. Transport abort/timeout is eight seconds and redirects are rejected. Public object IDs are validated before dispatch. Output is explicitly projected to owner, structured type identity, generic-argument count, version, digest, package flag, fixed source and fetched-at time. No object contents, bytecode, credentials, signing, or submission are returned or enabled.

The existing secret scanner and capability controls are unchanged. Object metadata reads are allowlisted in read-only execution modes; transfer preparation and unknown submission tools remain denied. The existing Inspect objects copy now identifies the read action, and a recommended starter asks for a public object ID and mainnet/testnet network rather than a wallet address. This is a small input/catalog wiring correction with no layout changes.

Final focused fixture commands from the repository root:

```sh
env -u MATTERHORN_WORK_DATA_DIR bun --no-env-file test apps/server/src/tools/sui.test.ts apps/server/src/managed-opencode-mcp.test.ts apps/server/src/agent-tool-routing.test.ts apps/server/src/agent-capability.test.ts apps/server/src/agent-token-budget.test.ts apps/app/tests/sui-desk-contract.test.ts apps/app/tests/desk-task-inputs.test.ts apps/app/tests/desk-task-starters.test.ts apps/app/tests/public-beta-desk-surface.test.ts --timeout 15000
env -u MATTERHORN_WORK_DATA_DIR bun --no-env-file test apps/server/src/backend-control-plane.e2e.test.ts --test-name-pattern 'Sui public read routes|Sui object route' --timeout 15000
env -u MATTERHORN_WORK_DATA_DIR bun --no-env-file test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'enforces deny-by-default tools for Discuss and Plan prompts|enforces execution mode on the stable prompt route and audits changes' --timeout 15000
pnpm --dir apps/server typecheck
pnpm --dir apps/app typecheck
git diff --check
```

The final focused set passed **119 tests across 9 files / 830 assertions**. Route fixtures passed **2 tests / 16 assertions**, including unauthenticated 401, metadata 200, invalid ID/network 400 and not-found 404. Exact Discuss/Plan permission inventory fixtures passed **2 tests / 25 assertions**, retaining deny-by-default and transfer-denial checks. Server and app typechecks passed, and whitespace validation passed. The schema catalog initially exceeded its unchanged 11,000-character ceiling after adding the tool; redundant descriptions were shortened to **10,994 characters / 21 tools**, without changing input validation, required fields, access classes, or the ceiling. These are mocked/local fixture results, not live-chain or hosted acceptance. The root task separately owns live object validation on the fresh local runtime.
