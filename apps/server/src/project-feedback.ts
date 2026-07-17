import { dirname, join } from "node:path";
import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { MatterhornProjectFeedbackEntry } from "@matterhorn-work/types/project-data-ledger";
import { atomicWriteTextFile } from "./atomic-file.js";
import { ensureDir, exists } from "./utils.js";

const feedbackMutationQueues = new Map<string, Promise<void>>();

async function withFeedbackMutationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = feedbackMutationQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const ticket = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => ticket);
  feedbackMutationQueues.set(key, queued);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (feedbackMutationQueues.get(key) === queued) feedbackMutationQueues.delete(key);
  }
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

export function projectFeedbackLogPath(workspaceId: string): string {
  return join(resolveOpenworkDataDir(), "feedback", `${workspaceId}.jsonl`);
}

export async function recordProjectFeedback(entry: MatterhornProjectFeedbackEntry): Promise<void> {
  const path = projectFeedbackLogPath(entry.workspaceId);
  await withFeedbackMutationLock(path, async () => {
    await ensureDir(dirname(path));
    await appendFile(path, JSON.stringify(entry) + "\n", { encoding: "utf8", mode: 0o600 });
  });
}

export async function readProjectFeedbackEntries(
  workspaceId: string,
  limit = 50,
): Promise<MatterhornProjectFeedbackEntry[]> {
  const path = projectFeedbackLogPath(workspaceId);
  if (!(await exists(path))) return [];
  const content = await readFile(path, "utf8");
  const rawLines = content.trim().split("\n").filter(Boolean);
  if (!rawLines.length) return [];
  const slice = rawLines.slice(-Math.max(1, limit));
  const entries: MatterhornProjectFeedbackEntry[] = [];
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    try {
      entries.push(JSON.parse(slice[i]) as MatterhornProjectFeedbackEntry);
    } catch {
      // Ignore malformed feedback lines.
    }
  }
  return entries;
}

export async function deleteProjectFeedbackEntry(
  workspaceId: string,
  feedbackId: string,
): Promise<MatterhornProjectFeedbackEntry | null> {
  const path = projectFeedbackLogPath(workspaceId);
  return withFeedbackMutationLock(path, async () => {
    if (!(await exists(path))) return null;
    const content = await readFile(path, "utf8");
    const rawLines = content.trim().split("\n").filter(Boolean);
    let deleted: MatterhornProjectFeedbackEntry | null = null;
    const kept: string[] = [];

    for (const line of rawLines) {
      try {
        const entry = JSON.parse(line) as MatterhornProjectFeedbackEntry;
        if (entry.id === feedbackId) {
          deleted = entry;
          continue;
        }
      } catch {
        // Keep malformed lines so deletion does not silently rewrite unrelated data.
      }
      kept.push(line);
    }

    if (!deleted) return null;
    await atomicWriteTextFile(path, kept.length ? `${kept.join("\n")}\n` : "", { mode: 0o600 });
    return deleted;
  });
}

export async function deleteAllProjectFeedbackEntries(workspaceId: string): Promise<number> {
  const path = projectFeedbackLogPath(workspaceId);
  return withFeedbackMutationLock(path, async () => {
    if (!(await exists(path))) return 0;
    const content = await readFile(path, "utf8");
    const rawLines = content.trim().split("\n").filter(Boolean);
    let deletedCount = 0;
    const malformed: string[] = [];

    for (const line of rawLines) {
      try {
        JSON.parse(line);
        deletedCount += 1;
      } catch {
        malformed.push(line);
      }
    }

    await atomicWriteTextFile(path, malformed.length ? `${malformed.join("\n")}\n` : "", { mode: 0o600 });
    return deletedCount;
  });
}
