import { describe, expect, test } from "bun:test";

import type { MatterhornBackendModelsResponse } from "@matterhorn-work/types/backend-models";
import { buildModelReadinessSummary } from "../src/react-app/domains/settings/state/model-readiness-summary";

const baseBackendModels: MatterhornBackendModelsResponse = {
  success: true,
  version: "matterhorn.backend.models.v1",
  generatedAt: "2026-07-06T00:00:00.000Z",
  defaultModel: {
    providerId: "openai",
    modelId: "gpt-4.1-mini",
    source: "server_default",
  },
  workspaceSelection: null,
  catalog: {
    status: "working",
    label: "Local provider list",
    description: "Provider list fetched from the local engine.",
    source: "opencode_provider_list",
    serverFetched: true,
    providerCount: 1,
    connectedProviderCount: 1,
    modelCount: 2,
    connectedProviderIds: ["openai"],
    defaultModels: { openai: "gpt-4.1-mini" },
    providers: [{
      id: "openai",
      name: "OpenAI",
      source: "api",
      connected: true,
      modelCount: 2,
      modelIds: ["gpt-4.1", "gpt-4.1-mini"],
      sampleModels: ["gpt-4.1", "gpt-4.1-mini"],
    }],
  },
  routing: {
    answerPath: {
      status: "working",
      label: "Local session prompts",
      description: "Prompts are sent through session.promptAsync.",
      transport: "opencode_session_prompt_async",
      requestModelField: "model.providerID_modelID",
    },
    selection: {
      status: "working",
      label: "User-selected model",
      description: "The app can still keep a local session override.",
      userSelectable: true,
      surface: "model_picker",
      preferenceStore: "local_preferences",
      serverPersisted: false,
    },
    registry: {
      status: "preview",
      label: "Local provider list",
      description: "The live model list comes from the local engine.",
      source: "opencode_provider_list",
      serverOwned: false,
      clientTool: "opencode_client_provider_list",
      cloudProviderImport: true,
    },
  },
  privacy: {
    trainingUse: "none_by_default",
    feedbackUse: "eval_routing_product_quality_only",
  },
  limitations: [],
};

describe("model readiness summary", () => {
  test("separates current picker choice, workspace default, and engine fallback", () => {
    const summary = buildModelReadinessSummary({
      currentModelLabel: "OpenAI - GPT 4.1",
      currentModelRef: "openai/gpt-4.1",
      hasLocalModelOverride: true,
      backendModels: {
        ...baseBackendModels,
        defaultModel: {
          providerId: "openai",
          modelId: "gpt-4.1",
          source: "server_workspace_preference",
        },
        workspaceSelection: {
          providerId: "openai",
          modelId: "gpt-4.1",
          source: "server_workspace_preference",
          savedAt: "2026-07-06T01:00:00.000Z",
        },
        routing: {
          ...baseBackendModels.routing,
          selection: {
            ...baseBackendModels.routing.selection,
            preferenceStore: "server",
            serverPersisted: true,
          },
        },
      },
      workspaceSelection: {
        providerId: "openai",
        modelId: "gpt-4.1",
        source: "server_workspace_preference",
        savedAt: "2026-07-06T01:00:00.000Z",
      },
      effectiveWorkspaceModel: {
        providerId: "openai",
        modelId: "gpt-4.1",
        source: "server_workspace_preference",
      },
      connectedProviderCount: 1,
      connectedModelCount: 2,
    });

    expect(summary.statusLabel).toBe("Working");
    expect(summary.statusTone).toBe("ready");
    expect(summary.currentChoice.value).toBe("OpenAI - GPT 4.1");
    expect(summary.currentChoice.detail).toContain("openai/gpt-4.1 is sent with prompts");
    expect(summary.workspaceDefault.value).toBe("openai/gpt-4.1");
    expect(summary.workspaceDefault.detail).toContain("Saved in this workspace");
    expect(summary.effectiveModel.value).toBe("openai/gpt-4.1");
    expect(summary.effectiveModel.label).toBe("Fallback model");
    expect(summary.answerPath.value).toBe("Local session prompts");
    expect(summary.answerPath.detail).toContain("session.promptAsync");
    expect(summary.providerList.value).toBe("Local provider list");
    expect(summary.providerList.detail).toContain("local engine provider list");
    expect(summary.providerCatalog.value).toBe("1 providers · 2 models");
    expect(summary.selectionPolicy.value).toBe("Workspace");
    expect(summary.trainingPolicy).toContain("No model training by default");
    expect(summary.trainingPolicy).toContain("product quality review");
  });

  test("shows workspace default as the current choice after local override is cleared", () => {
    const summary = buildModelReadinessSummary({
      currentModelLabel: "Default",
      currentModelRef: "Default",
      hasLocalModelOverride: false,
      backendModels: {
        ...baseBackendModels,
        defaultModel: {
          providerId: "openai",
          modelId: "gpt-4.1",
          source: "server_workspace_preference",
        },
        workspaceSelection: {
          providerId: "openai",
          modelId: "gpt-4.1",
          source: "server_workspace_preference",
          savedAt: "2026-07-06T01:00:00.000Z",
        },
      },
      workspaceSelection: {
        providerId: "openai",
        modelId: "gpt-4.1",
        source: "server_workspace_preference",
        savedAt: "2026-07-06T01:00:00.000Z",
      },
      effectiveWorkspaceModel: {
        providerId: "openai",
        modelId: "gpt-4.1",
        source: "server_workspace_preference",
      },
      connectedProviderCount: 1,
      connectedModelCount: 2,
    });

    expect(summary.currentChoice.value).toBe("Workspace default");
    expect(summary.currentChoice.detail).toContain("follows the saved workspace default");
    expect(summary.workspaceDefault.value).toBe("openai/gpt-4.1");
    expect(summary.effectiveModel.value).toBe("openai/gpt-4.1");
  });

  test("explains local preference fallback when no workspace default is saved", () => {
    const summary = buildModelReadinessSummary({
      currentModelLabel: "Default",
      currentModelRef: "Default",
      backendModels: baseBackendModels,
      connectedProviderCount: 3,
      connectedModelCount: 9,
    });

    expect(summary.workspaceDefault.value).toBe("Not saved");
    expect(summary.workspaceDefault.detail).toContain("local picker choice when you make one");
    expect(summary.effectiveModel.value).toBe("openai/gpt-4.1-mini");
    expect(summary.selectionPolicy.value).toBe("Local app");
    expect(summary.selectionPolicy.detail).toContain("chosen picker model is stored");
  });

  test("marks engine failures without hiding known local provider counts", () => {
    const summary = buildModelReadinessSummary({
      currentModelLabel: "Anthropic - Claude",
      currentModelRef: "anthropic/claude-3-5-sonnet",
      backendModels: {
        ...baseBackendModels,
        catalog: {
          ...baseBackendModels.catalog,
          status: "needs_setup",
          serverFetched: false,
          connectedProviderCount: 0,
          modelCount: 0,
          errorCode: "opencode_unconfigured",
        },
      },
      catalogQueryFailed: true,
      connectedProviderCount: 2,
      connectedModelCount: 8,
    });

    expect(summary.statusLabel).toBe("Needs engine");
    expect(summary.statusTone).toBe("warning");
    expect(summary.providerCatalog.value).toBe("2 providers · 8 models");
    expect(summary.providerCatalog.detail).toContain("workspace is not connected to an agent engine yet");
  });
});
