import { describe, expect, test } from "bun:test";
import type { MatterhornProjectEvidenceEvent } from "@matterhorn-work/types/project-evidence";

import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";
import {
  mergeOpenTargetsWithWorkflowOutputReceipts,
  openTargetFromWorkflowOutputReceipt,
  workflowOutputReceiptsFromEvidence,
} from "../src/react-app/domains/session/artifacts/output-receipts";

function makeEvent(overrides: Partial<MatterhornProjectEvidenceEvent> = {}): MatterhornProjectEvidenceEvent {
  return {
    id: "evt_1",
    workspaceId: "ws_1",
    type: "task.output_saved",
    source: "task_events",
    timestamp: "2026-07-05T10:00:00.000Z",
    title: "Saved output",
    summary: "longevity;session-alpha",
    desk: "longevity",
    sessionSlug: "session-alpha",
    taskId: "task_1",
    outputPath: "outputs/longevity/session-alpha/plan.md",
    artifactPaths: ["outputs/longevity/session-alpha/plan.md"],
    ...overrides,
  };
}

describe("workflow output receipts", () => {
  test("maps output-saved evidence into receipts", () => {
    const receipts = workflowOutputReceiptsFromEvidence([makeEvent()]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      outputPath: "outputs/longevity/session-alpha/plan.md",
      title: "Saved output",
      desk: "longevity",
      sessionSlug: "session-alpha",
      taskId: "task_1",
      status: "saved",
      artifactCount: 1,
    });
  });

  test("creates receipt targets that the Outputs panel can preview", () => {
    const [receipt] = workflowOutputReceiptsFromEvidence([makeEvent()]);
    const target = openTargetFromWorkflowOutputReceipt(receipt);

    expect(target).toMatchObject({
      id: "file:outputs/longevity/session-alpha/plan.md",
      kind: "file",
      value: "outputs/longevity/session-alpha/plan.md",
      name: "plan.md",
      preview: "markdown",
      exists: true,
      reason: "workflow output receipt",
    });
  });

  test("uses completed task runs as a fallback for outputs without saved events", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "run_1",
        type: "task.completed",
        source: "task_runs",
        title: "Workflow complete",
        outputPath: undefined,
        artifactPaths: [
          "outputs/longevity/session-alpha/plan.md",
          "outputs/longevity/session-alpha/checklist.json",
        ],
      }),
    ]);

    expect(receipts.map((receipt) => receipt.outputPath)).toEqual([
      "outputs/longevity/session-alpha/plan.md",
      "outputs/longevity/session-alpha/checklist.json",
    ]);
    expect(receipts.every((receipt) => receipt.status === "completed")).toBe(true);
  });

  test("prefers direct saved receipts over broader completion receipts for the same path", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "run_1",
        type: "task.completed",
        source: "task_runs",
        title: "Workflow complete",
        timestamp: "2026-07-05T10:05:00.000Z",
      }),
      makeEvent({
        id: "evt_saved",
        title: "Saved plan",
        timestamp: "2026-07-05T10:00:00.000Z",
      }),
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe("saved");
    expect(receipts[0].title).toBe("Saved plan");
  });

  test("treats newer output-deleted evidence as a tombstone", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "evt_saved",
        timestamp: "2026-07-05T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt_deleted",
        type: "task.output_deleted",
        title: "Output deleted",
        timestamp: "2026-07-05T10:05:00.000Z",
      }),
    ]);

    expect(receipts).toHaveLength(0);
  });

  test("keeps outputs saved after an older deletion event", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "evt_deleted",
        type: "task.output_deleted",
        title: "Output deleted",
        timestamp: "2026-07-05T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt_saved",
        timestamp: "2026-07-05T10:05:00.000Z",
      }),
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe("saved");
  });

  test("merges receipt targets with message-discovered outputs", () => {
    const existingTarget: OpenTarget = {
      id: "file:outputs/longevity/session-alpha/plan.md",
      kind: "file",
      value: "outputs/longevity/session-alpha/plan.md",
      name: "plan.md",
      preview: "markdown",
      confidence: 80,
      reason: "write tool output",
      exists: true,
    };
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent(),
      makeEvent({
        id: "evt_2",
        outputPath: "outputs/longevity/session-alpha/checklist.json",
        artifactPaths: ["outputs/longevity/session-alpha/checklist.json"],
      }),
    ]);

    const merged = mergeOpenTargetsWithWorkflowOutputReceipts([existingTarget], receipts);

    expect(merged.map((target) => target.value).sort()).toEqual([
      "outputs/longevity/session-alpha/checklist.json",
      "outputs/longevity/session-alpha/plan.md",
    ]);
    expect(merged.find((target) => target.value.endsWith("checklist.json"))?.preview).toBe("text");
    expect(merged.find((target) => target.value.endsWith("plan.md"))?.reason).toContain("workflow output receipt");
  });
});
