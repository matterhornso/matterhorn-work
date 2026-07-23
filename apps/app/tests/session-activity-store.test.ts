import { describe, expect, test } from "bun:test";

import type { MatterhornSessionSnapshot } from "../src/app/lib/matterhorn-server";
import { useSessionActivityStore } from "../src/react-app/domains/session/status/session-activity-store";
import { latestSessionSnapshotFailure } from "../src/react-app/domains/session/surface/session-surface";

describe("session activity timing", () => {
  test("keeps one start time through a run and resets it for the next run", async () => {
    const workspaceId = "ws_activity_timing";
    const sessionId = "ses_activity_timing";
    const activity = useSessionActivityStore.getState();

    activity.startOptimisticRun(workspaceId, sessionId, { title: "Test task" });
    const firstStartedAt = useSessionActivityStore.getState().recordsByWorkspaceId[workspaceId]?.[sessionId]?.runStartedAt;

    expect(firstStartedAt).toBeNumber();

    activity.markAssistantOutput(workspaceId, sessionId, undefined, { allowUnknownMessageRole: true });
    expect(useSessionActivityStore.getState().recordsByWorkspaceId[workspaceId]?.[sessionId]?.runStartedAt).toBe(firstStartedAt);

    activity.setRunStatus(workspaceId, sessionId, { type: "idle" });
    expect(useSessionActivityStore.getState().recordsByWorkspaceId[workspaceId]?.[sessionId]?.runStartedAt).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 2));
    activity.startOptimisticRun(workspaceId, sessionId, { title: "Next task" });
    const secondStartedAt = useSessionActivityStore.getState().recordsByWorkspaceId[workspaceId]?.[sessionId]?.runStartedAt;

    expect(secondStartedAt).toBeGreaterThan(firstStartedAt ?? 0);
  });

  test("treats an empty model abort as a neutral cancellation with the prompt available", () => {
    const snapshot = {
      messages: [
        {
          info: { id: "user-1", role: "user", time: { created: 100 } },
          parts: [{ type: "text", text: "Find useful subnets" }],
        },
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            time: { created: 110, completed: 130 },
            error: { name: "MessageAbortedError", data: { message: "Aborted" } },
          },
          parts: [],
        },
      ],
    } as unknown as MatterhornSessionSnapshot;

    expect(latestSessionSnapshotFailure(snapshot)).toEqual({
      id: "assistant-1",
      name: "MessageAbortedError",
      completedAt: 130,
      retryMessage: "Find useful subnets",
      error: {
        kind: "cancelled",
        message: "Generation stopped. Your prompt is still available to edit or send again.",
      },
    });
  });

  test("ignores an older failure after a later assistant response succeeds", () => {
    const snapshot = {
      messages: [
        {
          info: { id: "assistant-error", role: "assistant", time: { created: 100, completed: 110 }, error: { name: "MessageAbortedError" } },
          parts: [],
        },
        {
          info: { id: "assistant-success", role: "assistant", time: { created: 120, completed: 140 } },
          parts: [{ type: "text", text: "Done" }],
        },
      ],
    } as unknown as MatterhornSessionSnapshot;

    expect(latestSessionSnapshotFailure(snapshot)).toBeNull();
  });
});
