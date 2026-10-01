# Legacy soft-deleted memory cleanup

This is an offline operator procedure, not a public API or startup migration. It removes content left by older soft deletion. Normal deletion in the hardened code removes active record files, index entries and related suggestion/log copies; this procedure handles older tombstones hidden by normal API reads.

## Limits and prerequisites

- Run the tested release containing `scripts/matterhorn-legacy-memory-cleanup.ts`. Use the repository's pinned pnpm and Bun tooling.
- Identify the exact workspace ID, its filesystem root, the owning memory vault, and the server data directory. Never infer them from a URL alone. The default workspace-local vault is `<workspace-root>/.matterhorn-work/memory`; deployments configured for global memory use their explicitly configured shared vault instead.
- The canonical vault is filesystem JSON/Markdown on the machine running the server. For hosted users this is server storage, not their browser or personal computer. It is not application-encrypted by this tool.
- Stop **every writer process** using these files before the final preview and apply: server replicas, workers, local clients and background jobs. The in-process mutation queue does not lock other processes. `--writers-stopped` is an operator acknowledgement, not automatic verification.
- Verify a restricted, encrypted recovery backup and its restore procedure before production maintenance. Keep its retention/deletion policy explicit: a backup may still contain previously deleted data. Do not create an unmanaged plaintext copy as purported encrypted-backup evidence.
- The operator must have filesystem access to the exact workspace/vault and both audit locations. Do not run against production without maintenance authorization.

## Preview

Replace the example absolute paths and workspace ID with verified values. The command is read-only unless `--apply` is supplied. It does not initialize a vault, chmod files, create reports on disk, or print record titles/bodies.

```sh
pnpm exec bun scripts/matterhorn-legacy-memory-cleanup.ts \
  --vault-root /absolute/memory-vault \
  --workspace-root /absolute/workspace \
  --workspace-id ws_example \
  --server-data-dir /absolute/server-data
```

Review `recordIds`, `recordCount`, `auditEvents` and `fingerprint`. Treat IDs as operational metadata; do not publish the report unnecessarily. Only records with `deleted: true` and an unambiguous matching `workspace:` tag are selected. Active records, other workspaces and untagged records are not selected. Ambiguous ownership requires a separate investigation; do not relabel records merely to make cleanup pass.

The preview validates managed record paths and control-file integrity. It reads both the primary audit log (`<server-data>/audit/<workspace-id>.jsonl`) and the legacy workspace log (`<workspace>/.opencode/openwork/audit.jsonl`). Existing symlinked managed locations and malformed logs fail closed. The operator-selected root directories are trusted locations; this is not protection against a hostile OS administrator changing filesystem paths concurrently.

## Apply exactly the reviewed preview

Repeat the same command with all three additional arguments:

```text
--apply --writers-stopped --expect <fingerprint-from-the-final-preview>
```

Changes to vault content, candidate Markdown, audit logs or selected locations invalidate the fingerprint. Generate and review a new preview; never suppress the stale-plan check.

Apply scrubs matching memory capture/update audit summaries and metadata first, preserving event identity, actor, timestamp, action and target. It then deletes only the selected tombstones using the normal hard-deletion path, including related suggestion content and vault log copies. Unrelated security events remain. The output includes `deletedRecords` and a new `remaining` plan; verify `remaining.recordCount` is zero for this workspace.

Multi-file deletion is not a distributed transaction. A failure may leave partial progress. Keep writers stopped, resolve the cause and rerun preview; remaining index entries allow interrupted deletion to be retried, including when Markdown was already removed. The CLI does not print raw parse errors because they can contain private data.

## Verification and recovery

1. Confirm the deleted IDs are absent from the active index and their managed Markdown files are gone. Verify related suggestion copies and historical audit content have been removed without deleting security-event identity.
2. Verify a retained active record and another workspace's record are unchanged.
3. Resume the hardened release, then check normal memory save/read/delete and chat-context selection through normal authentication.
4. Keep a content-free operation receipt: code SHA, workspace ID, maintenance window, reviewed fingerprint, counts and result. Do not include deleted contents.
5. If restoration is required, restore only into an isolated environment first. Reconcile deletion requests before making restored data accessible. Restoring an old backup directly to live storage can resurrect forgotten content.

This operation does **not** erase previous chat messages, exported bundles, browser copies, provider retention, filesystem snapshots or backups. Each has its own lifecycle. Zero selected tombstones proves only that no eligible tagged tombstones remain in this one vault/workspace—not that every historical copy everywhere has been erased.
