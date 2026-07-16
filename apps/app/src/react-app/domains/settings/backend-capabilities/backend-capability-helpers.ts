/** @jsxImportSource react */
import type {
  MatterhornCapability,
  MatterhornCapabilityStatus,
  MatterhornWalletCapability,
  MatterhornWalletFamilyCapability,
} from "@matterhorn-work/types/backend-capabilities";
import {
  backendCapabilityLabel,
  backendCapabilityTone,
  summarizeCapability,
} from "../backend-capability-status";

export type CapabilityUiStatus = MatterhornCapabilityStatus | "unavailable";

export type CapabilityUiTone = "ready" | "setup" | "preview" | "neutral" | "error";

export function capabilityStatusLabel(status: CapabilityUiStatus): string {
  return status === "unavailable" ? "Unavailable" : backendCapabilityLabel(status);
}

export function capabilityStatusTone(status: CapabilityUiStatus): CapabilityUiTone {
  return status === "unavailable" ? "neutral" : backendCapabilityTone(status);
}

export function capabilitySummary(capability: MatterhornCapability | undefined): string {
  if (!capability) return "Status unavailable";
  return summarizeCapability(capability);
}

export function walletFamilySigningCopy(family: MatterhornWalletFamilyCapability): {
  label: string;
  hint: string;
} {
  if (family.family === "sui") {
    if (family.status === "preview" || family.status === "working") {
      return {
        label: family.status === "preview" ? "Connect here · Limited release" : "Connect here",
        hint: "Connect a supported Sui wallet in Matterhorn. You still review and sign every transaction in that wallet.",
      };
    }
    return {
      label: "Not supported here",
      hint: "Sui direct wallet connect is not available in this runtime. Transaction drafts and receipt evidence remain available when the workspace engine supports them.",
    };
  }

  if (family.status === "unsupported") {
    return {
      label: "Not supported here",
      hint: "This wallet family is not connected or supported in this build.",
    };
  }

  if (family.family === "evm") {
    if (family.directConnect && family.signing === "client_wallet") {
      return {
        label: family.status === "working" ? "Connect here" : capabilityStatusLabel(family.status),
        hint: "Connect your own EVM wallet. Matterhorn Work never holds your keys.",
      };
    }
    return {
      label: capabilityStatusLabel(family.status),
      hint: "EVM wallet connection is the direct-connect path in this build.",
    };
  }

  if (family.family === "bittensor") {
    return {
      label: family.publicRead ? "Read here · Prepare only" : capabilityStatusLabel(family.status),
      hint: "Matterhorn reads public Bittensor data and prepares unsigned actions. Review, sign, and submit them with your own Bittensor signer.",
    };
  }

  return {
    label: capabilityStatusLabel(family.status),
    hint: capabilitySummary(family),
  };
}

export function walletCapabilitySummary(wallets: MatterhornWalletCapability | undefined): string {
  if (!wallets) return "Wallet status unavailable";
  const evm = walletFamilySigningCopy(wallets.families.evm);
  const sui = walletFamilySigningCopy(wallets.families.sui);
  const bittensor = walletFamilySigningCopy(wallets.families.bittensor);
  return `EVM: ${evm.label}. Sui: ${sui.label}. Bittensor: ${bittensor.label}.`;
}

export function memoryScopeCopy(scope: "machine_global" | "workspace" | "unknown" | undefined): {
  label: string;
  hint: string;
} {
  if (scope === "workspace") {
    return {
      label: "Workspace-scoped",
      hint: "Memory is scoped to this workspace by the backend.",
    };
  }
  if (scope === "machine_global") {
    return {
      label: "Machine / global",
      hint: "Memory currently uses the machine-level vault unless the backend reports workspace scoping.",
    };
  }
  return {
    label: "Unknown scope",
    hint: "Memory scope could not be determined.",
  };
}

export function feedbackCapabilityCopy(capability: MatterhornCapability | undefined): {
  label: string;
  hint: string;
} {
  if (!capability || capability.status === "unsupported") {
    return {
      label: capability ? capabilityStatusLabel(capability.status) : "Status unavailable",
      hint: capability?.description || "Structured local feedback is unavailable from the backend. Use the configured support link if provided.",
    };
  }
  if (capability.status === "preview") {
      return {
        label: "Limited release",
        hint: capability.description || "Structured feedback is stored locally for product quality and routing. No training by default.",
    };
  }
  return {
    label: capabilityStatusLabel(capability.status),
    hint: capability.description || "Feedback status from the backend.",
  };
}
