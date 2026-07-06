/**
 * task-events.ts
 *
 * Persistent JSONL storage for Matterhorn task / workflow run events.
 * Mirrors the audit.ts pattern: one JSONL file per workspace under
 * ~/.openwork/openwork-server/task-events/<workspaceId>.jsonl
 *
 * Design principles:
 * - Events are append-only; the server writes one event per tool call,
 *   artifact save, or lifecycle transition (staged / started / waiting /
 *   completed / failed / cancelled).
 * - The client can only READ events; writing is server-internal.
 * - Never log raw secrets, wallet keys, API tokens, or signature material.
 * - Consumer-facing "outcomeSummary" and "detail" fields are scrubbed by the
 *   caller before they reach this module.
 */

import { join } from "node:path";
import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";

import type { MatterhornTaskEvent, MatterhornTaskRun } from "./types.js";
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

function taskEventsDir(): string {
  return join(resolveOpenworkDataDir(), "task-events");
}

export function taskEventsPath(workspaceId: string): string {
  return join(taskEventsDir(), `${workspaceId}.jsonl`);
}

/**
 * Append a task event to the workspace's JSONL log.
 * The caller is responsible for scrubbing `detail` / `outcomeSummary` of
 * any secrets before passing them here.
 */
export async function recordTaskEvent(event: MatterhornTaskEvent): Promise<void> {
  const workspaceId = event.workspaceId?.trim();
  if (!workspaceId) return;
  const dir = taskEventsDir();
  const path = taskEventsPath(workspaceId);
  await ensureDir(dir);
  await appendFile(path, JSON.stringify(event) + "\n", "utf8");
}

/**
 * Read the most recent N task events for a workspace, newest first.
 * Returns an empty array if no log file exists yet.
 */
export async function readTaskEvents(
  workspaceId: string,
  limit = 50,
): Promise<MatterhornTaskEvent[]> {
  const path = taskEventsPath(workspaceId);
  if (!(await exists(path))) return [];
  const content = await readFile(path, "utf8");
  const rawLines = content.trim().split("\n").filter(Boolean);
  if (!rawLines.length) return [];
  // Always read the last `limit` lines and return in reverse (newest first)
  const slice = rawLines.slice(-Math.max(1, limit));
  const events: MatterhornTaskEvent[] = [];
  for (let i = slice.length - 1; i >= 0; i--) {
    try {
      events.push(JSON.parse(slice[i]) as MatterhornTaskEvent);
    } catch {
      // ignore malformed lines
    }
  }
  return events;
}

/**
 * Derive a compact TaskRun summary from the last event for each taskId.
 * This collapses the full event log into the latest state of each run,
 * suitable for the Profile/Settings task history list.
 */
export async function deriveTaskRuns(
  workspaceId: string,
  limit = 20,
): Promise<MatterhornTaskRun[]> {
  const events = await readTaskEvents(workspaceId, limit * 20);

  const byTask = new Map<string, MatterhornTaskEvent[]>();
  for (const ev of events) {
    const list = byTask.get(ev.taskId) ?? [];
    list.push(ev);
    byTask.set(ev.taskId, list);
  }

  const runs: MatterhornTaskRun[] = [];
  for (const [, taskEvents] of byTask) {
    taskEvents.sort((a, b) => b.timestamp - a.timestamp);
    const latest = taskEvents[0];
    if (!latest) continue;
    const terminal = latest.type === "completed"
      ? "completed"
      : latest.type === "failed"
        ? "failed"
        : latest.type === "cancelled"
          ? "cancelled"
          : "running";

    const oldest = taskEvents[taskEvents.length - 1] ?? latest;
    const artifactPaths = taskEvents
      .filter((e) => e.type === "artifact_saved" && e.artifactPath)
      .map((e) => e.artifactPath!);
    const [desk = "unknown", sessionSlug = latest.taskId] = (latest.detail ?? "").split(";");

    runs.push({
      taskId: latest.taskId,
      workspaceId: latest.workspaceId,
      desk,
      sessionSlug,
      status: terminal,
      createdAt: oldest.timestamp,
      updatedAt: latest.timestamp,
      outcomeSummary: latest.summary,
      artifactPaths,
    });
  }

  // Sort newest-first, cap at limit
  return runs
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
