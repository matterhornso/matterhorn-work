import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createMatterhornMemoryVault } from "@matterhorn-work/memory-vault";
import { inspectMemoryAuditCleanup, redactMemoryAuditBatch } from "./audit.js";

export interface LegacyMemoryCleanupOptions {
  vaultRoot: string;
  workspaceRoot: string;
  workspaceId: string;
}

async function requireDirectory(path: string) {
  if (!isAbsolute(path)) throw new Error("Cleanup requires explicit absolute directories.");
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Cleanup requires existing non-symlink directories.");
  return realpath(path);
}

/** Operator-only, offline tool. Never register this as a user-facing HTTP endpoint. */
export async function planLegacyMemoryCleanup(options: LegacyMemoryCleanupOptions) {
  const dataRoot = process.env.OPENWORK_DATA_DIR;
  if (!dataRoot) throw new Error("Explicit OPENWORK_DATA_DIR is required for audit cleanup.");
  const roots = await Promise.all([
    requireDirectory(options.vaultRoot), requireDirectory(options.workspaceRoot), requireDirectory(dataRoot),
  ]);
  const vault = createMatterhornMemoryVault(options.vaultRoot);
  const memory = await vault.planLegacyMemoryCleanup(options.workspaceId);
  const audit = await inspectMemoryAuditCleanup(options.workspaceRoot, options.workspaceId, memory.recordIds);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(["legacy-memory-cleanup-v1", roots, options.workspaceId, memory.fingerprint, audit.fingerprint]))
    .digest("hex");
  return { version: "legacy-memory-cleanup-v1", workspaceId: options.workspaceId,
    recordIds: memory.recordIds, recordCount: memory.recordIds.length,
    auditEvents: audit.matchingEvents, fingerprint, vaultFingerprint: memory.fingerprint };
}

export async function applyLegacyMemoryCleanup(options: LegacyMemoryCleanupOptions, expectedFingerprint: string) {
  const plan = await planLegacyMemoryCleanup(options);
  if (plan.fingerprint !== expectedFingerprint) throw new Error("Cleanup plan is stale; run a new dry run.");
  const vault = createMatterhornMemoryVault(options.vaultRoot);
  const result = await vault.cleanupLegacyMemory(options.workspaceId, plan.vaultFingerprint,
    (ids) => redactMemoryAuditBatch(options.workspaceRoot, options.workspaceId, ids));
  return { ...result, workspaceId: options.workspaceId, remaining: await planLegacyMemoryCleanup(options) };
}
