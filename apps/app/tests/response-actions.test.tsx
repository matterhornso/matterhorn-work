import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { SessionTranscript } from "../src/react-app/domains/session/surface/message-list";
import {
  resolveAssistantResponseRetryTurn,
  responseOutputTitle,
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
  });
});
