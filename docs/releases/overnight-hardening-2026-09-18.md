# Overnight hardening release — 18 September 2026

Release base: `b055ceeb034d357d2ce627fb4bfe4a2f7060639f` (#1019).
User approved the accounting fix, PR, merge and deployment. This is a
paused-signup hardening release, **not public-beta launch approval**.

## Changes

- Preserve the current chat after a background refresh failure (selective
  OpenWork recovery port; see upstream compatibility record).
- Correct missing-model privacy copy; omit unrelated desk selection for
  Memory/MCP tasks; restore tablet settings navigation.
- Retain the selected note when saving fails and refresh Memory suggestion
  counts after successful note suggestions.
- Redact credential-shaped task-log text, including loaded legacy data, and
  reject excessively deep/wide or cyclic payloads. Legacy disk files are not
  rewritten; known-pattern filtering is not a guarantee against every secret.
- Reconcile all completed same-model tool-loop steps once, not just the first.
- Remove the 15-minute automatic cancellation of unresolved usage. Holds
  remain durable and count across daily/monthly rollover until reconciliation
  or explicit cancellation. Authoritative usage belongs to the request's
  creation period. Reconciliation is serialized with an immediate SQLite
  transaction. No schema migration or monetary billing was introduced.

## Accounting boundaries

The fix prevents time-based loss of pending records and accepts late usage
after restart. Confirmed cancellations remain idempotent; cancellation cannot
erase a completed record. Old already-cancelled records are not repaired.
Missing responses must not be treated as proof that no provider work happened.
Request admission is not a per-token provider-spend cutoff. Cross-model,
subagent and compaction accounting are not certified by these tests. Stuck
holds require investigation rather than blind timer-based release.

## Verification

- Full frontend: 1,159 pass / 0 fail, 7,463 assertions.
- Full backend: 1,676 pass / 0 fail, 10,959 assertions.
- Platform safety gate: PASS.
- Serial app/server typechecks, web build, bundle budget and diff check: PASS.
  Existing large lazy-chunk warnings remain; this is not a performance signoff.
- Accounting regressions cover late usage, exact-once reconciliation, two
  subjects, restart, month rollover, tool-loop steps and explicit cancellation.
- Prior isolated runtime integration used checksum-pinned OpenCode 1.18.31
  against a deterministic loopback stub: permitted read, denied tool,
  2,500-token two-step response, restart persistence and no duplicate charge.
  This is not live model acceptance.
- Sampled browser checks covered desk entry, Memory, Notes and settings at
  390/768/1024px. Mac lock prevented later browser confirmation and captures.
  Note-failure/badge tests execute the production callbacks, not mounted React.
  No screenshot/video is attached; reproduce with the steps below.

Commands from repository root (build/typecheck gates run serially):

```sh
pnpm --dir apps/app test
pnpm --dir apps/server test
pnpm test:matterhorn-platform-safety
pnpm --dir apps/app typecheck
pnpm --dir apps/server typecheck
pnpm --dir apps/app build:web
pnpm gate:task-first-bundle-budget
git diff --check
```

UI reproduction: use an isolated workspace; open Models at 768px and verify
navigation remains available; create a Memory task and check there is no
unrelated crypto-desk chooser; with no provider connected verify the privacy
notice does not name a processor; simulate a failed note save and choose Back
(editor must remain); suggest Memory from a note and verify the pending count
refreshes. Do not connect a wallet or send private content for these checks.

Impeccable/Uncodixfy review preserved incumbent components, focus controls and
tokens. No new visual world, decorative content or broad redesign was added.
Actual screen-reader/native-browser/performance acceptance remains separate.

## Release gates retained

Deploy an exact clean merge SHA to Railway, then Vercel. Verify both commit
identities before promoting the canonical frontend and run the strict hosted
probe with signup paused and guarded mode off. Keep usage enforcement hard.
No credentials, signup settings, backup policies or privacy controls changed.

Actual SES verification/reset delivery, S3/KMS restore, two hosted-account
isolation, real responses on all five desks, real-wallet acceptance and
remaining native-browser/accessibility/performance checks are still required
before public registration. Disabled integrations and prepare-only actions
must remain truthfully labeled.
