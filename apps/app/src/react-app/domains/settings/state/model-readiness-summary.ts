import type {
  MatterhornBackendModelCatalogSnapshot,
  MatterhornBackendModelRef,
  MatterhornBackendModelRouting,
  MatterhornBackendModelsResponse,
} from "@matterhorn-work/types/backend-models";
import {
  resolveModelDisplayName,
  resolveProviderDisplayName,
} from "../../../../app/utils";

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
  effectiveWorkspaceModel?:
    | (MatterhornBackendModelRef & { source?: string })
    | null;
  catalogQueryFailed?: boolean;
  connectedProviderCount: number;
  connectedModelCount: number;
};

function modelRefLabel(
  model: MatterhornBackendModelRef | null | undefined,
): string {
  if (!model?.providerId?.trim() || !model.modelId?.trim())
    return "Not available";
  return `${resolveProviderDisplayName(model.providerId)} / ${resolveModelDisplayName(model.modelId)}`;
}

function isCatalogOnlyProviderId(providerId: string | null | undefined) {
  return providerId?.trim().toLowerCase() === "opencode";
}

function connectedPromptProviders(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
) {
  return (catalog?.providers ?? []).filter(
    (provider) =>
      provider.connected &&
      !isCatalogOnlyProviderId(provider.id) &&
      provider.modelCount > 0,
  );
}

function answerPathLabel(
  routing: MatterhornBackendModelRouting | undefined,
  canAnswerPrompts: boolean,
): string {
  return routing?.answerPath.status === "working" && canAnswerPrompts
    ? "Ready for chats and desks"
    : "Connect a model provider";
}

function providerListLabel(
  routing: MatterhornBackendModelRouting | undefined,
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
  canAnswerPrompts: boolean,
): string {
  if (routing?.answerPath.status !== "working" || !canAnswerPrompts) {
    return "Connect a provider";
  }
  if (routing?.registry.source === "matterhorn_backend_registry") {
    return "Included and connected models";
  }
  if (catalog?.status === "needs_setup") return "Connect a provider";
  return catalog?.serverFetched || routing?.registry.status === "working"
    ? "Available to choose"
    : "Checking availability";
}

function providerCatalogDetail(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
  routing: MatterhornBackendModelRouting | undefined,
  canAnswerPrompts: boolean,
): string {
  if (routing?.answerPath.status !== "working" || !canAnswerPrompts) {
    return "Connect a provider before chats and desk tasks can start.";
  }
  if (!catalog) {
    return "Matterhorn Desks will check available models before you start work.";
  }
  if (catalog.serverFetched) {
    const availableProviderCount = Math.max(
      0,
      catalog.providerCount - catalog.connectedProviderCount,
    );
    return availableProviderCount > 0
      ? `${availableProviderCount} more provider${availableProviderCount === 1 ? " is" : "s are"} available to connect.`
      : "Your connected provider supplies the models shown here.";
  }
  if (catalog.errorCode === "opencode_unconfigured") {
    return "Connect a provider to start chats and desk tasks.";
  }
  return "Model availability is still being checked for this workspace.";
}

function statusForCatalog(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
  routing: MatterhornBackendModelRouting | undefined,
  catalogQueryFailed: boolean | undefined,
  canAnswerPrompts: boolean,
): { label: string; tone: ModelReadinessTone } {
  if (catalogQueryFailed) return { label: "Start engine", tone: "warning" };
  if (routing?.answerPath.status !== "working" || !canAnswerPrompts) {
    return { label: "Connect provider", tone: "warning" };
  }
  if (catalog?.status === "working") {
    return { label: "Working", tone: "ready" };
  }
  if (catalog?.status === "needs_setup")
    return { label: "Connect provider", tone: "warning" };
  if (catalog?.status === "preview")
    return { label: "Preview", tone: "neutral" };
  return { label: "Availability unknown", tone: "neutral" };
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
  return remaining > 0
    ? `${shown.join(", ")} +${remaining} more`
    : shown.join(", ");
}

export function buildModelCatalogRows(
  catalog: MatterhornBackendModelCatalogSnapshot | undefined,
  options: { connectedOnly?: boolean } = {},
): ModelCatalogRow[] {
  if (!catalog?.providers.length) return [];

  return catalog.providers
    .filter(
      (provider) =>
        !isCatalogOnlyProviderId(provider.id) &&
        (!options.connectedOnly || provider.connected),
    )
    .map((provider) => {
      const samples = provider.sampleModels.length
        ? provider.sampleModels
        : provider.modelIds;
      return {
        providerId: provider.id,
        providerName: resolveProviderDisplayName(provider.id, provider.name),
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
    .filter(
      (provider) =>
        provider.connected &&
        !isCatalogOnlyProviderId(provider.id),
    )
    .reduce((total, provider) => total + provider.modelCount, 0);
}

export function buildModelReadinessSummary(
  input: BuildModelReadinessSummaryInput,
): ModelReadinessSummary {
  const backendModels = input.backendModels ?? null;
  const routing = backendModels?.routing;
  const catalog = backendModels?.catalog;
  const workspaceSelection =
    input.workspaceSelection ?? backendModels?.workspaceSelection ?? null;
  const effectiveModel =
    input.effectiveWorkspaceModel ?? backendModels?.defaultModel ?? null;
  const providerCount = catalog?.serverFetched
    ? connectedPromptProviders(catalog).length
    : input.connectedProviderCount;
  const modelCount = catalog?.serverFetched
    ? countConnectedCatalogModels(catalog)
    : input.connectedModelCount;
  const canAnswerPrompts =
    routing?.answerPath.status === "working" && providerCount > 0;
  const status = statusForCatalog(
    catalog,
    routing,
    input.catalogQueryFailed,
    canAnswerPrompts,
  );
  const currentModelRef = input.currentModelRef.trim();
  const hasLocalModelOverride =
    input.hasLocalModelOverride ??
    Boolean(currentModelRef && currentModelRef.toLowerCase() !== "default");
  const currentChoiceValue = !canAnswerPrompts
    ? "Not ready"
    : hasLocalModelOverride
    ? input.currentModelLabel.trim() || currentModelRef || "Local picker"
    : workspaceSelection
      ? "Workspace default"
      : "No saved choice";
  const currentChoiceLabel = currentChoiceValue;
  const workspaceDefaultValue = !canAnswerPrompts
    ? "Connect a provider first"
    : workspaceSelection
    ? modelRefLabel(workspaceSelection)
    : "Not saved";
  const effectiveModelValue = canAnswerPrompts
    ? modelRefLabel(effectiveModel)
    : "Connect a provider first";
  const providerListValue = providerListLabel(
    routing,
    catalog,
    canAnswerPrompts,
  );
  const answerPathValue = answerPathLabel(routing, canAnswerPrompts);
  const preferenceStore =
    routing?.selection.preferenceStore === "server"
      ? "Workspace"
      : "This app";

  return {
    statusLabel: status.label,
    statusTone: status.tone,
    currentChoice: {
      label: "Selected model",
      value: currentChoiceLabel,
      detail: hasLocalModelOverride
        ? canAnswerPrompts
          ? "Used for this chat until you change it."
          : "Connect a provider before this choice can answer."
        : workspaceSelection
          ? "This chat follows the workspace default."
          : "Choose a model for this chat or save one for the workspace.",
    },
    workspaceDefault: {
      label: "Workspace default",
      value: workspaceDefaultValue,
      detail: workspaceSelection
        ? canAnswerPrompts
          ? "Used for new chats and desk tasks unless you choose another model."
          : "Connect a provider before this default can answer."
        : "Choose a model, then save it here for new chats and desk tasks.",
    },
    effectiveModel: {
      label: "When no model is chosen",
      value: effectiveModelValue,
      detail: canAnswerPrompts
        ? "Matterhorn Desks uses this model until you make a choice."
        : "Connect a provider to make a model available in this workspace.",
    },
    answerPath: {
      label: "Chat delivery",
      value: answerPathValue,
      detail: canAnswerPrompts
        ? "Your selected model is used when you send a prompt."
        : "Connect a provider before sending a prompt or starting a desk task.",
    },
    providerList: {
      label: "Model availability",
      value: providerListValue,
      detail: canAnswerPrompts
        ? "Choose a model from a connected provider."
        : "Connect a provider to make models available for this workspace.",
    },
    providerCatalog: {
      label: "Available models",
      value: `${providerCount} provider${providerCount === 1 ? "" : "s"} · ${modelCount} model${modelCount === 1 ? "" : "s"}`,
      detail: providerCatalogDetail(catalog, routing, canAnswerPrompts),
    },
    selectionPolicy: {
      label: "Where this choice applies",
      value: preferenceStore,
      detail: routing?.selection.serverPersisted
        ? "This workspace has a saved default. You can still choose another model for a chat."
        : "A model chosen here applies to this app until you save a workspace default.",
    },
    trainingPolicy:
      backendModels?.privacy.trainingUse === "none_by_default"
        ? "Your conversations are not used to train models by default."
        : "Training use is not reported for this workspace.",
    catalogRows: buildModelCatalogRows(catalog, { connectedOnly: true }),
    details: [
      {
        label: "Model selection",
        value: routing?.selection.userSelectable ? "You choose" : "Workspace managed",
      },
      {
        label: "Provider access",
        value: canAnswerPrompts ? "Connected provider" : "Provider needed",
      },
      {
        label: "Model check",
        value: canAnswerPrompts ? "Ready now" : "Connect provider",
      },
      {
        label: "User selectable",
        value: (routing?.selection.userSelectable ?? true) ? "Yes" : "No",
      },
    ],
  };
}
