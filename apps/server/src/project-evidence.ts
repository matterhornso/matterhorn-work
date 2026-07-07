import type {
  MatterhornProjectEvidenceEvent,
  MatterhornProjectEvidenceListOptions,
  MatterhornProjectEvidenceSummary,
} from "@matterhorn-work/types/project-evidence";
import type { MatterhornNote } from "@matterhorn-work/types/notes";
import type { MatterhornTaskEvent, MatterhornTaskRun } from "./types.js";
import { MatterhornNotesStore } from "./notes.js";
import { deriveTaskRuns, readTaskEvents } from "./task-events.js";

type ProjectEvidenceBuildOptions = MatterhornProjectEvidenceListOptions & {
  workspaceId: string;
  workspaceRoot: string;
};

const TASK_EVENT_TYPE_MAP: Partial<Record<MatterhornTaskEvent["type"], MatterhornProjectEvidenceEvent["type"]>> = {
  workflow_started: "task.started",
  stage_started: "task.stage_started",
  artifact_saved: "task.output_saved",
  artifact_deleted: "task.output_deleted",
  image_generated: "image.generated",
  nft_minted: "nft.minted",
  nft_listed: "nft.listed",
  completed: "task.completed",
  failed: "task.failed",
  cancelled: "task.cancelled",
};

function isoTimestamp(value: string | number | undefined): string {
  if (typeof value === "string") return value;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : Date.now();
  return new Date(numeric).toISOString();
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function noteToEvents(note: MatterhornNote): MatterhornProjectEvidenceEvent[] {
  const base: MatterhornProjectEvidenceEvent = {
    id: `note:${note.id}`,
    workspaceId: note.workspaceId,
    type: "note.created",
    source: "notes",
    timestamp: note.createdAt,
    title: note.title || "Untitled note",
    summary: note.body ? note.body.slice(0, 180) : undefined,
    desk: note.desk,
    sessionId: note.sessionId,
    taskId: note.taskId,
    noteId: note.id,
    outputPath: note.outputPath,
    artifactPaths: note.outputPath ? [note.outputPath] : undefined,
    href: `/workspace/${encodeURIComponent(note.workspaceId)}/notes`,
  };
  const events = [base];
  if (note.memorySuggestionId || note.memorySuggestionStatus) {
    events.push({
      id: `note-memory:${note.id}:${note.memorySuggestionId ?? note.updatedAt}`,
      workspaceId: note.workspaceId,
      type: "note.memory_suggested",
      source: "memory",
      timestamp: note.updatedAt,
      title: "Memory review suggestion created",
      summary: note.title || "Untitled note",
      desk: note.desk,
      sessionId: note.sessionId,
      taskId: note.taskId,
      noteId: note.id,
      outputPath: note.outputPath,
      memorySuggestionId: note.memorySuggestionId,
      memorySuggestionStatus: note.memorySuggestionStatus,
      href: `/workspace/${encodeURIComponent(note.workspaceId)}/notes`,
    });
  }
  return events;
}

function taskEventToEvidence(event: MatterhornTaskEvent): MatterhornProjectEvidenceEvent | null {
  const type = TASK_EVENT_TYPE_MAP[event.type];
  if (!type) return null;
  const detailParts = (event.detail ?? "").split(";");
  const desk = detailParts[0] || undefined;
  const sessionSlug = detailParts[1] || undefined;
  return {
    id: `task-event:${event.id}`,
    workspaceId: event.workspaceId,
    type,
    source: "task_events",
    timestamp: isoTimestamp(event.timestamp),
    title: event.summary,
    summary: event.detail,
    desk,
    sessionSlug,
    taskId: event.taskId,
    outputPath: event.artifactPath,
    artifactPaths: event.artifactPath ? [event.artifactPath] : undefined,
    metadata: event.metadata,
  };
}

function taskRunToEvidence(run: MatterhornTaskRun): MatterhornProjectEvidenceEvent | null {
  if (run.status === "running") return null;
  const type: MatterhornProjectEvidenceEvent["type"] =
    run.status === "completed" ? "task.completed" : run.status === "failed" ? "task.failed" : "task.cancelled";
  return {
    id: `task-run:${run.taskId}`,
    workspaceId: run.workspaceId,
    type,
    source: "task_runs",
    timestamp: isoTimestamp(run.updatedAt),
    title: run.outcomeSummary || `${run.desk} task ${run.status}`,
    summary: `${run.desk} · ${run.sessionSlug}`,
    desk: run.desk,
    sessionSlug: run.sessionSlug,
    taskId: run.taskId,
    artifactPaths: run.artifactPaths,
    outputPath: run.artifactPaths[0],
  };
}

function matchesFilters(event: MatterhornProjectEvidenceEvent, options: MatterhornProjectEvidenceListOptions): boolean {
  if (options.desk && event.desk !== options.desk) return false;
  if (options.sessionId && event.sessionId !== options.sessionId && event.sessionSlug !== options.sessionId) return false;
  if (options.taskId && event.taskId !== options.taskId) return false;
  if (options.source && event.source !== options.source) return false;
  return true;
}

function eventOutputPaths(event: MatterhornProjectEvidenceEvent): string[] {
  return [
    ...(event.artifactPaths ?? []),
    ...(event.outputPath ? [event.outputPath] : []),
  ].map((path) => path.trim()).filter(Boolean);
}

function activeOutputCount(items: MatterhornProjectEvidenceEvent[]): number {
  const deletedAtByPath = new Map<string, number>();
  for (const item of items) {
    if (item.type !== "task.output_deleted") continue;
    const timestamp = Date.parse(item.timestamp);
    for (const path of eventOutputPaths(item)) {
      const key = path.toLowerCase();
      const current = deletedAtByPath.get(key) ?? 0;
      deletedAtByPath.set(key, Math.max(current, Number.isFinite(timestamp) ? timestamp : 0));
    }
  }

  const active = new Set<string>();
  for (const item of items) {
    if (item.type === "task.output_deleted") continue;
    const timestamp = Date.parse(item.timestamp);
    for (const path of eventOutputPaths(item)) {
      const key = path.toLowerCase();
      const deletedAt = deletedAtByPath.get(key);
      if (deletedAt !== undefined && (!Number.isFinite(timestamp) || timestamp <= deletedAt)) continue;
      active.add(path);
    }
  }
  return active.size;
}

function summarize(items: MatterhornProjectEvidenceEvent[]): MatterhornProjectEvidenceSummary {
  return {
    notes: items.filter((item) => item.source === "notes").length,
    memorySuggestions: items.filter((item) => item.source === "memory").length,
    taskEvents: items.filter((item) => item.source === "task_events").length,
    taskRuns: items.filter((item) => item.source === "task_runs").length,
    outputs: activeOutputCount(items),
    images: items.filter((item) => item.type.startsWith("image.")).length,
    nfts: items.filter((item) => item.type.startsWith("nft.")).length,
  };
}

export async function buildProjectEvidenceTimeline(options: ProjectEvidenceBuildOptions): Promise<{
  items: MatterhornProjectEvidenceEvent[];
  summary: MatterhornProjectEvidenceSummary;
}> {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 300));
  const noteStore = new MatterhornNotesStore({
    workspaceRoot: options.workspaceRoot,
    workspaceId: options.workspaceId,
  });

  const [notes, taskEvents, taskRuns] = await Promise.all([
    noteStore.listNotes({ limit: 300 }),
    readTaskEvents(options.workspaceId, 300),
    deriveTaskRuns(options.workspaceId, 100),
  ]);

  const items = [
    ...notes.flatMap(noteToEvents),
    ...taskEvents.map(taskEventToEvidence).filter((event): event is MatterhornProjectEvidenceEvent => !!event),
    ...taskRuns.map(taskRunToEvidence).filter((event): event is MatterhornProjectEvidenceEvent => !!event),
  ]
    .filter((event) => matchesFilters(event, options))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return {
    items: items.slice(0, limit).map((item) => ({
      ...item,
      title: item.outputPath && item.type === "task.output_saved"
        ? `${item.title}: ${basename(item.outputPath)}`
        : item.title,
    })),
    summary: summarize(items),
  };
}
