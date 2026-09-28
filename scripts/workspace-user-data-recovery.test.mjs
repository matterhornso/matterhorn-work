#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, createCipheriv, scryptSync } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { MAX_TENANT_ARCHIVE_BYTES, validateTenantArchive } from "./lib/validate-tenant-archive.mjs";

const script = "scripts/workspace-user-data-recovery.mjs";
const root = mkdtempSync(join(tmpdir(), "matterhorn-user-data-recovery-test-"));
const workspace = join(root, "source");
const restoreTarget = join(root, "restored");
const wrongKeyTarget = join(root, "wrong-key");
const nestedTarget = join(workspace, "unsafe-restore");
const symlinkedWorkspaceParent = join(root, "linked-workspace");
const archive = join(root, "backup.mhdb");
const backupReport = join(root, "backup-report.json");
const restoreReport = join(root, "restore-report.json");
const tenantArchive = join(root, "matterhorn-workspace-ws_test.json.gz");
const passphrase = "test-only-recovery-passphrase-32-characters";

function write(relativePath, content) {
  const target = join(workspace, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, content);
}

function run(args, envPassphrase = passphrase) {
  return new Promise((resolve) => {
    const child = spawn("node", [script, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, MATTERHORN_BACKUP_PASSPHRASE: envPassphrase },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const data = {
  configuration: {}, mission: null, activity: { items: [] },
  notes: [{ id: "note_test", title: "Launch" }],
  chats: [{ session: { id: "ses_test" }, messages: [{ text: "Recovery chat" }], todos: [] }],
  memory: { records: [{ id: "mem_test" }], suggestions: [] },
  receipts: [{ runId: "run_test", recordHash: "a".repeat(64) }],
  files: [{ path: "notes/launch.md", size: 7, encoding: "utf8", content: "# Note\n" },
    { path: "outputs/binary.bin", size: 2, encoding: "base64", content: "AP8=" }],
};

function exportArchive(payload = structuredClone(data)) {
  return {
    version: "matterhorn.workspace-data-archive.v1",
    workspace: { id: "ws_test", name: "Tenant test" }, data: payload,
    manifest: {
      counts: { notes: 1, memoryRecords: 1, memorySuggestions: 0, chats: 1, messages: 1, receipts: 1, files: 2 },
      integrity: { algorithm: "sha256", dataSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") },
    },
  };
}

function compressed(payload) { return gzipSync(Buffer.from(JSON.stringify(payload))); }

// Build a correctly authenticated legacy container with an invalid inner
// archive: envelope verification alone must not publish its restore target.
function legacyContainer(payload) {
  const manifest = Buffer.from(JSON.stringify({
    version: "matterhorn.tenant-data-backup.v2",
    coverage: { notes: true, memory: true, outputs: true, taskAndEvidenceState: true, chatHistory: true, receipts: true },
    files: [{ path: "tenant/workspace-data-archive.json.gz", kind: "tenant_workspace_archive",
      size: payload.length, sha256: createHash("sha256").update(payload).digest("hex") }],
  }));
  const length = Buffer.alloc(4); length.writeUInt32BE(manifest.length);
  const salt = Buffer.alloc(16, 1); const iv = Buffer.alloc(12, 2);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
  return Buffer.concat([Buffer.from("MHDBK01\n"), salt, iv,
    cipher.update(Buffer.concat([length, manifest, payload])), cipher.final(), cipher.getAuthTag()]);
}

try {
  mkdirSync(workspace, { recursive: true });
  const malformedArchive = join(root, "not-a-workspace.gz");
  writeFileSync(malformedArchive, "not even gzip");
  const malformedBackup = await run([
    "--workspace-root", workspace, "--tenant-archive", malformedArchive,
    "--output", join(root, "malformed.mhdb"), "--json",
  ]);
  assert.equal(malformedBackup.code, 1, "Malformed input must not produce a ready recovery report");

  write("notes/launch.md", "# Launch note\nprivate launch plan\n");
  write("outputs/report.txt", "customer output\n");
  write(".matterhorn-work/memory/memory-records.json", '{"records":[{"title":"remembered"}]}\n');
  write(".matterhorn-work/task-logs/ws_test/run.jsonl", '{"type":"completed"}\n');
  write(".matterhorn-work/outputs/images/image.metadata.json", '{"id":"img_test"}\n');
  const produced = spawnSync("bun", ["--eval", `
    import { buildMatterhornWorkspaceArchive } from "./apps/server/src/workspace-data-archive.ts";
    const result = await buildMatterhornWorkspaceArchive({
      workspace: { id: "ws_producer", name: "Disposable producer fixture", path: process.env.QA_ARCHIVE_WORKSPACE, preset: "starter", workspaceType: "local" },
      configuration: {}, mission: null, notes: [], memory: { records: [], suggestions: [] },
      chats: [], receipts: [], activity: { items: [] }
    });
    process.stdout.write(result.compressed.toString("base64"));
  `], { encoding: "utf8", env: { ...process.env, QA_ARCHIVE_WORKSPACE: workspace } });
  assert.equal(produced.status, 0, produced.stderr);
  const producerValidation = validateTenantArchive(Buffer.from(produced.stdout, "base64"));
  assert.equal(producerValidation.workspaceId, "ws_producer");
  assert.equal(producerValidation.counts.files, 3);
  writeFileSync(tenantArchive, compressed(exportArchive()));
  assert.equal(validateTenantArchive(readFileSync(tenantArchive)).dataDigestVerified, true);
  const missingNotes = exportArchive(); delete missingNotes.data.notes;
  assert.throws(() => validateTenantArchive(compressed(missingNotes)), /missing notes/);
  const wrongCount = exportArchive(); wrongCount.manifest.counts.chats = 9;
  assert.throws(() => validateTenantArchive(compressed(wrongCount)), /count/);
  const badDigest = exportArchive(); badDigest.manifest.integrity.dataSha256 = "0".repeat(64);
  assert.throws(() => validateTenantArchive(compressed(badDigest)), /digest/);
  const unsafePath = structuredClone(data); unsafePath.files[0].path = "notes/../private";
  assert.throws(() => validateTenantArchive(compressed(exportArchive(unsafePath))), /unsafe file path/);
  const badEncoding = structuredClone(data); badEncoding.files[1].content = "!!!";
  assert.throws(() => validateTenantArchive(compressed(exportArchive(badEncoding))), /file size mismatch|invalid base64/);
  assert.throws(() => validateTenantArchive(compressed({ padding: "x".repeat(4096) }), 1024), /bounded gzip/);

  const invalidContainer = join(root, "invalid-inner.mhdb");
  writeFileSync(invalidContainer, legacyContainer(Buffer.from("not gzip")));
  const invalidTarget = join(root, "invalid-inner-target");
  const invalidRestore = await run(["--restore", "--workspace-root", workspace,
    "--archive", invalidContainer, "--restore-to", invalidTarget, "--confirm-restore-to", invalidTarget]);
  assert.equal(invalidRestore.code, 1);
  assert.match(invalidRestore.stderr, /bounded gzip/);
  assert.equal(existsSync(invalidTarget), false);

  const backupResult = await run([
    "--workspace-root", workspace,
    "--tenant-archive", tenantArchive,
    "--output", archive,
    "--json-output", backupReport,
    "--json",
  ]);
  assert.equal(backupResult.code, 0, backupResult.stderr);
  const backup = JSON.parse(backupResult.stdout);
  assert.equal(backup.version, "matterhorn.user-data-recovery-report.v1");
  assert.equal(backup.operation, "backup");
  assert.equal(backup.status, "archive_verified");
  assert.equal(backup.ready, false);
  assert.equal(backup.applicationRestoreVerified, false);
  assert.equal(backup.tenantBoundaryVerified, false);
  assert.deepEqual(backup.coverage, {
    notes: true,
    memory: true,
    outputs: true,
    taskAndEvidenceState: true,
    chatHistory: true,
    receipts: true,
  });
  assert.equal(backup.encryption.passphraseStored, false);
  assert.match(backup.archive.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(readFileSync(backupReport, "utf8")), backup);
  const encryptedBytes = readFileSync(archive);
  assert.equal(encryptedBytes.includes(Buffer.from("private launch plan")), false);
  assert.equal(encryptedBytes.includes(Buffer.from("Recovery chat")), false);
  assert.equal(encryptedBytes.includes(Buffer.from(passphrase)), false);

  const wrongKey = await run([
    "--restore",
    "--workspace-root", workspace,
    "--archive", archive,
    "--restore-to", wrongKeyTarget,
    "--confirm-restore-to", wrongKeyTarget,
  ], "different-test-only-passphrase-32-characters");
  assert.equal(wrongKey.code, 1);
  assert.match(wrongKey.stderr, /authentication failed/i);

  const restoreResult = await run([
    "--restore",
    "--workspace-root", workspace,
    "--archive", archive,
    "--restore-to", restoreTarget,
    "--confirm-restore-to", restoreTarget,
    "--json-output", restoreReport,
    "--json",
  ]);
  assert.equal(restoreResult.code, 0, restoreResult.stderr);
  const restore = JSON.parse(restoreResult.stdout);
  assert.equal(restore.operation, "restore");
  assert.equal(restore.status, "archive_verified");
  assert.equal(restore.ready, false);
  assert.equal(restore.applicationRestoreVerified, false);
  assert.equal(restore.restore.tenantBoundaryVerified, false);
  assert.equal(restore.restore.payloadStructureAndDigestVerified, true);
  assert.equal(restore.restore.publishedAtomically, true);
  assert.equal(restore.restore.existingTargetOverwritten, false);
  const restoredArchive = join(restoreTarget, "tenant", "workspace-data-archive.json.gz");
  const restoredData = JSON.parse(gunzipSync(readFileSync(restoredArchive)).toString("utf8"));
  assert.equal(restoredData.workspace.id, "ws_test");
  assert.equal(restoredData.data.chats[0].messages[0].text, "Recovery chat");
  assert.equal(restoredData.data.files[0].content, "# Note\n");
  assert.deepEqual(Buffer.from(restoredData.data.files[1].content, "base64"), Buffer.from([0, 255]));
  assert.equal(JSON.stringify(restoredData).includes("ws_other_tenant"), false);

  const overwrite = await run([
    "--restore",
    "--workspace-root", workspace,
    "--archive", archive,
    "--restore-to", restoreTarget,
    "--confirm-restore-to", restoreTarget,
  ]);
  assert.equal(overwrite.code, 1);
  assert.match(overwrite.stderr, /already exists/i);

  const missingWorkspace = await run([
    "--restore",
    "--archive", archive,
    "--restore-to", join(root, "missing-workspace"),
    "--confirm-restore-to", join(root, "missing-workspace"),
  ]);
  assert.equal(missingWorkspace.code, 1);
  assert.match(missingWorkspace.stderr, /workspace-root is required/i);

  const nestedRestore = await run([
    "--restore",
    "--workspace-root", workspace,
    "--archive", archive,
    "--restore-to", nestedTarget,
    "--confirm-restore-to", nestedTarget,
  ]);
  assert.equal(nestedRestore.code, 1);
  assert.match(nestedRestore.stderr, /separate from the active workspace/i);

  symlinkSync(workspace, symlinkedWorkspaceParent, "dir");
  const symlinkedRestore = await run([
    "--restore",
    "--workspace-root", workspace,
    "--archive", archive,
    "--restore-to", join(symlinkedWorkspaceParent, "unsafe-restore"),
    "--confirm-restore-to", join(symlinkedWorkspaceParent, "unsafe-restore"),
  ]);
  assert.equal(symlinkedRestore.code, 1);
  assert.match(symlinkedRestore.stderr, /separate from the active workspace/i);

  const tenantArchiveLink = join(root, "tenant-archive-link.json.gz");
  symlinkSync(tenantArchive, tenantArchiveLink);
  const unsafeBackup = await run([
    "--workspace-root", workspace,
    "--tenant-archive", tenantArchiveLink,
    "--output", join(root, "unsafe-backup.mhdb"),
  ]);
  assert.equal(unsafeBackup.code, 1);
  assert.match(unsafeBackup.stderr, /regular gzip file/i);

  const oversizedSource = join(root, "oversized-source.gz");
  writeFileSync(oversizedSource, "");
  truncateSync(oversizedSource, MAX_TENANT_ARCHIVE_BYTES + 1); // sparse disposable file
  const oversizedOutput = join(root, "oversized.mhdb");
  const oversizedBackup = await run(["--workspace-root", workspace,
    "--tenant-archive", oversizedSource, "--output", oversizedOutput]);
  assert.equal(oversizedBackup.code, 1);
  assert.match(oversizedBackup.stderr, /size limit/);
  assert.equal(existsSync(oversizedOutput), false);
  const directoryBackup = await run(["--workspace-root", workspace,
    "--tenant-archive", workspace, "--output", join(root, "directory.mhdb")]);
  assert.equal(directoryBackup.code, 1);
  assert.match(directoryBackup.stderr, /regular gzip file/i);

  const unsafeGlobalDatabase = await run([
    "--workspace-root", workspace,
    "--opencode-db", tenantArchive,
    "--output", join(root, "unsafe-global-db.mhdb"),
  ]);
  assert.equal(unsafeGlobalDatabase.code, 1);
  assert.match(unsafeGlobalDatabase.stderr, /unsafe for tenant recovery/i);

  const unsafeCliSecret = await run(["--passphrase", passphrase]);
  assert.equal(unsafeCliSecret.code, 1);
  assert.match(unsafeCliSecret.stderr, /environment variable/i);
  assert.doesNotMatch(readFileSync(backupReport, "utf8"), new RegExp(passphrase));
  assert.doesNotMatch(readFileSync(restoreReport, "utf8"), new RegExp(passphrase));
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Encrypted workspace user-data backup and restore contract passed.");
