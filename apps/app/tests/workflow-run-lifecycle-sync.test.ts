import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const clientSource = readFileSync(new URL("../src/app/lib/matterhorn-server.ts", import.meta.url), "utf8");
const surfaceSource = readFileSync(
  new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url),
  "utf8",
);

describe("workflow run lifecycle sync", () => {
  test("exposes waiting and completion mutations on the backend client", () => {
    expect(clientSource).toContain("setWorkflowRunWaiting:");
    expect(clientSource).toContain("/waiting`");
    expect(clientSource).toContain("completeWorkflowRun:");
    expect(clientSource).toContain("/complete`");
  });

  test("reconciles a linked workflow run with visible chat state", () => {
    expect(surfaceSource).toContain('["session-workflow-run", props.workspaceId, props.sessionId]');
    expect(surfaceSource).toContain("props.activeQuestion || props.activePermission");
    expect(surfaceSource).toContain("props.client.setWorkflowRunWaiting");
    expect(surfaceSource).toContain("props.client.startWorkflowRun");
    expect(surfaceSource).toContain("props.client.completeWorkflowRun");
    expect(surfaceSource).toContain("hasVisibleAssistantMessage");
    expect(surfaceSource).toContain("linkedWorkflowRun?.agentId ?? matterhornDeskAgentIdForDesk(activeDeskMode)");
  });
});
