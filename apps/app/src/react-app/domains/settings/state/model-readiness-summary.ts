import type {
  MatterhornBackendModelCatalogSnapshot,
  MatterhornBackendModelRef,
  MatterhornBackendModelRouting,
  MatterhornBackendModelsResponse,
} from "@matterhorn-work/types/backend-models";

export type ModelReadinessTone = "ready" | "warning" | "neutral";

export type ModelReadinessDetail = {
  label: string;
  value: string;
  detail?: string;
};

export type ModelReadinessSummary = {
  statusLabel: string;
  statusTone: ModelReadinessTone;
  currentChoice: ModelReadinessDetail;
  workspaceDefault: ModelReadinessDetail;
  effectiveModel: ModelReadinessDetail;
  answerPath: ModelReadinessDetail;
  providerList: ModelReadinessDetail;
  providerCatalog: ModelReadinessDetail;
  selectionPolicy: ModelReadinessDetail;
  trainingPolicy: string;
  details: ModelReadinessDetail[];
};

type BuildModelReadinessSummaryInput = {
  currentModelLabel: string;
  currentModelRef: string;
  hasLocalModelOverride?: boolean;
  backendModels?: MatterhornBackendModelsResponse | null;
  workspaceSelection?: MatterhornBackendModelsResponse["workspaceSelection"];
  effectiveWorkspaceModel?: MatterhornBackendModelRef & { source?: string } | null;
  catalogQueryFailed?: boolean;
  connectedProviderCount: number;
  connectedModelCount: number;
};

function modelRefLabel(model: MatterhornBackendModelRef | null | undefined): string {
  if (!model?.providerId?.trim() || !model.modelId?.trim()) return "Not available";
  return `${model.providerId}/${model.modelId}`;
}

function answerPathLabel(routing: MatterhornBackendModelRouting | undefined): string {
  if (routing?.answerPath.transport === "opencode_session_prompt_async") {
    return "Local session prompts";
  }
  return routing?.answerPath.label ?? "Local session prompts";
}

function providerListLabel(
  routing: MatterhornBackendModelRouting | undefined,
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
): string {
  if (routing?.registry.source === "matterhorn_backend_registry") return "Matterhorn model registry";
  if (routing?.registry.source === "opencode_provider_list" || catalog?.source === "opencode_provider_list") {
    return "Local provider list";
  }
  return routing?.registry.label ?? "Provider source unavailable";
}

function providerCatalogDetail(catalog: MatterhornBackendModelCatalogSnapshot | undefined): string {
  if (!catalog) return "Using the app provider list until the engine reports a workspace catalog.";
  if (catalog.serverFetched) return "Fetched from the local workspace engine.";
  if (catalog.errorCode === "opencode_unconfigured") {
    return "The local engine is reachable, but this workspace is not connected to an agent engine yet.";
  }
  return "Using delegated app state until a live workspace catalog is available.";
}

function statusForCatalog(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
  catalogQueryFailed: boolean | undefined,
): { label: string; tone: ModelReadinessTone } {
  if (catalogQueryFailed) return { label: "Needs engine", tone: "warning" };
  if (catalog?.status === "working") return { label: "Working", tone: "ready" };
  if (catalog?.status === "needs_setup") return { label: "Needs setup", tone: "warning" };
  if (catalog?.status === "preview") return { label: "Preview", tone: "neutral" };
  return { label: "Unknown", tone: "neutral" };
}

export function buildModelReadinessSummary(input: BuildModelReadinessSummaryInput): ModelReadinessSummary {
  const backendModels = input.backendModels ?? null;
  const routing = backendModels?.routing;
  const catalog = backendModels?.catalog;
  const workspaceSelection = input.workspaceSelection ?? backendModels?.workspaceSelection ?? null;
  const effectiveModel = input.effectiveWorkspaceModel ?? backendModels?.defaultModel ?? null;
  const status = statusForCatalog(catalog, input.catalogQueryFailed);
  const providerCount = catalog?.serverFetched ? catalog.connectedProviderCount : input.connectedProviderCount;
  const modelCount = catalog?.serverFetched ? catalog.modelCount : input.connectedModelCount;
  const currentModelRef = input.currentModelRef.trim();
  const hasLocalModelOverride =
    input.hasLocalModelOverride ??
    Boolean(currentModelRef && currentModelRef.toLowerCase() !== "default");
  const currentChoiceValue = hasLocalModelOverride
    ? currentModelRef || "Local picker"
    : workspaceSelection
      ? "Workspace default"
      : "Engine fallback";
  const currentChoiceLabel = hasLocalModelOverride
    ? input.currentModelLabel.trim() || currentChoiceValue
    : currentChoiceValue;
  const workspaceDefaultValue = workspaceSelection ? modelRefLabel(workspaceSelection) : "Not saved";
  const effectiveModelValue = modelRefLabel(effectiveModel);
  const providerListValue = providerListLabel(routing, catalog);
  const answerPathValue = answerPathLabel(routing);
  const preferenceStore = routing?.selection.preferenceStore === "server" ? "Workspace" : "Local app";

  return {
    statusLabel: status.label,
    statusTone: status.tone,
    currentChoice: {
      label: "Current picker choice",
      value: currentChoiceLabel,
      detail: hasLocalModelOverride
        ? `${currentChoiceValue} is sent with prompts from this app session.`
        : workspaceSelection
          ? "This app session follows the saved workspace default."
          : "This app session falls back to the engine default until you choose or save a model.",
    },
    workspaceDefault: {
      label: "Workspace default",
      value: workspaceDefaultValue,
      detail: workspaceSelection
        ? "Saved in this workspace for agents that do not have a local picker override."
        : "No workspace default is saved yet. The app uses a local picker choice when you make one, then the engine fallback.",
    },
    effectiveModel: {
      label: "Fallback model",
      value: effectiveModelValue,
      detail: "Used when this app has no local picker choice or saved workspace default.",
    },
    answerPath: {
      label: "Agent answers",
      value: answerPathValue,
      detail: "Chats and desk tasks call session.promptAsync. Requests include providerID/modelID when a picker choice or workspace default exists.",
    },
    providerList: {
      label: "Model list",
      value: providerListValue,
      detail: routing?.registry.serverOwned
        ? "The Matterhorn backend owns the model registry for this workspace."
        : "The live selectable list is fetched from the local engine provider list for this workspace.",
    },
    providerCatalog: {
      label: "Connected catalog",
      value: `${providerCount} providers · ${modelCount} models`,
      detail: providerCatalogDetail(catalog),
    },
    selectionPolicy: {
      label: "Selection store",
      value: preferenceStore,
      detail: routing?.selection.serverPersisted
        ? "A server-side workspace default exists. Local app overrides can still apply."
        : "A chosen picker model is stored in this app profile unless you save a workspace default.",
    },
    trainingPolicy:
      backendModels?.privacy.trainingUse === "none_by_default"
        ? "No model training by default. Feedback is kept only for eval, routing, and product quality review."
        : "Training policy is unavailable.",
    details: [
      {
        label: "Request field",
        value: routing?.answerPath.requestModelField === "model.providerID_modelID"
          ? "model.providerID + model.modelID"
          : "Unavailable",
      },
      {
        label: "Provider import",
        value: routing?.registry.cloudProviderImport ? "Cloud provider import supported" : "Local providers only",
      },
      {
        label: "Catalog source",
        value: catalog?.serverFetched ? "Server snapshot" : "Delegated",
      },
      {
        label: "User selectable",
        value: routing?.selection.userSelectable ?? true ? "Yes" : "No",
      },
    ],
  };
}
