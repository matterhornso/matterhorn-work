# Recovery and account isolation — local acceptance

This is **local fixture evidence**, not hosted email delivery, real AWS backup,
or full platform disaster-recovery acceptance. Public launch remains blocked.

## Corrections reproduced and tested

### Failed restores exposed partial databases

The restore script wrote databases directly into the destination before checking
all digests and before enforcing the external erasure ledger. A deliberately
damaged second database caused a nonzero exit but left `auth/` populated.
Missing erasure-ledger failures likewise happened after writing the archive.

Restores now use a private sibling staging directory and publish it with one
rename only after validation and erasure reconciliation succeed. A failed
restore preserves an existing empty destination or leaves a new destination
absent. Nonempty targets and symlinks are refused. Temporary staging is removed.
No production data was restored or removed; test scratch data is disposable.

### Plain-file ledger copies lost committed WAL records

With a reader holding an older SQLite snapshot, two committed deletion records
remained in the external ledger's WAL. The old restore reconciled against those
records, then copied only the database file and reported success with **zero**
records in the restored ledger. The regression reproduced `0 !== 2`.

The restore now snapshots the ledger through SQLite, authenticates that snapshot,
and uses it for reconciliation and publication. The restored ledger retains both
records. This does not relax signatures, checkpoint continuity, retention or
deletion enforcement. Recovery should still run with writers quiesced and the
latest independently preserved ledger, not a stale ledger inside an archive.

## Verified locally

- Host recovery script: five SQLite database snapshots, exact digests, file
  permissions, successful empty-root restore, retained deletion records, missing
  ledger refusal, corrupt archive refusal without partial publication, existing
  data preservation, symlink refusal and staging cleanup.
- Eight Node test cases pass across verified S3 upload and workspace restore
  drill fixtures. The AWS SDK test talks only to localhost: PUT followed by
  checksum-enabled HEAD. This is not AWS delivery/restore evidence.
- Auth/store/outbox/backup-readiness suite: 47 tests, 640 assertions before the
  isolation extension. Verification/reset expiry and replay, session revocation,
  durable outbox retries, account deletion and freshness failure paths pass.
- Extended auth HTTP suite: 30 tests, 590 assertions. Added 12 cross-account
  route checks covering model catalog/default selection, selection writes/deletes,
  agent files, raw/content file reads and writes, MCP list, workspace and ledger
  exports. Denials must be `404 workspace_not_found`, not a generic missing route.
- Existing two-account note/memory tests include colliding record IDs, attempted
  mutations, restart persistence and signed-out session rejection.

Commands (repository root):

```sh
node scripts/matterhorn-host-recovery.test.mjs
node --test scripts/verified-host-backup-upload.test.mjs scripts/workspace-backup-restore-drill.test.mjs
bun test apps/server/src/auth.e2e.test.ts apps/server/src/auth-store-verification.test.ts apps/server/src/auth-email-outbox.test.ts apps/server/src/auth-store-maintenance.test.ts apps/server/src/host-backup-readiness.test.ts --timeout 15000
```

Local HTTP tests require permission to bind loopback ports. Do not substitute
production credentials, disable production verification, or reuse fixture accounts.

## Newly confirmed recovery coverage gap

`scripts/matterhorn-host-recovery.mjs` archives only:

- `auth/accounts.db`
- `usage/model-usage.db`
- `auth/rate-limits.db`
- `guarded-runtime/state.db`
- the selected OpenCode database

Notes are filesystem-backed under each workspace's `notes/` and index. Hosted
organization workspaces live under the Matterhorn data root's `web-workspaces/`.
Memory uses `MATTERHORN_WORK_MEMORY_ROOT` / `OPENWORK_MEMORY_ROOT`, otherwise
`~/.matterhorn-work/memory`. The production Dockerfile does not set that memory
override; actual deployed environment/volume coverage must be checked privately.
Workspace outputs and configuration also live outside the five database entries.
`listPortableFiles` limits configuration export to `.opencode/agents/`,
`.opencode/plugins/`, `.opencode/tools/`; the workspace restore drill is not a
replacement for recovery of notes, memory and outputs.

**Do not sign off full backups from a green database upload marker.** A supported,
tested filesystem/volume backup is needed alongside the database archive, or the
archive format must be extended with safe path and size limits, durable scope,
deletion reconciliation and end-to-end restore coverage. No infrastructure backup
configuration was inspected sufficiently to claim this gap is covered elsewhere.

## Operator acceptance still required

1. Confirm actual mounted paths for accounts, runtime, workspace files, memory,
   outputs, keys and the independent erasure ledger. Document exclusions.
2. Configure dedicated S3/KMS credentials and restricted backup storage; prove a
   real checksum/encryption/version-verified upload and freshness marker.
3. Restore a selected real backup version to an isolated empty environment, using
   the current external deletion ledger and approved secret-recovery procedure.
4. Verify known account/chat/usage records plus note, memory and output sentinels;
   confirm deleted records stay deleted. Start only the isolated restored backend.
5. Record revision, object version/checksum, backup age, recovery duration and
   redacted results. Do not attach raw archives, keys, tokens or user content.

Hosted account creation, inbox verification, password reset and two-account
browser acceptance remain separate release gates. A local fixture pass cannot
replace them.

## 22:27 continuation — tenant archive validation and truthful evidence

Confirmed a separate false-positive in `workspace-user-data-recovery.mjs`:
passing a regular file containing `not even gzip` produced exit 0, a successful
backup report, `ready: true`, every coverage bit true, and tenant verification
true. The tool encrypted arbitrary bytes without inspecting the supplied export.
Likewise, restore verified the envelope/file hash but only extracted the gzip
file; it did not import user data into the application. This must not count as
full application recovery.

Bounded correction:

- Validate gzip/JSON under a 256 MiB compressed/uncompressed ceiling, supported
  version, workspace identity, required data collections/context, manifest counts,
  data digest, and file path/encoding/size integrity. No input content is logged.
- Encrypt a private snapshot of the exact bytes validated, not a subsequently
  reread source. Restore revalidates the inner export before publishing staging.
- Reports now say `status: archive_verified`, `ready: false`,
  `applicationRestoreVerified: false`, and `tenantBoundaryVerified: false`.
  Structure and an embedded digest are not authentication/provenance proofs.
- Updated current operations documentation and corrected the old launch-room
  command which still suggested the now-prohibited shared OpenCode database.

Evidence: the malformed-input assertion failed before the fix. Recovery tests
now cover malformed gzip, missing collections, count/digest mismatch, unsafe
paths, invalid binary encoding, decompression limits and an authenticated legacy
container with invalid inner content (no restore target published). A generated
export from the real server builder passes the validator. Text/binary fixture
outputs survive the encryption/extraction round trip. Existing wrong-key,
existing-target, overlap/symlink and command-line secret protections pass.

The five server archive tests pass (20 assertions), the recovery contract passes,
and the full ten-stage local safety gate passes. These tests are fixture/local
evidence, not a live storage recovery or hosted readiness result.

Still required: supported filesystem/volume recovery, deletion reconciliation,
an actual isolated application import/restore, and owner-authenticated tenant
sentinel verification. Neither this packaging tool nor a green database marker
can supply that acceptance. No production secrets/configuration were changed.
