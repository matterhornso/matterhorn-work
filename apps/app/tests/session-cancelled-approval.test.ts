import { beforeEach, expect, test } from "bun:test";
import { recordSessionSubmissionFailure } from "../src/react-app/domains/session/surface/session-surface";
import { useSessionActivityStore } from "../src/react-app/domains/session/status/session-activity-store";
import { useComposerStateStore } from "../src/react-app/domains/session/surface/composer-state-store";
import { JevPreparationCancelledError } from "../src/react-app/domains/session/surface/use-jev-chat";
import {
  beginModelOperation, clearModelOperationMetrics, pendingModelOperation,
  readModelOperationMetrics, recordModelOperationCancelled,
} from "../src/app/lib/model-operation-metrics";

const workspaceId = "ws_cancelled_approval";
const sessionId = "ses_cancelled_approval";
const cancelled = new Error(JSON.stringify({ code: "write_denied", details: { reason: "cancelled" } }));

beforeEach(() => {
  clearModelOperationMetrics();
  useSessionActivityStore.getState().removeSession(workspaceId, sessionId);
  useComposerStateStore.getState().clearSession(sessionId);
});

for (const { label, error } of [{ label: "approval", error: cancelled }, { label: "Jev preparation", error: new JevPreparationCancelledError() }]) {
for (const stopFirst of [false, true]) {
  test(`cancelled ${label} returns to idle and records cancellation once (Stop first: ${stopFirst})`, () => {
    const operation = beginModelOperation({ workspaceId, sessionId, source: "chat" });
    const activity = useSessionActivityStore.getState();
    activity.setRunStatus(workspaceId, sessionId, { type: "busy" });
    activity.setError(workspaceId, sessionId);
    useComposerStateStore.getState().setDraft(sessionId, "My newer draft");
    if (stopFirst) recordModelOperationCancelled(operation);

    expect(recordSessionSubmissionFailure(operation, error).kind).toBe("cancelled");
    if (!stopFirst) {
      const pending = pendingModelOperation(sessionId);
      if (pending) recordModelOperationCancelled(pending);
    }
    expect(useSessionActivityStore.getState().getStatus(workspaceId, sessionId)).toBe("idle");
    expect(pendingModelOperation(sessionId)).toBeNull();
    expect(readModelOperationMetrics().filter((metric) => metric.event === "cancelled")).toHaveLength(1);
    expect(readModelOperationMetrics().filter((metric) => metric.event === "provider_error")).toHaveLength(0);
    expect(useComposerStateStore.getState().sessions[sessionId]?.draft).toBe("My newer draft");
  });
}
}

test("a real failure remains an error with its draft intact", () => {
  const operation = beginModelOperation({ workspaceId, sessionId, source: "chat" });
  useComposerStateStore.getState().setDraft(sessionId, "Retry this later");
  const error = new Error(JSON.stringify({ code: "write_denied", details: { reason: "denied" } }));
  expect(recordSessionSubmissionFailure(operation, error).kind).not.toBe("cancelled");
  expect(useSessionActivityStore.getState().getStatus(workspaceId, sessionId)).toBe("error");
  expect(readModelOperationMetrics().filter((metric) => metric.event === "provider_error")).toHaveLength(1);
  expect(pendingModelOperation(sessionId)).toBeNull();
  expect(useComposerStateStore.getState().sessions[sessionId]?.draft).toBe("Retry this later");
});
