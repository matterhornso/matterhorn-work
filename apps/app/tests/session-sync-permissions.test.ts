import { afterEach, describe, expect, test } from "bun:test";
import { accountClientState } from "../src/app/lib/account-client-state";
import type { UIMessage } from "ai";
import { responseCompletionSummary } from "../src/react-app/domains/session/message-completion-metadata";
import type { PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client";

import type { OpenworkSessionSnapshot } from "../src/app/lib/openwork-server";
import { getReactQueryClient } from "../src/react-app/infra/query-client";
import { deriveRenderedSessionMessages } from "../src/react-app/domains/session/surface/session-render-state";
import {
  __applySessionSyncEventForTest,
  __createWorkspaceSessionSyncForTest,
  __disposeWorkspaceSessionSyncForTest,
  __hasWorkspaceSessionSyncForTest,
  captureSessionTranscriptSnapshotBoundary,
  coalescePendingDeltas,
  ensureWorkspaceSessionSync,
  permissionKey,
  questionKey,
  seedPermissionState,
  seedQuestionState,
  seedReplacementSessionState,
  seedSessionState,
  snapshotKey,
  trackWorkspaceSessionSync,
  transcriptKey,
} from "../src/react-app/domains/session/sync/session-sync";

function permission(id: string, sessionID: string): PermissionRequest {
  return {
    id,
    sessionID,
    permission: "bash",
    patterns: ["echo ok"],
    metadata: {},
    always: {
      session: false,
      project: false,
    },
  };
}

function question(id: string, sessionID: string): QuestionRequest {
  return {
    id,
    sessionID,
    questions: [
      {
        header: "Choice",
        question: "Pick one",
        options: [{ label: "Yes", description: "Proceed" }],
      },
    ],
  };
}

function uiMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text, state: "done" }],
  };
}

function snapshotWithMessages(
  messages: Array<{ id: string; role: "user" | "assistant"; text: string }>,
  sessionId = "session-a",
): OpenworkSessionSnapshot {
  return {
    session: {
      id: sessionId,
      parentID: undefined,
      title: "Test session",
      time: { created: 1, updated: 2 },
      share: undefined,
      version: "0",
    },
    messages: messages.map((message, index) => ({
      info: {
        id: message.id,
        role: message.role,
        sessionID: sessionId,
        time: { created: index + 1 },
      },
      parts: [
        {
          id: `part_${message.id}`,
          type: "text",
          text: message.text,
          sessionID: sessionId,
          messageID: message.id,
        },
      ],
    })),
    todos: [],
    status: { type: "idle" },
  } as unknown as OpenworkSessionSnapshot;
}

afterEach(() => {
  getReactQueryClient().clear();
});

describe("session permission sync", () => {
  test("live completion events retain length finishes through idle and snapshot reconciliation", () => {
    const syncInput = { workspaceId: "workspace-completion", baseUrl: "http://127.0.0.1:1234", openworkToken: "fixture" };
    const cleanup = __createWorkspaceSessionSyncForTest(syncInput);
    const releaseSession = trackWorkspaceSessionSync(syncInput, "session-a");
    try {
      __applySessionSyncEventForTest(syncInput, { type: "message.updated", properties: { info: {
        id: "assistant-partial", role: "assistant", sessionID: "session-a", finish: "length",
        time: { created: 1000, completed: 2000 }, tokens: { input: 437, output: 36 },
      } } });
      __applySessionSyncEventForTest(syncInput, { type: "session.idle", properties: { sessionID: "session-a" } });
      const result = getReactQueryClient().getQueryData<UIMessage[]>(transcriptKey("workspace-completion", "session-a"));
      expect(result).toHaveLength(1);
      expect(responseCompletionSummary(result![0]!)).toMatchObject({ state: "incomplete", canContinue: true, tokenLabel: "473 tokens" });
    } finally { releaseSession(); cleanup(); }
  });

  test("seeds only permissions for the selected session", () => {
    seedPermissionState("workspace-a", "session-a", [
      permission("perm-a", "session-a"),
      permission("perm-b", "session-b"),
    ]);

    expect(getReactQueryClient().getQueryData(permissionKey("workspace-a", "session-a"))).toMatchObject([
      { id: "perm-a", sessionID: "session-a", permission: "bash" },
    ]);
  });

  test("preserves received time when refreshing an existing permission", () => {
    seedPermissionState("workspace-a", "session-a", [permission("perm-a", "session-a")]);
    const first = getReactQueryClient().getQueryData<Array<{ id: string; receivedAt: number }>>(
      permissionKey("workspace-a", "session-a"),
    )!;

    seedPermissionState("workspace-a", "session-a", [permission("perm-a", "session-a")]);
    const second = getReactQueryClient().getQueryData<Array<{ id: string; receivedAt: number }>>(
      permissionKey("workspace-a", "session-a"),
    )!;

    expect(second[0]!.receivedAt).toBe(first[0]!.receivedAt);
  });

  test("keeps live permissions that arrive after a snapshot starts", () => {
    getReactQueryClient().setQueryData(permissionKey("workspace-a", "session-a"), [
      {
        ...permission("perm-live", "session-a"),
        receivedAt: 200,
      },
    ]);

    seedPermissionState("workspace-a", "session-a", [], { snapshotStartedAt: 100 });

    expect(getReactQueryClient().getQueryData(permissionKey("workspace-a", "session-a"))).toMatchObject([
      { id: "perm-live", sessionID: "session-a", permission: "bash" },
    ]);
  });

  test("drops stale permissions that predate a fresh snapshot", () => {
    getReactQueryClient().setQueryData(permissionKey("workspace-a", "session-a"), [
      {
        ...permission("perm-stale", "session-a"),
        receivedAt: 100,
      },
    ]);

    seedPermissionState("workspace-a", "session-a", [], { snapshotStartedAt: 200 });

    expect(getReactQueryClient().getQueryData(permissionKey("workspace-a", "session-a"))).toEqual([]);
  });
});

describe("session question sync", () => {
  test("seeds only questions for the selected session", () => {
    seedQuestionState("workspace-a", "session-a", [
      question("question-a", "session-a"),
      question("question-b", "session-b"),
    ]);

    expect(getReactQueryClient().getQueryData(questionKey("workspace-a", "session-a"))).toMatchObject([
      { id: "question-a", sessionID: "session-a" },
    ]);
  });

  test("adds and removes live question events", () => {
    const syncInput = { workspaceId: "workspace-a", baseUrl: "http://127.0.0.1:1234", openworkToken: "token" };
    const cleanup = __createWorkspaceSessionSyncForTest(syncInput);
    const releaseSession = trackWorkspaceSessionSync(syncInput, "session-a");

    try {
      __applySessionSyncEventForTest(syncInput, {
        type: "question.asked",
        properties: question("question-live", "session-a"),
      } as any);

      expect(getReactQueryClient().getQueryData(questionKey("workspace-a", "session-a"))).toMatchObject([
        { id: "question-live", sessionID: "session-a" },
      ]);

      __applySessionSyncEventForTest(syncInput, {
        type: "question.replied",
        properties: { sessionID: "session-a", requestID: "question-live", answers: [["Yes"]] },
      } as any);

      expect(getReactQueryClient().getQueryData(questionKey("workspace-a", "session-a"))).toEqual([]);
    } finally {
      releaseSession();
      cleanup();
    }
  });
});

describe("session transcript sync", () => {
  test("account reset discards pending deltas and old cleanup cannot dispose a new stream", async () => {
    const input = { workspaceId: "ws_account", baseUrl: "http://127.0.0.1:1234", matterhornToken: "fixture" };
    __createWorkspaceSessionSyncForTest(input);
    const releaseOldWorkspace = ensureWorkspaceSessionSync(input);
    const releaseOldSession = trackWorkspaceSessionSync(input, "ses_account");
    getReactQueryClient().setQueryData(transcriptKey(input.workspaceId, "ses_account"), [
      uiMessage("msg_a", "assistant", "account A"),
    ]);
    __applySessionSyncEventForTest(input, { type: "message.part.delta", properties: {
      sessionID: "ses_account", messageID: "msg_a", partID: "part_a", delta: " private pending delta",
    } });
    accountClientState.clear();
    expect(__hasWorkspaceSessionSyncForTest(input)).toBe(false);
    await Promise.resolve();
    expect(getReactQueryClient().getQueryData(transcriptKey(input.workspaceId, "ses_account"))).toBeUndefined();
    const cleanup = __createWorkspaceSessionSyncForTest(input);
    try {
      releaseOldSession();
      releaseOldWorkspace();
      expect(__hasWorkspaceSessionSyncForTest(input)).toBe(true);
    } finally { cleanup(); }
  });
  test("reports the first visible assistant output but ignores synthetic text", () => {
    const outputs: Array<{ sessionId: string; messageId: string }> = [];
    const syncInput = {
      workspaceId: "workspace-a",
      baseUrl: "http://127.0.0.1:1234",
      matterhornToken: "token",
      onAssistantOutput: (output: { sessionId: string; messageId: string }) => outputs.push(output),
    };
    const cleanup = __createWorkspaceSessionSyncForTest(syncInput);
    const releaseSession = trackWorkspaceSessionSync(syncInput, "session-a");

    try {
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-synthetic",
            type: "text",
            text: "internal placeholder",
            synthetic: true,
            sessionID: "session-a",
            messageID: "msg-assistant",
          },
        },
      } as any);
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-visible",
            type: "text",
            text: "visible answer",
            sessionID: "session-a",
            messageID: "msg-assistant",
          },
        },
      } as any);

      expect(outputs).toEqual([{ sessionId: "session-a", messageId: "msg-assistant" }]);
    } finally {
      releaseSession();
      cleanup();
    }
  });

  test("coalesces token-sized deltas by transcript part", () => {
    const deltas = coalescePendingDeltas([
      { sessionId: "session-a", messageId: "msg-a", partId: "part-a", reasoning: false, delta: "hel" },
      { sessionId: "session-a", messageId: "msg-a", partId: "part-a", reasoning: false, delta: "lo" },
      { sessionId: "session-a", messageId: "msg-a", partId: "part-b", reasoning: true, delta: "think" },
      { sessionId: "session-b", messageId: "msg-b", partId: "part-a", reasoning: false, delta: "other" },
    ]);

    expect(deltas).toEqual([
      { sessionId: "session-a", messageId: "msg-a", partId: "part-a", reasoning: false, delta: "hello" },
      { sessionId: "session-a", messageId: "msg-a", partId: "part-b", reasoning: true, delta: "think" },
      { sessionId: "session-b", messageId: "msg-b", partId: "part-a", reasoning: false, delta: "other" },
    ]);
  });

  test("keeps live-only messages when an idle snapshot is stale", () => {
    getReactQueryClient().setQueryData(transcriptKey("workspace-a", "session-a"), [
      uiMessage("msg-user", "user", "hello"),
      uiMessage("msg-assistant", "assistant", "finished answer"),
    ]);

    seedSessionState("workspace-a", snapshotWithMessages([
      { id: "msg-user", role: "user", text: "hello" },
    ]));

    const transcript = getReactQueryClient().getQueryData<UIMessage[]>(transcriptKey("workspace-a", "session-a"));
    expect(transcript?.map((message) => message.id)).toEqual(["msg-user", "msg-assistant"]);
  });

  test("keeps longer live text when an idle snapshot lags the event stream", () => {
    getReactQueryClient().setQueryData(transcriptKey("workspace-a", "session-a"), [
      uiMessage("msg-user", "user", "hello"),
      uiMessage("msg-assistant", "assistant", "finished answer"),
    ]);

    seedSessionState("workspace-a", snapshotWithMessages([
      { id: "msg-user", role: "user", text: "hello" },
      { id: "msg-assistant", role: "assistant", text: "finished" },
    ]));

    const transcript = getReactQueryClient().getQueryData<UIMessage[]>(transcriptKey("workspace-a", "session-a"));
    expect(transcript?.[1]?.parts[0]).toMatchObject({ text: "finished answer" });
  });

  test("replaces retried history while preserving messages that arrive during the authoritative snapshot", () => {
    const key = transcriptKey("workspace-a", "session-a");
    getReactQueryClient().setQueryData(key, [
      uiMessage("msg-earlier", "assistant", "unrelated earlier history"),
      uiMessage("msg-old-user", "user", "retry this"),
      uiMessage("msg-old-assistant", "assistant", "obsolete answer"),
    ]);
    const replacementBoundary = captureSessionTranscriptSnapshotBoundary(
      "workspace-a",
      "session-a",
      ["msg-old-user", "msg-old-assistant"],
    );

    getReactQueryClient().setQueryData<UIMessage[]>(key, (current = []) => [
      ...current,
      uiMessage("msg-concurrent", "assistant", "arrived while snapshot was loading"),
    ]);
    seedSessionState("workspace-a", snapshotWithMessages([
      { id: "msg-retry-user", role: "user", text: "retry this" },
      { id: "msg-retry-assistant", role: "assistant", text: "Generation stopped" },
    ]), { replacementBoundary });

    const transcript = getReactQueryClient().getQueryData<UIMessage[]>(key);
    expect(transcript?.map((message) => message.id)).toEqual([
      "msg-earlier",
      "msg-retry-user",
      "msg-retry-assistant",
      "msg-concurrent",
    ]);
    expect(transcript?.map((message) => message.id)).not.toContain("msg-old-user");
    expect(transcript?.map((message) => message.id)).not.toContain("msg-old-assistant");
  });

  test("does not apply an authoritative replacement boundary across sessions", () => {
    getReactQueryClient().setQueryData(transcriptKey("workspace-a", "session-a"), [
      uiMessage("msg-a", "assistant", "session a"),
    ]);
    const replacementBoundary = captureSessionTranscriptSnapshotBoundary("workspace-a", "session-a", ["msg-a"]);
    getReactQueryClient().setQueryData(transcriptKey("workspace-a", "session-b"), [
      uiMessage("msg-b-old", "assistant", "keep session b cache"),
    ]);

    seedSessionState("workspace-a", snapshotWithMessages([
      { id: "msg-b-new", role: "user", text: "session b snapshot" },
    ], "session-b"), { replacementBoundary });

    const transcript = getReactQueryClient().getQueryData<UIMessage[]>(transcriptKey("workspace-a", "session-b"));
    expect(transcript?.map((message) => message.id)).toEqual(["msg-b-new", "msg-b-old"]);
  });

  test("drops replaced IDs even when an ordinary snapshot rebuilt them before retry reconciliation", () => {
    const workspaceId = "workspace-retry-poll";
    const sessionId = "session-retry-poll";
    const key = transcriptKey(workspaceId, sessionId);
    getReactQueryClient().setQueryData(key, [
      uiMessage("msg-earlier", "assistant", "earlier history"),
      uiMessage("msg-old-user", "user", "retry this"),
      uiMessage("msg-old-assistant", "assistant", "obsolete answer"),
    ]);
    const replacementBoundary = captureSessionTranscriptSnapshotBoundary(
      workspaceId,
      sessionId,
      ["msg-old-user", "msg-old-assistant"],
    );

    seedSessionState(workspaceId, snapshotWithMessages([
      { id: "msg-old-user", role: "user", text: "retry this" },
      { id: "msg-old-assistant", role: "assistant", text: "obsolete answer" },
    ], sessionId));
    seedSessionState(workspaceId, snapshotWithMessages([
      { id: "msg-retry-user", role: "user", text: "retry this" },
      { id: "msg-retry-assistant", role: "assistant", text: "Generation stopped" },
    ], sessionId), { replacementBoundary });

    const transcript = getReactQueryClient().getQueryData<UIMessage[]>(key);
    expect(transcript?.map((message) => message.id)).toEqual([
      "msg-earlier",
      "msg-retry-user",
      "msg-retry-assistant",
    ]);
  });

  test("does not resurrect replaced IDs from late stream events or stale snapshots", async () => {
    const workspaceId = "workspace-retry-late";
    const sessionId = "session-retry-late";
    const syncInput = { workspaceId, baseUrl: "http://127.0.0.1:1234", openworkToken: "token" };
    const cleanup = __createWorkspaceSessionSyncForTest(syncInput);
    const releaseSession = trackWorkspaceSessionSync(syncInput, sessionId);
    try {
      const key = transcriptKey(workspaceId, sessionId);
      getReactQueryClient().setQueryData(key, [
        uiMessage("msg-old-user", "user", "retry this"),
        uiMessage("msg-old-assistant", "assistant", "obsolete answer"),
      ]);
      const replacementBoundary = captureSessionTranscriptSnapshotBoundary(
        workspaceId,
        sessionId,
        ["msg-old-user", "msg-old-assistant"],
      );
      seedSessionState(workspaceId, snapshotWithMessages([
        { id: "msg-retry-user", role: "user", text: "retry this" },
        { id: "msg-retry-assistant", role: "assistant", text: "Generation stopped" },
      ], sessionId), { replacementBoundary });

      __applySessionSyncEventForTest(syncInput, {
        type: "message.updated",
        properties: { info: { id: "msg-old-assistant", role: "assistant", sessionID: sessionId } },
      } as any);
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.updated",
        properties: { part: {
          id: "part-old-assistant",
          type: "text",
          text: "late obsolete answer",
          sessionID: sessionId,
          messageID: "msg-old-assistant",
        } },
      } as any);
      seedSessionState(workspaceId, snapshotWithMessages([
        { id: "msg-old-user", role: "user", text: "retry this" },
        { id: "msg-old-assistant", role: "assistant", text: "stale polled answer" },
        { id: "msg-retry-user", role: "user", text: "retry this" },
        { id: "msg-retry-assistant", role: "assistant", text: "Generation stopped" },
      ], sessionId));
      const staleSnapshot = snapshotWithMessages([
        { id: "msg-old-user", role: "user", text: "retry this" },
        { id: "msg-old-assistant", role: "assistant", text: "stale rendered answer" },
        { id: "msg-retry-user", role: "user", text: "retry this" },
        { id: "msg-retry-assistant", role: "assistant", text: "Generation stopped" },
      ], sessionId);
      const rendered = deriveRenderedSessionMessages({
        workspaceId,
        sessionId,
        transcriptState: getReactQueryClient().getQueryData<UIMessage[]>(key),
        snapshot: staleSnapshot,
      });
      __applySessionSyncEventForTest(syncInput, {
        type: "message.updated",
        properties: { info: { id: "msg-new-live", role: "assistant", sessionID: sessionId } },
      } as any);
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.updated",
        properties: { part: {
          id: "part-new-live",
          type: "text",
          text: "new live answer",
          sessionID: sessionId,
          messageID: "msg-new-live",
        } },
      } as any);

      await Promise.resolve();
      const ids = getReactQueryClient().getQueryData<UIMessage[]>(key)?.map((message) => message.id);
      expect(ids).toEqual(["msg-retry-user", "msg-retry-assistant", "msg-new-live"]);
      expect(ids).not.toContain("msg-old-user");
      expect(ids).not.toContain("msg-old-assistant");
      expect(rendered.map((message) => message.id)).toEqual(["msg-retry-user", "msg-retry-assistant"]);
    } finally {
      __applySessionSyncEventForTest(syncInput, {
        type: "session.deleted",
        properties: { sessionID: sessionId },
      } as any);
      releaseSession();
      cleanup();
    }
  });

  test("restores exact replaced IDs when retry was known unsent", () => {
    const workspaceId = "workspace-retry-restore";
    const sessionId = "session-retry-restore";
    const key = transcriptKey(workspaceId, sessionId);
    getReactQueryClient().setQueryData(key, [
      uiMessage("msg-old-user", "user", "retry this"),
      uiMessage("msg-old-assistant", "assistant", "original answer"),
    ]);
    const replacementBoundary = captureSessionTranscriptSnapshotBoundary(
      workspaceId,
      sessionId,
      ["msg-old-user", "msg-old-assistant"],
    );
    getReactQueryClient().setQueryData(transcriptKey(workspaceId, "session-active"), [
      uiMessage("msg-active", "assistant", "another chat stays active"),
    ]);

    const revertedSnapshot = snapshotWithMessages([], sessionId);
    (revertedSnapshot.session as typeof revertedSnapshot.session & { revert?: { messageID: string } }).revert = {
      messageID: "msg-old-user",
    };
    getReactQueryClient().setQueryData(snapshotKey(workspaceId, sessionId), revertedSnapshot);
    seedSessionState(workspaceId, revertedSnapshot, { replacementBoundary });
    expect(getReactQueryClient().getQueryData<UIMessage[]>(key)).toEqual([]);

    const restoredSnapshot = snapshotWithMessages([
      { id: "msg-old-user", role: "user", text: "retry this" },
      { id: "msg-old-assistant", role: "assistant", text: "original answer" },
    ], sessionId);
    seedReplacementSessionState(workspaceId, restoredSnapshot, replacementBoundary);

    expect(getReactQueryClient().getQueryData<UIMessage[]>(key)?.map((message) => message.id)).toEqual([
      "msg-old-user",
      "msg-old-assistant",
    ]);
    const cachedSnapshot = getReactQueryClient().getQueryData<OpenworkSessionSnapshot>(
      snapshotKey(workspaceId, sessionId),
    );
    expect((cachedSnapshot?.session as { revert?: unknown } | undefined)?.revert).toBeUndefined();
    expect(deriveRenderedSessionMessages({
      workspaceId,
      sessionId,
      transcriptState: getReactQueryClient().getQueryData<UIMessage[]>(key),
      snapshot: cachedSnapshot,
    }).map((message) => message.id)).toEqual(["msg-old-user", "msg-old-assistant"]);
    expect(getReactQueryClient().getQueryData<UIMessage[]>(
      transcriptKey(workspaceId, "session-active"),
    )?.map((message) => message.id)).toEqual(["msg-active"]);
  });

  test("continues accepting stream deltas for a recently unselected session", async () => {
    const syncInput = { workspaceId: "workspace-a", baseUrl: "http://127.0.0.1:1234", openworkToken: "token" };
    const cleanup = __createWorkspaceSessionSyncForTest(syncInput);

    try {
      const releaseSessionA = trackWorkspaceSessionSync(syncInput, "session-a");
      releaseSessionA();
      const releaseSessionB = trackWorkspaceSessionSync(syncInput, "session-b");

      __applySessionSyncEventForTest(syncInput, {
        type: "message.updated",
        properties: { info: { id: "msg-assistant", role: "assistant", sessionID: "session-a" } },
      } as any);
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-assistant",
            type: "text",
            text: "",
            sessionID: "session-a",
            messageID: "msg-assistant",
          },
        },
      } as any);
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.delta",
        properties: {
          sessionID: "session-a",
          messageID: "msg-assistant",
          partID: "part-assistant",
          delta: "still streaming after switch",
        },
      } as any);

      await Promise.resolve();

      const transcript = getReactQueryClient().getQueryData<UIMessage[]>(transcriptKey("workspace-a", "session-a"));
      expect(transcript?.[0]?.parts[0]).toMatchObject({ text: "still streaming after switch" });

      releaseSessionB();
    } finally {
      cleanup();
    }
  });

  test("keeps workspace stream alive while retained sessions remain after route unmount", async () => {
    const syncInput = { workspaceId: "workspace-a", baseUrl: "http://127.0.0.1:1234", openworkToken: "token" };
    const releaseWorkspace = ensureWorkspaceSessionSync(syncInput);
    const releaseSessionA = trackWorkspaceSessionSync(syncInput, "session-a");

    releaseSessionA();
    releaseWorkspace();

    try {
      expect(__hasWorkspaceSessionSyncForTest(syncInput)).toBe(true);

      __applySessionSyncEventForTest(syncInput, {
        type: "message.updated",
        properties: { info: { id: "msg-route-leave", role: "assistant", sessionID: "session-a" } },
      } as any);
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-route-leave",
            type: "text",
            text: "",
            sessionID: "session-a",
            messageID: "msg-route-leave",
          },
        },
      } as any);
      __applySessionSyncEventForTest(syncInput, {
        type: "message.part.delta",
        properties: {
          sessionID: "session-a",
          messageID: "msg-route-leave",
          partID: "part-route-leave",
          delta: "stream survived settings route",
        },
      } as any);

      await Promise.resolve();

      const transcript = getReactQueryClient().getQueryData<UIMessage[]>(transcriptKey("workspace-a", "session-a"));
      expect(transcript?.[0]?.parts[0]).toMatchObject({ text: "stream survived settings route" });
    } finally {
      __disposeWorkspaceSessionSyncForTest(syncInput);
    }
  });
});
