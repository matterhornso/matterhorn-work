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

  test("does not let an initial idle snapshot erase a newly dispatched desk task", () => {
    const workspaceId = "ws_optimistic_dispatch";
    const sessionId = "ses_optimistic_dispatch";
    const activity = useSessionActivityStore.getState();

    activity.startOptimisticRun(workspaceId, sessionId, { title: "Explore subnets" });
    activity.setRunStatus(workspaceId, sessionId, { type: "idle" });

    expect(activity.getStatus(workspaceId, sessionId)).toBe("thinking");
    expect(useSessionActivityStore.getState().recordsByWorkspaceId[workspaceId]?.[sessionId]?.optimisticRunTitle).toBe(
      "Explore subnets",
    );

    activity.setRunStatus(workspaceId, sessionId, { type: "busy" });
    activity.setRunStatus(workspaceId, sessionId, { type: "idle" });

    expect(activity.getStatus(workspaceId, sessionId)).toBe("idle");
  });

  test("clears an optimistic run after assistant output completes without a busy event", () => {
    const workspaceId = "ws_optimistic_output";
    const sessionId = "ses_optimistic_output";
    const activity = useSessionActivityStore.getState();

    activity.startOptimisticRun(workspaceId, sessionId, { title: "Check market structure" });
    activity.markAssistantOutput(workspaceId, sessionId, undefined, { allowUnknownMessageRole: true });
    expect(activity.getStatus(workspaceId, sessionId)).toBe("responding");

    activity.setRunStatus(workspaceId, sessionId, { type: "idle" });

    expect(activity.getStatus(workspaceId, sessionId)).toBe("idle");
  });

  test("reconciles a polled idle snapshot once it contains assistant output", () => {
    const workspaceId = "ws_optimistic_snapshot";
    const sessionId = "ses_optimistic_snapshot";
    const activity = useSessionActivityStore.getState();

    activity.startOptimisticRun(workspaceId, sessionId, { title: "Review emissions" });
    activity.seedSessionRun(workspaceId, sessionId, { type: "idle" }, false);
    expect(activity.getStatus(workspaceId, sessionId)).toBe("thinking");

    activity.seedSessionRun(workspaceId, sessionId, { type: "idle" }, true);
    expect(activity.getStatus(workspaceId, sessionId)).toBe("idle");
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

  test("turns an upstream provider authentication failure into an actionable recovery", () => {
    const snapshot = {
      messages: [
        {
          info: { id: "user-1", role: "user", time: { created: 100 } },
          parts: [{ type: "text", text: "How can I connect a Sui wallet?" }],
        },
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            time: { created: 110, completed: 130 },
            error: {
              name: "APIError",
              data: {
                message: "No provider available",
                statusCode: 401,
                responseBody: JSON.stringify({
                  type: "error",
                  error: {
                    type: "ModelError",
                    message: "No provider available",
                  },
                }),
              },
            },
          },
          parts: [],
        },
      ],
    } as unknown as MatterhornSessionSnapshot;

    expect(latestSessionSnapshotFailure(snapshot)).toEqual({
      id: "assistant-1",
      name: "APIError",
      completedAt: 130,
      retryMessage: "How can I connect a Sui wallet?",
      error: {
        kind: "provider-unavailable",
        message: "This model is not ready in this workspace.",
        detail: "Your message is still in the composer. Connect a provider or choose another model, then send it again.",
      },
    });
  });
});
