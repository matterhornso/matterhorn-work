import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentSecurityReceiptDirectory } from "./agent-run-receipts.js";
import { auditLogPath } from "./audit.js";
import {
  legacySecurityMigrationCheckpointPath,
  migrateLegacySecurityRecords,
  purgeExpiredLegacySecuritySegments,
} from "./legacy-security-migration.js";
import { taskEventsPath } from "./task-events.js";
import type { WorkspaceInfo } from "./types.js";

const roots: string[] = [];
const originalDataDir = process.env.OPENWORK_DATA_DIR;

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.OPENWORK_DATA_DIR;
  else process.env.OPENWORK_DATA_DIR = originalDataDir;
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(root: string): WorkspaceInfo {
  return {
    id: "ws_guarded_migration",
    name: "Guarded migration",
    path: root,
    workspaceType: "local",
    preset: "default",
  } as WorkspaceInfo;
}

describe("legacy security record migration", () => {
  test("strictly projects, verifies, checkpoints, and removes superseded content logs", async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-security-migration-"));
    roots.push(root);
    process.env.OPENWORK_DATA_DIR = join(root, "data");
    const currentWorkspace = workspace(root);
    const workflowDir = join(root, ".matterhorn-work", "task-logs", currentWorkspace.id);
    await mkdir(join(process.env.OPENWORK_DATA_DIR, "audit"), { recursive: true });
    await mkdir(join(process.env.OPENWORK_DATA_DIR, "task-events"), { recursive: true });
    await mkdir(workflowDir, { recursive: true });

    const secret = "never migrate this raw prompt or private key";
    await writeFile(auditLogPath(currentWorkspace.id), `${JSON.stringify({
      id: "audit-1",
      workspaceId: currentWorkspace.id,
      action: "wallet.review",
      target: secret,
      summary: secret,
      timestamp: Date.parse("2026-08-01T00:00:00.000Z"),
    })}\n`);
    await writeFile(taskEventsPath(currentWorkspace.id), `${JSON.stringify({
      id: "task-1",
      workspaceId: currentWorkspace.id,
      taskId: "task-private-id",
      type: "completed",
      summary: secret,
      detail: secret,
      timestamp: Date.parse("2026-08-01T00:01:00.000Z"),
    })}\n`);
    await writeFile(join(workflowDir, "run-1.jsonl"), `${JSON.stringify({
      workflowRunId: "run-private-id",
      workspaceId: currentWorkspace.id,
      visibleUserIntent: secret,
      status: "completed",
      createdAt: Date.parse("2026-08-01T00:02:00.000Z"),
    })}\n${JSON.stringify({
      id: "event-1",
      type: "workflow.completed",
      payload: { raw: secret },
      timestamp: Date.parse("2026-08-01T00:03:00.000Z"),
    })}\n`);

    const checkpoint = await migrateLegacySecurityRecords({
      workspace: currentWorkspace,
      now: new Date("2026-08-18T12:00:00.000Z"),
    });

    expect(checkpoint).toMatchObject({
      verified: true,
      migratedCount: 4,
      removedSourceFiles: 3,
      sourceCounts: { audit: 1, task_events: 1, workflow_runs: 2 },
    });
    expect(existsSync(auditLogPath(currentWorkspace.id))).toBe(false);
    expect(existsSync(taskEventsPath(currentWorkspace.id))).toBe(false);
    expect(existsSync(join(workflowDir, "run-1.jsonl"))).toBe(false);
    expect(existsSync(legacySecurityMigrationCheckpointPath(currentWorkspace.id))).toBe(true);

    const legacyDir = join(agentSecurityReceiptDirectory(currentWorkspace.id), "legacy");
    const migrated = readFileSync(join(legacyDir, `2026-08-18-${checkpoint.migrationId}.jsonl`), "utf8");
    expect(migrated).not.toContain(secret);
    expect(migrated).not.toContain("visibleUserIntent");
    expect(migrated).not.toContain("payload");
    expect(migrated).toContain("wallet.review");
  });

  test("expires only dated verified migration segments older than 365 days", async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-security-expiry-"));
    roots.push(root);
    process.env.OPENWORK_DATA_DIR = join(root, "data");
    const directory = join(agentSecurityReceiptDirectory("ws_guarded_migration"), "legacy");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "2025-01-01-aaaaaaaaaaaa.jsonl"), "old\n");
    await writeFile(join(directory, "2026-08-01-bbbbbbbbbbbb.jsonl"), "new\n");
    await writeFile(join(directory, "checkpoint.json"), "{}\n");

    expect(await purgeExpiredLegacySecuritySegments("ws_guarded_migration", new Date("2026-08-18T00:00:00.000Z"))).toBe(1);
    expect(existsSync(join(directory, "2025-01-01-aaaaaaaaaaaa.jsonl"))).toBe(false);
    expect(existsSync(join(directory, "2026-08-01-bbbbbbbbbbbb.jsonl"))).toBe(true);
    expect(existsSync(join(directory, "checkpoint.json"))).toBe(true);
  });
});
