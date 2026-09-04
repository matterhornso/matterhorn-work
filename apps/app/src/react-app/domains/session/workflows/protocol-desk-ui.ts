import type { CSSProperties } from "react";
import {
  MATTERHORN_WORKFLOW_FIXTURES,
  PROTOCOL_BRAND_ASSET_REGISTRY,
  PROTOCOL_DESK_MANIFEST_REGISTRY,
  type MatterhornWorkflowManifest,
  type ProtocolBrandAssetManifest,
  type ProtocolDeskManifest,
  type ProtocolDeskVisualStatus,
} from "@matterhorn-work/types/matterhorn-workflows";
import { getMatterhornDeskAgent } from "@matterhorn-work/types/desk-agents";

export type CustomerProtocolDeskId =
  | "bittensor"
  | "hyperliquid"
  | "polymarket"
  | "sui"
  | "wellness"
  | "memory"
  | "mcps";

export const CUSTOMER_PROTOCOL_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "wellness",
  "memory",
  "mcps",
] as const satisfies readonly CustomerProtocolDeskId[];

export const CUSTOMER_LAUNCHER_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "wellness",
] as const satisfies readonly CustomerProtocolDeskId[];

export const CUSTOMER_RAIL_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
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
  agentId?: string;
  agentName: string;
  agentDescription: string;
  outputDeskId: string;
  brandAsset: ProtocolBrandAssetManifest | null;
};

const STATUS_LABELS: Record<ProtocolDeskVisualStatus, string> = {
  live: "Working",
  beta_ready: "Read and preview",
  preview_only: "Preview only",
  workflow_ready: "Workflow-ready",
  planned_not_live: "Planned, not live",
};

const DESK_STATUS_LABELS: Partial<Record<CustomerProtocolDeskId, string>> = {
  bittensor: "Transfer, stake & unstake",
  hyperliquid: "Review in wallet",
  polymarket: "Buy, sell & cancel",
  sui: "Transfer in wallet",
};

const WORKSPACE_TO_DESK_ID: Record<string, CustomerProtocolDeskId | undefined> = {
  bittensor: "bittensor",
  hyperliquid: "hyperliquid",
  polymarket: "polymarket",
  sui: "sui",
  wellness: "wellness",
};

export function protocolDeskStatusLabel(status: ProtocolDeskVisualStatus, id?: CustomerProtocolDeskId | string): string {
  return DESK_STATUS_LABELS[id as CustomerProtocolDeskId] ?? STATUS_LABELS[status];
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
        ? "Offline human-optimization"
        : "Safe context";
  return Array.from(new Set([...actions, walletBoundary])).slice(0, 3);
}

function safetySummary(manifest: ProtocolDeskManifest): string {
  if (manifest.id === "bittensor") {
    return "Agents prepare drafts only. TAO transfers, stake, and unstake calls require exact review and connected Bittensor-wallet approval. Other runtime calls remain unavailable until separately audited.";
  }
  if (manifest.id === "hyperliquid") {
    return "Agents prepare drafts only. Exact orders require separate review and connected-wallet authorization before one-time submission.";
  }
  if (manifest.id === "polymarket") {
    return "Agents prepare drafts only. Eligible buy, sell, and cancel actions require compliance approval, exact review, and connected Polygon-wallet authorization.";
  }
  if (manifest.id === "sui") {
    return "Use your Sui wallet on web. On desktop, Matterhorn prepares the action for you to finish in your own wallet. Matterhorn stores previews and public receipts only.";
  }
  if (manifest.id === "wellness") {
    return "Standalone business workflow. Not Web3, not markets, no medical advice, and no live payments/email/hosting.";
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
    return "Bittensor: TAO reads, subnets, validators, wallet-reviewed transfers, stake, unstake, watches, and receipts";
  }
  if (manifest.id === "hyperliquid") {
    return "Hyperliquid: orderbooks, exposure, funding, watches, and wallet-reviewed place, cancel, modify, and close actions";
  }
  if (manifest.id === "polymarket") {
    return "Polymarket: markets, liquidity, compliance, watches, and wallet-reviewed buy, sell, and cancel actions";
  }
  if (manifest.id === "sui") {
    return "Sui: account reads, native and custom coin transfers, object transfers, batch transfers, and receipt evidence";
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
    return "Public wallet details and transaction drafts. You approve TAO transfers, stake, and unstake calls in your connected wallet; unsupported advanced calls are not presented as executable.";
  }
  if (manifest.id === "hyperliquid") {
    return "Runs market and account checks, then prepares exact place, cancel, modify, and close actions for separate review and connected-wallet approval. Agents cannot submit autonomously.";
  }
  if (manifest.id === "polymarket") {
    return "Runs market research and compliance checks. Eligible buy, sell, and cancel actions continue through a separate connected-wallet ticket; blocked regions get no executable terms.";
  }
  if (manifest.id === "sui") {
    return "Runs public Sui account reads and prepares native coin, custom coin, object, and batch transfers. Web signing happens in the connected wallet; desktop signing stays external.";
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
  const agent = getMatterhornDeskAgent(manifest.id);
  return {
    id: manifest.id as CustomerProtocolDeskId,
    displayName: manifest.displayName,
    shortDescription: manifest.shortDescription,
    category: manifest.category,
    status: manifest.status,
    statusLabel: agent?.capabilityPolicy.statusLabel ?? protocolDeskStatusLabel(manifest.status, manifest.id),
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
    safetySummary: agent?.capabilityPolicy.summary ?? safetySummary(manifest),
    railTitle: railTitle(manifest),
    sessionTitle: sessionTitle(manifest),
    sessionBoundary: agent?.capabilityPolicy.summary ?? sessionBoundary(manifest),
    agentId: agent?.agentId,
    agentName: agent?.displayName ?? `${manifest.displayName} Agent`,
    agentDescription: agent?.description ?? manifest.shortDescription,
    outputDeskId: agent?.outputDeskId ?? manifest.id,
    brandAsset,
  };
}

type PublicBetaProtocolDeskCopy = Pick<
  CustomerProtocolDeskVisual,
  | "shortDescription"
  | "capabilityBullets"
  | "primaryActions"
  | "secondaryActions"
  | "safetySummary"
  | "railTitle"
  | "sessionBoundary"
  | "agentDescription"
>;

function publicBetaAction(actionId: string, label: string, intent: string): ProtocolDeskManifest["primaryActions"][number] {
  return {
    actionId,
    label,
    intent,
    requiresConfirmation: false,
    surface: "desk_panel",
  };
}

const PUBLIC_BETA_PROTOCOL_DESK_COPY: Partial<
  Record<CustomerProtocolDeskId, PublicBetaProtocolDeskCopy>
> = {
  bittensor: {
    shortDescription: "Read TAO context, compare subnets and validators, and collect public evidence.",
    capabilityBullets: ["TAO context", "Subnet and validator research", "Watches and evidence"],
    primaryActions: [
      publicBetaAction("read_tao_context", "Read public TAO context", "Read public TAO context"),
      publicBetaAction("compare_subnets", "Compare subnets", "Compare public subnet data"),
      publicBetaAction("compare_validators", "Compare validators", "Compare public validator data"),
    ],
    secondaryActions: [
      publicBetaAction("create_watch", "Create a watch", "Monitor public Bittensor data"),
      publicBetaAction("save_public_evidence", "Save public evidence", "Save public Bittensor evidence"),
    ],
    safetySummary: "Public Beta is limited to Bittensor research, monitoring, and public evidence.",
    railTitle: "Bittensor: TAO reads, subnet and validator research, watches, and public evidence",
    sessionBoundary: "Public Beta keeps this desk read-only. Transaction preparation, staking, transfers, and wallet actions stay hidden.",
    agentDescription: "Researches public TAO, subnet, and validator context without preparing wallet actions.",
  },
  hyperliquid: {
    shortDescription: "Research markets, exposure, funding, and watch evidence.",
    capabilityBullets: ["Markets and orderbooks", "Exposure and funding", "Watches and evidence"],
    primaryActions: [
      publicBetaAction("read_market_structure", "Read market structure", "Read public market structure"),
      publicBetaAction("review_exposure", "Review exposure", "Review public exposure data"),
      publicBetaAction("compare_funding", "Compare funding", "Compare public funding data"),
    ],
    secondaryActions: [
      publicBetaAction("create_watch", "Create a watch", "Monitor public Hyperliquid data"),
      publicBetaAction("save_public_evidence", "Save public evidence", "Save public Hyperliquid evidence"),
    ],
    safetySummary: "Public Beta is limited to Hyperliquid research, monitoring, and public evidence.",
    railTitle: "Hyperliquid: orderbooks, exposure, funding, watches, and public evidence",
    sessionBoundary: "Public Beta keeps this desk read-only. Order preparation, trade tickets, and wallet actions stay hidden.",
    agentDescription: "Researches public market, exposure, and funding context without preparing orders.",
  },
  polymarket: {
    shortDescription: "Research prediction markets across venues, with Polymarket liquidity, compliance, and watch evidence.",
    capabilityBullets: ["Cross-venue research", "Polymarket liquidity and compliance", "Watches and evidence"],
    primaryActions: [
      publicBetaAction("research_markets", "Research markets", "Research public prediction-market data"),
      publicBetaAction("review_liquidity", "Review liquidity", "Review public liquidity data"),
      publicBetaAction("check_compliance_context", "Check compliance context", "Read public compliance context"),
    ],
    secondaryActions: [
      publicBetaAction("create_watch", "Create a watch", "Monitor public Polymarket data"),
      publicBetaAction("save_public_evidence", "Save public evidence", "Save public Polymarket evidence"),
    ],
    safetySummary: "Public Beta supports cross-venue research. Kalshi and Manifold remain research-only; Polymarket wallet actions stay hidden.",
    railTitle: "Prediction markets: cross-venue research, Polymarket compliance, watches, and public evidence",
    sessionBoundary: "Public Beta keeps this desk read-only. Kalshi and Manifold have no transaction path, and Polymarket wallet actions stay hidden.",
    agentDescription: "Researches public prediction markets across supported venues without preparing trades.",
  },
  sui: {
    shortDescription: "Read public Sui account, object, network, and receipt evidence.",
    capabilityBullets: ["Account and object reads", "Network and fee research", "Receipt evidence"],
    primaryActions: [
      publicBetaAction("read_account_context", "Read account context", "Read public Sui account context"),
      publicBetaAction("inspect_objects", "Inspect objects", "Inspect public Sui objects"),
      publicBetaAction("review_network_context", "Review network context", "Review public Sui network context"),
    ],
    secondaryActions: [
      publicBetaAction("import_public_receipts", "Import public receipts", "Import public Sui receipt evidence"),
      publicBetaAction("save_public_evidence", "Save public evidence", "Save public Sui evidence"),
    ],
    safetySummary: "Public Beta is limited to public Sui reads, monitoring, and receipt evidence.",
    railTitle: "Sui: account and object reads, network research, watches, and receipt evidence",
    sessionBoundary: "Public Beta keeps this desk read-only. Transfer preparation, signing handoffs, and wallet actions stay hidden.",
    agentDescription: "Researches public Sui account, object, network, and receipt context without preparing transfers.",
  },
};

export function getCustomerProtocolDeskVisualForLaunch(
  id: CustomerProtocolDeskId | string | null | undefined,
  reviewedActions: boolean,
): CustomerProtocolDeskVisual | null {
  const visual = getCustomerProtocolDeskVisual(id);
  if (!visual || reviewedActions) return visual;
  const publicBetaCopy = PUBLIC_BETA_PROTOCOL_DESK_COPY[visual.id];
  return publicBetaCopy
    ? { ...visual, ...publicBetaCopy, statusLabel: "Read-only Beta" }
    : visual;
}

export const CUSTOMER_PROTOCOL_DESK_VISUALS: CustomerProtocolDeskVisual[] = CUSTOMER_PROTOCOL_DESK_IDS
  .map((id) => getCustomerProtocolDeskVisual(id))
  .filter((visual): visual is CustomerProtocolDeskVisual => Boolean(visual));

export const CUSTOMER_LAUNCHER_DESK_VISUALS: CustomerProtocolDeskVisual[] = CUSTOMER_LAUNCHER_DESK_IDS
  .map((id) => getCustomerProtocolDeskVisual(id))
  .filter((visual): visual is CustomerProtocolDeskVisual => Boolean(visual));

const DESK_WORKFLOW_ID: Record<CustomerProtocolDeskId, string | undefined> = {
  bittensor: "bittensor_operator",
  hyperliquid: "hyperliquid_preview",
  polymarket: "polymarket_preview",
  sui: "sui_wallet_workflow",
  wellness: "wellness_creator_services",
  memory: undefined,
  mcps: undefined,
};

export function getDeskWorkflowManifest(id: CustomerProtocolDeskId | string): MatterhornWorkflowManifest | null {
  const workflowId = DESK_WORKFLOW_ID[id as CustomerProtocolDeskId];
  if (!workflowId) return null;
  return MATTERHORN_WORKFLOW_FIXTURES[workflowId] ?? null;
}

export function deskToneStyle(id: CustomerProtocolDeskId | string): CSSProperties {
  const tone = (() => {
    switch (id) {
      case "bittensor":
        return ["--desk-bittensor", "--desk-bittensor-rgb", "--desk-bittensor-secondary"];
      case "hyperliquid":
        return ["--desk-hyperliquid", "--desk-hyperliquid-rgb", "--desk-hyperliquid-secondary"];
      case "polymarket":
        return ["--desk-polymarket", "--desk-polymarket-rgb", "--desk-polymarket-secondary"];
      case "sui":
        return ["--desk-sui", "--desk-sui-rgb", "--desk-sui-secondary"];
      case "wellness":
        return ["--desk-wellness", "--desk-wellness-rgb", "--desk-wellness-secondary"];
      default:
        return ["--matterhorn-blue", "--matterhorn-blue-rgb", "--matterhorn-sky"];
    }
  })();
  return {
    "--matterhorn-desk-color": `var(${tone[0]})`,
    "--matterhorn-desk-rgb": `var(${tone[1]})`,
    "--matterhorn-desk-secondary": `var(${tone[2]})`,
  } as CSSProperties;
}
