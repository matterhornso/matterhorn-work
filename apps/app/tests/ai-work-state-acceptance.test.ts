import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function source(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Milestone 3 AI work-state acceptance", () => {
  const surface = source("domains/session/surface/session-surface.tsx");
  const messages = source("domains/session/surface/message-list.tsx");
  const route = source("shell/session-route.tsx");

  test("loading and streaming expose named, announced activity", () => {
    expect(surface).toContain("Opening session…");
    expect(surface).toContain("AssistantWaitingCard");
    expect(surface).toContain('role="status"');
    expect(surface).toContain('aria-live="polite"');
    expect(surface).toContain("Working on ${optimisticRunTitle}");
    expect(surface).toContain("formatAssistantRunElapsed");
    expect(messages).toContain("streaming={isStreamingLatestAssistant}");
  });

  test("partial output stays visible while the active run continues", () => {
    expect(surface).toContain("assistantOutputAfterAwaitStart && chatStreaming");
    expect(surface).toContain("footer={assistantStatusFooter}");
    expect(messages).toContain("isActive={isStreamingLatestAssistant}");
    expect(messages).toContain("props.isStreaming && block.messageIds.includes");
  });

  test("successful output completes the linked run and exposes artifacts", () => {
    expect(surface).toContain("hasVisibleAssistantMessage");
    expect(surface).toContain("props.client.completeWorkflowRun(linkedWorkflowRun.workflowRunId)");
    expect(messages).toContain("OpenableTargetsStrip");
    expect(messages).toContain("Open artifact");
  });

  test("errors preserve a correction draft and provide retry recovery", () => {
    expect(surface).toContain("Matterhorn could not complete this response. Your prompt is ready to retry.");
    expect(surface).toContain("Your prompt is still available to edit or send again.");
    expect(surface).toContain("setComposerDraft(props.sessionId, failure.retryMessage)");
    expect(surface).toContain('retryable: true');
    expect(surface).toContain('"Retry response"');
    expect(surface).toContain("handleRetryResponse");
    expect(surface).toContain("if (sending || !draft.trim()) return;");
    expect(surface).toContain("snapshotQuery.refetch()");
    expect(messages).toContain('role="alert"');
    expect(messages).toContain('status === "failed"');
    expect(messages).toContain('"Retry save"');
  });

  test("revert and feedback remain explicit user actions", () => {
    expect(messages).toContain('aria-label="Revert to this message"');
    expect(messages).toContain("props.onRevertToMessage?.(block.messageId)");
    expect(route).toContain("setFeedbackDialogOpen(true)");
    expect(route).toContain('entrypoint="status-bar"');
  });

  test("saved output has saving, success, and retry states", () => {
    expect(messages).toContain('useState<"idle" | "saving" | "saved" | "failed">');
    expect(messages).toContain('"Save to Outputs"');
    expect(messages).toContain('"Saving..."');
    expect(messages).toContain('"Saved to Outputs"');
    expect(messages).toContain('"Open saved output"');
    expect(messages).toContain('"Retry save"');
    expect(surface).toContain("Result saved to Outputs");
    expect(surface).toContain("Select Open saved output to view it.");
  });

  test("completed runs disclose privacy, usage, tools, Memory, and wallet reconciliation", () => {
    expect(surface).toContain("AgentRunReceiptDisclosure");
    expect(surface).toContain("receipt.privacy.dataCategories.join");
    expect(surface).toContain("receipt.privacy.redactionCount");
    expect(surface).toContain("receipt.memory.readIds.length");
    expect(surface).toContain("receipt.memory.writtenIds.length");
    expect(surface).toContain("receiptToolLabel");
    expect(surface).toContain("tool.latencyMs");
    expect(surface).toContain("tool.freshness");
    expect(surface).toContain("receipt.usage.cacheWriteTokens");
    expect(surface).toContain("action.publicReceipt");
  });
});
