import { dirname, join } from "node:path";
import { createReadStream } from "node:fs";
import { constants } from "node:fs";
import { lstat, open, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
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

const auditMutations = new Map<string, Promise<void>>();

async function withAuditMutation<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = auditMutations.get(path) ?? Promise.resolve();
  const result = previous.then(task);
  const settled = result.then(() => undefined, () => undefined);
  auditMutations.set(path, settled);
  try {
    return await result;
  } finally {
    if (auditMutations.get(path) === settled) auditMutations.delete(path);
  }
}

function isMemoryContentAudit(action: unknown): boolean {
  return action === "memory.capture" || action === "memory.record.update";
}

async function assertAuditLocation(root: string, parts: string[]): Promise<void> {
  let current = root;
  for (const part of parts) {
    if (part === ".." || part.includes("/") || part.includes("\\")) throw new Error("Invalid audit storage path.");
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("Audit storage must not use symbolic links.");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}

export async function recordAudit(workspaceRoot: string, entry: AuditEntry): Promise<void> {
  const workspaceId = entry.workspaceId?.trim();
  const path = workspaceId ? auditLogPath(workspaceId) : legacyAuditLogPath(workspaceRoot);
  await withAuditMutation(path, async () => {
    await assertAuditLocation(workspaceId ? resolveOpenworkDataDir() : workspaceRoot,
      workspaceId ? ["audit", `${workspaceId}.jsonl`] : [".opencode", "openwork", "audit.jsonl"]);
    await ensureDir(dirname(path));
    const stored = isMemoryContentAudit(entry.action)
      ? { ...entry, summary: entry.action === "memory.capture" ? "Captured memory" : "Updated memory", metadata: undefined }
      : entry;
    const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try {
      await file.chmod(0o600);
      await file.writeFile(`${JSON.stringify(stored)}\n`, "utf8");
    } finally {
      await file.close();
    }
  });
}

/** Remove historical memory content while retaining who/when/action/target audit evidence. */
export async function redactMemoryAuditContent(workspaceRoot: string, workspaceId: string, memoryId: string): Promise<void> {
  await processMemoryAuditContent(workspaceRoot, workspaceId, new Set([memoryId]), true);
}

/** Offline cleanup preflight. Reads both log locations without changing files or modes. */
export async function inspectMemoryAuditCleanup(workspaceRoot: string, workspaceId: string, memoryIds: readonly string[]) {
  return processMemoryAuditContent(workspaceRoot, workspaceId, new Set(memoryIds), false);
}

export async function redactMemoryAuditBatch(workspaceRoot: string, workspaceId: string, memoryIds: readonly string[]) {
  // Validate both logs before rewriting either one. The offline caller must stop all writers.
  await inspectMemoryAuditCleanup(workspaceRoot, workspaceId, memoryIds);
  await processMemoryAuditContent(workspaceRoot, workspaceId, new Set(memoryIds), true);
}

async function processMemoryAuditContent(workspaceRoot: string, workspaceId: string, memoryIds: ReadonlySet<string>, apply: boolean) {
  const fingerprint = createHash("sha256");
  let matchingEvents = 0;
  for (const path of [auditLogPath(workspaceId), legacyAuditLogPath(workspaceRoot)]) {
    fingerprint.update(JSON.stringify([path]));
    await withAuditMutation(path, async () => {
      const primary = path === auditLogPath(workspaceId);
      await assertAuditLocation(primary ? resolveOpenworkDataDir() : workspaceRoot,
        primary ? ["audit", `${workspaceId}.jsonl`] : [".opencode", "openwork", "audit.jsonl"]);
      const input = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      });
      if (!input) {
        fingerprint.update("missing");
        return;
      }
      fingerprint.update("present");
      const temp = `${path}.${randomUUID()}.tmp`;
      let created = false;
      try {
        const output = apply ? await open(temp, "wx", 0o600) : null;
        created = output !== null;
        try {
          const lines = createInterface({ input: input.createReadStream({ autoClose: false }), crlfDelay: Infinity });
          try {
            for await (const line of lines) {
              fingerprint.update(JSON.stringify([line]));
              if (!line.trim()) continue;
              let parsed: unknown;
              try {
                parsed = JSON.parse(line);
              } catch {
                throw new Error("Cannot redact a malformed audit log. Repair it before deleting memory.");
              }
              let serialized = line;
              if (typeof parsed === "object" && parsed !== null &&
                "action" in parsed && isMemoryContentAudit(parsed.action) &&
                "target" in parsed && typeof parsed.target === "string" && memoryIds.has(parsed.target) &&
                (("workspaceId" in parsed && parsed.workspaceId === workspaceId) ||
                  (!primary && (!("workspaceId" in parsed) || parsed.workspaceId === "")))) {
                serialized = JSON.stringify({ ...parsed, summary: "Memory record content removed", metadata: undefined });
                matchingEvents++;
              }
              await output?.writeFile(`${serialized}\n`, "utf8");
            }
          } finally {
            lines.close();
          }
          await output?.sync();
        } finally {
          await output?.close();
        }
        if (output) await rename(temp, path);
      } finally {
        await input.close();
        if (created) await rm(temp, { force: true });
      }
    });
  }
  return { fingerprint: fingerprint.digest("hex"), matchingEvents };
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
