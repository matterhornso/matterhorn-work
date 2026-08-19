import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { atomicWriteTextFile } from "./atomic-file.js";
import { agentSecurityReceiptDirectory } from "./agent-run-receipts.js";
import { auditLogPath } from "./audit.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import { taskEventsPath } from "./task-events.js";
import type { WorkspaceInfo } from "./types.js";

const MIGRATION_VERSION = "matterhorn.legacy-security-migration.v1" as const;
const RECORD_VERSION = "matterhorn.minimal-security-record.v1" as const;
const RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;

type LegacySource = "audit" | "task_events" | "workflow_runs";

export type MinimalLegacySecurityRecord = {
  version: typeof RECORD_VERSION;
  workspaceId: string;
  source: LegacySource;
  eventCode: string;
  status?: string;
  occurredAt: string;
  subjectHash: string;
  sourceEntryHash: string;
  integrity: {
    previousHash: string | null;
    recordHash: string;
  };
};

export type LegacySecurityMigrationCheckpoint = {
  version: typeof MIGRATION_VERSION;
  workspaceId: string;
  migrationId: string;
  createdAt: string;
  sourceCounts: Record<LegacySource, number>;
  migratedCount: number;
  sourceAggregateHash: string;
  outputAggregateHash: string;
  removedSourceFiles: number;
  verified: true;
};

type SourceEntry = {
  source: LegacySource;
  value: Record<string, unknown>;
  sourceHash: string;
};

const TASK_EVENT_CODES = new Set([
  "workflow_staged",
  "workflow_started",
  "stage_started",
  "tool_called",
  "artifact_saved",
  "artifact_deleted",
  "image_generated",
  "nft_minted",
  "nft_listed",
  "waiting_for_user",
  "completed",
  "failed",
  "cancelled",
]);

const WORKFLOW_EVENT_CODES = new Set([
  "workflow.staged",
  "workflow.started",
  "workflow.stage_started",
  "workflow.tool_called",
  "workflow.artifact_saved",
  "workflow.waiting_for_user",
  "workflow.completed",
  "workflow.failed",
  "workflow.cancelled",
]);

const STATUS_CODES = new Set(["staged", "running", "waiting", "completed", "failed", "cancelled"]);

function safeWorkspaceId(workspaceId: string): string {
  return workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
}

function normalizeAuditAction(value: unknown): string {
  if (typeof value !== "string") return "audit.other";
  const action = value.trim();
  return /^[a-z][a-z0-9_.:-]{0,79}$/.test(action) ? action : "audit.other";
}

function normalizeTimestamp(value: unknown, fallbackMs: number): string {
  const numeric = typeof value === "number" ? value : Date.parse(typeof value === "string" ? value : "");
  const timestamp = Number.isFinite(numeric) && numeric > 0 ? numeric : fallbackMs;
  return new Date(timestamp).toISOString();
}

function normalizedSubjectHash(value: Record<string, unknown>, sourceHash: string): string {
  for (const key of ["workflowRunId", "taskId", "runId", "id", "sessionId"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return sha256(candidate.trim());
  }
  return sha256(sourceHash);
}

function eventCode(entry: SourceEntry): string {
  if (entry.source === "audit") return normalizeAuditAction(entry.value.action);
  const candidate = typeof entry.value.type === "string" ? entry.value.type.trim() : "";
  if (entry.source === "task_events") return TASK_EVENT_CODES.has(candidate) ? candidate : "task.other";
  if (WORKFLOW_EVENT_CODES.has(candidate)) return candidate;
  return typeof entry.value.workflowRunId === "string" ? "workflow.header" : "workflow.other";
}

function statusCode(value: Record<string, unknown>): string | undefined {
  const candidate = typeof value.status === "string" ? value.status.trim() : "";
  return STATUS_CODES.has(candidate) ? candidate : undefined;
}

function recordHash(record: MinimalLegacySecurityRecord): string {
  return sha256({
    ...record,
    integrity: { previousHash: record.integrity.previousHash, recordHash: "" },
  });
}

async function readJsonl(path: string, source: LegacySource): Promise<SourceEntry[]> {
  const text = await readFile(path, "utf8").catch(() => "");
  const entries: SourceEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      entries.push({ source, value: parsed as Record<string, unknown>, sourceHash: sha256(line) });
    } catch {
      // Corrupt legacy rows are not migrated and therefore cannot weaken the verified count.
    }
  }
  return entries;
}

async function listJsonlFiles(directory: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const name of names.sort()) {
    const path = join(directory, name);
    const info = await stat(path).catch(() => null);
    if (info?.isFile() && name.endsWith(".jsonl")) files.push(path);
  }
  return files;
}

function migrationDirectory(workspaceId: string): string {
  return join(agentSecurityReceiptDirectory(workspaceId), "legacy");
}

export function legacySecurityMigrationCheckpointPath(workspaceId: string): string {
  return join(migrationDirectory(workspaceId), "checkpoint.json");
}

export async function purgeExpiredLegacySecuritySegments(workspaceId: string, now = new Date()): Promise<number> {
  const directory = migrationDirectory(workspaceId);
  let files: string[];
  try {
    files = await readdir(directory);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const file of files) {
    const match = /^(\d{4}-\d{2}-\d{2})-[a-f0-9]{12}\.jsonl$/.exec(file);
    if (!match) continue;
    const timestamp = Date.parse(`${match[1]}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp) || now.getTime() - timestamp <= RETENTION_MS) continue;
    await rm(join(directory, file), { force: true });
    removed += 1;
  }
  return removed;
}

export async function migrateLegacySecurityRecords(input: {
  workspace: WorkspaceInfo;
  now?: Date;
}): Promise<LegacySecurityMigrationCheckpoint> {
  const now = input.now ?? new Date();
  const workspaceId = safeWorkspaceId(input.workspace.id);
  const checkpointPath = legacySecurityMigrationCheckpointPath(workspaceId);
  const existing = await readFile(checkpointPath, "utf8").catch(() => "");
  let existingCheckpoint: LegacySecurityMigrationCheckpoint | null = null;
  if (existing) {
    try {
      const checkpoint = JSON.parse(existing) as LegacySecurityMigrationCheckpoint;
      if (checkpoint.version === MIGRATION_VERSION && checkpoint.workspaceId === input.workspace.id && checkpoint.verified) {
        existingCheckpoint = checkpoint;
      }
    } catch {
      // Invalid checkpoints are replaced only after a fresh verified migration.
    }
  }

  const sourceFiles: Array<{ source: LegacySource; path: string }> = [
    { source: "audit", path: auditLogPath(input.workspace.id) },
    { source: "task_events", path: taskEventsPath(input.workspace.id) },
  ];
  const workflowDirectory = join(input.workspace.path, ".matterhorn-work", "task-logs", input.workspace.id);
  for (const path of await listJsonlFiles(workflowDirectory)) sourceFiles.push({ source: "workflow_runs", path });

  const entries: SourceEntry[] = [];
  const sourceCounts: Record<LegacySource, number> = { audit: 0, task_events: 0, workflow_runs: 0 };
  const existingSourceFiles: string[] = [];
  for (const sourceFile of sourceFiles) {
    const values = await readJsonl(sourceFile.path, sourceFile.source);
    if (values.length > 0) existingSourceFiles.push(sourceFile.path);
    sourceCounts[sourceFile.source] += values.length;
    entries.push(...values);
  }

  // A prior checkpoint is reusable only while no new legacy rows exist. Audit and
  // workflow writers can create fresh source files after an earlier migration.
  if (existingCheckpoint && entries.length === 0) return existingCheckpoint;

  entries.sort((left, right) => {
    const leftTime = normalizeTimestamp(left.value.timestamp ?? left.value.createdAt, now.getTime());
    const rightTime = normalizeTimestamp(right.value.timestamp ?? right.value.createdAt, now.getTime());
    return leftTime.localeCompare(rightTime) || left.sourceHash.localeCompare(right.sourceHash);
  });

  let previousHash: string | null = null;
  const records = entries.map((entry): MinimalLegacySecurityRecord => {
    const record: MinimalLegacySecurityRecord = {
      version: RECORD_VERSION,
      workspaceId: input.workspace.id,
      source: entry.source,
      eventCode: eventCode(entry),
      ...(statusCode(entry.value) ? { status: statusCode(entry.value) } : {}),
      occurredAt: normalizeTimestamp(entry.value.timestamp ?? entry.value.createdAt, now.getTime()),
      subjectHash: normalizedSubjectHash(entry.value, entry.sourceHash),
      sourceEntryHash: entry.sourceHash,
      integrity: { previousHash, recordHash: "" },
    };
    record.integrity.recordHash = recordHash(record);
    previousHash = record.integrity.recordHash;
    return record;
  });

  const sourceAggregateHash = sha256(entries.map((entry) => entry.sourceHash));
  const outputAggregateHash = sha256(records.map((record) => record.integrity.recordHash));
  const migrationId = sha256({ workspaceId: input.workspace.id, sourceAggregateHash, outputAggregateHash }).slice(0, 12);
  const directory = migrationDirectory(workspaceId);
  const outputName = `${now.toISOString().slice(0, 10)}-${migrationId}.jsonl`;
  const outputPath = join(directory, outputName);
  const temporaryPath = join(directory, `.${outputName}.${process.pid}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, records.map((record) => canonicalJson(record)).join("\n") + (records.length ? "\n" : ""), { encoding: "utf8", mode: 0o600 });

  const verification = await readJsonl(temporaryPath, "workflow_runs");
  if (verification.length !== records.length) {
    await rm(temporaryPath, { force: true });
    throw new Error("Legacy security migration verification count mismatch");
  }
  let expectedPrevious: string | null = null;
  for (const entry of verification) {
    const record = entry.value as unknown as MinimalLegacySecurityRecord;
    if (record.version !== RECORD_VERSION || record.workspaceId !== input.workspace.id) throw new Error("Legacy security migration produced an invalid record");
    if (record.integrity.previousHash !== expectedPrevious || recordHash(record) !== record.integrity.recordHash) throw new Error("Legacy security migration hash chain verification failed");
    expectedPrevious = record.integrity.recordHash;
  }

  await rename(temporaryPath, outputPath);
  let removedSourceFiles = 0;
  for (const path of existingSourceFiles) {
    if (basename(path).endsWith(".jsonl")) {
      await rm(path, { force: true });
      removedSourceFiles += 1;
    }
  }

  const checkpoint: LegacySecurityMigrationCheckpoint = {
    version: MIGRATION_VERSION,
    workspaceId: input.workspace.id,
    migrationId,
    createdAt: now.toISOString(),
    sourceCounts,
    migratedCount: records.length,
    sourceAggregateHash,
    outputAggregateHash,
    removedSourceFiles,
    verified: true,
  };
  await atomicWriteTextFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  await purgeExpiredLegacySecuritySegments(workspaceId, now);
  return checkpoint;
}
