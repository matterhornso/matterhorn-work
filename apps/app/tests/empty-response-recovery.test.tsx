import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import { SessionTranscript } from "../src/react-app/domains/session/surface/message-list";
import { resolveAssistantResponseRetryTurn } from "../src/react-app/domains/session/surface/response-actions";

const prompt: UIMessage = {
  id: "request",
  role: "user",
  parts: [{ type: "text", text: "Read public subnet 27 evidence. Do not submit a transaction." }],
};

function interrupted(parts: UIMessage["parts"] = [], errorName = "MessageAbortedError"): UIMessage {
  return {
    id: "early-stop",
    role: "assistant",
    parts,
    metadata: { opencode: {
      errorName, created: 1000, completed: 1165,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    } },
  };
}

function transcript(messages: UIMessage[], options: { streaming?: boolean; retry?: boolean } = {}) {
  return renderToStaticMarkup(React.createElement(SessionTranscript, {
    messages, isStreaming: options.streaming ?? false, developerMode: false, showThinking: false,
    onRetryAssistantResponse: options.retry === false ? undefined : async () => undefined,
    onSaveAssistantResponse: async () => undefined,
    onRateAssistantResponse: async () => undefined,
  }));
}

describe("empty interrupted response recovery", () => {
  const emptyParts: UIMessage["parts"][] = [
    [], [{ type: "step-start" }], [{ type: "text", text: "" }],
    [{ type: "reasoning", text: "Internal reasoning hidden by the user's preference." }],
  ];

  for (const parts of emptyParts) {
    test(`early Stop keeps one visible guarded Retry with ${JSON.stringify(parts)}`, () => {
      const stopped = interrupted(parts);
      const html = transcript([prompt, stopped]);
      expect(html).toContain('data-message-id="early-stop"');
      expect(html).toContain('data-response-state="stopped"');
      expect(html).toContain("Stopped before an answer was returned.");
      expect(html.match(/aria-label="Retry response"/g)).toHaveLength(1);
      expect(html).toContain(">Retry response</span>");
      expect(html).not.toContain("Internal reasoning hidden");
      expect(html).not.toContain('aria-label="Save response to Outputs"');
      expect(html).not.toContain('aria-label="Mark response helpful"');
      // Only the original user prompt remains copyable; there is no empty answer to copy.
      expect(html.match(/aria-label="Copy message"/g)).toHaveLength(1);
      expect(resolveAssistantResponseRetryTurn([prompt, stopped], stopped.id)).toEqual({
        responseIndex: 1, promptMessageId: prompt.id, prompt: prompt.parts[0]?.type === "text" ? prompt.parts[0].text : "",
      });
    });
  }

  test("a failed empty answer preserves recovery without presenting an answer to save", () => {
    const html = transcript([prompt, interrupted([], "APIError")]);
    expect(html).toContain('data-response-state="failed"');
    expect(html).toContain("Response failed before an answer was returned.");
    expect(html).toContain('aria-label="Retry response"');
    expect(html).not.toContain('aria-label="Save response to Outputs"');
  });

  test("Stop during a tool step retains the actual tool result and recovery", () => {
    const html = transcript([prompt, interrupted([{
      type: "dynamic-tool", toolName: "bittensor_subnet_info", toolCallId: "public-read",
      state: "output-error", input: { netuid: 27 }, errorText: "Request cancelled",
    }])]);
    expect(html).toContain("bittensor subnet info");
    expect(html).toContain("data-matterhorn-tool-disclosure");
    expect(html).toContain('data-response-state="stopped"');
    expect(html.match(/aria-label="Retry response"/g)).toHaveLength(1);
  });

  test("an unfinished empty placeholder does not pretend to be a failed response", () => {
    for (const parts of [[], [{ type: "text", text: "" }]] satisfies UIMessage["parts"][]) {
      const html = transcript([prompt, { id: "waiting", role: "assistant", parts }], { streaming: true });
      expect(html).not.toContain("before an answer was returned");
      expect(html).not.toContain('aria-label="Retry response"');
      expect(html).not.toContain('data-response-state="failed"');
    }
  });

  test("recovery is not offered during an active request or without a retry capability", () => {
    const messages = [prompt, interrupted()];
    expect(transcript(messages, { streaming: true })).not.toContain('aria-label="Retry response"');
    expect(transcript(messages, { retry: false })).not.toContain('aria-label="Retry response"');
    expect(transcript(messages, { retry: false })).toContain("Stopped before an answer was returned.");
  });

  test("older interrupted turns cannot replace subsequent user turns", () => {
    const messages: UIMessage[] = [prompt, interrupted(), { ...prompt, id: "later-request" }];
    expect(transcript(messages)).not.toContain('aria-label="Retry response"');
    const html = transcript([...messages, {
      id: "later-answer", role: "assistant", parts: [{ type: "text", text: "Later answer" }],
      metadata: { opencode: { finish: "stop", completed: 2000 } },
    }]);
    expect(html.match(/aria-label="Retry response"/g)).toHaveLength(1);
    expect(html).not.toContain(">Retry response</span>");
  });
});
