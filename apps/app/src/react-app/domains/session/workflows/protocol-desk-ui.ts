import {
  PROTOCOL_BRAND_ASSET_REGISTRY,
  PROTOCOL_DESK_MANIFEST_REGISTRY,
  type ProtocolBrandAssetManifest,
  type ProtocolDeskManifest,
  type ProtocolDeskVisualStatus,
} from "@matterhorn-work/types/matterhorn-workflows";

export type CustomerProtocolDeskId =
  | "bittensor"
  | "hyperliquid"
  | "polymarket"
  | "wellness"
  | "memory"
  | "mcps";

export const CUSTOMER_PROTOCOL_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "memory",
  "mcps",
] as const satisfies readonly CustomerProtocolDeskId[];

export const CUSTOMER_LAUNCHER_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
] as const satisfies readonly CustomerProtocolDeskId[];

export const CUSTOMER_RAIL_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
] as const satisfies readonly CustomerProtocolDeskId[];

export type CustomerProtocolDeskVisual = {
  id: CustomerProtocolDeskId;
  displayName: string;
  shortDescription: string;
  category: ProtocolDeskManifest["category"];
  status: ProtocolDeskVisualStatus;
  statusLabel: string;
  routeOrPanelId: string;
  logoAssetKey: string;
  fallbackInitials: string;
  preferredColorToken: string;
  theme: {
    light: ProtocolDeskManifest["lightThemeTokenHints"];
    dark: ProtocolDeskManifest["darkThemeTokenHints"];
  };
  primaryActions: ProtocolDeskManifest["primaryActions"];
  secondaryActions: ProtocolDeskManifest["secondaryActions"];
  walletRequirements: ProtocolDeskManifest["walletRequirements"];
  safetyBoundaries: ProtocolDeskManifest["safetyBoundaries"];
  emptyStateCopy: ProtocolDeskManifest["emptyStateCopy"];
  degradedStateCopy: ProtocolDeskManifest["degradedStateCopy"];
  capabilityBullets: string[];
  safetySummary: string;
  railTitle: string;
  sessionTitle: string;
  sessionBoundary: string;
  brandAsset: ProtocolBrandAssetManifest | null;
};

const STATUS_LABELS: Record<ProtocolDeskVisualStatus, string> = {
  beta_ready: "Beta-ready",
  preview_only: "Preview only",
  workflow_ready: "Workflow-ready",
  planned_not_live: "Planned, not live",
};

const MARKET_STATUS_LABELS: Partial<Record<CustomerProtocolDeskId, string>> = {
  hyperliquid: "External trade handoff",
  polymarket: "Compliance-gated handoff",
};

const WORKSPACE_TO_DESK_ID: Record<string, CustomerProtocolDeskId | undefined> = {
  bittensor: "bittensor",
  hyperliquid: "hyperliquid",
  polymarket: "polymarket",
  wellness: "wellness",
};

export function protocolDeskStatusLabel(status: ProtocolDeskVisualStatus, id?: CustomerProtocolDeskId | string): string {
  return MARKET_STATUS_LABELS[id as CustomerProtocolDeskId] ?? STATUS_LABELS[status];
}

export function protocolDeskIdForWorkspace(workspaceId: string | null | undefined): CustomerProtocolDeskId | null {
  if (!workspaceId) return null;
  return WORKSPACE_TO_DESK_ID[workspaceId] ?? null;
}

export function protocolDeskIdForChatMode(chatMode: string | null | undefined): CustomerProtocolDeskId | null {
  if (!chatMode) return null;
  return WORKSPACE_TO_DESK_ID[chatMode] ?? null;
}

function compactActionLabel(label: string): string {
  return label
    .replace(/^Preview /i, "")
    .replace(/^Prepare /i, "")
    .replace(/^Research /i, "")
    .replace(/^Build /i, "")
    .replace(/^Manage /i, "")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function capabilityBullets(manifest: ProtocolDeskManifest): string[] {
  const actions = [...manifest.primaryActions, ...manifest.secondaryActions]
    .map((action) => compactActionLabel(action.label))
    .filter(Boolean);
  const walletBoundary = manifest.walletRequirements.includes("ss58_external_signer")
    ? "External signer handoff"
    : manifest.walletRequirements.includes("evm_read_only")
      ? "Public wallet context"
      : manifest.category === "wellness"
        ? "Client-safe artifacts"
        : "Safe context";
  return Array.from(new Set([...actions, walletBoundary])).slice(0, 3);
}

function safetySummary(manifest: ProtocolDeskManifest): string {
  if (manifest.id === "bittensor") {
    return "Public SS58 reads and unsigned previews only. External signer required; no seed phrases, private keys, or wallet exports.";
  }
  if (manifest.id === "hyperliquid" || manifest.id === "polymarket") {
    return "Can submit: No. Live submission: Off. External trade handoff only; Matterhorn never stores keys, API secrets, raw signatures, or signed payloads.";
  }
  if (manifest.id === "wellness") {
    return "Standalone workflow. No Web3 trading, medical advice, diagnosis, prescriptions, or live payment/email/hosting claims.";
  }
  if (manifest.id === "memory") {
    return "User-controlled memory only. No hidden saves; secrets and clinical records are blocked.";
  }
  if (manifest.id === "mcps") {
    return "Approved MCP tools only. No secret collection, signing, custody, or market submission.";
  }
  return "Matterhorn keeps safety boundaries visible before anything runs.";
}

function railTitle(manifest: ProtocolDeskManifest): string {
  if (manifest.id === "bittensor") {
    return "Bittensor: TAO wallet reads, subnets, validators, watches, receipts, and unsigned staking previews";
  }
  if (manifest.id === "hyperliquid") {
    return "Hyperliquid: orderbooks, exposure, funding, watches, and external trade handoffs";
  }
  if (manifest.id === "polymarket") {
    return "Polymarket: markets, outcomes, liquidity, compliance, watches, and trade handoffs";
  }
  if (manifest.id === "wellness") {
    return "Longevity: standalone service workflows, program packets, progress check-ins, and client handoffs";
  }
  return `${manifest.displayName}: ${manifest.shortDescription}`;
}

function sessionTitle(manifest: ProtocolDeskManifest): string {
  if (manifest.id === "wellness") return "Longevity workflow session";
  return `${manifest.displayName} session`;
}

function sessionBoundary(manifest: ProtocolDeskManifest): string {
  if (manifest.id === "bittensor") {
    return "Public SS58/coldkey/hotkey context only. External signer required for actions.";
  }
  if (manifest.id === "hyperliquid") {
    return "External trade handoff only. Can submit: No. Live submission: Off. Matterhorn never stores API secrets or signs orders.";
  }
  if (manifest.id === "polymarket") {
    return "Compliance-gated handoff only. Can submit: No. Live submission: Off. Blocked regions get no executable bet fields.";
  }
  if (manifest.id === "wellness") {
    return "Standalone workflow. No medical advice, diagnosis, prescription, live payments, email, hosting, or token gating.";
  }
  return safetySummary(manifest);
}

export function getCustomerProtocolDeskVisual(id: CustomerProtocolDeskId | string | null | undefined): CustomerProtocolDeskVisual | null {
  if (!id) return null;
  const manifest = PROTOCOL_DESK_MANIFEST_REGISTRY[id];
  if (!manifest || !CUSTOMER_PROTOCOL_DESK_IDS.includes(manifest.id as CustomerProtocolDeskId)) return null;
  const brandAsset = PROTOCOL_BRAND_ASSET_REGISTRY[manifest.logoAssetKey] ?? null;
  return {
    id: manifest.id as CustomerProtocolDeskId,
    displayName: manifest.displayName,
    shortDescription: manifest.shortDescription,
    category: manifest.category,
    status: manifest.status,
    statusLabel: protocolDeskStatusLabel(manifest.status, manifest.id),
    routeOrPanelId: manifest.routeOrPanelId,
    logoAssetKey: manifest.logoAssetKey,
    fallbackInitials: brandAsset?.fallbackInitials ?? manifest.displayName.slice(0, 2).toUpperCase(),
    preferredColorToken: manifest.preferredColorToken,
    theme: {
      light: manifest.lightThemeTokenHints,
      dark: manifest.darkThemeTokenHints,
    },
    primaryActions: manifest.primaryActions,
    secondaryActions: manifest.secondaryActions,
    walletRequirements: manifest.walletRequirements,
    safetyBoundaries: manifest.safetyBoundaries,
    emptyStateCopy: manifest.emptyStateCopy,
    degradedStateCopy: manifest.degradedStateCopy,
    capabilityBullets: capabilityBullets(manifest),
    safetySummary: safetySummary(manifest),
    railTitle: railTitle(manifest),
    sessionTitle: sessionTitle(manifest),
    sessionBoundary: sessionBoundary(manifest),
    brandAsset,
  };
}

export const CUSTOMER_PROTOCOL_DESK_VISUALS: CustomerProtocolDeskVisual[] = CUSTOMER_PROTOCOL_DESK_IDS
  .map((id) => getCustomerProtocolDeskVisual(id))
  .filter((visual): visual is CustomerProtocolDeskVisual => Boolean(visual));

export const CUSTOMER_LAUNCHER_DESK_VISUALS: CustomerProtocolDeskVisual[] = CUSTOMER_LAUNCHER_DESK_IDS
  .map((id) => getCustomerProtocolDeskVisual(id))
  .filter((visual): visual is CustomerProtocolDeskVisual => Boolean(visual));
