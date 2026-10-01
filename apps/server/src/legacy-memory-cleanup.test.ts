import { afterEach, expect, test } from "bun:test";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createMatterhornMemoryVault } from "@matterhorn-work/memory-vault";
import type { MatterhornMemoryRecord } from "@matterhorn-work/types/memory";
import { auditLogPath, legacyAuditLogPath } from "./audit.js";
import { applyLegacyMemoryCleanup, planLegacyMemoryCleanup } from "./legacy-memory-cleanup.js";

const priorDataDir = process.env.OPENWORK_DATA_DIR;
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  if (priorDataDir === undefined) delete process.env.OPENWORK_DATA_DIR;
  else process.env.OPENWORK_DATA_DIR = priorDataDir;
});

function record(id: string, workspaceId = "ws_cleanup"): MatterhornMemoryRecord {
  return { id, kind: "protocol_address", scope: "workspace", title: "Legacy private label",
    summary: "ERASE_LEGACY_CONTENT", body: { validatorName: "ERASE_LEGACY_CONTENT" },
    tags: ["bittensor", `workspace:${workspaceId}`], links: [], sensitivity: "public",
    provenance: { source: "user_confirmed", capturedAt: "2026-09-30T00:00:00Z", capturedBy: "user",
      confidence: 1, reasonRemembered: "User confirmed fixture" },
    createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z",
    canUseInChat: true, canExport: true, canDelete: true };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-legacy-cleanup-"));
  directories.push(root);
  const dataDir = join(root, "data");
  const workspaceRoot = join(root, "workspace");
  await mkdir(join(dataDir, "audit"), { recursive: true });
  await mkdir(join(workspaceRoot, ".opencode", "openwork"), { recursive: true });
  process.env.OPENWORK_DATA_DIR = dataDir;
  const vault = createMatterhornMemoryVault(join(root, "vault"));
  const deleted = await vault.captureRecord(record("mem_old"));
  await vault.storeSuggestions([{
    version: "matterhorn.memory.suggestion.v1", id: "suggest_old", proposedRecord: record("mem_old"),
    reason: "ERASE_LEGACY_CONTENT", source: "chat_capture", confidence: 1,
    desk: "bittensor", useCase: "bittensor_wallet_label", userAction: "dismiss",
    captureMode: "user_confirmed_only", canAutoCapture: false, requiresExplicitConsent: true, forbiddenIfSecretDetected: true,
  }]);
  const active = await vault.captureRecord({ ...record("mem_active"), summary: "KEEP_ACTIVE", body: { validatorName: "KEEP_ACTIVE" } });
  const other = await vault.captureRecord(record("mem_other", "ws_other"));
  const index = JSON.parse(await readFile(vault.indexPath, "utf8"));
  index.entries.mem_old.deleted = true;
  index.entries.mem_other.deleted = true;
  await writeFile(vault.indexPath, JSON.stringify(index));
  const oldEvent = { id: "event_old", action: "memory.capture", workspaceId: "ws_cleanup", target: "mem_old",
    timestamp: 1, actor: { type: "remote" }, summary: "ERASE_LEGACY_CONTENT", metadata: { title: "ERASE_LEGACY_CONTENT" } };
  const keepEvent = { ...oldEvent, id: "event_keep", action: "wallet.approval.denied", summary: "KEEP_AUDIT", metadata: { safe: true } };
  const legacyEvent = { ...oldEvent, id: "event_legacy", workspaceId: undefined };
  await writeFile(auditLogPath("ws_cleanup"), `${JSON.stringify(oldEvent)}\n${JSON.stringify(keepEvent)}\n`);
  await writeFile(legacyAuditLogPath(workspaceRoot), `${JSON.stringify(legacyEvent)}\n`);
  const options = { vaultRoot: vault.rootDir, workspaceRoot, workspaceId: "ws_cleanup" };
  return { root, dataDir, vault, deleted, active, other, options, oldEvent, keepEvent };
}

async function snapshot(directory: string): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const name of (await readdir(directory)).sort()) {
    const file = join(directory, name);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      results.push([name, info.mode, info.mtimeMs, info.isDirectory() ? await snapshot(file) : await handle.readFile("utf8")]);
    } finally {
      await handle.close();
    }
  }
  return results;
}

test("fixture snapshots reject symbolic links instead of reading their targets", async () => {
  const { root } = await fixture();
  await symlink(join(root, "vault", "memory-index.json"), join(root, "snapshot-link"));
  await expect(snapshot(root)).rejects.toMatchObject({ code: "ELOOP" });
});

test("dry run is content-free and changes no bytes, permissions or modification times", async () => {
  const { root, vault, options } = await fixture();
  await chmod(vault.indexPath, 0o644);
  const before = await snapshot(root);
  const plan = await planLegacyMemoryCleanup(options);
  expect(plan.recordIds).toEqual(["mem_old"]);
  expect(plan.auditEvents).toBe(2);
  expect(JSON.stringify(plan)).not.toMatch(/ERASE_LEGACY_CONTENT|Legacy private label/);
  expect(await snapshot(root)).toEqual(before);
});

test("apply erases only selected tombstones and historical audit content, preserving event identity", async () => {
  const { vault, options, deleted, active, other, oldEvent, keepEvent } = await fixture();
  const plan = await planLegacyMemoryCleanup(options);
  const result = await applyLegacyMemoryCleanup(options, plan.fingerprint);
  expect(result.deletedRecords).toBe(1);
  expect(result.remaining.recordCount).toBe(0);
  expect(JSON.parse(await readFile(vault.indexPath, "utf8")).entries.mem_old).toBeUndefined();
  await expect(readFile(deleted.markdownPath)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(active.markdownPath, "utf8")).toContain("KEEP_ACTIVE");
  expect(await readFile(other.markdownPath, "utf8")).toContain("ERASE_LEGACY_CONTENT");
  const rows = (await readFile(auditLogPath(options.workspaceId), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(rows[0]).toEqual({ ...oldEvent, summary: "Memory record content removed", metadata: undefined });
  expect(rows[1]).toEqual(keepEvent);
  expect(await readFile(legacyAuditLogPath(options.workspaceRoot), "utf8")).not.toContain("ERASE_LEGACY_CONTENT");
  expect(await readFile(vault.suggestionInboxPath, "utf8")).not.toContain("ERASE_LEGACY_CONTENT");
  expect(await readFile(vault.logPath, "utf8")).not.toContain("suggest_old");
  const after = await snapshot(vault.rootDir);
  expect((await applyLegacyMemoryCleanup(options, result.remaining.fingerprint)).deletedRecords).toBe(0);
  expect(await snapshot(vault.rootDir)).toEqual(after);
});

for (const changed of ["record", "index", "suggestions", "audit", "legacy-audit", "log"]) {
  test(`a changed ${changed} invalidates a reviewed plan before any cleanup`, async () => {
    const { root, vault, options, deleted } = await fixture();
    const plan = await planLegacyMemoryCleanup(options);
    const file = changed === "record" ? deleted.markdownPath : changed === "index" ? vault.indexPath
      : changed === "suggestions" ? vault.suggestionInboxPath : changed === "audit" ? auditLogPath(options.workspaceId)
      : changed === "legacy-audit" ? legacyAuditLogPath(options.workspaceRoot) : vault.logPath;
    await writeFile(file, `${await readFile(file, "utf8")}\n`);
    const before = await snapshot(root);
    await expect(applyLegacyMemoryCleanup(options, plan.fingerprint)).rejects.toThrow(/stale/);
    expect(await snapshot(root)).toEqual(before);
  });
}

test("another workspace cannot apply this plan", async () => {
  const { root, options } = await fixture();
  const plan = await planLegacyMemoryCleanup(options);
  const before = await snapshot(root);
  await expect(applyLegacyMemoryCleanup({ ...options, workspaceId: "ws_other" }, plan.fingerprint)).rejects.toThrow(/stale/);
  expect(await snapshot(root)).toEqual(before);
});

for (const location of ["audit", "legacy-audit", "log"]) {
  test(`malformed ${location} blocks preflight without modifying the vault`, async () => {
    const { root, options, vault } = await fixture();
    const file = location === "audit" ? auditLogPath(options.workspaceId)
      : location === "legacy-audit" ? legacyAuditLogPath(options.workspaceRoot) : vault.logPath;
    await writeFile(file, "{ MALFORMED_PRIVATE_CONTENT\n");
    const before = await snapshot(root);
    await expect(planLegacyMemoryCleanup(options)).rejects.toThrow();
    expect(await snapshot(root)).toEqual(before);
  });
}

test("ambiguous ownership and tampered record paths fail before mutation", async () => {
  const { root, options, vault } = await fixture();
  const index = JSON.parse(await readFile(vault.indexPath, "utf8"));
  index.entries.mem_old.record.tags.push("workspace:ws_other");
  await writeFile(vault.indexPath, JSON.stringify(index));
  await expect(planLegacyMemoryCleanup(options)).rejects.toThrow(/ambiguous/);
  index.entries.mem_old.record.tags.pop();
  index.entries.mem_old.markdownPath = join(root, "other-file");
  await writeFile(vault.indexPath, JSON.stringify(index));
  const before = await snapshot(root);
  await expect(planLegacyMemoryCleanup(options)).rejects.toThrow(/path/);
  expect(await snapshot(root)).toEqual(before);
});

test("symlinked control files are rejected without modifying the target", async () => {
  const { root, options, vault } = await fixture();
  const outside = join(root, "external-index");
  const content = await readFile(vault.indexPath, "utf8");
  await writeFile(outside, content);
  await rm(vault.indexPath);
  await symlink(outside, vault.indexPath);
  await expect(planLegacyMemoryCleanup(options)).rejects.toThrow(/symbolic/);
  expect(await readFile(outside, "utf8")).toBe(content);
});

test("interrupted legacy deletion with an absent markdown file can be completed", async () => {
  const { options, deleted } = await fixture();
  await rm(deleted.markdownPath);
  const plan = await planLegacyMemoryCleanup(options);
  expect((await applyLegacyMemoryCleanup(options, plan.fingerprint)).deletedRecords).toBe(1);
});

test("untagged legacy records are not guessed to belong to the selected workspace", async () => {
  const { options, vault } = await fixture();
  const index = JSON.parse(await readFile(vault.indexPath, "utf8"));
  index.entries.mem_old.record.tags = ["bittensor"];
  await writeFile(vault.indexPath, JSON.stringify(index));
  expect((await planLegacyMemoryCleanup(options)).recordCount).toBe(0);
});

test("a failed external audit precondition leaves all vault storage untouched", async () => {
  const { vault, options } = await fixture();
  const plan = await vault.planLegacyMemoryCleanup(options.workspaceId);
  const before = await snapshot(vault.rootDir);
  await expect(vault.cleanupLegacyMemory(options.workspaceId, plan.fingerprint, async () => {
    throw new Error("Audit storage unavailable");
  })).rejects.toThrow(/Audit storage/);
  expect(await snapshot(vault.rootDir)).toEqual(before);
});

test("CLI requires explicit apply confirmation and does not print corrupt record content", async () => {
  const { root, options, dataDir, vault } = await fixture();
  const script = resolve(import.meta.dir, "../../../scripts/matterhorn-legacy-memory-cleanup.ts");
  const args = [process.execPath, script, "--vault-root", options.vaultRoot, "--workspace-root", options.workspaceRoot,
    "--workspace-id", options.workspaceId, "--server-data-dir", dataDir];
  const before = await snapshot(root);
  const dry = Bun.spawnSync(args);
  expect(dry.exitCode).toBe(0);
  expect(JSON.parse(dry.stdout.toString()).mode).toBe("dry-run");
  expect(Bun.spawnSync([...args, "--apply"]).exitCode).toBe(2);
  expect(await snapshot(root)).toEqual(before);
  const applied = Bun.spawnSync([...args, "--apply", "--writers-stopped", "--expect", JSON.parse(dry.stdout.toString()).fingerprint]);
  expect(applied.exitCode).toBe(0);
  expect(JSON.parse(applied.stdout.toString()).deletedRecords).toBe(1);
  await writeFile(vault.indexPath, "{ PRIVATE_CORRUPT_RECORD_CONTENT");
  const corrupt = Bun.spawnSync(args);
  expect(corrupt.exitCode).toBe(1);
  expect(`${corrupt.stdout}${corrupt.stderr}`).not.toContain("PRIVATE_CORRUPT_RECORD_CONTENT");
});
