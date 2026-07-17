import { beforeEach, describe, expect, test } from "bun:test";

import { clearDevLogs, readDevLogs } from "../src/app/lib/dev-log";
import {
  beginModelOperation,
  clearModelOperationMetrics,
  pendingModelOperation,
  readModelOperationMetrics,
  recordModelOperationAccepted,
  recordModelOperationCancelled,
  recordModelOperationCompleted,
  recordModelOperationProviderError,
  recordModelReasoningLevelSelection,
} from "../src/app/lib/model-operation-metrics";

describe("privacy-safe model operation metrics", () => {
  beforeEach(() => {
    clearModelOperationMetrics();
    clearDevLogs();
  });

  test("tracks latency, selected reasoning level, and token counts", () => {
    const operation = beginModelOperation({
      workspaceId: "ws_test",
      sessionId: "ses_test",
      providerId: "openai",
      modelId: "gpt-test",
      reasoningLevel: "high",
      source: "chat",
    });
    recordModelOperationAccepted(operation);
    recordModelOperationCompleted(operation, {
      completedAt: operation.startedAt + 245,
      tokens: {
        input: 12,
        output: 34,
        reasoning: 8,
        cache: { read: 3, write: 2 },
        total: 59,
      },
    });

    expect(pendingModelOperation("ses_test")).toBeNull();
    expect(readModelOperationMetrics()).toContainEqual(expect.objectContaining({
      event: "completed",
      reasoningLevel: "high",
      latencyMs: 245,
      tokens: {
        input: 12,
        output: 34,
        reasoning: 8,
        cacheRead: 3,
        cacheWrite: 2,
        total: 59,
      },
    }));
  });

  test("tracks cancellations and provider error classes without messages", () => {
    const cancelled = beginModelOperation({
      workspaceId: "ws_test",
      sessionId: "ses_cancel",
      providerId: "cudos",
      modelId: "asi1-mini",
      source: "desk",
    });
    recordModelOperationCancelled(cancelled);

    const failed = beginModelOperation({
      workspaceId: "ws_test",
      sessionId: "ses_error",
      providerId: "cudos",
      modelId: "asi1-mini",
      source: "chat",
    });
    const sensitiveText = "SENTINEL_PROMPT_AND_REASONING_MUST_NOT_BE_LOGGED";
    recordModelOperationProviderError(failed, new Error(sensitiveText));
    recordModelReasoningLevelSelection({
      workspaceId: "ws_test",
      providerId: "openai",
      modelId: "gpt-test",
      reasoningLevel: null,
      source: "workspace",
    });

    const serialized = JSON.stringify({
      metrics: readModelOperationMetrics(),
      logs: readDevLogs(0),
    });
    expect(serialized).not.toContain(sensitiveText);
    expect(serialized).not.toMatch(/promptText|reasoningText|messageContent/i);
    expect(readModelOperationMetrics()).toContainEqual(expect.objectContaining({
      event: "cancelled",
      providerId: "cudos",
    }));
    expect(readModelOperationMetrics()).toContainEqual(expect.objectContaining({
      event: "provider_error",
      errorName: "Error",
    }));
    expect(readModelOperationMetrics()).toContainEqual(expect.objectContaining({
      event: "reasoning_level_selected",
      reasoningLevel: "provider_default",
      source: "workspace",
    }));
  });
});
