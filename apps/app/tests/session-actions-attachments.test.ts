import { describe, expect, test } from "bun:test";

import type { Client, ComposerDraft } from "../src/app/types";
import { createSessionActionsStore } from "../src/react-app/domains/session/sync/actions-store";

function createOptions(client: Client) {
  return {
    client: () => client,
    baseUrl: () => "http://127.0.0.1:3222",
    developerMode: () => false,
    prompt: () => "",
    setPrompt: () => {},
    selectedSessionId: () => "ses_attachment_test",
    selectedSession: () => null,
    sessions: () => [],
    messages: () => [],
    setSessions: () => {},
    sessionStatusById: () => ({}),
    setSessionStatusById: () => {},
    setBusy: () => {},
    setBusyLabel: () => {},
    setBusyStartedAt: () => {},
    setCreatingSession: () => {},
    setError: () => {},
    selectWorkspace: () => true,
    workspaceRootForId: () => "/tmp/matterhorn-attachments",
    selectedWorkspaceId: () => "ws_attachment_test",
    selectedWorkspaceRoot: () => "/tmp/matterhorn-attachments",
    runtimeWorkspaceRoot: () => "/tmp/matterhorn-attachments",
    ensureWorkspaceRuntime: async () => true,
    selectSession: async () => {},
    refreshSidebarWorkspaceSessions: async () => {},
    abortRefreshes: () => {},
    modelConfig: {
      applyPendingSessionChoice: () => {},
      setSessionModelById: () => {},
      clearSessionModelOverride: () => {},
    },
    selectedSessionModel: () => ({
      providerID: "matterhorn",
      modelID: "attachment-test",
    }),
    modelVariant: () => null,
    sanitizeModelVariantForRef: () => null,
    resolveCodexReasoningEffort: () => undefined,
    messageIdFromInfo: () => "",
    restorePromptFromUserMessage: () => {},
    upsertLocalSession: () => {},
    readSessionByWorkspace: () => ({}),
    writeSessionByWorkspace: () => {},
    setSelectedSessionId: () => {},
    locationPath: () => "/workspace/ws_attachment_test/session/ses_attachment_test",
    navigate: () => {},
    renameSession: async () => {},
    appendSessionErrorTurn: () => {},
  };
}

describe("session attachment delivery", () => {
  test("sends browser attachments as named data-url file parts", async () => {
    let request: Record<string, unknown> | null = null;
    const client = {
      session: {
        promptAsync: async (input: Record<string, unknown>) => {
          request = input;
          return {};
        },
      },
    } as unknown as Client;
    const store = createSessionActionsStore(createOptions(client));
    const file = new File(["Matterhorn attachment"], "brief.txt", {
      type: "text/plain",
    });
    const draft: ComposerDraft = {
      mode: "prompt",
      text: "Review the attached brief.",
      parts: [{ type: "text", text: "Review the attached brief." }],
      attachments: [
        {
          id: "attachment-1",
          name: "brief.txt",
          mimeType: "text/plain",
          size: file.size,
          kind: "file",
          file,
        },
      ],
    };

    await store.sendPrompt(draft);

    expect(request).not.toBeNull();
    expect(request?.parts).toEqual([
      { type: "text", text: "Review the attached brief." },
      {
        type: "file",
        url: "data:text/plain;charset=utf-8;base64,TWF0dGVyaG9ybiBhdHRhY2htZW50",
        filename: "brief.txt",
        mime: "text/plain",
      },
    ]);
  });
});
