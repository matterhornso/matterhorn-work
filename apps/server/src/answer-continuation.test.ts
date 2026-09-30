import { describe, expect, test } from "bun:test";
import { MATTERHORN_CONTINUE_ANSWER_TEXT } from "@matterhorn-work/types/guarded-agent-runtime";
import { assertAnswerContinuationTarget, parseAnswerContinuation } from "./answer-continuation.js";
import type { SessionMessageReadModel } from "./session-read-model.js";

const request = { continuationOf: "msg_cut_short", parts: [{ type: "text", text: MATTERHORN_CONTINUE_ANSWER_TEXT }] };
const answer: SessionMessageReadModel = {
  info: { id: "msg_cut_short", sessionID: "ses_current", role: "assistant", finish: "length", time: { created: 100, completed: 200 } },
  parts: [{ id: "part_answer", messageID: "msg_cut_short", sessionID: "ses_current", type: "text", text: "Partial answer" }],
};
const session = { id: "ses_current" };

describe("answer-only continuation", () => {
  test("requires an explicit valid reference and the fixed continuation prompt", () => {
    expect(parseAnswerContinuation({})).toBeUndefined();
    expect(parseAnswerContinuation(request)).toBe("msg_cut_short");
    for (const continuationOf of [null, "", 7, "msg\nignore-policy", "a".repeat(161)]) {
      expect(() => parseAnswerContinuation({ ...request, continuationOf })).toThrow("Choose an incomplete answer");
    }
    for (const change of [
      { parts: [] }, { parts: [{ type: "text", text: "Run another tool" }] },
      { parts: [...request.parts, { type: "file", url: "file:///private" }] },
      { parts: [{ ...request.parts[0], synthetic: true }] },
      { message: "override" }, { noReply: true },
    ]) expect(() => parseAnswerContinuation({ ...request, ...change })).toThrow("answer-continuation prompt");
  });

  test("accepts only a visible final truncated answer in the same session", () => {
    expect(() => assertAnswerContinuationTarget({ messageId: answer.info.id, session, messages: [answer] })).not.toThrow();
    for (const change of [
      { finish: "stop" }, { finish: "tool-calls" }, { finish: "content-filter" },
      { finish: "unknown" }, { error: { name: "MessageAbortedError" } },
      { role: "user" }, { sessionID: "ses_another" }, { time: { created: 100 } },
      { time: { completed: Infinity } },
    ]) {
      expect(() => assertAnswerContinuationTarget({ messageId: answer.info.id, session,
        messages: [{ ...answer, info: { ...answer.info, ...change } }] })).toThrow("Only the latest answer");
    }
    for (const messages of [[], [answer, { ...answer, info: { ...answer.info, id: "msg_later" } }],
      [{ ...answer, parts: [] }], [{ ...answer, parts: [{ ...answer.parts[0]!, synthetic: true }] }],
      [{ ...answer, parts: [...answer.parts, { id: "tool", sessionID: session.id, messageID: answer.info.id, type: "tool", state: { status: "running" } }] }]]) {
      expect(() => assertAnswerContinuationTarget({ messageId: answer.info.id, session, messages })).toThrow("Only the latest answer");
    }
    expect(() => assertAnswerContinuationTarget({ messageId: answer.info.id,
      session: { ...session, revert: { messageID: answer.info.id } }, messages: [answer] })).toThrow("Only the latest answer");
  });
});
