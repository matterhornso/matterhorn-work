# OpenCode request identity experiment

This source patch carries the current user-message ID through the early message,
compaction and system hooks used by Matterhorn's provider authorization. It is a
local compatibility experiment, not a published runtime release or permission to
deploy. The accompanying server and plugin changes require these hook fields and
fail closed with the unpatched runtime. Do not deploy them independently.

## Source and artifact provenance

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

## Requirements before deployment

Choose a maintained patched distribution or an upstream release carrying the
same verified identity contract. Build and verify all supported deployment
platforms, include the intended model catalog, record artifact provenance and
checksums, and update installers plus compatibility/readiness checks together.
Repeat native ordinary-chat, tools, cancellation, restart and compaction tests
against those exact artifacts. The Darwin-only fixture build is not that release.

The local native fixture currently passes 24 cases: nine compaction cases and
fifteen ordinary-chat, file-tool, retry, replacement, Stop and restart cases. Cancellation
now covers both early authorization boundaries, a received provider request,
a second provider call after a completed tool step, and an observed text delta
before final usage. Completion replay covers the existing gateway and a backend
restart preserving disposable data, while the native engine remains running.
Mid-request backend restart now covers the message hook, system hook and an
already received provider request. Denied pre-provider requests become terminal
errors and retain unknown-usage holds; the received request completes once with
473 tokens and no hold. The native engine stays running in all three cases.
See the [current QA evidence](../../qa-reports/launch/2026-10-05/RESULTS.md#in-flight-restart-and-receipt-persistence).
Native engine restart, completion notification recovery during gateway downtime
and concurrent replicas remain unverified. The server's separate authenticated
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
