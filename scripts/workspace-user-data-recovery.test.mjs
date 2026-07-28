#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const requireFromServer = createRequire(new URL("../apps/server/package.json", import.meta.url));
const Database = requireFromServer("better-sqlite3");
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
const databasePath = join(root, "opencode.db");
const qaRestoreTarget = join(workspace, ".matterhorn-work", "qa-restore-target-contract");
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

try {
  write("notes/launch.md", "# Launch note\nprivate launch plan\n");
  write("outputs/report.txt", "customer output\n");
  write(".matterhorn-work/memory/memory-records.json", '{"records":[{"title":"remembered"}]}\n');
  write(".matterhorn-work/task-logs/ws_test/run.jsonl", '{"type":"completed"}\n');
  write(".matterhorn-work/outputs/images/image.metadata.json", '{"id":"img_test"}\n');
  mkdirSync(join(qaRestoreTarget, ".opencode", "node_modules", ".bin"), { recursive: true });
  symlinkSync(
    join(workspace, "notes", "launch.md"),
    join(qaRestoreTarget, ".opencode", "node_modules", ".bin", "qa-only-link"),
  );

  const database = new Database(databasePath);
  database.exec("create table session (id text primary key, title text); insert into session values ('ses_test', 'Recovery chat');");
  database.close();

  const backupResult = await run([
    "--workspace-root", workspace,
    "--opencode-db", databasePath,
    "--output", archive,
    "--json-output", backupReport,
    "--json",
  ]);
  assert.equal(backupResult.code, 0, backupResult.stderr);
  const backup = JSON.parse(backupResult.stdout);
  assert.equal(backup.version, "matterhorn.user-data-recovery-report.v1");
  assert.equal(backup.operation, "backup");
  assert.equal(backup.ready, true);
  assert.deepEqual(backup.coverage, {
    notes: true,
    memory: true,
    outputs: true,
    taskAndEvidenceState: true,
    chatHistory: true,
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
  assert.equal(restore.ready, true);
  assert.equal(restore.restore.publishedAtomically, true);
  assert.equal(restore.restore.existingTargetOverwritten, false);
  assert.equal(readFileSync(join(restoreTarget, "workspace", "notes", "launch.md"), "utf8"), "# Launch note\nprivate launch plan\n");
  assert.equal(readFileSync(join(restoreTarget, "workspace", "outputs", "report.txt"), "utf8"), "customer output\n");
  assert.equal(readFileSync(join(restoreTarget, "workspace", ".matterhorn-work", "memory", "memory-records.json"), "utf8"), '{"records":[{"title":"remembered"}]}\n');
  assert.equal(
    existsSync(join(restoreTarget, "workspace", ".matterhorn-work", "qa-restore-target-contract")),
    false,
    "QA restore targets must not be included in user-data backups",
  );

  const restoredDb = new Database(join(restoreTarget, "runtime", "opencode.db"), { readonly: true });
  assert.equal(restoredDb.prepare("select title from session where id = ?").get("ses_test").title, "Recovery chat");
  restoredDb.close();

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

  symlinkSync(
    join(workspace, "notes", "launch.md"),
    join(workspace, ".matterhorn-work", "memory", "unsafe-link"),
  );
  const unsafeBackup = await run([
    "--workspace-root", workspace,
    "--opencode-db", databasePath,
    "--output", join(root, "unsafe-backup.mhdb"),
  ]);
  assert.equal(unsafeBackup.code, 1);
  assert.match(unsafeBackup.stderr, /symlinks are not allowed/i);

  const unsafeCliSecret = await run(["--passphrase", passphrase]);
  assert.equal(unsafeCliSecret.code, 1);
  assert.match(unsafeCliSecret.stderr, /environment variable/i);
  assert.doesNotMatch(readFileSync(backupReport, "utf8"), new RegExp(passphrase));
  assert.doesNotMatch(readFileSync(restoreReport, "utf8"), new RegExp(passphrase));
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Encrypted workspace user-data backup and restore contract passed.");
