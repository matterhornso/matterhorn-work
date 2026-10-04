import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import { accountClientState, AccountStateChangedError } from "../src/app/lib/account-client-state";

import { SessionTranscript } from "../src/react-app/domains/session/surface/message-list";
import {
  resolveAssistantResponseRetryTurn,
  restoreResponseRetryAttachments,
  responseOutputTitle,
  runAssistantResponseRetry,
  requireAnswerContinuationSupport,
  failedResponseId,
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
        finish: "stop",
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
  for (const boundary of ["prepare", "abort", "revert", "dispatch"]) {
    test(`account switch during ${boundary} prevents subsequent retry mutations`, async () => {
      const calls: string[] = [];
      const step = async (name: string) => {
        calls.push(name);
        if (boundary === name) {
          accountClientState.clear();
          if (name === "dispatch") throw new Error("old account dispatch failed");
        }
      };
      await expect(runAssistantResponseRetry({
        prepare: () => step("prepare"), abort: () => step("abort"), revert: () => step("revert"),
        dispatch: () => step("dispatch"), restore: () => step("restore"),
      })).rejects.toThrow(AccountStateChangedError);
      const steps = ["prepare", "abort", "revert", "dispatch"];
      expect(calls).toEqual(steps.slice(0, steps.indexOf(boundary) + 1));
    });
  }
  test("accepted failures retry only the response identified by the displayed error", () => {
    expect(failedResponseId("msg_assistant_1", messages)).toBe("msg_assistant_1");
    expect(failedResponseId(undefined, messages)).toBeNull();
    expect(failedResponseId("msg_assistant_1", [...messages, { id: "later", role: "user", parts: [] }])).toBeNull();
    expect(failedResponseId("older", messages)).toBeNull();
  });
  test("safe continuation requires acknowledgement from the backend for this exact answer", () => {
    expect(() => requireAnswerContinuationSupport({}, "partial")).toThrow("backend does not support safe answer continuation");
    expect(() => requireAnswerContinuationSupport({ continuation: { messageId: "other", tools: "disabled" } }, "partial")).toThrow();
    expect(() => requireAnswerContinuationSupport({ continuation: { messageId: "partial", tools: "disabled" } }, "partial")).not.toThrow();
  });

  test.each(["length", "stop", "content-filter", "unknown"])("continuation action is available only for length, not %s", (finish) => {
    const html = renderToStaticMarkup(React.createElement(SessionTranscript, {
      messages: [{ id: "partial", role: "assistant", parts: [{ type: "text", text: "Answer" }],
        metadata: { opencode: { finish, completed: 2000, created: 1000 } } }],
      isStreaming: false, developerMode: false, onContinueAssistantResponse: async () => undefined,
    }));
    expect(html.includes("Continue answer")).toBe(finish === "length");
  });

  test("streaming and older incomplete answers do not expose continuation", () => {
    const partial: UIMessage = { id: "partial", role: "assistant", parts: [{ type: "text", text: "Answer" }],
      metadata: { opencode: { finish: "length", completed: 2000 } } };
    for (const streaming of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(SessionTranscript, {
        messages: streaming ? [partial] : [partial, ...messages], isStreaming: streaming,
        developerMode: false, onContinueAssistantResponse: async () => undefined,
      }));
      expect(html).not.toContain("Continue answer");
    }
  });

  test("a persisted truncated answer stays incomplete in the rendered transcript", () => {
    const html = renderToStaticMarkup(React.createElement(SessionTranscript, {
      messages: [{ id: "partial", role: "assistant", parts: [{ type: "text", text: "Cut off" }],
        metadata: { opencode: { finish: "length", completed: 2000, created: 1000 } } }],
      isStreaming: false, developerMode: false,
    }));
    expect(html).toContain('data-response-state="incomplete"');
    expect(html).toContain("The model reached its output limit before finishing.");
    expect(html).not.toContain('data-response-state="completed"');
  });

  test("a later user turn hides continuation even before another assistant exists", () => {
    const html = renderToStaticMarkup(React.createElement(SessionTranscript, {
      messages: [
        { id: "partial", role: "assistant", parts: [{ type: "text", text: "Cut off" }],
          metadata: { opencode: { finish: "length", completed: 2000 } } },
        { id: "followup", role: "user", parts: [{ type: "text", text: "New question" }] },
      ],
      isStreaming: false, developerMode: false, onContinueAssistantResponse: async () => undefined,
    }));
    expect(html).not.toContain("Continue answer");
    expect(html).toContain('data-response-state="incomplete"');
  });

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
      attachments: [],
    });
    expect(resolveAssistantResponseRetryTurn(messages, "missing")).toBeNull();
  });

  test("attachment-only turns retain their saved bytes without inventing prompt text", async () => {
    const retry = resolveAssistantResponseRetryTurn([
      { id: "msg_user_file", role: "user", parts: [{ type: "file", url: "data:text/plain;base64,QQ==", mediaType: "text/plain" }] },
      { id: "msg_assistant_file", role: "assistant", parts: [{ type: "text", text: "I read the file." }] },
    ], "msg_assistant_file");

    expect(retry?.promptMessageId).toBe("msg_user_file");
    expect(retry?.prompt).toBe("");
    if (!retry) throw new Error("Missing retry turn");
    const restored = restoreResponseRetryAttachments(retry);
    expect(restored).toHaveLength(1);
    expect(await restored[0].file.text()).toBe("A");
    expect(restored[0].id).toBe("retry:msg_user_file:0");
  });

  test("retry restoration preserves text and binary attachments independently of composer files", async () => {
    const values = [Buffer.from("Résumé 日本語"), Buffer.from([0, 255, 1, 128])];
    const restored = restoreResponseRetryAttachments({ responseIndex: 1, promptMessageId: "user", prompt: "Read these",
      attachments: values.map((value, index) => ({ type: "file", filename: `saved-${index}`, mediaType: index ? "image/png" : "text/plain",
        url: `data:${index ? "image/png" : "text/plain"};base64,${value.toString("base64")}` })),
    });
    for (const [index, attachment] of restored.entries()) {
      expect(Buffer.from(await attachment.file.arrayBuffer())).toEqual(values[index]);
      expect(attachment.name).toBe(`saved-${index}`);
      expect(attachment.size).toBe(values[index].length);
      expect(attachment.previewUrl).toBeUndefined();
    }
    expect(restored.map(file => file.kind)).toEqual(["file", "image"]);
  });

  for (const url of ["https://example.invalid/private", "file:///private/notes.txt", "blob:expired", "data:text/plain;base64,YQ=", "data:text/plain;base64,Y@==", "data:text/plain;base64,YQ===", "data:text/plain,not-base64", "data:image/png;base64,YQ=="]) {
    test(`unreplayable historical attachment is not dropped or fetched: ${url}`, () => {
      expect(() => restoreResponseRetryAttachments({ responseIndex: 1, promptMessageId: "user", prompt: "Read this",
        attachments: [{ type: "file", filename: "notes.txt", mediaType: "text/plain", url }],
      })).toThrow("Attach the files again");
    });
  }

  for (const size of [0, 5_000_000, 5_000_001]) {
    test(`historical attachment decoded bound ${size}`, () => {
      const restore = () => restoreResponseRetryAttachments({ responseIndex: 1, promptMessageId: "user", prompt: "",
        attachments: [{ type: "file", mediaType: "text/plain", url: `data:text/plain;base64,${Buffer.alloc(size, 97).toString("base64")}` }],
      });
      if (size > 5_000_000) expect(restore).toThrow("cannot be restored");
      else expect(restore()[0].file.size).toBe(size);
    });
  }

  test("historical attachment restoration bounds total decoded allocation and part count", () => {
    const part = { type: "file", mediaType: "text/plain", url: `data:text/plain;base64,${Buffer.alloc(5_000_000, 97).toString("base64")}` } satisfies UIMessage["parts"][number];
    const turn = { responseIndex: 1, promptMessageId: "user", prompt: "", attachments: [part, part] };
    expect(restoreResponseRetryAttachments(turn).reduce((total, item) => total + item.size, 0)).toBe(10_000_000);
    expect(() => restoreResponseRetryAttachments({ ...turn, attachments: [...turn.attachments,
      { type: "file", mediaType: "text/plain", url: "data:text/plain;base64,YQ==" },
    ] })).toThrow("cannot be restored");
    expect(() => restoreResponseRetryAttachments({ ...turn, attachments: Array.from({ length: 65 }, () => part) })).toThrow("cannot be restored");
  });

  test("failed retry dispatch restores the original conversation before surfacing the error", async () => {
    const calls: string[] = [];
    const dispatchError = new Error("Selected model is unavailable.");

    await expect(runAssistantResponseRetry({
      prepare: async () => { calls.push("prepare"); },
      abort: async () => { calls.push("abort"); },
      revert: async () => { calls.push("revert"); },
      dispatch: async () => {
        calls.push("dispatch");
        throw dispatchError;
      },
      restore: async () => { calls.push("restore"); },
    })).rejects.toBe(dispatchError);

    expect(calls).toEqual(["prepare", "abort", "revert", "dispatch", "restore"]);
  });

  test("retry does not restore after a successful replacement dispatch", async () => {
    const calls: string[] = [];

    await runAssistantResponseRetry({
      prepare: async () => { calls.push("prepare"); return { jevReceipt: "scoped-receipt", answerOnly: true }; },
      abort: async () => { calls.push("abort"); },
      revert: async () => { calls.push("revert"); },
      dispatch: async (prepared) => {
        expect(prepared).toEqual({ jevReceipt: "scoped-receipt", answerOnly: true });
        calls.push("dispatch");
      },
      restore: async () => { calls.push("restore"); },
    });

    expect(calls).toEqual(["prepare", "abort", "revert", "dispatch"]);
  });

  test("retry reports when both dispatch and conversation restoration fail", async () => {
    await expect(runAssistantResponseRetry({
      prepare: async () => undefined,
      abort: async () => undefined,
      revert: async () => undefined,
      dispatch: async () => { throw new Error("Dispatch unavailable"); },
      restore: async () => { throw new Error("Restore unavailable"); },
    })).rejects.toThrow("could not restore the original conversation");
  });

  test("cancelled Jev preparation leaves the original conversation untouched", async () => {
    const calls: string[] = [];
    await expect(runAssistantResponseRetry({
      prepare: async () => { calls.push("prepare"); throw new Error("Message cancelled before model submission."); },
      abort: async () => { calls.push("abort"); },
      revert: async () => { calls.push("revert"); },
      dispatch: async () => { calls.push("dispatch"); },
      restore: async () => { calls.push("restore"); },
    })).rejects.toThrow("cancelled");
    expect(calls).toEqual(["prepare"]);
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
