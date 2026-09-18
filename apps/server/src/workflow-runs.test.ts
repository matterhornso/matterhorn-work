import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkflowRunEngine } from "./workflow-runs.js";
import { redactWorkflowRunEventPayload } from "./workflow-run-redaction.js";

describe("WorkflowRunEngine", () => {
  test("sanitizes intent and failure logs before persistence and on reload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "matterhorn-workflow-redaction-"));
    try {
      const engine = new WorkflowRunEngine({ persistenceRoot: dir });
      const run = await engine.stageRun({
        workspaceId: "ws_qa", sessionId: "sess_qa", deskId: "bittensor",
        agentId: "matterhorn-bittensor", workflowId: "bittensor_operator_workflow",
        visibleUserIntent: "Authorization: Bearer synthetic-qa-intent",
      });
      expect(run.visibleUserIntent).toBe("[REDACTED]");
      expect(run.events[0]?.redacted).toBe(true);
      await engine.startRun(run.workflowRunId);
      await engine.recordToolCall(run.workflowRunId, { note: "Public market lookup" });
      expect(run.events.at(-1)?.redacted).toBe(false);
      await engine.failRun(run.workflowRunId, "Authorization: Bearer synthetic-qa-failure");
      expect(run.events.at(-1)?.redacted).toBe(true);
      const path = join(dir, ".matterhorn-work", "task-logs", "ws_qa", `${run.workflowRunId}.jsonl`);
      const persisted = readFileSync(path, "utf8");
      expect(persisted.includes("synthetic-qa-")).toBe(false);
      expect(persisted).toContain("Public market lookup");

      // Simulate a legacy file without printing its synthetic credential-shaped data.
      writeFileSync(path, persisted.replaceAll("[REDACTED]", "Bearer synthetic-qa-legacy"));
      const reloaded = new WorkflowRunEngine({ persistenceRoot: dir });
      await reloaded.loadFromDisk("ws_qa");
      expect(reloaded.getRun(run.workflowRunId)?.visibleUserIntent).toBe("[REDACTED]");
      expect(JSON.stringify(reloaded.getRun(run.workflowRunId)).includes("synthetic-qa-")).toBe(false);
      expect(reloaded.listEvents(run.workflowRunId).at(-1)?.redacted).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

    const reloaded = new WorkflowRunEngine({ persistenceRoot: dir });
    await reloaded.loadFromDisk("ws_1");
    expect(reloaded.getRun(run.workflowRunId)).toMatchObject({
      workflowRunId: run.workflowRunId,
      workspaceId: "ws_1",
      sessionId: "sess_abc",
      status: "running",
    });
    expect(reloaded.listEvents(run.workflowRunId).map((event) => event.type)).toEqual([
      "workflow.staged",
      "workflow.started",
    ]);

    await reloaded.recordWaitingForUser(run.workflowRunId, "Choose a program goal");
    expect(reloaded.getRun(run.workflowRunId)?.status).toBe("waiting");

    const loadedAgain = new WorkflowRunEngine({ persistenceRoot: dir });
    await loadedAgain.loadFromDisk("ws_1");
    expect(loadedAgain.getRun(run.workflowRunId)?.status).toBe("waiting");
    expect(loadedAgain.listRuns({ workspaceId: "ws_1" })).toHaveLength(1);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("redactWorkflowRunEventPayload", () => {
  test("rejects excessive nesting, oversized node counts and cycles with a bounded error", () => {
    let deep: unknown = "public context";
    for (let index = 0; index < 200; index += 1) deep = { nested: deep };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const payload of [deep, Array.from({ length: 5000 }, () => "public"), cyclic]) {
      expect(() => redactWorkflowRunEventPayload(payload)).toThrow("workflow_run_event_rejected");
    }
  });

  test("redacts credential-shaped text in ordinary fields and arrays", () => {
    const result = redactWorkflowRunEventPayload({
      error: "Upstream rejected Authorization: Bearer synthetic-qa-credential",
      messages: ["password=synthetic-qa-password", `sk-${"q".repeat(24)}`],
      safe: "Market data unavailable",
      transactionHash: `0x${"a".repeat(64)}`,
    });
    expect(result.redacted).toBe(true);
    expect(result.value).toEqual({
      error: "[REDACTED]",
      messages: ["[REDACTED]", "[REDACTED]"],
      safe: "Market data unavailable",
      transactionHash: `0x${"a".repeat(64)}`,
    });
  });

  test("redacts authorization and access-token fields", () => {
    expect(redactWorkflowRunEventPayload({
      authorization: "synthetic-qa-credential",
      accessToken: "synthetic-qa-credential",
      cookie: "synthetic-qa-cookie",
    }).value).toEqual({ authorization: "[REDACTED]", accessToken: "[REDACTED]", cookie: "[REDACTED]" });
  });

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
