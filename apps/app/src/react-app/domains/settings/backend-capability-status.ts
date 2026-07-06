import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapability,
  MatterhornCapabilityStatus,
  MatterhornDataStoreDescriptor,
  MatterhornWalletFamilyCapability,
  MatterhornWalletRuntimeSupport,
  MatterhornWorkspaceDataMapResponse,
} from "@matterhorn-work/types/backend-capabilities";

export type BackendCapabilityTone = "ready" | "setup" | "preview" | "neutral" | "error";

export function backendCapabilityLabel(status: MatterhornCapabilityStatus): string {
  switch (status) {
    case "working":
      return "Working";
    case "needs_setup":
      return "Needs setup";
    case "preview":
      return "Preview";
    case "unsupported":
      return "Not supported here";
    case "error":
      return "Unavailable";
  }
}

export function backendCapabilityTone(status: MatterhornCapabilityStatus): BackendCapabilityTone {
  switch (status) {
    case "working":
      return "ready";
    case "needs_setup":
      return "setup";
    case "preview":
      return "preview";
    case "unsupported":
      return "neutral";
    case "error":
      return "error";
  }
}

export function summarizeCapability(capability: MatterhornCapability): string {
  return capability.description?.trim() || capability.label.trim() || backendCapabilityLabel(capability.status);
}

export function summarizeModelSource(capabilities: MatterhornBackendCapabilitiesResponse): string {
  const provider = capabilities.models.defaultModel.providerId;
  const model = capabilities.models.defaultModel.modelId;
  if (!provider || !model) return "No default model reported.";
  return `${provider}/${model}`;
}

export function summarizeModelRoutingPolicy(capabilities: MatterhornBackendCapabilitiesResponse): string {
  const routing = capabilities.models.routing;
  if (!routing) return "Model routing policy is not reported by the backend.";
  const answerPath = routing.answerPath === "opencode_session_prompt_async"
    ? "OpenCode session prompts"
    : "unknown route";
  const modelList = routing.modelListTool === "opencode_provider_list"
    ? "OpenCode provider list"
    : routing.modelListTool === "matterhorn_backend_registry"
      ? "Matterhorn registry"
      : "unknown source";
  const selection = routing.userSelectable
    ? `users can choose in ${routing.selectionSurface === "model_picker" ? "the model picker" : routing.selectionSurface}`
    : "users cannot choose models here";
  return `Answers use ${answerPath}. Models come from ${modelList}; ${selection}.`;
}

export function walletFamilySummary(capabilities: MatterhornBackendCapabilitiesResponse): Array<{
  family: "EVM" | "Sui" | "Bittensor";
  label: string;
  status: MatterhornCapabilityStatus;
  directConnect: boolean;
  signing: MatterhornWalletFamilyCapability["signing"];
  runtimeSupport?: MatterhornWalletFamilyCapability["runtimeSupport"];
}> {
  return [
    {
      family: "EVM",
      label: capabilities.wallets.families.evm.label,
      status: capabilities.wallets.families.evm.status,
      directConnect: capabilities.wallets.families.evm.directConnect,
      signing: capabilities.wallets.families.evm.signing,
      runtimeSupport: capabilities.wallets.families.evm.runtimeSupport,
    },
    {
      family: "Sui",
      label: capabilities.wallets.families.sui.label,
      status: capabilities.wallets.families.sui.status,
      directConnect: capabilities.wallets.families.sui.directConnect,
      signing: capabilities.wallets.families.sui.signing,
      runtimeSupport: capabilities.wallets.families.sui.runtimeSupport,
    },
    {
      family: "Bittensor",
      label: capabilities.wallets.families.bittensor.label,
      status: capabilities.wallets.families.bittensor.status,
      directConnect: capabilities.wallets.families.bittensor.directConnect,
      signing: capabilities.wallets.families.bittensor.signing,
      runtimeSupport: capabilities.wallets.families.bittensor.runtimeSupport,
    },
  ];
}

export function walletRuntimeSupportSummary(
  support: MatterhornWalletRuntimeSupport | undefined,
): { label: string; detail: string; status: MatterhornCapabilityStatus | null } {
  if (!support) {
    return {
      label: "Runtime status unavailable",
      detail: "The backend did not report wallet support for this runtime.",
      status: null,
    };
  }
  const connection = support.directConnect ? "Direct connect" : "External handoff";
  const signing =
    support.signing === "client_wallet"
      ? "signing stays in the user's wallet"
      : support.signing === "external_signer"
        ? "external signer required"
        : "signing not supported";
  return {
    label: `${connection} · ${backendCapabilityLabel(support.status)}`,
    detail: support.description || `${connection}; ${signing}.`,
    status: support.status,
  };
}

export function storageLocationLabel(store: MatterhornDataStoreDescriptor): string {
  if (store.path?.trim()) return store.path.trim();
  const firstPath = store.paths?.find((path) => path.trim());
  if (firstPath) return firstPath.trim();
  if (store.scope === "matterhorn_cloud") return "Matterhorn Cloud";
  if (store.scope === "opencode_runtime") return "OpenCode runtime";
  if (store.scope === "machine_global") return "This device";
  if (store.scope === "workspace") return "Workspace folder";
  return "Location unavailable";
}

export function workspaceDataPolicySummary(dataMap: MatterhornWorkspaceDataMapResponse): string {
  if (dataMap.policy.trainingUse === "none_by_default") {
    return "No training use by default.";
  }
  if (dataMap.policy.trainingUse === "opt_in_only") {
    return "Training use requires opt-in.";
  }
  return "Training policy unavailable.";
}
