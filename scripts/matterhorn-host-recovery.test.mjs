#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const requireFromServer = createRequire(new URL("../apps/server/package.json", import.meta.url));
const Database = requireFromServer("better-sqlite3");
const root = mkdtempSync(join(tmpdir(), "matterhorn-host-recovery-test-"));
const dataRoot = join(root, "data");
const opencodeDb = join(root, "opencode.db");
const archive = join(root, "host-recovery.json.gz");
const restored = join(root, "restored");
const scriptSource = readFileSync("scripts/matterhorn-host-recovery.mjs", "utf8");

function createDatabase(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.exec("CREATE TABLE state (value TEXT NOT NULL)");
  database.prepare("INSERT INTO state(value) VALUES (?)").run(value);
  database.close();
}

function run(args) {
  return spawnSync("node", ["scripts/matterhorn-host-recovery.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, MATTERHORN_BUILD_COMMIT: "host-recovery-test" },
  });
}

try {
  assert.match(scriptSource, /MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID/);
  assert.match(scriptSource, /MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(scriptSource, /process\.env\.AWS_ACCESS_KEY_ID/);
  const databases = [
    [join(dataRoot, "auth", "accounts.db"), "identity"],
    [join(dataRoot, "usage", "model-usage.db"), "usage"],
    [join(dataRoot, "auth", "rate-limits.db"), "rate-limit"],
    [join(dataRoot, "guarded-runtime", "state.db"), "guarded"],
    [opencodeDb, "opencode"],
  ];
  for (const [path, value] of databases) createDatabase(path, value);

  const backup = run([
    "--data-root", dataRoot,
    "--opencode-db", opencodeDb,
    "--output", archive,
    "--json",
  ]);
  assert.equal(backup.status, 0, backup.stderr);
  const report = JSON.parse(backup.stdout);
  assert.equal(report.ready, true);
  assert.deepEqual(report.files.map((file) => file.path).sort(), [
    "auth/accounts.db",
    "auth/rate-limits.db",
    "guarded-runtime/state.db",
    "opencode/opencode.db",
    "usage/model-usage.db",
  ]);
  const archiveFd = openSync(archive, "r");
  try {
    assert.equal(fstatSync(archiveFd).mode & 0o777, 0o600);
    assert.equal(readFileSync(archiveFd).includes(Buffer.from("identity")), false);
  } finally {
    closeSync(archiveFd);
  }

  const restore = run([
    "--restore",
    "--archive", archive,
    "--restore-to", restored,
    "--confirm-restore-to", restored,
    "--json",
  ]);
  assert.equal(restore.status, 0, restore.stderr);
  for (const [source, value] of databases) {
    const relative = source === opencodeDb
      ? "opencode/opencode.db"
      : source.slice(dataRoot.length + 1);
    const restoredDb = new Database(join(restored, relative), { readonly: true });
    assert.equal(restoredDb.prepare("SELECT value FROM state").get().value, value);
    restoredDb.close();
  }

  const nonempty = join(root, "nonempty");
  mkdirSync(nonempty, { recursive: true });
  createDatabase(join(nonempty, "existing.db"), "do-not-overwrite");
  const refused = run([
    "--restore",
    "--archive", archive,
    "--restore-to", nonempty,
    "--confirm-restore-to", nonempty,
  ]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /clean, empty restore root/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("SSE-KMS host recovery snapshot and restore contract passed.");
