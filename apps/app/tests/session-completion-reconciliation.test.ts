import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { buildOpenCodeMessageMetadata, responseCompletionSummary } from "../src/react-app/domains/session/message-completion-metadata";
import { mergeSnapshotAndLiveMessages, mergeSnapshotIntoCachedMessages } from "../src/react-app/domains/session/sync/message-merge";

function message(completed?: number, total = 0): UIMessage {
  return {
    id: "assistant-response",
    role: "assistant",
    parts: [{ type: "text", text: "Answer" }],
    metadata: buildOpenCodeMessageMetadata({
      time: { created: 1_000, completed },
      tokens: { total, input: total, output: 0 },
    }),
  };
}

for (const [name, merge] of [
  ["live rendering", mergeSnapshotAndLiveMessages],
  ["snapshot refresh", mergeSnapshotIntoCachedMessages],
] as const) {
  describe(`${name} completion metadata`, () => {
    test("retains incomplete status across a late pending snapshot", () => {
      const incomplete = { ...message(3000, 473), metadata: buildOpenCodeMessageMetadata({
        finish: "length", time: { created: 1000, completed: 3000 }, tokens: { total: 473 },
      }) };
      expect(responseCompletionSummary(merge([message()], [incomplete])[0]!).state).toBe("incomplete");
      expect(responseCompletionSummary(merge([incomplete], [message()])[0]!).state).toBe("incomplete");
    });

    test("keeps completed usage and timing when a pending snapshot arrives late", () => {
      const completed = message(3_000, 473);
      const [result] = merge([message()], [completed]);
      expect(result?.metadata).toEqual(completed.metadata);
      expect(responseCompletionSummary(result!)).toMatchObject({
        tokenLabel: "473 tokens", durationLabel: "2.0 s",
      });
      expect(merge([message()], [result!])[0]?.metadata).toEqual(completed.metadata);
    });

    test("accepts a completed snapshot over a pending live message", () => {
      const completed = message(3_000, 473);
      expect(merge([completed], [message()])[0]?.metadata).toEqual(completed.metadata);
    });

    test("uses completion order, not the larger token count", () => {
      const newer = message(4_000, 123);
      const older = message(3_000, 473);
      expect(merge([older], [newer])[0]?.metadata).toEqual(newer.metadata);
      expect(merge([newer], [older])[0]?.metadata).toEqual(newer.metadata);
    });

    test("keeps the server authoritative for equal completed timestamps, including zero usage", () => {
      const corrected = message(3_000, 0);
      expect(merge([corrected], [message(3_000, 473)])[0]?.metadata).toEqual(corrected.metadata);
    });

    test("does not let invalid cached completion timestamps override a snapshot", () => {
      for (const completed of [NaN, Infinity, -1, "3000"]) {
        const cached = { ...message(), metadata: { opencode: { completed, tokens: { total: 999 } } } };
        const snapshot = message(3_000, 473);
        expect(merge([snapshot], [cached])[0]?.metadata).toEqual(snapshot.metadata);
      }
    });

    test("retains cached metadata when a legacy snapshot contains none", () => {
      const cached = message(3_000, 473);
      expect(merge([{ ...message(), metadata: undefined }], [cached])[0]?.metadata).toEqual(cached.metadata);
    });
  });
}
