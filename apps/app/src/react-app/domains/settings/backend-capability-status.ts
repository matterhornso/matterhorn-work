import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapability,
  MatterhornCapabilityStatus,
  MatterhornDataStoreDescriptor,
  MatterhornWalletFamilyCapability,
  MatterhornWalletRuntimeSupport,
  MatterhornWorkspaceDataMapResponse,
} from "@matterhorn-work/types/backend-capabilities";
import {
  resolveModelDisplayName,
  resolveProviderDisplayName,
} from "@/app/utils";

export type BackendCapabilityTone =
  | "ready"
  | "setup"
  | "preview"
  | "neutral"
  | "error";

export function backendCapabilityLabel(
  status: MatterhornCapabilityStatus,
): string {
  switch (status) {
    case "working":
      return "Working";
    case "needs_setup":
      return "Needs setup";
    case "preview":
      return "Limited release";
    case "unsupported":
      return "Not supported here";
    case "error":
      return "Unavailable";
  }
}

export function backendCapabilityTone(
  status: MatterhornCapabilityStatus,
): BackendCapabilityTone {
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
  return (
    capability.description?.trim() ||
    capability.label.trim() ||
    backendCapabilityLabel(capability.status)
  );
}

export function summarizeModelSource(
  capabilities: MatterhornBackendCapabilitiesResponse,
): string {
  const provider = capabilities.models.defaultModel.providerId;
  const model = capabilities.models.defaultModel.modelId;
  if (!provider || !model) return "No default model reported.";
  return `${resolveProviderDisplayName(provider)} / ${resolveModelDisplayName(model)}`;
}

export function summarizeModelRoutingPolicy(
  capabilities: MatterhornBackendCapabilitiesResponse,
): string {
  const routing = capabilities.models.routing;
  if (!routing) return "Model routing policy is not reported by the backend.";
  const delivery =
    routing.answerPath === "opencode_session_prompt_async"
      ? "Chats and desk tasks use the selected model."
      : "Model delivery needs attention before you start work.";
  const selection = routing.userSelectable
    ? "Choose another model anytime in Models."
    : "This workspace uses its configured model.";
  return `${delivery} ${selection}`;
}

/**
 * Keeps routine settings copy useful without exposing provider implementation
 * identifiers such as an internal runtime/model slug.
 */
export function summarizeModelSelection(
  capabilities: MatterhornBackendCapabilitiesResponse,
): string {
  if (capabilities.models.status !== "working") {
    return "Set up a model provider to finish configuring this workspace.";
  }

  return capabilities.models.routing?.userSelectable
    ? "You can change the workspace model in Models."
    : "A workspace model is ready to use.";
}

export function walletFamilySummary(
  capabilities: MatterhornBackendCapabilitiesResponse,
): Array<{
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
): {
  label: string;
  detail: string;
  status: MatterhornCapabilityStatus | null;
} {
  if (!support) {
    return {
      label: "Runtime status unavailable",
      detail: "The backend did not report wallet support for this runtime.",
      status: null,
    };
  }
  if (["needs_setup", "unsupported", "error"].includes(support.status)) {
    return {
      label: backendCapabilityLabel(support.status),
      detail:
        support.description ||
        "Wallet support is not available in this runtime.",
      status: support.status,
    };
  }

  const limitedRelease = support.status === "preview";
  const label = support.directConnect
    ? `Connect here${limitedRelease ? " · Limited release" : ""}`
    : `Prepare only${limitedRelease ? " · Limited release" : ""}`;
  const detail = support.directConnect
    ? `Connect and use a supported wallet in Matterhorn. ${
        support.signing === "client_wallet"
          ? "You still review and sign every transaction in your wallet."
          : "Transaction signing is not available here."
      }${limitedRelease ? " Wallet compatibility is still expanding." : ""}`
    : `Matterhorn prepares the action. ${
        support.signing === "external_signer"
          ? "Review, sign, and submit it in your own wallet or protocol client."
          : "Signing and submission are not available here."
      }${limitedRelease ? " This workflow is still in a limited release." : ""}`;
  return {
    label,
    detail,
    status: support.status,
  };
}

export function storageLocationLabel(
  store: MatterhornDataStoreDescriptor,
): string {
  if (store.scope === "opencode_runtime")
    return "Managed chat history on this device";
  if (store.path?.trim()) return store.path.trim();
  const firstPath = store.paths?.find((path) => path.trim());
  if (firstPath) return firstPath.trim();
  if (store.scope === "matterhorn_cloud") return "Matterhorn Cloud";
  if (store.scope === "machine_global") return "This device";
  if (store.scope === "workspace") return "Workspace folder";
  return "Location unavailable";
}

export function workspaceDataPolicySummary(
  dataMap: MatterhornWorkspaceDataMapResponse,
): string {
  if (dataMap.policy.trainingUse === "none_by_default") {
    return "No training use by default.";
  }
  if (dataMap.policy.trainingUse === "opt_in_only") {
    return "Training use requires opt-in.";
  }
  return "Training policy unavailable.";
}
