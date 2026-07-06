import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapability,
  MatterhornCapabilityStatus,
  MatterhornDataStoreDescriptor,
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

export function walletFamilySummary(capabilities: MatterhornBackendCapabilitiesResponse): Array<{
  family: "EVM" | "Sui" | "Bittensor";
  label: string;
  status: MatterhornCapabilityStatus;
}> {
  return [
    {
      family: "EVM",
      label: capabilities.wallets.families.evm.label,
      status: capabilities.wallets.families.evm.status,
    },
    {
      family: "Sui",
      label: capabilities.wallets.families.sui.label,
      status: capabilities.wallets.families.sui.status,
    },
    {
      family: "Bittensor",
      label: capabilities.wallets.families.bittensor.label,
      status: capabilities.wallets.families.bittensor.status,
    },
  ];
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
