import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkflowRunEngine } from "./workflow-runs.js";
import { redactWorkflowRunEventPayload } from "./workflow-run-redaction.js";

describe("WorkflowRunEngine", () => {
  test("stages a run with the required contract fields", async () => {
    const engine = new WorkflowRunEngine();
    const run = await engine.stageRun({
      workspaceId: "ws_1",
      sessionId: "sess_abc",
      deskId: "wellness",
      agentId: "matterhorn-longevity",
      workflowId: "wellness_creator_workflow",
      visibleUserIntent: "Build a Longevity program for my clients",
    });

    expect(run.workflowRunId).toStartWith("run_");
    expect(run.workspaceId).toBe("ws_1");
    expect(run.sessionId).toBe("sess_abc");
    expect(run.deskId).toBe("wellness");
    expect(run.agentId).toBe("matterhorn-longevity");
    expect(run.workflowId).toBe("wellness_creator_workflow");
    expect(run.status).toBe("staged");
    expect(run.outputBasePath).toBe("outputs/wellness/sess_abc/");
    expect(run.events[0]?.type).toBe("workflow.staged");
  });

  test("starts a staged run and emits workflow.started", async () => {
    const engine = new WorkflowRunEngine();
    const staged = await engine.stageRun({
      workspaceId: "ws_1",
      sessionId: "sess_abc",
      deskId: "wellness",
      agentId: "matterhorn-longevity",
      workflowId: "wellness_creator_workflow",
      visibleUserIntent: "Build a Longevity program",
    });

    const run = await engine.startRun(staged.workflowRunId);
    expect(run.status).toBe("running");
    expect(run.events.at(-1)?.type).toBe("workflow.started");
  });

  test("advances stages and records tool calls", async () => {
    const engine = new WorkflowRunEngine();
    const staged = await engine.stageRun({
      workspaceId: "ws_1",
      sessionId: "sess_abc",
      deskId: "wellness",
      agentId: "matterhorn-longevity",
      workflowId: "wellness_creator_workflow",
      visibleUserIntent: "Build a Longevity program",
    });

    await engine.startRun(staged.workflowRunId);
    await engine.advanceStage(staged.workflowRunId, "stage_1", "intake");
    await engine.recordToolCall(staged.workflowRunId, { tool: "planner", input: { audience: "beginners" } });
    await engine.recordArtifactSaved(staged.workflowRunId, "outputs/wellness/sess_abc/intake.md");
    const run = await engine.completeRun(staged.workflowRunId);

    expect(run.status).toBe("completed");
    expect(run.events.some((event) => event.type === "workflow.stage_started")).toBe(true);
    expect(run.events.some((event) => event.type === "workflow.tool_called")).toBe(true);
    expect(run.events.some((event) => event.type === "workflow.artifact_saved")).toBe(true);
    expect(run.events.at(-1)?.type).toBe("workflow.completed");
  });

  test("lists runs with filters", async () => {
    const engine = new WorkflowRunEngine();
    await engine.stageRun({
      workspaceId: "ws_a",
      sessionId: "sess_1",
      deskId: "wellness",
      agentId: "matterhorn-longevity",
      workflowId: "wellness_creator_workflow",
      visibleUserIntent: "A",
    });
    await engine.stageRun({
      workspaceId: "ws_b",
      sessionId: "sess_2",
      deskId: "bittensor",
      agentId: "matterhorn-bittensor",
      workflowId: "bittensor_operator_workflow",
      visibleUserIntent: "B",
    });

    expect(engine.listRuns({ workspaceId: "ws_a" }).length).toBe(1);
    expect(engine.listRuns({ deskId: "bittensor" }).length).toBe(1);
    expect(engine.listRuns({ limit: 1 }).length).toBe(1);
  });

  test("persists events to disk when persistenceRoot is provided", async () => {
    const dir = mkdtempSync(join(tmpdir(), "matterhorn-workflow-runs-"));
    const engine = new WorkflowRunEngine({ persistenceRoot: dir });
    const run = await engine.stageRun({
      workspaceId: "ws_1",
      sessionId: "sess_abc",
      deskId: "wellness",
      agentId: "matterhorn-longevity",
      workflowId: "wellness_creator_workflow",
      visibleUserIntent: "Build a Longevity program",
    });
    await engine.startRun(run.workflowRunId);

    const filePath = join(dir, ".matterhorn-work", "task-logs", "ws_1", `${run.workflowRunId}.jsonl`);
    const content = await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
    expect(content).toContain("workflow.staged");
    expect(content).toContain("workflow.started");

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("redactWorkflowRunEventPayload", () => {
  test("redacts secret-shaped fields", () => {
    const result = redactWorkflowRunEventPayload({
      tool: "swap",
      privateKey: "0xdeadbeef",
      apiSecret: "shhh",
      config: {
        apiKey: "abc",
        nested: {
          seedPhrase: "word word word",
        },
      },
      safe: "visible",
    });

    expect(result.redacted).toBe(true);
    expect(result.value).toEqual({
      tool: "swap",
      privateKey: "[REDACTED]",
      apiSecret: "[REDACTED]",
      config: {
        apiKey: "[REDACTED]",
        nested: {
          seedPhrase: "[REDACTED]",
        },
      },
      safe: "visible",
    });
  });

  test("rejects medical or clinical details", () => {
    expect(() =>
      redactWorkflowRunEventPayload({
        diagnosis: "Type 2 diabetes",
      })
    ).toThrow("workflow_run_event_rejected");
  });

  test("leaves plain strings and numbers untouched", () => {
    const result = redactWorkflowRunEventPayload({ count: 3, note: "hello" });
    expect(result.redacted).toBe(false);
    expect(result.value).toEqual({ count: 3, note: "hello" });
  });
});
