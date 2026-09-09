import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import {
  mergeSnapshotAndLiveMessages,
  mergeSnapshotIntoCachedMessages,
} from "../src/react-app/domains/session/sync/message-merge";
import {
  getComposerDraft,
  useComposerStateStore,
} from "../src/react-app/domains/session/surface/composer-state-store";

function assistant(parts: UIMessage["parts"]): UIMessage {
  return { id: "assistant", role: "assistant", parts };
}

describe("OpenWork v0.18.44 session reliability contracts", () => {
  for (const [name, merge] of [
    ["live merge", mergeSnapshotAndLiveMessages],
    ["cached restore", mergeSnapshotIntoCachedMessages],
  ] as const) {
    test(`${name} never regresses a completed tool to an in-progress snapshot`, () => {
      const running = assistant([{
        type: "dynamic-tool",
        toolName: "matterhorn_sui_get_balance",
        toolCallId: "call-a",
        state: "input-available",
        input: { address: "0x1" },
      }]);
      const completed = assistant([{
        ...running.parts[0],
        state: "output-available",
        output: { balance: "1" },
      }]);

      expect(merge([running], [completed])[0]?.parts).toEqual(completed.parts);
      expect(merge([completed], [running])[0]?.parts).toEqual(completed.parts);
    });
  }

  test("composer drafts remain scoped to their session while views change", () => {
    useComposerStateStore.setState({ sessions: {} });
    useComposerStateStore.getState().setDraft("session-a", "keep this draft");
    useComposerStateStore.getState().setDraft("session-b", "other work");

    expect(getComposerDraft(useComposerStateStore.getState(), "session-a")).toBe("keep this draft");
    expect(getComposerDraft(useComposerStateStore.getState(), "session-b")).toBe("other work");
    useComposerStateStore.getState().clearSession("session-b");
    expect(getComposerDraft(useComposerStateStore.getState(), "session-a")).toBe("keep this draft");
  });
});
