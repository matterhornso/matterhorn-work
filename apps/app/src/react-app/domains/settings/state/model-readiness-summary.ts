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

export type ModelCatalogRow = {
  providerId: string;
  providerName: string;
  sourceLabel: string;
  connectedLabel: string;
  modelCountLabel: string;
  defaultModel: string;
  sampleModels: string;
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
  catalogRows: ModelCatalogRow[];
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
  return routing?.registry.label ?? "Connect an agent engine";
}

function providerCatalogDetail(catalog: MatterhornBackendModelCatalogSnapshot | undefined): string {
  if (!catalog) return "Using the app provider list until the engine reports a workspace catalog.";
  if (catalog.serverFetched) {
    const availableProviderCount = Math.max(0, catalog.providerCount - catalog.connectedProviderCount);
    return availableProviderCount > 0
      ? `Fetched from the local workspace engine. ${availableProviderCount} more provider${availableProviderCount === 1 ? " is" : "s are"} available through Connect provider.`
      : "Fetched from the local workspace engine.";
  }
  if (catalog.errorCode === "opencode_unconfigured") {
    return "The local engine is reachable, but this workspace is not connected to an agent engine yet.";
  }
  return "Using delegated app state until a live workspace catalog is available.";
}

function statusForCatalog(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
  catalogQueryFailed: boolean | undefined,
): { label: string; tone: ModelReadinessTone } {
  if (catalogQueryFailed) return { label: "Start engine", tone: "warning" };
  if (catalog?.status === "working") return { label: "Working", tone: "ready" };
  if (catalog?.status === "needs_setup") return { label: "Connect provider", tone: "warning" };
  if (catalog?.status === "preview") return { label: "Preview", tone: "neutral" };
  return { label: "Provider status unavailable", tone: "neutral" };
}

function sourceLabel(source: string | undefined): string {
  if (source === "api") return "API key";
  if (source === "env") return "Environment";
  if (source === "config") return "Config";
  if (source === "custom") return "Custom";
  return "Provider-defined";
}

function formatModelCount(count: number): string {
  return count === 1 ? "1 model" : `${count} models`;
}

function sampleModelList(modelIds: string[], modelCount: number): string {
  if (!modelIds.length) return "No models reported";
  const shown = modelIds.slice(0, 4);
  const remaining = Math.max(0, modelCount - shown.length);
  return remaining > 0 ? `${shown.join(", ")} +${remaining} more` : shown.join(", ");
}

export function buildModelCatalogRows(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
  options: { connectedOnly?: boolean } = {},
): ModelCatalogRow[] {
  if (!catalog?.providers.length) return [];

  return catalog.providers
    .filter((provider) => !options.connectedOnly || provider.connected)
    .map((provider) => {
    const samples = provider.sampleModels.length ? provider.sampleModels : provider.modelIds;
    return {
      providerId: provider.id,
      providerName: provider.name || provider.id,
      sourceLabel: sourceLabel(provider.source),
      connectedLabel: provider.connected ? "Connected" : "Available",
      modelCountLabel: formatModelCount(provider.modelCount),
      defaultModel: catalog.defaultModels[provider.id] ?? "Not set",
      sampleModels: sampleModelList(samples, provider.modelCount),
    };
    });
}

export function countConnectedCatalogModels(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
): number {
  if (!catalog?.providers.length) return 0;
  return catalog.providers
    .filter((provider) => provider.connected)
    .reduce((total, provider) => total + provider.modelCount, 0);
}

export function buildModelReadinessSummary(input: BuildModelReadinessSummaryInput): ModelReadinessSummary {
  const backendModels = input.backendModels ?? null;
  const routing = backendModels?.routing;
  const catalog = backendModels?.catalog;
  const workspaceSelection = input.workspaceSelection ?? backendModels?.workspaceSelection ?? null;
  const effectiveModel = input.effectiveWorkspaceModel ?? backendModels?.defaultModel ?? null;
  const status = statusForCatalog(catalog, input.catalogQueryFailed);
  const providerCount = catalog?.serverFetched ? catalog.connectedProviderCount : input.connectedProviderCount;
  const modelCount = catalog?.serverFetched ? countConnectedCatalogModels(catalog) : input.connectedModelCount;
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
      value: `${providerCount} provider${providerCount === 1 ? "" : "s"} · ${modelCount} model${modelCount === 1 ? "" : "s"}`,
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
        : "The agent engine did not report a training policy.",
    catalogRows: buildModelCatalogRows(catalog, { connectedOnly: true }),
    details: [
      {
        label: "Request field",
        value: routing?.answerPath.requestModelField === "model.providerID_modelID"
          ? "model.providerID + model.modelID"
          : "Engine did not report",
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
