import { describe, expect, test } from "bun:test";

import type { MatterhornBackendModelSelectionResponse } from "@matterhorn-work/types/backend-models";
import type { ModelRef } from "../src/app/types";
import {
  resolveSelectedPromptModel,
  resolveWorkspaceDefaultModel,
} from "../src/react-app/domains/session/model-selection";

function workspaceSelection(
  effective: {
    providerId: string;
    modelId: string;
    source: "server_workspace_preference" | "server_default";
  } | null,
): MatterhornBackendModelSelectionResponse | null {
  if (!effective) return null;
  return {
    success: true,
    version: "matterhorn.backend.model-selection.v1",
    generatedAt: "2026-07-07T00:00:00.000Z",
    workspace: {
      id: "ws_test",
      name: "Test workspace",
      type: "local",
    },
    selection: effective.source === "server_workspace_preference"
      ? {
        providerId: effective.providerId,
        modelId: effective.modelId,
        source: "server_workspace_preference",
        savedAt: "2026-07-07T00:00:00.000Z",
      }
      : null,
    effectiveModel: effective,
    storage: {
      status: "working",
      label: "Workspace model",
      scope: "workspace",
      path: "/tmp/.matterhorn-work/models/selection.json",
      containsSecrets: false,
      auditLogged: false,
    },
    policy: {
      storesCredentials: false,
      userSelectable: true,
      writeRequires: ["collaborator", "writable_server"],
      feedbackTrainingUse: "none_by_default",
    },
  };
}

describe("session model selection resolver", () => {
  test("local picker override wins over the workspace default", () => {
    const local: ModelRef = { providerID: "anthropic", modelID: "claude-3-5-sonnet" };
    const resolved = resolveSelectedPromptModel({
      localDefaultModel: local,
      workspaceModelSelection: workspaceSelection({
        providerId: "openai",
        modelId: "gpt-4.1",
        source: "server_workspace_preference",
      }),
    });

    expect(resolved.model).toEqual(local);
    expect(resolved.source).toBe("local_preferences");
    expect(resolved.workspaceDefaultModel).toEqual({ providerID: "openai", modelID: "gpt-4.1" });
  });

  test("cleared local override lets the saved workspace model govern sends", () => {
    const resolved = resolveSelectedPromptModel({
      localDefaultModel: null,
      workspaceModelSelection: workspaceSelection({
        providerId: "openai",
        modelId: "gpt-4.1",
        source: "server_workspace_preference",
      }),
    });

    expect(resolved.model).toEqual({ providerID: "openai", modelID: "gpt-4.1" });
    expect(resolved.source).toBe("server_workspace_preference");
  });

  test("uses the server default when no workspace preference is saved", () => {
    const resolved = resolveSelectedPromptModel({
      localDefaultModel: null,
      workspaceModelSelection: workspaceSelection({
        providerId: "opencode",
        modelId: "big-pickle",
        source: "server_default",
      }),
    });

    expect(resolved.model).toEqual({ providerID: "opencode", modelID: "big-pickle" });
    expect(resolved.source).toBe("server_default");
  });

  test("returns engine fallback when no app or backend model is available", () => {
    const resolved = resolveSelectedPromptModel({
      localDefaultModel: null,
      workspaceModelSelection: null,
    });

    expect(resolved.model).toBeNull();
    expect(resolved.source).toBe("engine_fallback");
    expect(resolved.workspaceDefaultModel).toBeNull();
  });

  test("normalizes backend model refs into session model refs", () => {
    expect(resolveWorkspaceDefaultModel(workspaceSelection({
      providerId: "  openai  ",
      modelId: "  gpt-4.1-mini  ",
      source: "server_default",
    }))).toEqual({ providerID: "openai", modelID: "gpt-4.1-mini" });
  });
});
