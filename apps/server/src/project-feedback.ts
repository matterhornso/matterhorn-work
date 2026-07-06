import { dirname, join } from "node:path";
import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { MatterhornProjectFeedbackEntry } from "@matterhorn-work/types/project-data-ledger";
import { ensureDir, exists } from "./utils.js";

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
  await ensureDir(dirname(path));
  await appendFile(path, JSON.stringify(entry) + "\n", "utf8");
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
