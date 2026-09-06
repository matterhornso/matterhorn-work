import type {
  MatterhornBackendModelRef,
  MatterhornBackendModelSelectionResponse,
  MatterhornBackendModelSelectionSource,
} from "@matterhorn-work/types/backend-models";

import type { ModelRef } from "../../../app/types";

export type SelectedPromptModelSource =
  | "session_override"
  | "local_preferences"
  | Extract<MatterhornBackendModelSelectionSource, "server_workspace_preference" | "server_default">
  | "engine_fallback";

export type SelectedPromptModelResolution = {
  model: ModelRef | null;
  source: SelectedPromptModelSource;
  workspaceDefaultModel: ModelRef | null;
};

function modelRefFromBackend(value: MatterhornBackendModelRef | null | undefined): ModelRef | null {
  const providerID = value?.providerId?.trim();
  const modelID = value?.modelId?.trim();
  if (!providerID || !modelID) return null;
  return { providerID, modelID };
}

export function resolveWorkspaceDefaultModel(
  workspaceModelSelection: MatterhornBackendModelSelectionResponse | null | undefined,
): ModelRef | null {
  return modelRefFromBackend(workspaceModelSelection?.effectiveModel);
}

export function resolveSelectedPromptModel(input: {
  sessionModel?: ModelRef | null;
  localDefaultModel: ModelRef | null | undefined;
  workspaceModelSelection: MatterhornBackendModelSelectionResponse | null | undefined;
}): SelectedPromptModelResolution {
  const sessionModel = input.sessionModel ?? null;
  const localModel = input.localDefaultModel ?? null;
  const workspaceDefaultModel = resolveWorkspaceDefaultModel(input.workspaceModelSelection);
  if (sessionModel) {
    return {
      model: sessionModel,
      source: "session_override",
      workspaceDefaultModel,
    };
  }
  if (localModel) {
    return {
      model: localModel,
      source: "local_preferences",
      workspaceDefaultModel,
    };
  }

  const effectiveSource = input.workspaceModelSelection?.effectiveModel?.source;
  if (workspaceDefaultModel && (effectiveSource === "server_workspace_preference" || effectiveSource === "server_default")) {
    return {
      model: workspaceDefaultModel,
      source: effectiveSource,
      workspaceDefaultModel,
    };
  }

  return {
    model: null,
    source: "engine_fallback",
    workspaceDefaultModel,
  };
}
