import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MatterhornWorkflowRun,
  MatterhornWorkflowRunEvent,
  MatterhornWorkflowRunEventType,
  MatterhornWorkflowRunListItem,
  MatterhornWorkflowRunStageInput,
  MatterhornWorkflowRunStatus,
} from "@matterhorn-work/types/workflow-runs";
import {
  createWorkflowRunEventId,
  createWorkflowRunId,
  makeOutputBasePath,
  normalizeSessionSlug,
  canTransitionTo,
} from "./workflow-run-types.js";
import { sanitizeWorkflowRunEventPayload } from "./workflow-run-redaction.js";
import { ensureDir, exists } from "./utils.js";

export type WorkflowRunEngineOptions = {
  persistenceRoot?: string;
  maxRunsPerWorkspace?: number;
  maxEventsPerRun?: number;
  onEvent?: (run: MatterhornWorkflowRun, event: MatterhornWorkflowRunEvent) => void | Promise<void>;
};

export type WorkflowRunFilters = {
  workspaceId?: string;
  sessionId?: string;
  deskId?: string;
  status?: MatterhornWorkflowRunStatus;
  limit?: number;
};

function runToListItem(run: MatterhornWorkflowRun): MatterhornWorkflowRunListItem {
  return {
    workflowRunId: run.workflowRunId,
    workspaceId: run.workspaceId,
    sessionId: run.sessionId,
    deskId: run.deskId,
    agentId: run.agentId,
    workflowId: run.workflowId,
    status: run.status,
    visibleUserIntent: run.visibleUserIntent,
    outputBasePath: run.outputBasePath,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export class WorkflowRunEngine {
  private runs = new Map<string, MatterhornWorkflowRun>();
  private runsByWorkspace = new Map<string, Set<string>>();
  private persistenceRoot?: string;
  private maxRunsPerWorkspace: number;
  private maxEventsPerRun: number;
  private onEvent?: (run: MatterhornWorkflowRun, event: MatterhornWorkflowRunEvent) => void | Promise<void>;

  constructor(options: WorkflowRunEngineOptions = {}) {
    this.persistenceRoot = options.persistenceRoot;
    this.maxRunsPerWorkspace = options.maxRunsPerWorkspace ?? 256;
    this.maxEventsPerRun = options.maxEventsPerRun ?? 500;
    this.onEvent = options.onEvent;
  }

  private runDir(workspaceId: string): string | undefined {
    if (!this.persistenceRoot) return undefined;
    return join(this.persistenceRoot, ".matterhorn-work", "task-logs", workspaceId);
  }

  private runFilePath(workspaceId: string, runId: string): string | undefined {
    const dir = this.runDir(workspaceId);
    if (!dir) return undefined;
    return join(dir, `${runId}.jsonl`);
  }

  private async appendEvent(run: MatterhornWorkflowRun, event: MatterhornWorkflowRunEvent): Promise<void> {
    const path = this.runFilePath(run.workspaceId, run.workflowRunId);
    if (!path) return;
    try {
      await ensureDir(this.runDir(run.workspaceId)!);
      const line = JSON.stringify(event) + "\n";
      await appendFile(path, line, "utf8");
    } catch {
      // Fall back to memory-only if persistence fails.
    }
  }

  private async writeRunHeader(run: MatterhornWorkflowRun): Promise<void> {
    const path = this.runFilePath(run.workspaceId, run.workflowRunId);
    if (!path) return;
    try {
      await ensureDir(this.runDir(run.workspaceId)!);
      const header = {
        ...runToListItem(run),
        hiddenAgentInstructions: run.hiddenAgentInstructions,
        workflowManifestRef: run.workflowManifestRef,
      };
      await writeFile(path, JSON.stringify(header) + "\n", "utf8");
    } catch {
      // Fall back to memory-only if persistence fails.
    }
  }

  async stageRun(input: MatterhornWorkflowRunStageInput & {
    agentId: string;
    workflowId: string;
    outputBasePath?: string;
    hiddenAgentInstructions?: string;
    workflowManifestRef?: string;
  }): Promise<MatterhornWorkflowRun> {
    const now = Date.now();
    const runId = createWorkflowRunId();
    const sessionSlug = normalizeSessionSlug(input.sessionId);
    const outputBasePath = input.outputBasePath ?? makeOutputBasePath(input.deskId, sessionSlug);

    const run: MatterhornWorkflowRun = {
      workflowRunId: runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      deskId: input.deskId,
      agentId: input.agentId,
      workflowId: input.workflowId,
      actionId: input.actionId,
      stageId: input.stageId,
      visibleUserIntent: input.visibleUserIntent,
      hiddenAgentInstructions: input.hiddenAgentInstructions,
      workflowManifestRef: input.workflowManifestRef,
      status: "staged",
      outputBasePath,
      createdAt: now,
      updatedAt: now,
      events: [],
    };

    this.runs.set(runId, run);
    const workspaceSet = this.runsByWorkspace.get(run.workspaceId) ?? new Set();
    workspaceSet.add(runId);
    this.runsByWorkspace.set(run.workspaceId, workspaceSet);

    this.pruneWorkspaceRuns(run.workspaceId);

    await this.writeRunHeader(run);
    await this.addEvent(runId, {
      type: "workflow.staged",
      payload: { visibleUserIntent: run.visibleUserIntent },
    });

    return run;
  }

  async startRun(runId: string): Promise<MatterhornWorkflowRun> {
    return this.transitionStatus(runId, "running", "workflow.started");
  }

  async advanceStage(runId: string, stageId: string, actionId?: string): Promise<MatterhornWorkflowRun> {
    const run = this.requireRun(runId);
    run.stageId = stageId;
    if (actionId) run.actionId = actionId;
    run.updatedAt = Date.now();
    await this.addEvent(runId, { type: "workflow.stage_started", stageId, actionId });
    return run;
  }

  async recordToolCall(runId: string, payload: unknown): Promise<MatterhornWorkflowRun> {
    await this.addEvent(runId, { type: "workflow.tool_called", payload });
    return this.requireRun(runId);
  }

  async recordArtifactSaved(runId: string, path: string): Promise<MatterhornWorkflowRun> {
    await this.addEvent(runId, { type: "workflow.artifact_saved", payload: { path } });
    return this.requireRun(runId);
  }

  async recordWaitingForUser(runId: string, reason?: string): Promise<MatterhornWorkflowRun> {
    return this.transitionStatus(
      runId,
      "waiting",
      "workflow.waiting_for_user",
      reason ? { reason } : undefined,
    );
  }

  async completeRun(runId: string): Promise<MatterhornWorkflowRun> {
    return this.transitionStatus(runId, "completed", "workflow.completed");
  }

  async failRun(runId: string, error: string): Promise<MatterhornWorkflowRun> {
    return this.transitionStatus(runId, "failed", "workflow.failed", { error });
  }

  async cancelRun(runId: string): Promise<MatterhornWorkflowRun> {
    return this.transitionStatus(runId, "cancelled", "workflow.cancelled");
  }

  getRun(runId: string): MatterhornWorkflowRun | null {
    return this.runs.get(runId) ?? null;
  }

  listRuns(filters: WorkflowRunFilters = {}): MatterhornWorkflowRunListItem[] {
    let runs = Array.from(this.runs.values());
    if (filters.workspaceId) {
      runs = runs.filter((run) => run.workspaceId === filters.workspaceId);
    }
    if (filters.sessionId) {
      runs = runs.filter((run) => run.sessionId === filters.sessionId);
    }
    if (filters.deskId) {
      runs = runs.filter((run) => run.deskId === filters.deskId);
    }
    if (filters.status) {
      runs = runs.filter((run) => run.status === filters.status);
    }
    runs.sort((a, b) => b.updatedAt - a.updatedAt);
    if (filters.limit && filters.limit > 0) {
      runs = runs.slice(0, filters.limit);
    }
    return runs.map(runToListItem);
  }

  listEvents(runId: string): MatterhornWorkflowRunEvent[] {
    const run = this.runs.get(runId);
    return run ? [...run.events] : [];
  }

  private requireRun(runId: string): MatterhornWorkflowRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`workflow_run_not_found: ${runId}`);
    }
    return run;
  }

  private async transitionStatus(
    runId: string,
    nextStatus: MatterhornWorkflowRunStatus,
    eventType: MatterhornWorkflowRunEventType,
    payload?: Record<string, unknown>,
  ): Promise<MatterhornWorkflowRun> {
    const run = this.requireRun(runId);
    if (!canTransitionTo(run.status, nextStatus)) {
      throw new Error(
        `invalid_workflow_run_transition: cannot move from ${run.status} to ${nextStatus}`,
      );
    }
    run.status = nextStatus;
    run.updatedAt = Date.now();
    await this.addEvent(runId, { type: eventType, payload });
    return run;
  }

  private async addEvent(
    runId: string,
    partial: {
      type: MatterhornWorkflowRunEventType;
      stageId?: string;
      actionId?: string;
      payload?: unknown;
    },
  ): Promise<MatterhornWorkflowRunEvent> {
    const run = this.requireRun(runId);
    const event: MatterhornWorkflowRunEvent = {
      eventId: createWorkflowRunEventId(),
      workflowRunId: runId,
      type: partial.type,
      timestamp: Date.now(),
      stageId: partial.stageId ?? run.stageId,
      actionId: partial.actionId ?? run.actionId,
    };

    if (partial.payload !== undefined) {
      const sanitized = sanitizeWorkflowRunEventPayload(partial.payload);
      event.payload = sanitized;
      event.redacted = sanitized !== partial.payload;
    }

    run.events.push(event);
    if (run.events.length > this.maxEventsPerRun) {
      run.events.splice(0, run.events.length - this.maxEventsPerRun);
    }
    run.updatedAt = event.timestamp;

    await this.appendEvent(run, event);
    if (this.onEvent) {
      try {
        await this.onEvent(run, event);
      } catch {
        // Workflow execution should not fail because the auxiliary task log is unavailable.
      }
    }
    return event;
  }

  private pruneWorkspaceRuns(workspaceId: string): void {
    const set = this.runsByWorkspace.get(workspaceId);
    if (!set) return;
    if (set.size <= this.maxRunsPerWorkspace) return;

    const runIds = Array.from(set);
    const runs = runIds
      .map((id) => this.runs.get(id))
      .filter((run): run is MatterhornWorkflowRun => !!run);
    runs.sort((a, b) => a.updatedAt - b.updatedAt);
    const excess = runs.slice(0, runs.length - this.maxRunsPerWorkspace);
    for (const run of excess) {
      this.runs.delete(run.workflowRunId);
      set.delete(run.workflowRunId);
    }
  }

  async loadFromDisk(workspaceId: string): Promise<void> {
    const dir = this.runDir(workspaceId);
    if (!dir) return;
    if (!(await exists(dir))) return;

    // Basic JSONL replay is optional; for now we keep memory as source of truth
    // and use disk as an append-only durable log. This method is a hook for
    // future startup replay.
  }
}
