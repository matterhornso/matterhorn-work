import { dirname, join } from "node:path";
import { createReadStream } from "node:fs";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import type { AuditEntry } from "./types.js";
import { ensureDir, exists } from "./utils.js";
import { readRecentJsonl } from "./jsonl-tail.js";

export interface AuditEntryCountOptions {
  actions?: readonly string[];
  startAtMs?: number;
  endBeforeMs?: number;
  excludeTargetContains?: readonly string[];
  uniqueTargets?: boolean;
}

function expandHome(value: string): string {
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

function resolveOpenworkDataDir(): string {
  const override = process.env.OPENWORK_DATA_DIR?.trim();
  if (override) return expandHome(override);
  return join(homedir(), ".openwork", "openwork-server");
}

export function auditLogPath(workspaceId: string): string {
  return join(resolveOpenworkDataDir(), "audit", `${workspaceId}.jsonl`);
}

export function legacyAuditLogPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".opencode", "openwork", "audit.jsonl");
}

async function resolveReadableAuditPath(workspaceRoot: string, workspaceId: string): Promise<string | null> {
  const primary = auditLogPath(workspaceId);
  if (await exists(primary)) return primary;
  const legacy = legacyAuditLogPath(workspaceRoot);
  if (await exists(legacy)) return legacy;
  return null;
}

export async function recordAudit(workspaceRoot: string, entry: AuditEntry): Promise<void> {
  const workspaceId = entry.workspaceId?.trim();
  if (!workspaceId) {
    const path = legacyAuditLogPath(workspaceRoot);
    await ensureDir(dirname(path));
    await appendFile(path, JSON.stringify(entry) + "\n", "utf8");
    return;
  }

  const path = auditLogPath(workspaceId);
  await ensureDir(dirname(path));
  await appendFile(path, JSON.stringify(entry) + "\n", "utf8");
}

export async function readLastAudit(workspaceRoot: string, workspaceId: string): Promise<AuditEntry | null> {
  const [entry] = await readAuditEntries(workspaceRoot, workspaceId, 1);
  return entry ?? null;
}

export async function readAuditEntries(
  workspaceRoot: string,
  workspaceId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  const path = await resolveReadableAuditPath(workspaceRoot, workspaceId);
  if (!path) return [];
  const { items } = await readRecentJsonl<AuditEntry>(path, limit);
  return items;
}

export async function countAuditEntries(
  workspaceRoot: string,
  workspaceId: string,
  options: AuditEntryCountOptions = {},
): Promise<number> {
  const path = await resolveReadableAuditPath(workspaceRoot, workspaceId);
  if (!path) return 0;

  const actions = options.actions?.length ? new Set(options.actions) : null;
  const uniqueTargets = options.uniqueTargets ? new Set<string>() : null;
  let count = 0;
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (!line.trim()) continue;
    let entry: AuditEntry;
    try {
      entry = JSON.parse(line) as AuditEntry;
    } catch {
      continue;
    }

    if (actions && !actions.has(entry.action)) continue;
    if (options.startAtMs !== undefined && entry.timestamp < options.startAtMs) continue;
    if (options.endBeforeMs !== undefined && entry.timestamp >= options.endBeforeMs) continue;
    const target = typeof entry.target === "string" ? entry.target : "";
    if (options.excludeTargetContains?.some((fragment) => target.includes(fragment))) continue;

    if (uniqueTargets) {
      uniqueTargets.add(`${entry.action}:${target}`);
    } else {
      count += 1;
    }
  }

  return uniqueTargets?.size ?? count;
}
