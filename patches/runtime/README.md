# OpenCode runtime compatibility experiments

This source patch carries the current user-message ID through the early message,
compaction and system hooks used by Matterhorn's provider authorization. It is a
local compatibility experiment, not a published runtime release or permission to
deploy. The accompanying server and plugin changes require these hook fields and
fail closed with the unpatched runtime. Do not deploy them independently.

## Source and artifact provenance

The list below identifies the original `.2` identity artifact. The `.3` candidate
adds the separate lock-recovery patch and is identified in the next section.

- Upstream repository: `https://github.com/anomalyco/opencode`.
- Base tag: `v1.18.31`; exact commit: `014614d35b397775e5d397a490fc72368c894ec2`.
- Patch: `opencode-1.18.31-request-identity.patch`.
- Patch SHA-256: `fe5ea43bb2fc4aba455fa85a8026426951e6caf27e993a464b50f50ef7c408eb`.
- Experimental version: `1.18.31-matterhorn-identity.2`.
- Build toolchain: Bun `1.3.14`, isolated `@oven/bun-darwin-aarch64@1.3.14` package.
- Locally built Darwin arm64 binary SHA-256:
  `cfb690d5b7087a08ed0c0b16b01e94de20c4b748f80f6b344ab28aeff2c4d2b3`.
- Local source: `/private/tmp/matterhorn-runtime-identity.4gR56K/source`.
- Local binary: `packages/opencode/dist/opencode-darwin-arm64/bin/opencode` inside that source checkout.

Four upstream implementation files and one prompt test file change. Compaction supplies `input.parentID`; ordinary
messages supply `lastUser.id`; provider-system preparation supplies `input.user.id`.
The plugin interface exposes these fields without adding an HTTP API or a
database migration. Never derive the current compaction ID from the last retained
history message: native compaction removes its current parent from that history.

Version `.2` also finalizes an assistant error when a preparation hook fails
before `processor.process()`. The error still propagates; no provider or tool is
retried. Already completed messages and interruption handling remain unchanged.
The upstream prompt suite passes 59 tests with one existing skip; its new hook
rejection test verifies terminal history, idle session state and zero provider
calls. This does not provide crash recovery for a stopped native engine.

## Local lock recovery candidate

Apply the original identity patch and `opencode-1.18.31-lock-recovery.patch` to
the same exact upstream base. The latter includes the fresh-lock regression;
do **not** also apply `opencode-1.18.31-fresh-lock-regression.patch`. That older
file remains a standalone negative reproduction for the uncorrected source.

- Recovery patch SHA-256: `676994e9a0cecc7dc0d46f9ccccfeab95ecdc78bf7fe048004595432f3b1f248`.
- Candidate version: `1.18.31-matterhorn-identity.3`.
- Final Darwin arm64 binary: `/private/tmp/matterhorn-runtime-identity.4gR56K/lock-runtime-final-Dg7mOK/candidate-dist/opencode-darwin-arm64/bin/opencode`.
- Binary SHA-256: `7eacfd199c41bab87cf5bc1c412b73ca3ab0d9eaaec78fc5ce02203400ce029e`.
- Build toolchain/flags and empty model fixture: same as `.2`, with the explicit version changed to `.3`; no release-upload variable is set. The `.2` binary remains at its original path and checksum.

The patch records a kernel boot identity and, on Linux, the PID namespace. Only
a comparable PID proven absent enables early reclaim. Live owners, reused PIDs
and permission errors preserve exclusion. Unknown scopes and legacy metadata
retain the prior lease behavior. Windows has no early-recovery scope here;
Linux namespace behavior needs execution on an actual Linux/container host.
Partially initialized locks and crashed breakers may still wait for expiry.
This does not migrate old data, bypass authorization or replay model/tool work.

The final local candidate passes all 30 native cases and six repeated
chat-crash cases. The lock suite passes 96 repeated executions; final local
install/lock and plugin/MCP-auth groups pass 36 and 28 cases. See
[commands, evidence and limits](../../qa-reports/launch/2026-10-05/RESULTS.md#local-orphan-lock-recovery-candidate).
Use the isolated verifier below with this exact candidate path and expected
version `.3`. It remains a synthetic-provider experiment, not a production
artifact or hosted acceptance result. Release pins still refer to stock 1.18.31.

## Reproducing the isolated experiment

Use a disposable checkout of the exact base commit. Verify the patch checksum,
run `git apply --check`, then apply it. In the existing patched experiment,
`git apply --reverse --check` succeeds. Install the frozen upstream dependencies
with lifecycle scripts disabled; do not use the user's live runtime or its data.

The dependency command used from the source root was:

```sh
bun install --frozen-lockfile --ignore-scripts --filter './packages/opencode' --cache-dir /private/tmp/matterhorn-runtime-identity.4gR56K/bun-cache
```

An initial install had one native lint-package extraction failure; the explicit
package-filter retry completed successfully without changing the lockfile.
Run `bun typecheck` from `packages/opencode`, not the repository root. The patched
package typecheck and native build both completed with exit zero.

The experiment built from `packages/opencode` with Bun 1.3.14, an empty inherited
environment, isolated XDG directories, and these explicit build settings:

```sh
env OPENCODE_CHANNEL=matterhorn-identity-experiment \
  OPENCODE_VERSION=1.18.31-matterhorn-identity.2 \
  MODELS_DEV_API_JSON=/private/tmp/matterhorn-runtime-identity.4gR56K/models.fixture.json \
  bun run script/build.ts --single --skip-install --skip-embed-web-ui
```

These are build settings, not production environment recommendations. The
model snapshot contains `{}` because the acceptance test supplies its own local
synthetic provider. No release upload variable was set. No installed runtime,
existing preview, workspace, chat, credential or production setting was changed.

From the Matterhorn checkout, native acceptance requires both explicit overrides:

```sh
MATTERHORN_TEST_OPENCODE_BIN=/private/tmp/matterhorn-runtime-identity.4gR56K/source/packages/opencode/dist/opencode-darwin-arm64/bin/opencode \
MATTERHORN_TEST_OPENCODE_VERSION=1.18.31-matterhorn-identity.2 \
bun test apps/server/src/opencode-compaction-contract.e2e.test.ts
```

The version override belongs only to this opt-in test harness. Repository runtime
pins, production download URLs and checksums still refer to official OpenCode
1.18.31 and have not been replaced with this experimental build.

## Native release verification

Use the isolated verifier for an exact locally available candidate:

```sh
node scripts/verify-opencode-native-contract.mjs \
  --binary /absolute/path/to/candidate/opencode \
  --expected-version 1.18.31-matterhorn-identity.2
```

The example version identifies this experiment, not a production recommendation.
The verifier requires Bun and the installed Matterhorn dependencies plus the built
Crypto App SDK. It runs the complete native suite against disposable loopback
providers, with private temporary HOME/XDG/config/data paths and no inherited
provider credentials, runtime configuration or Node/Bun option overrides. It
requires an exact version and at least 30 passing JUnit cases with no skips or
failures. The binary checksum must match before and after verification. JSON
output reports the binary SHA-256 and explicitly marks hosted acceptance false.
An overall ten-minute timeout and fail-fast suite limit keep failures bounded.

The ordinary compatibility gate now invokes this verifier when a binary is on
PATH. Without a binary it reports metadata checks only, not native compatibility;
`MATTERHORN_REQUIRE_OPENCODE_BINARY=1` makes that absence fail. CI requires the
binary and runs after dependency installation, Bun setup and Crypto App SDK
build on Linux and macOS. A healthy endpoint or matching version no longer
suffices. **The unchanged stock runtime pin still lacks the required identity
contract, so release CI must remain blocked until a maintained compatible
distribution and coordinated pins are supplied.** Do not waive the native test,
substitute the fixture binary as a release artifact, or call a metadata-only
local safety pass a production-runtime pass.

## Requirements before deployment

Choose a maintained patched distribution or an upstream release carrying the
same verified identity contract. Build and verify all supported deployment
platforms, include the intended model catalog, record artifact provenance and
checksums, and update installers plus compatibility/readiness checks together.
Repeat native ordinary-chat, tools, cancellation, restart and compaction tests
against those exact artifacts. The Darwin-only fixture build is not that release.

The separate `opencode-1.18.31-fresh-lock-regression.patch` adds one upstream
EffectFlock crash test that fails on the uncorrected base without backdating
lock timestamps. It is not included in `.2` and contains no recovery implementation.
Apply it to the same source base, then run `bun test test/util/effect-flock.test.ts`
from `packages/core` on that uncorrected source; the result is 11 passes and one failure. Native
diagnostics found two fresh dependency-install locks owned by the killed engine
while global health remained responsive and workspace reads stalled. See
[fresh lock recovery evidence and safety requirements](../../qa-reports/launch/2026-10-05/RESULTS.md#fresh-lock-recovery-after-engine-termination).
Do not delete locks or shorten lease safety checks merely to pass the test.

The native fixture contains **30 cases**. An isolated `.2` repeat records
29 passes and one intermittent timeout reading
history after abrupt engine termination during a provider request. Targeted
repeats reproduce it, including a failed fresh-connection read. The `.3` candidate
above corrects the demonstrated fresh-owner lock case and passes the final full
matrix and six targeted repeats; lease fallback and platform limits remain.
See [candidate verification](../../qa-reports/launch/2026-10-05/RESULTS.md#local-orphan-lock-recovery-candidate).
Do not apply `.3` results to the unchanged `.2` binary. The original
24 cases comprise nine compaction cases and fifteen ordinary-chat, file-tool,
retry, replacement, Stop and backend-restart cases. Cancellation
now covers both early authorization boundaries, a received provider request,
a second provider call after a completed tool step, and an observed text delta
before final usage. Completion replay covers the existing gateway and a backend
restart preserving disposable data, while the native engine remains running.
Mid-request backend restart now covers the message hook, system hook and an
already received provider request. Denied pre-provider requests become terminal
errors and retain unknown-usage holds; the received request completes once with
473 tokens and no hold. The native engine stays running in all three cases.
See the [current QA evidence](../../qa-reports/launch/2026-10-05/RESULTS.md#in-flight-restart-and-receipt-persistence).
New native-engine controls verify orderly restart with fresh chat, explicit
Stop/retry after a provider-side interruption, and a lost acknowledgement after
Matterhorn commits completion. The former lost-delivery failure now passes with
the server's sealed run/parent/model binding and native-history recovery, without
repeating model/tool work. Two additional cases cover recovery on backend startup
without browser/billing reads and cumulative usage after a two-step tool request.
Concurrent production replicas, extended downtime, deleted history and delivery
beyond binding retention remain unverified or unavailable. See the
[latest native evidence](../../qa-reports/launch/2026-10-05/RESULTS.md#native-completion-recovery).
The server's separate authenticated
append-journal correction now passes the two receipt-index recovery regressions;
see [receipt recovery evidence](../../qa-reports/launch/2026-10-05/RESULTS.md#authenticated-receipt-append-recovery).
This runtime patch alone does not provide receipt recovery or certify production
artifacts or provider invoice accuracy.

The reservation correction preserves a hold after any provider-system release,
including a lost acknowledgement or later HTTP 400. It cancels only after this
same gateway process verifies the exact run/workspace/session/message and
synchronously revokes a run that never released provider authorization. Evidence
is content-free and expires with the run authority. A restart, missing evidence,
different scope or previous release cannot establish a refund. This does not
repair historical reservations or prove provider invoice reconciliation.
