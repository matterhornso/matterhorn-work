import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { SessionTranscript } from "../src/react-app/domains/session/surface/message-list";
import {
  resolveAssistantResponseRetryTurn,
  responseOutputTitle,
  runAssistantResponseRetry,
} from "../src/react-app/domains/session/surface/response-actions";

const messages: UIMessage[] = [
  {
    id: "msg_user_1",
    role: "user",
    parts: [{ type: "text", text: "Compare the validator evidence." }],
  },
  {
    id: "msg_assistant_1",
    role: "assistant",
    metadata: {
      opencode: {
        created: 1_000,
        completed: 3_500,
        tokens: { total: 1_650, input: 1_200, output: 400, reasoning: 50 },
      },
    },
    parts: [{ type: "text", text: "The current evidence favors validator A." }],
  },
];

function renderTranscript(isStreaming: boolean) {
  return renderToStaticMarkup(
    React.createElement(SessionTranscript, {
      messages,
      isStreaming,
      developerMode: false,
      onRetryAssistantResponse: async () => undefined,
      onSaveAssistantResponse: async () => undefined,
      onRateAssistantResponse: async () => undefined,
      onRevertToMessage: () => undefined,
      onForkAtMessage: () => undefined,
    }),
  );
}

describe("assistant response actions", () => {
  test("completed responses expose one coherent, accessible action group", () => {
    const html = renderTranscript(false);

    expect(html).toContain('data-response-state="completed"');
    expect(html).toContain('aria-label="Response actions"');
    expect(html).toContain('aria-label="Retry response"');
    expect(html).toContain('aria-label="Copy message"');
    expect(html).toContain('aria-label="Save response to Outputs"');
    expect(html).toContain('aria-label="Mark response helpful"');
    expect(html).toContain('aria-label="Mark response not helpful"');
    expect(html).toContain('aria-label="Revert to this response"');
    expect(html).toContain('aria-label="Fork conversation from this response"');
    expect(html).toContain("Completed");
    expect(html).toContain("1,650 tokens");
    expect(html).toContain("2.5 s");
    expect(html).toContain("No transaction");
  });

  test("the active streaming response does not expose completion actions", () => {
    const html = renderTranscript(true);

    expect(html).not.toContain('data-response-state="completed"');
    expect(html).not.toContain('aria-label="Response actions"');
    expect(html).not.toContain('aria-label="Retry response"');
  });

  test("only the latest response can regenerate in place; earlier turns keep fork semantics", () => {
    const html = renderToStaticMarkup(
      React.createElement(SessionTranscript, {
        messages: [
          ...messages,
          { id: "msg_user_2", role: "user", parts: [{ type: "text", text: "Follow up." }] },
          { id: "msg_assistant_2", role: "assistant", parts: [{ type: "text", text: "Follow-up answer." }] },
        ],
        isStreaming: false,
        developerMode: false,
        onRetryAssistantResponse: async () => undefined,
        onForkAtMessage: () => undefined,
      }),
    );

    expect((html.match(/aria-label="Retry response"/g) ?? [])).toHaveLength(1);
    expect((html.match(/aria-label="Fork conversation from this response"/g) ?? [])).toHaveLength(2);
  });

  test("retry resolves the nearest preceding user turn and never crosses forward", () => {
    const retry = resolveAssistantResponseRetryTurn([
      ...messages,
      { id: "msg_user_2", role: "user", parts: [{ type: "text", text: "Now compare fees." }] },
      { id: "msg_assistant_2", role: "assistant", parts: [{ type: "text", text: "Fees are lower on B." }] },
    ], "msg_assistant_2");

    expect(retry).toEqual({
      responseIndex: 3,
      promptMessageId: "msg_user_2",
      prompt: "Now compare fees.",
    });
    expect(resolveAssistantResponseRetryTurn(messages, "missing")).toBeNull();
  });

  test("attachment-only turns stay identifiable but fail closed without a replayable prompt", () => {
    const retry = resolveAssistantResponseRetryTurn([
      { id: "msg_user_file", role: "user", parts: [{ type: "file", url: "data:text/plain;base64,QQ==", mediaType: "text/plain" }] },
      { id: "msg_assistant_file", role: "assistant", parts: [{ type: "text", text: "I read the file." }] },
    ], "msg_assistant_file");

    expect(retry?.promptMessageId).toBe("msg_user_file");
    expect(retry?.prompt).toBe("");
  });

  test("failed retry dispatch restores the original conversation before surfacing the error", async () => {
    const calls: string[] = [];
    const dispatchError = new Error("Selected model is unavailable.");

    await expect(runAssistantResponseRetry({
      abort: async () => { calls.push("abort"); },
      revert: async () => { calls.push("revert"); },
      dispatch: async () => {
        calls.push("dispatch");
        throw dispatchError;
      },
      restore: async () => { calls.push("restore"); },
    })).rejects.toBe(dispatchError);

    expect(calls).toEqual(["abort", "revert", "dispatch", "restore"]);
  });

  test("retry does not restore after a successful replacement dispatch", async () => {
    const calls: string[] = [];

    await runAssistantResponseRetry({
      abort: async () => { calls.push("abort"); },
      revert: async () => { calls.push("revert"); },
      dispatch: async () => { calls.push("dispatch"); },
      restore: async () => { calls.push("restore"); },
    });

    expect(calls).toEqual(["abort", "revert", "dispatch"]);
  });

  test("retry reports when both dispatch and conversation restoration fail", async () => {
    await expect(runAssistantResponseRetry({
      abort: async () => undefined,
      revert: async () => undefined,
      dispatch: async () => { throw new Error("Dispatch unavailable"); },
      restore: async () => { throw new Error("Restore unavailable"); },
    })).rejects.toThrow("could not restore the original conversation");
  });

  test("saved-output titles are compact, plain, and deterministic", () => {
    expect(responseOutputTitle("## Recommendation\n\nKeep the watch active.")).toBe("Recommendation");
    expect(responseOutputTitle("   ")).toBe("Matterhorn response");
    expect(responseOutputTitle(`# ${"x".repeat(90)}`)).toHaveLength(72);
  });

  test("web URL targets retain native link semantics", () => {
    const html = renderToStaticMarkup(
      React.createElement(SessionTranscript, {
        messages: [
          messages[0]!,
          { id: "msg_assistant_url", role: "assistant", parts: [{ type: "text", text: "Open http://127.0.0.1:3000/report" }] },
        ],
        isStreaming: false,
        developerMode: false,
        openTargets: [{
          id: "url:http://127.0.0.1:3000/report",
          kind: "url",
          value: "http://127.0.0.1:3000/report",
          name: "report",
          preview: "browser",
          confidence: 90,
          reason: "message",
        }],
        onOpenTarget: () => undefined,
      }),
    );

    expect(html).toContain('href="http://127.0.0.1:3000/report"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Files and links from this response"');
    expect(html).toContain("Open from this response");
    expect(html).toContain("min-h-11");
    expect(html).toContain("rounded-md");
    expect(html).toContain("focus-visible:ring-2");
  });

  test("saved file targets use the same touch and keyboard affordance as links", () => {
    const html = renderToStaticMarkup(
      React.createElement(SessionTranscript, {
        messages: [
          messages[0]!,
          { id: "msg_assistant_file", role: "assistant", parts: [{ type: "text", text: "Saved outputs/research/report.md" }] },
        ],
        isStreaming: false,
        developerMode: false,
        openTargets: [{
          id: "file:outputs/research/report.md",
          kind: "file",
          value: "outputs/research/report.md",
          name: "report.md",
          preview: "markdown",
          confidence: 100,
          reason: "saved response",
          exists: true,
        }],
        onOpenTarget: () => undefined,
      }),
    );

    expect(html).toContain("Open artifact");
    expect(html).toContain('type="button"');
    expect(html).toContain("touch-manipulation");
    expect(html).toContain("focus-visible:ring-2");
  });
});
