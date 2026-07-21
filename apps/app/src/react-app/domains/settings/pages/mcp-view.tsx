/** @jsxImportSource react */
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Cloud,
  Code2,
  Copy,
  CreditCard,
  ExternalLink,
  FolderOpen,
  Globe,
  Loader2,
  MonitorSmartphone,
  Plug2,
  Plus,
  Power,
  Search,
  Settings2,
  Unplug,
  Zap,
} from "lucide-react";

import {
  isBuiltInMatterhornExtension,
  getMcpServerName,
  isCustomerFacingMatterhornExtension,
  type McpDirectoryInfo,
} from "../../../../app/constants";
import {
  evaluateEnablement,
  defaultMcpEnablement,
} from "../../../../app/enablement";
import type { EnablementResult } from "../../../../app/extensions";
import type { CloudImportedPlugin } from "../../../../app/cloud/import-state";
import { ExtensionCard } from "../../../design-system/extension-card";
import { ExtensionDetailModal } from "../../../design-system/extension-detail-modal";
import {
  openDesktopPath,
  readOpencodeConfig,
  revealDesktopItemInDir,
  type OpencodeConfigFile,
} from "../../../../app/lib/desktop";
import { MATTERHORN_CLOUD_ENABLED } from "../../../../app/lib/den";
import { isPublicOauthConnectorEnabledAtLaunch } from "../../../../app/lib/launch-features";
import { getMcpIdentityKey, normalizeMcpSlug } from "../../../../app/mcp";
import type { McpServerEntry, McpStatusMap } from "../../../../app/types";
import {
  formatRelativeTime,
  isDesktopRuntime,
  isWindowsPlatform,
} from "../../../../app/utils";
import { t } from "../../../../i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import { AddMcpModal } from "../../connections/modals/add-mcp-modal";
import {
  isMatterhornExtensionEnabled,
  isMatterhornExtensionHidden,
  MATTERHORN_EXTENSION_STATE_CHANGED,
  setMatterhornExtensionEnabled,
  setMatterhornExtensionHidden,
} from "../extension-state";
import {
  initialMcpViewLocalState,
  mcpViewLocalReducer,
  type ConfigScope,
  type McpViewLocalState,
} from "./mcp-view-state";
import {
  matterhornMcpDisplayName,
  mcpServerDisplayName,
} from "./mcp-display-name";
import { ProtocolBrandLogo } from "../../session/workflows/protocol-brand-logo";
import type { CustomerProtocolDeskId } from "../../session/workflows/protocol-desk-ui";

export type ReactMcpStatus =
  | "connected"
  | "needs_auth"
  | "needs_client_registration"
  | "failed"
  | "disabled"
  | "disconnected";

export type SkillItem = {
  name: string;
  description?: string;
  trigger?: string;
  path: string;
};

const getSkillHiddenId = (skill: SkillItem) => `skill:${skill.name}`;

function fallbackMcpDisplayName(name: string) {
  return mcpServerDisplayName(name);
}

export type McpViewProps = {
  busy: boolean;
  selectedWorkspaceRoot: string;
  isRemoteWorkspace: boolean;
  /** Installed skills to render alongside MCPs in the grid. */
  installedSkills?: SkillItem[];
  /** Installed marketplace packages to render alongside runtime extensions. */
  installedPlugins?: CloudImportedPlugin[];
  /** Uninstall a skill by name. */
  uninstallSkill?: (name: string) => void;
  /** Remove an imported marketplace package by plugin id. */
  removeCloudPlugin?: (pluginId: string) => void | Promise<unknown>;
  /** Read skill content by name. */
  readSkill?: (name: string) => Promise<{ content: string } | null>;
  readConfigFile?: (
    scope: "project" | "global",
  ) => Promise<OpencodeConfigFile | null>;
  showHeader?: boolean;
  mcpServers: McpServerEntry[];
  mcpStatus: string | null;
  mcpLastUpdatedAt: number | null;
  mcpStatuses: McpStatusMap;
  mcpConnectingName: string | null;
  selectedMcp: string | null;
  setSelectedMcp: (name: string | null) => void;
  quickConnect: McpDirectoryInfo[];
  connectMcp: (entry: McpDirectoryInfo) => void;
  authorizeMcp: (entry: McpServerEntry) => void;
  logoutMcpAuth: (name: string) => Promise<void> | void;
  removeMcp: (name: string) => void;
  setMcpEnabled?: (name: string, enabled: boolean) => Promise<void> | void;
  /** Return extension-specific config UI for the detail modal. */
  configSlotForEntry?: (entry: McpDirectoryInfo) => React.ReactNode | null;
  /** Check if an extension-kind entry is connected/active. */
  isExtensionConnected?: (entry: McpDirectoryInfo) => boolean;
  /** Enablement context for evaluating extension active state. */
  enablementContext?: import("../../../../app/enablement").EnablementContext;
  /** Organization policy restriction for Matterhorn Desks-provided built-in extensions. */
  builtInExtensionsDisabled?: boolean;
  detailEntryRequest?: { id: string; requestId: number } | null;
  onDetailEntryRequestHandled?: (requestId: number) => void;
  addMcpRequestId?: number | null;
  onAddMcpRequestHandled?: (requestId: number) => void;
  /** Rendered inside the session right rail instead of the full Settings page. */
  compact?: boolean;
};

const builtInExtensionDisabledReason = "Disabled by organization";

const statusDot = (status: ReactMcpStatus) => {
  switch (status) {
    case "connected":
      return "bg-green-9";
    case "needs_auth":
    case "needs_client_registration":
      return "bg-amber-9";
    case "disabled":
      return "bg-gray-8";
    case "disconnected":
      return "bg-gray-7";
    default:
      return "bg-red-9";
  }
};

const friendlyStatus = (status: ReactMcpStatus) => {
  switch (status) {
    case "connected":
      return t("mcp.friendly_status_ready");
    case "needs_auth":
    case "needs_client_registration":
      return t("mcp.friendly_status_needs_signin");
    case "disabled":
      return t("mcp.friendly_status_paused");
    case "disconnected":
      return t("mcp.friendly_status_offline");
    default:
      return t("mcp.friendly_status_issue");
  }
};

const statusBadgeStyle = (status: ReactMcpStatus) => {
  switch (status) {
    case "connected":
      return "bg-green-3 text-green-11";
    case "needs_auth":
    case "needs_client_registration":
      return "bg-amber-3 text-amber-11";
    case "disabled":
    case "disconnected":
      return "bg-gray-3 text-gray-11";
    default:
      return "bg-red-3 text-red-11";
  }
};

const serviceIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("notion")) return BookOpen;
  if (lower.includes("linear")) return Zap;
  if (lower.includes("sentry")) return CircleAlert;
  if (lower.includes("stripe")) return CreditCard;
  if (lower.includes("context")) return Globe;
  if (lower.includes("devtools")) {
    return MonitorSmartphone;
  }
  if (lower.includes("matterhorn") && lower.includes("cloud")) return Cloud;
  if (lower.includes("matterhorn") && lower.includes("ui"))
    return MonitorSmartphone;
  return Plug2;
};

const serviceColor = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("notion")) return "text-gray-12";
  if (lower.includes("linear")) return "text-blue-11";
  if (lower.includes("sentry")) return "text-purple-11";
  if (lower.includes("stripe")) return "text-blue-11";
  if (lower.includes("context")) return "text-green-11";
  if (lower.includes("devtools")) {
    return "text-amber-11";
  }
  if (lower.includes("matterhorn")) return "text-gray-12";
  return "text-dls-secondary";
};

function extensionResourceLabels(entry: McpDirectoryInfo) {
  return (
    entry.extensionManifest?.resources.map(
      (resource) => resource.label ?? resource.id,
    ) ?? []
  );
}

function extensionContributionLabels(entry: McpDirectoryInfo) {
  return (
    entry.extensionManifest?.contributions?.map(
      (contribution) =>
        contribution.label ?? contribution.ref ?? contribution.type,
    ) ?? []
  );
}

function isToggleOnlyExtension(entry: McpDirectoryInfo) {
  if (entry.kind !== "extension") return false;
  return (
    entry.extensionManifest?.contributions?.some(
      (contribution) =>
        contribution.type === "session-side-panel" ||
        contribution.type === "session-rail-item",
    ) === true
  );
}

function hasRunnableConnectorTarget(entry: McpDirectoryInfo) {
  return Boolean(
    entry.oauth || entry.type || entry.command?.length || entry.url,
  );
}

function protocolDeskLogoNode(entry: McpDirectoryInfo, size = 24) {
  if (!entry.protocolDeskId) return undefined;
  return (
    <ProtocolBrandLogo
      id={entry.protocolDeskId as CustomerProtocolDeskId}
      size={size}
    />
  );
}

function availabilityLabelForEntry(
  entry: McpDirectoryInfo,
  configured: boolean,
  disabledReason: string | null,
) {
  if (disabledReason) return "Blocked by platform";
  const id = entry.id ?? entry.serverName ?? getMcpServerName(entry);
  if (id === "bittensor") return "Built-in preview";
  if (id === "hyperliquid" || id === "polymarket") return "Built-in preview";
  if (id === "matterhorn-memory" || id === "matterhorn-crypto")
    return "Built-in";
  if (id === "openai-image-gen" || id === "matterhorn-voice")
    return "Needs API key";
  if (isBuiltInMatterhornExtension(entry))
    return entry.preview ? "Built-in preview" : "Built-in";
  if (entry.oauth) return configured ? "Connected" : "Connect account";
  if (
    entry.kind === "mcp" ||
    entry.kind === "ui-control" ||
    entry.command?.length ||
    entry.url
  ) {
    return configured ? "Configured" : "Requires setup";
  }
  if (!hasRunnableConnectorTarget(entry))
    return configured ? "Configured" : "Catalog only";
  return configured ? "Installed" : "Requires setup";
}

function actionLabelForEntry(
  entry: McpDirectoryInfo,
  configured: boolean,
  disabledReason: string | null,
) {
  if (disabledReason) return "View details";
  if (configured) return "View details";
  if (!hasRunnableConnectorTarget(entry)) return "View setup";
  return t("mcp.tap_to_connect");
}

type ExtensionFilter = "all" | "mcp" | "skill" | "plugin";

type MatterhornMcpProductCard = {
  id: string;
  name: string;
  description: string;
  command: string;
  tools: string[];
  toolSummary?: string;
  boundary: string;
  worksWith: string[];
  docs: {
    repoPath: string;
    githubUrl: string;
    summary: string;
    sections: Array<{
      title: string;
      items: string[];
    }>;
    examples: string[];
  };
  protocolDeskId?: CustomerProtocolDeskId;
  statusLabel?: string;
  setupNote?: string;
  backendBacked?: boolean;
};

type MatterhornMcpClientId =
  | "codex"
  | "claude-code"
  | "claude-desktop"
  | "cursor";

type MatterhornMcpClientInstallGuide = {
  id: MatterhornMcpClientId;
  label: string;
  command: string;
  configSurface: string;
  summary: string;
  steps: string[];
  verifyTools: string[];
  safetyNote: string;
};

const DEFAULT_MATTERHORN_MCP_CLIENT_ID: MatterhornMcpClientId = "codex";
const MATTERHORN_MCP_DOCS_GITHUB_BASE =
  "https://github.com/matterhornso/matterhorn-work/blob/dev/docs/mcp";

function mcpDocs(
  slug: string,
  summary: string,
  sections: MatterhornMcpProductCard["docs"]["sections"],
  examples: string[],
): MatterhornMcpProductCard["docs"] {
  return {
    repoPath: `docs/mcp/${slug}.md`,
    githubUrl: `${MATTERHORN_MCP_DOCS_GITHUB_BASE}/${slug}.md`,
    summary,
    sections,
    examples,
  };
}

const MATTERHORN_MCP_CLIENT_INSTALL_GUIDES: MatterhornMcpClientInstallGuide[] =
  [
    {
      id: "codex",
      label: "Codex",
      command: "matterhorn-work mcp config --target codex --profile full",
      configSurface: "~/.codex/config.toml",
      summary:
        "Generates Codex-native TOML for Matterhorn protocol, memory, workflow, and UI tools.",
      steps: [
        "Run the command and add its TOML output to ~/.codex/config.toml.",
        "Restart or refresh Codex.",
        "Confirm Matterhorn tools are listed.",
      ],
      verifyTools: [
        "matterhorn_bittensor_chat",
        "matterhorn_crypto_chat",
        "matterhorn_memory_list",
      ],
      safetyNote:
        "Preview or external-signer only. Never paste keys, seeds, signatures, payloads, secrets, or wallet exports.",
    },
    {
      id: "claude-code",
      label: "Claude Code",
      command: "matterhorn-work mcp config --target claude --profile full",
      configSurface: "Project .mcp.json",
      summary:
        "Generates MCP JSON for protocol reads, memory, workflow, and evidence tools.",
      steps: [
        "Run the command and save its JSON output as .mcp.json.",
        "Restart Claude Code.",
        "Confirm Matterhorn tools appear.",
      ],
      verifyTools: [
        "matterhorn_hyperliquid_chat",
        "matterhorn_polymarket_chat",
        "matterhorn_crypto_chat",
      ],
      safetyNote: "No custody, live submit, API secrets, or signed payloads.",
    },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      command:
        "matterhorn-work mcp config --target claude-desktop --profile full",
      configSurface: "claude_desktop_config.json",
      summary: "Generates Matterhorn MCP JSON for Claude Desktop.",
      steps: [
        "Run the command and merge its output into claude_desktop_config.json.",
        "Quit and reopen Claude Desktop.",
        "Test one public Matterhorn tool.",
      ],
      verifyTools: [
        "matterhorn_bittensor_prepare_extrinsic",
        "matterhorn_hyperliquid_preview_order",
        "matterhorn_polymarket_preview_order",
      ],
      safetyNote:
        "Handoffs stay unsigned. Review actions in your wallet or protocol client.",
    },
    {
      id: "cursor",
      label: "Cursor",
      command: "matterhorn-work mcp config --target cursor --profile full",
      configSurface: ".cursor/mcp.json",
      summary:
        "Generates MCP JSON for protocol, workflow, memory, and UI tools in Cursor.",
      steps: [
        "Run the command and save its JSON output as .cursor/mcp.json.",
        "Restart Cursor and reopen the project.",
        "Confirm the Matterhorn server is active.",
      ],
      verifyTools: [
        "matterhorn_crypto_chat",
        "matterhorn_memory_search",
        "matterhorn_ui_control",
      ],
      safetyNote:
        "Public or redacted context only. Never paste keys, secrets, signatures, payloads, or wallet exports.",
    },
  ];

const MATTERHORN_MCP_PRODUCT_CARDS: MatterhornMcpProductCard[] = [
  {
    id: "bittensor",
    name: "Bittensor MCP",
    protocolDeskId: "bittensor",
    description:
      "TAO reads, subnet discovery, validator checks, watches, receipts, and unsigned previews.",
    command: "matterhorn-work mcp config --target codex --profile full",
    tools: [
      "matterhorn_bittensor_chat",
      "matterhorn_bittensor_readiness",
      "matterhorn_bittensor_customer_evidence_bundle",
      "matterhorn_bittensor_list_capabilities",
      "matterhorn_bittensor_get_subnet_capability",
      "matterhorn_bittensor_adapter_canary_gate",
      "matterhorn_bittensor_prepare_extrinsic",
      "matterhorn_bittensor_create_signing_handoff",
      "matterhorn_bittensor_import_receipt",
      "matterhorn_bittensor_check_receipt",
      "matterhorn_bittensor_check_signing_handoff",
      "matterhorn_bittensor_submit_signed_extrinsic",
      "matterhorn_bittensor_preview_subnet_invocation",
      "matterhorn_bittensor_invoke_subnet",
      "matterhorn_bittensor_create_watch",
      "matterhorn_bittensor_list_watches",
      "matterhorn_bittensor_check_watches",
      "matterhorn_bittensor_watch_digest",
      "matterhorn_bittensor_act_on_watch_alert",
    ],
    toolSummary:
      "19 tools for chat, wallet reads, readiness, subnets, watches, and receipts.",
    boundary:
      "Public reads and unsigned previews only. Use an external signer. Never paste seeds, keys, mnemonics, signatures, signed payloads, or wallet exports.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "bittensor",
      "Use Bittensor public wallet and subnet context from an agent without turning Matterhorn into a custodian.",
      [
        {
          title: "Use this MCP for",
          items: [
            "TAO balance, stake, hotkey, coldkey, subnet, validator, and watch context.",
            "Unsigned staking, transfer, subnet invocation, and receipt previews.",
            "Customer evidence bundles and readiness checks before an external signing step.",
          ],
        },
        {
          title: "How it works",
          items: [
            "Reads use public SS58, coldkey, hotkey, subnet, validator, and receipt data.",
            "Preview tools return unsigned payloads or handoff packets for review.",
            "External signing remains outside Matterhorn; signed receipts can be imported for evidence.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "Matterhorn never asks for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
            "Action previews require user review and an external signer.",
            "Any live sidecar submission remains explicitly separated from the default MCP flow.",
          ],
        },
      ],
      [
        "Show my TAO balance and active stakes for this public SS58 address.",
        "Compare validators for subnet 1 and prepare an unsigned delegation preview.",
        "Create a watch for validator stake changes and summarize today's alerts.",
      ],
    ),
    backendBacked: true,
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid MCP",
    protocolDeskId: "hyperliquid",
    description:
      "Markets, orderbooks, funding, exposure, watches, previews, handoffs, and receipts.",
    command: "matterhorn-work mcp config --target claude --profile full",
    tools: [
      "matterhorn_hyperliquid_chat",
      "matterhorn_hyperliquid_list_markets",
      "matterhorn_hyperliquid_get_account",
      "matterhorn_hyperliquid_get_positions",
      "matterhorn_hyperliquid_get_open_orders",
      "matterhorn_hyperliquid_get_funding",
      "matterhorn_hyperliquid_get_orderbook",
      "matterhorn_hyperliquid_create_watch",
      "matterhorn_hyperliquid_check_watches",
      "matterhorn_hyperliquid_watch_digest",
      "matterhorn_hyperliquid_act_on_watch_alert",
      "matterhorn_hyperliquid_preview_order",
      "matterhorn_hyperliquid_prepare_handoff",
      "matterhorn_hyperliquid_create_sign_request",
      "matterhorn_hyperliquid_validate_external_artifact",
      "matterhorn_hyperliquid_verify_receipt",
    ],
    toolSummary:
      "16 tools for markets, accounts, watches, handoffs, validation, and receipts.",
    boundary:
      "Prepare only. Matterhorn cannot submit the action; review and submit it with your own signer or client. Never paste API secrets, keys, signatures, signed payloads, or custody credentials.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "hyperliquid",
      "Use Hyperliquid market, account, and watch context from an agent while keeping trade execution outside Matterhorn.",
      [
        {
          title: "Use this MCP for",
          items: [
            "Market list, funding, open interest, L2 orderbook, account, position, and open-order reads.",
            "Read-only funding, orderbook, and account watches with alert digests.",
            "Non-submittable order previews, external trade handoffs, artifact validation, and receipt checks.",
          ],
        },
        {
          title: "How it works",
          items: [
            "Read tools fetch public or user-supplied account context without storing exchange secrets.",
            "Preview tools produce a handoff summary, not an executable order inside Matterhorn.",
            "Receipt tools verify artifacts after the user acts in their own Hyperliquid client.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "No live order submission, custody, hidden signing, or API secret collection.",
            "Matterhorn does not store exchange API keys, private keys, raw signatures, or signed payloads.",
            "Users execute trades only in their own external client after reviewing the handoff.",
          ],
        },
      ],
      [
        "Show BTC-PERP funding, open interest, and the current orderbook.",
        "Summarize exposure for this public account and flag liquidation-sensitive positions.",
        "Prepare a BTC-PERP long handoff for review without submitting anything.",
      ],
    ),
    backendBacked: true,
  },
  {
    id: "polymarket",
    name: "Polymarket MCP",
    protocolDeskId: "polymarket",
    description:
      "Market search, outcomes, compliance, liquidity, watches, handoffs, and receipts.",
    command:
      "matterhorn-work mcp config --target claude-desktop --profile full",
    tools: [
      "matterhorn_polymarket_chat",
      "matterhorn_polymarket_search_markets",
      "matterhorn_polymarket_search_events",
      "matterhorn_polymarket_get_market",
      "matterhorn_polymarket_get_orderbook",
      "matterhorn_polymarket_check_compliance",
      "matterhorn_polymarket_create_watch",
      "matterhorn_polymarket_check_watches",
      "matterhorn_polymarket_watch_digest",
      "matterhorn_polymarket_act_on_watch_alert",
      "matterhorn_polymarket_preview_order",
      "matterhorn_polymarket_prepare_handoff",
      "matterhorn_polymarket_create_sign_request",
      "matterhorn_polymarket_validate_external_artifact",
      "matterhorn_polymarket_verify_receipt",
    ],
    toolSummary:
      "15 tools for research, orderbooks, compliance, watches, handoffs, and receipts.",
    boundary:
      "Compliance-gated handoff only. No live submit. Blocked flows hide executable price, size, and share fields.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "polymarket",
      "Use Polymarket research, liquidity, compliance, and receipt context from an agent without enabling in-app bet placement.",
      [
        {
          title: "Use this MCP for",
          items: [
            "Market and event search, market detail reads, orderbook checks, and outcome context.",
            "Compliance checks before any handoff is prepared.",
            "Read-only watches, compliance-gated handoffs, external artifact validation, and receipt verification.",
          ],
        },
        {
          title: "How it works",
          items: [
            "Research tools collect market, outcome, liquidity, and orderbook context.",
            "Compliance tools determine whether a handoff can be shown.",
            "Blocked regions or blocked markets do not expose executable price, size, or share fields.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "No live bet placement, no hidden wallet connection, and no signed payload storage.",
            "Handoffs stay external and compliance-gated.",
            "Receipt checks are evidence tools, not a Matterhorn submission path.",
          ],
        },
      ],
      [
        "Search Polymarket for Bitcoin ETF markets and summarize liquidity.",
        "Check compliance for this market before preparing any handoff.",
        "Create a watch for probability changes and explain today's movement.",
      ],
    ),
    backendBacked: true,
  },
  {
    id: "memory",
    name: "Memory MCP",
    description:
      "Search, capture, update, forget, and export explicit Matterhorn Memory records.",
    command: "matterhorn-work mcp config --target cursor --profile full",
    tools: [
      "matterhorn_memory_search",
      "matterhorn_memory_list",
      "matterhorn_memory_get",
      "matterhorn_memory_capture",
      "matterhorn_memory_update",
      "matterhorn_memory_forget",
      "matterhorn_memory_export",
    ],
    toolSummary: "7 tools for search, capture, update, forget, and export.",
    boundary:
      "No hidden saves. Capture is explicit and user-confirmed; restricted records stay protected by policy.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "memory",
      "Use explicit Matterhorn Memory from agents while keeping saves reviewable, scoped, and reversible.",
      [
        {
          title: "Use this MCP for",
          items: [
            "Searching, listing, reading, capturing, updating, forgetting, and exporting memory records.",
            "Keeping agent work consistent across Matterhorn desks without hidden capture.",
            "Exporting user-safe evidence bundles for review.",
          ],
        },
        {
          title: "How it works",
          items: [
            "The server only writes explicit, user-confirmed records.",
            "Capture and update routes run safety validators before storing content.",
            "Forget and export operations leave auditable intent in the server response.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "No hidden saves or background capture.",
            "Credentials, secrets, signatures, payloads, and unsafe records are rejected.",
            "Restricted records remain protected by policy and scope.",
          ],
        },
      ],
      [
        "Search memory for the current Bittensor wallet context.",
        "Capture this project preference as a user-confirmed memory.",
        "Export safe memory records for this workspace.",
      ],
    ),
    statusLabel: "Memory MCP",
    backendBacked: true,
  },
  {
    id: "core-agent",
    name: "Core Agent MCP",
    description:
      "Doctor checks, workspace sessions, file sessions, approvals, and event watches.",
    command: "matterhorn-work mcp config --target codex --profile full",
    tools: [
      "matterhorn_doctor",
      "matterhorn_status",
      "matterhorn_list_workspaces",
      "matterhorn_create_session",
      "matterhorn_list_sessions",
      "matterhorn_get_session",
      "matterhorn_get_session_messages",
      "matterhorn_submit_session_prompt",
      "matterhorn_get_session_status",
      "matterhorn_watch_session_events",
      "matterhorn_get_session_snapshot",
      "matterhorn_delete_session",
      "matterhorn_create_file_session",
      "matterhorn_file_catalog",
      "matterhorn_watch_file_events",
      "matterhorn_read_files",
      "matterhorn_write_files",
      "matterhorn_close_file_session",
      "matterhorn_list_approvals",
      "matterhorn_reply_approval",
    ],
    toolSummary:
      "19 tools for status, sessions, files, approvals, and event watches.",
    boundary:
      "Agent control only. File writes and approvals stay explicit. No custody, signing, or hidden market submit.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "core-agent",
      "Use Matterhorn workspace, session, file-session, approval, and event controls from an external agent.",
      [
        {
          title: "Use this MCP for",
          items: [
            "Server readiness, status, workspace discovery, and session lifecycle control.",
            "Reading and submitting chat prompts through Matterhorn's server route.",
            "File-session catalog, read, write, close, approval, and event-watch operations.",
          ],
        },
        {
          title: "How it works",
          items: [
            "Tools call the running Matterhorn Desks server through the configured client token.",
            "Writable operations use Matterhorn's session and approval model.",
            "Event-watch tools return bounded progress batches for agents that cannot hold an SSE stream.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "Approvals require the host token where needed.",
            "File writes remain explicit and scoped to the active file session.",
            "No custody, signing, market submit, or hidden wallet action is exposed here.",
          ],
        },
      ],
      [
        "Run doctor checks for the local Matterhorn server and workspace.",
        "Create a session in this workspace and submit a reviewed prompt.",
        "Watch session events until the current run finishes.",
      ],
    ),
    statusLabel: "Core MCP",
    backendBacked: true,
  },
  {
    id: "evidence",
    name: "Evidence MCP",
    description:
      "Customer-safe evidence packets, readiness checks, public QA, and receipt validation.",
    command: "matterhorn-work mcp config --target claude --profile full",
    tools: [
      "matterhorn_crypto_chat",
      "matterhorn_crypto_readiness",
      "matterhorn_crypto_live_public_qa",
      "matterhorn_market_execution_readiness",
      "matterhorn_market_execution_chain",
      "matterhorn_market_sdk_validation",
      "matterhorn_market_customer_evidence_verify",
      "matterhorn_market_artifact_reconcile",
      "matterhorn_bittensor_customer_evidence_verify",
      "matterhorn_crypto_customer_packet",
    ],
    toolSummary:
      "10 tools for evidence, readiness, QA, reconciliation, and receipts.",
    boundary:
      "Public or redacted evidence only. No keys, exchange secrets, signatures, payload imports, or live submit.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "evidence",
      "Use customer-safe readiness, QA, reconciliation, packet, and receipt evidence tools from agents.",
      [
        {
          title: "Use this MCP for",
          items: [
            "Crypto readiness, market execution readiness, live public QA, SDK validation, and reconciliation.",
            "Bittensor and market customer evidence verification.",
            "Customer packets that summarize public or redacted proof without secrets.",
          ],
        },
        {
          title: "How it works",
          items: [
            "Evidence tools assemble deterministic reports from public, redacted, or server-held safe context.",
            "Readiness tools state missing dependencies before production use or a handoff.",
            "Verification tools reconcile artifacts against expected Matterhorn safety boundaries.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "Evidence packets must not include keys, exchange secrets, signatures, signed payloads, or wallet exports.",
            "Market evidence does not submit trades or bets.",
            "Receipts are validation artifacts, not custody or execution authority.",
          ],
        },
      ],
      [
        "Run market execution readiness and list blockers for production use.",
        "Build a customer packet for this public Bittensor wallet context.",
        "Reconcile this market artifact and explain whether it is safe to show.",
      ],
    ),
    statusLabel: "Evidence MCP",
    backendBacked: true,
  },
  {
    id: "workflow",
    name: "Workflow MCP",
    description:
      "Customer templates, prompt packs, workflow catalogs, and evidence bundles.",
    command: "matterhorn-work mcp config --target json --profile full",
    tools: [
      "matterhorn_services_get_capabilities",
      "matterhorn_services_chat_plan",
      "matterhorn_workflows_catalog",
      "matterhorn_workflows_prompt_pack",
      "matterhorn_workflows_customer_templates",
    ],
    toolSummary:
      "5 tools for capabilities, plans, workflow catalogs, prompt packs, and templates.",
    boundary:
      "Discovery and planning only. No provider execution, payments, email sending, publishing, or token gates.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "workflow",
      "Use Matterhorn workflow catalogs, prompt packs, service capability planning, and customer templates from agents.",
      [
        {
          title: "Use this MCP for",
          items: [
            "Reading workflow catalogs and customer-visible template metadata.",
            "Generating staged prompt packs for Matterhorn desks and workflows.",
            "Planning decentralized service capabilities without executing providers.",
          ],
        },
        {
          title: "How it works",
          items: [
            "Catalog tools return supported workflows, prompts, and customer templates.",
            "Service planning tools explain possible hosting, storage, email, payments, and access paths.",
            "Outputs are reviewed artifacts and prompts, not live provider actions.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "No live payments, email sending, hosting publish, token gates, or provider execution.",
            "Health-related customer workflows remain standalone, reviewed, and non-medical.",
            "Users review generated plans before any external work happens.",
          ],
        },
      ],
      [
        "List workflow templates available for customer use.",
        "Generate a prompt pack for the Bittensor desk.",
        "Plan hosting and email capabilities without executing a provider.",
      ],
    ),
    statusLabel: "Workflow MCP",
    backendBacked: true,
  },
  {
    id: "ui-control",
    name: "UI Control MCP",
    description:
      "Preview desktop bridge for opening desks, setting prompts, and reading panel state.",
    command: "matterhorn-work mcp config --target env --profile full",
    tools: [],
    boundary:
      "Desktop bridge preview only. No custody, signing, market submit, or secret collection.",
    worksWith: ["Codex", "Claude Code", "Claude Desktop", "Cursor"],
    docs: mcpDocs(
      "ui-control",
      "Preview the local desktop UI bridge for focusing desks, setting prompts, and reading panel state.",
      [
        {
          title: "Use this MCP for",
          items: [
            "Opening or focusing a Matterhorn desk from an agent.",
            "Setting a reviewed prompt in the composer without auto-sending.",
            "Reading visible panel state for guided UI workflows.",
          ],
        },
        {
          title: "How it works",
          items: [
            "The bridge is planned for the local desktop runtime rather than the backend MCP server.",
            "Actions are UI navigation and prompt-prep operations, not backend execution.",
            "Availability depends on the desktop UI bridge publishing Matterhorn UI actions.",
          ],
        },
        {
          title: "Safety boundary",
          items: [
            "No backend execution, custody, signing, market submit, or secret collection.",
            "Prompt changes remain user-visible and editable.",
            "The bridge stays unavailable until the desktop integration is registered.",
          ],
        },
      ],
      [
        "Open the Bittensor desk and place this prompt in the composer.",
        "Show the Wallet panel so I can review signing boundaries.",
        "Read which Matterhorn side panel is currently open.",
      ],
    ),
    statusLabel: "Desktop bridge preview",
    setupNote:
      "This is not registered by the backend MCP server yet. It becomes available when the local desktop UI bridge publishes matterhorn UI actions.",
    backendBacked: false,
  },
];

export function McpView(props: McpViewProps) {
  const showHeader = props.showHeader !== false;
  const [detailEntry, setDetailEntry] = useState<McpDirectoryInfo | null>(null);
  const [detailSkill, setDetailSkill] = useState<SkillItem | null>(null);
  const [detailSkillContent, setDetailSkillContent] = useState<string | null>(
    null,
  );
  const [detailPlugin, setDetailPlugin] = useState<CloudImportedPlugin | null>(
    null,
  );
  const [matterhornUiMcpCommand, setOpenworkUiMcpCommand] = useState<
    string[] | null
  >(null);
  const [matterhornUiMcpEnvironment, setOpenworkUiMcpEnvironment] =
    useState<Record<string, string> | null>(null);
  const [computerUseMcpCommand, setComputerUseMcpCommand] = useState<
    string[] | null
  >(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExtensionFilter>("mcp");
  const [showHidden, setShowHidden] = useState(false);
  const [, setExtensionStateVersion] = useState(0);

  const [localState, dispatchLocal] = useReducer(
    mcpViewLocalReducer,
    initialMcpViewLocalState,
  );
  const {
    logoutOpen,
    logoutTarget,
    logoutBusy,
    removeOpen,
    removeTarget,
    configScope,
    projectConfig,
    globalConfig,
    configError,
    revealBusy,
    showAdvanced,
    addMcpModalOpen,
    togglingMcp,
  } = localState;
  const setLocal = <K extends keyof McpViewLocalState>(
    key: K,
    value: SetStateAction<McpViewLocalState[K]>,
  ) => dispatchLocal({ type: "set", key, value });
  const setLogoutOpen = (value: SetStateAction<boolean>) =>
    setLocal("logoutOpen", value);
  const setLogoutTarget = (value: SetStateAction<string | null>) =>
    setLocal("logoutTarget", value);
  const setLogoutBusy = (value: SetStateAction<boolean>) =>
    setLocal("logoutBusy", value);
  const setRemoveOpen = (value: SetStateAction<boolean>) =>
    setLocal("removeOpen", value);
  const setRemoveTarget = (value: SetStateAction<string | null>) =>
    setLocal("removeTarget", value);
  const setConfigScope = (value: SetStateAction<ConfigScope>) =>
    setLocal("configScope", value);
  const setConfigError = (value: SetStateAction<string | null>) =>
    setLocal("configError", value);
  const setRevealBusy = (value: SetStateAction<boolean>) =>
    setLocal("revealBusy", value);
  const setShowAdvanced = (value: SetStateAction<boolean>) =>
    setLocal("showAdvanced", value);
  const setAddMcpModalOpen = (value: SetStateAction<boolean>) =>
    setLocal("addMcpModalOpen", value);
  const setTogglingMcp = (value: SetStateAction<string | null>) =>
    setLocal("togglingMcp", value);
  const configRequestId = useRef(0);

  const quickConnectList = props.quickConnect;
  const handledDetailRequestRef = useRef<number | null>(null);
  const handledAddMcpRequestRef = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => setExtensionStateVersion((value) => value + 1);
    window.addEventListener(MATTERHORN_EXTENSION_STATE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MATTERHORN_EXTENSION_STATE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const request = props.detailEntryRequest;
    if (!request || handledDetailRequestRef.current === request.requestId)
      return;
    const requestedId = request.id.trim();
    if (!requestedId) return;

    const match = quickConnectList.find((candidate) => {
      const identity = getMcpIdentityKey(candidate);
      return (
        candidate.id === requestedId ||
        candidate.serverName === requestedId ||
        identity === requestedId ||
        normalizeMcpSlug(candidate.name) === requestedId
      );
    });
    if (!match) return;

    handledDetailRequestRef.current = request.requestId;
    setDetailEntry(match);
    props.onDetailEntryRequestHandled?.(request.requestId);
  }, [
    props.detailEntryRequest,
    props.onDetailEntryRequestHandled,
    quickConnectList,
  ]);

  useEffect(() => {
    const requestId = props.addMcpRequestId;
    if (requestId == null || handledAddMcpRequestRef.current === requestId)
      return;
    handledAddMcpRequestRef.current = requestId;
    setAddMcpModalOpen(true);
    props.onAddMcpRequestHandled?.(requestId);
  }, [props.addMcpRequestId, props.onAddMcpRequestHandled]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void (async () => {
      try {
        const command = await window.__OPENWORK_ELECTRON__?.invokeDesktop?.(
          "getOpenworkUiMcpCommand",
        );
        if (
          Array.isArray(command) &&
          command.every((part) => typeof part === "string")
        ) {
          setOpenworkUiMcpCommand(command);
        }
        const environment = await window.__OPENWORK_ELECTRON__?.invokeDesktop?.(
          "getOpenworkUiMcpEnvironment",
        );
        if (
          environment &&
          typeof environment === "object" &&
          !Array.isArray(environment)
        ) {
          setOpenworkUiMcpEnvironment(
            Object.fromEntries(
              Object.entries(environment).filter(
                (entry): entry is [string, string] =>
                  typeof entry[0] === "string" && typeof entry[1] === "string",
              ),
            ),
          );
        }
        const computerUseCommand =
          await window.__OPENWORK_ELECTRON__?.invokeDesktop?.(
            "getComputerUseMcpCommand",
          );
        if (
          Array.isArray(computerUseCommand) &&
          computerUseCommand.every((part) => typeof part === "string")
        ) {
          setComputerUseMcpCommand(computerUseCommand);
        }
      } catch {
        setOpenworkUiMcpCommand(null);
        setOpenworkUiMcpEnvironment(null);
        setComputerUseMcpCommand(null);
      }
    })();
  }, []);

  useEffect(() => {
    const root = props.selectedWorkspaceRoot.trim();
    const nextId = configRequestId.current + 1;
    configRequestId.current = nextId;
    const readConfig = props.readConfigFile;

    if (!readConfig && !isDesktopRuntime()) {
      dispatchLocal({ type: "configUnavailable" });
      return;
    }

    void (async () => {
      try {
        setConfigError(null);
        const [project, global] = await Promise.all([
          root
            ? readConfig
              ? readConfig("project")
              : readOpencodeConfig("project", root)
            : Promise.resolve(null),
          readConfig
            ? readConfig("global")
            : readOpencodeConfig("global", root),
        ]);
        if (nextId !== configRequestId.current) return;
        dispatchLocal({
          type: "configLoaded",
          project: project as OpencodeConfigFile | null,
          global: global as OpencodeConfigFile | null,
        });
      } catch (error) {
        if (nextId !== configRequestId.current) return;
        dispatchLocal({
          type: "configLoadError",
          error:
            error instanceof Error
              ? error.message
              : t("mcp.config_load_failed"),
        });
      }
    })();
  }, [props.readConfigFile, props.selectedWorkspaceRoot]);

  const activeConfig = configScope === "project" ? projectConfig : globalConfig;

  const revealLabel = isWindowsPlatform()
    ? t("mcp.open_file")
    : t("mcp.reveal_in_finder");

  const canRevealConfig =
    isDesktopRuntime() &&
    !revealBusy &&
    !(configScope === "project" && !props.selectedWorkspaceRoot.trim()) &&
    Boolean(activeConfig?.exists);

  const resolveQuickConnectMatch = (name: string) =>
    quickConnectList.find((candidate) => {
      const candidateKey = getMcpIdentityKey(candidate);
      return (
        candidateKey === name ||
        candidate.name === name ||
        normalizeMcpSlug(candidate.name) === name
      );
    });

  const displayName = (name: string) =>
    resolveQuickConnectMatch(name)?.name ?? name;

  const quickConnectStatus = (entry: McpDirectoryInfo) =>
    props.mcpStatuses[getMcpIdentityKey(entry)];

  const isQuickConnectConfigured = (entry: McpDirectoryInfo) =>
    props.mcpServers.some((server) => server.name === getMcpIdentityKey(entry));

  const isMcpBackedExtension = (entry: McpDirectoryInfo) =>
    entry.kind === "extension" &&
    Boolean(entry.type || entry.command?.length || entry.url);

  const enablementForEntry = (
    entry: McpDirectoryInfo,
  ): { active: boolean; results: EnablementResult[] } | null => {
    const manifest = entry.extensionManifest;
    if (manifest?.enablement && props.enablementContext) {
      return evaluateEnablement(manifest.enablement, props.enablementContext);
    }
    // For plain MCP entries, use default mcp-connected enablement.
    if (
      entry.kind === "mcp" ||
      entry.kind === "ui-control" ||
      isMcpBackedExtension(entry)
    ) {
      const serverName = getMcpIdentityKey(entry);
      if (props.enablementContext) {
        return evaluateEnablement(
          defaultMcpEnablement(serverName),
          props.enablementContext,
        );
      }
    }
    return null;
  };

  const launchCommandForEntry = (entry: McpDirectoryInfo) => {
    if (entry.serverName === "matterhorn-ui")
      return matterhornUiMcpCommand ?? undefined;
    if (entry.serverName === "computer-use")
      return computerUseMcpCommand ?? entry.command;
    return entry.command;
  };

  const supportsOauth = (entry: McpServerEntry) =>
    entry.config.managed !== true &&
    entry.config.type === "remote" &&
    entry.config.oauth !== false;

  const resolveStatus = (entry: McpServerEntry): ReactMcpStatus => {
    if (entry.config.enabled === false) return "disabled";
    const resolved = props.mcpStatuses[entry.name];
    return resolved?.status ?? "disconnected";
  };

  const connectedServers = props.mcpServers.filter(
    (entry) => resolveStatus(entry) === "connected",
  );
  const connectedNames = connectedServers.map((entry) => {
    const resolvedName = displayName(entry.name);
    const matterhornName = matterhornMcpDisplayName(resolvedName);
    if (matterhornName) return matterhornName;
    return resolvedName === entry.name
      ? fallbackMcpDisplayName(entry.name)
      : resolvedName;
  });
  const customerQuickConnectList = quickConnectList.filter(
    (entry) =>
      isCustomerFacingMatterhornExtension(entry) &&
      (MATTERHORN_CLOUD_ENABLED ||
        getMcpServerName(entry) !== "matterhorn-cloud"),
  );
  const hiddenCount =
    customerQuickConnectList.filter((entry) =>
      isMatterhornExtensionHidden(entry),
    ).length +
    (props.installedSkills ?? []).filter((skill) =>
      isMatterhornExtensionHidden(getSkillHiddenId(skill)),
    ).length +
    (props.installedPlugins ?? []).filter((plugin) =>
      isMatterhornExtensionHidden(`plugin:${plugin.pluginId}`),
    ).length;
  const policyHiddenBuiltInCount = props.builtInExtensionsDisabled
    ? customerQuickConnectList.filter(
        (entry) =>
          isBuiltInMatterhornExtension(entry) &&
          !isMatterhornExtensionHidden(entry),
      ).length
    : 0;
  const hiddenOrPolicyCount = hiddenCount + policyHiddenBuiltInCount;
  const mcpStatusIsEmpty =
    props.mcpStatus?.toLowerCase().includes("no mcp servers configured") ??
    false;

  const requestLogout = (name: string) => {
    if (!name.trim()) return;
    setLogoutTarget(name);
    setLogoutOpen(true);
  };

  const copyMatterhornMcpCommand = (command: string) => {
    if (typeof navigator === "undefined") return;
    void navigator.clipboard?.writeText(command).catch(() => undefined);
  };

  const confirmLogout = async () => {
    const name = logoutTarget;
    if (!name || logoutBusy) return;
    setLogoutBusy(true);
    try {
      await props.logoutMcpAuth(name);
    } finally {
      setLogoutBusy(false);
      setLogoutOpen(false);
      setLogoutTarget(null);
    }
  };

  const revealConfig = async () => {
    if (!isDesktopRuntime() || revealBusy) return;
    const root = props.selectedWorkspaceRoot.trim();

    if (configScope === "project" && !root) {
      setConfigError(t("mcp.pick_workspace_error"));
      return;
    }

    setRevealBusy(true);
    setConfigError(null);
    try {
      const resolved = props.readConfigFile
        ? await props.readConfigFile(configScope)
        : await readOpencodeConfig(configScope, root);
      const configFile = resolved as OpencodeConfigFile | null;
      if (!configFile) {
        throw new Error(t("mcp.config_load_failed"));
      }
      if (isWindowsPlatform()) {
        await openDesktopPath(configFile.path);
      } else {
        await revealDesktopItemInDir(configFile.path);
      }
    } catch (error) {
      setConfigError(
        error instanceof Error ? error.message : t("mcp.reveal_config_failed"),
      );
    } finally {
      setRevealBusy(false);
    }
  };

  return (
    <section
      className={`${props.compact ? "space-y-5" : "space-y-6 max-w-3xl"} w-full animate-in fade-in duration-300`}
    >
      {showHeader ? <McpViewHeader connectedNames={connectedNames} /> : null}

      {props.mcpStatus ? (
        <div
          className={
            props.compact
              ? "flex items-start gap-2 break-words text-xs leading-5 text-dls-secondary"
              : "break-words rounded-lg border border-dls-border bg-dls-hover px-4 py-3 text-xs text-dls-secondary"
          }
        >
          {props.compact ? (
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-dls-muted" />
          ) : null}
          <div>
            <div className="font-medium text-dls-text">
              {mcpStatusIsEmpty
                ? "No external MCPs connected."
                : props.mcpStatus}
            </div>
            {mcpStatusIsEmpty ? (
              <p className="mt-2 text-xs leading-5 text-dls-secondary">
                Built-in Matterhorn MCPs are server-backed and ready to install
                below. Copy a command for Codex, Claude Code, Claude Desktop, or
                Cursor.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.builtInExtensionsDisabled ? (
        <div className="rounded-lg border border-amber-6 bg-amber-2 px-4 py-3 text-xs text-amber-11">
          Built-in Matterhorn Desks extensions are disabled by your
          organization. Use Show hidden to review blocked built-ins.
        </div>
      ) : null}

      <McpConfiguredServersSection
        compact={props.compact}
        servers={props.mcpServers}
        statuses={props.mcpStatuses}
        lastUpdatedAt={props.mcpLastUpdatedAt}
        selectedMcp={props.selectedMcp}
        busy={props.busy}
        logoutBusy={logoutBusy}
        logoutTarget={logoutTarget}
        togglingMcp={togglingMcp}
        displayName={displayName}
        resolveStatus={resolveStatus}
        supportsOauth={supportsOauth}
        onSelect={props.setSelectedMcp}
        onAuthorize={props.authorizeMcp}
        onRequestLogout={requestLogout}
        onRemove={(name) => {
          setRemoveTarget(name);
          setRemoveOpen(true);
        }}
        onToggleEnabled={props.setMcpEnabled}
        onToggleBusy={setTogglingMcp}
      />

      <MatterhornMcpProductSection
        cards={MATTERHORN_MCP_PRODUCT_CARDS}
        onCopyCommand={copyMatterhornMcpCommand}
        compact
      />

      <McpCustomAppCard
        compact={props.compact}
        onOpen={() => setAddMcpModalOpen(true)}
      />

      {/* Search + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dls-secondary"
          />
          <input
            className="w-full rounded-lg border border-dls-border bg-dls-surface py-2 pl-9 pr-3 text-xs text-dls-text placeholder:text-dls-secondary focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.2)]"
            placeholder="Search MCPs, connectors, and skills..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "mcp", "skill"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "secondary" : "outline"}
              size="xs"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "mcp" ? "MCPs" : "Skills"}
            </Button>
          ))}
          <Button
            variant={showHidden ? "secondary" : "outline"}
            size="xs"
            onClick={() => setShowHidden((current) => !current)}
          >
            {showHidden
              ? "Showing hidden"
              : hiddenOrPolicyCount > 0
                ? `Show hidden (${hiddenOrPolicyCount})`
                : "Show hidden"}
          </Button>
        </div>
      </div>

      <McpQuickConnectSection
        entries={customerQuickConnectList.filter((entry) => {
          if (
            !showHidden &&
            (isMatterhornExtensionHidden(entry) ||
              (props.builtInExtensionsDisabled &&
                isBuiltInMatterhornExtension(entry)))
          )
            return false;
          if (filter === "skill") return false;
          if (
            filter === "mcp" &&
            (entry.kind ?? "mcp") !== "mcp" &&
            entry.kind !== "ui-control"
          )
            return false;
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            entry.name.toLowerCase().includes(q) ||
            entry.description.toLowerCase().includes(q)
          );
        })}
        installedSkills={(props.installedSkills ?? []).filter((skill) => {
          if (
            !showHidden &&
            isMatterhornExtensionHidden(getSkillHiddenId(skill))
          )
            return false;
          if (filter === "mcp") return false;
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            skill.name.toLowerCase().includes(q) ||
            (skill.description ?? "").toLowerCase().includes(q)
          );
        })}
        installedPlugins={(props.installedPlugins ?? []).filter((plugin) => {
          if (
            !showHidden &&
            isMatterhornExtensionHidden(`plugin:${plugin.pluginId}`)
          )
            return false;
          if (filter === "mcp" || filter === "skill") return false;
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return [
            plugin.name,
            plugin.description ?? "",
            ...plugin.files.map(
              (file) => `${file.title} ${file.objectType} ${file.path}`,
            ),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        })}
        busy={props.busy}
        connectingName={props.mcpConnectingName}
        isEntryHidden={(entry) => isMatterhornExtensionHidden(entry)}
        isSkillHidden={(skill) =>
          isMatterhornExtensionHidden(getSkillHiddenId(skill))
        }
        isPluginHidden={(plugin) =>
          isMatterhornExtensionHidden(`plugin:${plugin.pluginId}`)
        }
        disabledReasonForEntry={(entry) =>
          props.builtInExtensionsDisabled && isBuiltInMatterhornExtension(entry)
            ? builtInExtensionDisabledReason
            : null
        }
        isConfigured={(entry) => {
          if (
            props.builtInExtensionsDisabled &&
            isBuiltInMatterhornExtension(entry)
          )
            return false;
          const result = enablementForEntry(entry);
          if (result) return result.active;
          // Fallback for entries without enablement context.
          if (isToggleOnlyExtension(entry))
            return isMatterhornExtensionEnabled(entry);
          if (entry.kind === "extension" && !isMcpBackedExtension(entry))
            return props.isExtensionConnected?.(entry) ?? false;
          return isQuickConnectConfigured(entry);
        }}
        enablementForEntry={
          props.enablementContext ? enablementForEntry : undefined
        }
        statusForEntry={quickConnectStatus}
        onConnect={props.connectMcp}
        onDetail={setDetailEntry}
        onSkillDetail={(skill) => {
          setDetailSkill(skill);
          setDetailSkillContent(null);
          if (props.readSkill) {
            void props.readSkill(skill.name).then((result) => {
              if (result?.content) {
                setDetailSkillContent(result.content.slice(0, 2000));
              }
            });
          }
        }}
        onPluginDetail={setDetailPlugin}
      />

      <ConfirmModal
        open={logoutOpen}
        title={t("mcp.logout_modal_title")}
        message={t("mcp.logout_modal_message").replace(
          "{server}",
          displayName(logoutTarget ?? ""),
        )}
        confirmLabel={
          logoutBusy ? t("mcp.logout_working") : t("mcp.logout_action")
        }
        cancelLabel={t("common.cancel")}
        variant="danger"
        onCancel={() => {
          if (logoutBusy) return;
          setLogoutOpen(false);
          setLogoutTarget(null);
        }}
        onConfirm={() => {
          void confirmLogout();
        }}
      />

      <ConfirmModal
        open={removeOpen}
        title={t("mcp.remove_modal_title")}
        message={t("mcp.remove_modal_message").replace(
          "{server}",
          displayName(removeTarget ?? ""),
        )}
        confirmLabel={t("mcp.remove_app")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onCancel={() => {
          setRemoveOpen(false);
          setRemoveTarget(null);
        }}
        onConfirm={() => {
          if (removeTarget) props.removeMcp(removeTarget);
          setRemoveOpen(false);
          setRemoveTarget(null);
        }}
      />

      <McpAdvancedConfigSection
        open={showAdvanced}
        configScope={configScope}
        activeConfig={activeConfig}
        canRevealConfig={canRevealConfig}
        revealBusy={revealBusy}
        revealLabel={revealLabel}
        configError={configError}
        onToggle={() => setShowAdvanced((current) => !current)}
        onScopeChange={setConfigScope}
        onReveal={revealConfig}
      />

      <AddMcpModal
        open={addMcpModalOpen}
        onClose={() => setAddMcpModalOpen(false)}
        onAdd={(entry) => props.connectMcp(entry)}
        busy={props.busy}
        isRemoteWorkspace={props.isRemoteWorkspace}
      />

      {detailEntry
        ? (() => {
            const extensionConfigSlot =
              props.configSlotForEntry?.(detailEntry) ?? null;
            const hasConfigSlot = extensionConfigSlot !== null;
            const hidden = isMatterhornExtensionHidden(detailEntry);
            const disabledReason =
              props.builtInExtensionsDisabled &&
              isBuiltInMatterhornExtension(detailEntry)
                ? builtInExtensionDisabledReason
                : null;
            const isConnected = disabledReason
              ? false
              : isToggleOnlyExtension(detailEntry)
                ? isMatterhornExtensionEnabled(detailEntry)
                : detailEntry.kind === "extension" &&
                    !isMcpBackedExtension(detailEntry)
                  ? (props.isExtensionConnected?.(detailEntry) ?? false)
                  : isQuickConnectConfigured(detailEntry);
            const isGoogleWorkspace = detailEntry.id === "google-workspace";
            return (
              <ExtensionDetailModal
                open={!!detailEntry}
                onClose={() => setDetailEntry(null)}
                name={detailEntry.name}
                description={detailEntry.description}
                iconSlug={detailEntry.iconSlug}
                iconSrc={detailEntry.iconSrc}
                iconNode={protocolDeskLogoNode(detailEntry, 28)}
                fallbackIcon={serviceIcon(detailEntry.name)}
                kind={detailEntry.kind ?? "mcp"}
                connected={isConnected}
                connecting={props.mcpConnectingName === detailEntry.name}
                hidden={hidden}
                preview={detailEntry.preview}
                disabledReason={disabledReason}
                setupInstructions={
                  isGoogleWorkspace
                    ? undefined
                    : detailEntry.extensionManifest?.setup?.instructions
                }
                resourceLabels={
                  isGoogleWorkspace ? [] : extensionResourceLabels(detailEntry)
                }
                contributionLabels={
                  isGoogleWorkspace
                    ? []
                    : extensionContributionLabels(detailEntry)
                }
                launchCommand={launchCommandForEntry(detailEntry)}
                environment={
                  detailEntry.serverName === "matterhorn-ui"
                    ? (matterhornUiMcpEnvironment ?? undefined)
                    : undefined
                }
                url={
                  typeof detailEntry.url === "string"
                    ? detailEntry.url
                    : undefined
                }
                oauth={detailEntry.oauth}
                configSlot={disabledReason ? null : extensionConfigSlot}
                showEnablementCard={!isGoogleWorkspace}
                onConnect={
                  disabledReason
                    ? undefined
                    : isToggleOnlyExtension(detailEntry)
                      ? () => {
                          setMatterhornExtensionEnabled(detailEntry, true);
                          setDetailEntry(null);
                        }
                      : hasConfigSlot
                        ? undefined
                        : () => {
                            props.connectMcp(detailEntry);
                            setDetailEntry(null);
                          }
                }
                onUninstall={
                  disabledReason
                    ? undefined
                    : isToggleOnlyExtension(detailEntry) && isConnected
                      ? () => {
                          setMatterhornExtensionEnabled(detailEntry, false);
                        }
                      : isQuickConnectConfigured(detailEntry)
                        ? () => {
                            const slug = getMcpIdentityKey(detailEntry);
                            props.removeMcp(slug);
                            setDetailEntry(null);
                          }
                        : undefined
                }
                onHide={() => setMatterhornExtensionHidden(detailEntry, true)}
                onShow={() => setMatterhornExtensionHidden(detailEntry, false)}
              />
            );
          })()
        : null}

      {detailSkill
        ? (() => {
            const hidden = isMatterhornExtensionHidden(
              getSkillHiddenId(detailSkill),
            );
            return (
              <ExtensionDetailModal
                open={!!detailSkill}
                onClose={() => {
                  setDetailSkill(null);
                  setDetailSkillContent(null);
                }}
                name={detailSkill.name}
                description={detailSkill.description ?? "Installed skill"}
                kind="skill"
                connected={true}
                hidden={hidden}
                path={detailSkill.path}
                trigger={detailSkill.trigger}
                contentPreview={detailSkillContent ?? undefined}
                onReveal={
                  detailSkill.path
                    ? () => {
                        void revealDesktopItemInDir(detailSkill.path);
                      }
                    : undefined
                }
                onUninstall={
                  props.uninstallSkill
                    ? () => {
                        props.uninstallSkill?.(detailSkill.name);
                        setDetailSkill(null);
                      }
                    : undefined
                }
                onHide={() =>
                  setMatterhornExtensionHidden(
                    getSkillHiddenId(detailSkill),
                    true,
                  )
                }
                onShow={() =>
                  setMatterhornExtensionHidden(
                    getSkillHiddenId(detailSkill),
                    false,
                  )
                }
              />
            );
          })()
        : null}

      {detailPlugin
        ? (() => {
            const hidden = isMatterhornExtensionHidden(
              `plugin:${detailPlugin.pluginId}`,
            );
            return (
              <ExtensionDetailModal
                open={!!detailPlugin}
                onClose={() => setDetailPlugin(null)}
                name={detailPlugin.name}
                description={
                  detailPlugin.description ??
                  "Marketplace extension installed in this workspace."
                }
                kind="extension"
                connected={true}
                hidden={hidden}
                onUninstall={
                  props.removeCloudPlugin
                    ? () => {
                        void props.removeCloudPlugin?.(detailPlugin.pluginId);
                        setDetailPlugin(null);
                      }
                    : undefined
                }
                onHide={() =>
                  setMatterhornExtensionHidden(
                    `plugin:${detailPlugin.pluginId}`,
                    true,
                  )
                }
                onShow={() =>
                  setMatterhornExtensionHidden(
                    `plugin:${detailPlugin.pluginId}`,
                    false,
                  )
                }
              />
            );
          })()
        : null}
    </section>
  );
}

function McpViewHeader(props: { connectedNames: string[] }) {
  const connectedCount = props.connectedNames.length;

  return (
    <div>
      <h2 className="text-3xl font-semibold text-dls-text">
        {t("mcp.apps_title")}
      </h2>
      <p className="mt-1.5 text-sm text-dls-secondary">
        {t("mcp.apps_subtitle")}
      </p>
      {connectedCount > 0 ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-2 font-medium text-green-11">
            <span className="size-2 rounded-full bg-green-9" />
            {connectedCount}{" "}
            {connectedCount === 1
              ? t("mcp.app_connected")
              : t("mcp.apps_connected")}
          </span>
          <span
            className="min-w-0 text-dls-secondary"
            aria-label={`Connected MCP servers: ${props.connectedNames.join(", ")}`}
          >
            {props.connectedNames.join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function MatterhornMcpReadinessFacts(props: {
  card: MatterhornMcpProductCard;
  compact?: boolean;
}) {
  const facts = [
    "Command ready",
    props.card.backendBacked === false ? "Preview" : "Server tools",
    "Install in agent",
  ];

  return (
    <div
      className={
        props.compact
          ? "mt-3 flex flex-wrap gap-1.5"
          : "mt-3 flex flex-wrap gap-2"
      }
    >
      {facts.map((fact) => (
        <span
          key={fact}
          className={
            props.compact
              ? "rounded-full bg-dls-hover/45 px-2 py-0.5 text-[10px] text-dls-secondary"
              : "rounded-full bg-dls-hover/45 px-2.5 py-1 text-[11px] text-dls-secondary"
          }
        >
          {fact}
        </span>
      ))}
    </div>
  );
}

function MatterhornMcpFullDocs(props: {
  card: MatterhornMcpProductCard;
  compact?: boolean;
}) {
  const docsHref = props.card.docs.githubUrl;
  const toolsHref = `${docsHref}#tools`;

  return (
    <div
      className={
        props.compact
          ? "mt-3 space-y-2 text-[11px] leading-4 text-dls-secondary"
          : "mt-4 space-y-3 text-xs leading-5 text-dls-secondary"
      }
    >
      <a
        href={docsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 font-medium text-dls-text transition-colors hover:text-[rgb(var(--dls-accent-rgb))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
      >
        <BookOpen size={props.compact ? 12 : 14} />
        Full docs
        <ExternalLink size={12} />
      </a>

      {props.card.tools.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {props.card.tools.map((tool) => (
            <a
              key={tool}
              href={toolsHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open GitHub docs for ${tool}`}
              className={
                props.compact
                  ? "max-w-full break-words rounded-md bg-dls-hover/45 px-1.5 py-0.5 font-mono text-[10px] text-dls-text transition-colors hover:bg-dls-hover hover:text-[rgb(var(--dls-accent-rgb))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
                  : "max-w-full break-words rounded-md bg-dls-hover/45 px-2 py-1 font-mono text-[10px] text-dls-text transition-colors hover:bg-dls-hover hover:text-[rgb(var(--dls-accent-rgb))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
              }
            >
              {tool}
            </a>
          ))}
        </div>
      ) : (
        <p className="max-w-prose">
          Tool names publish in GitHub docs after this MCP registers.
        </p>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <a
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 break-words font-mono text-[10px] text-dls-secondary transition-colors hover:text-dls-text focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
        >
          {props.card.docs.repoPath}
        </a>
      </div>
    </div>
  );
}

function MatterhornMcpProductSection(props: {
  cards: MatterhornMcpProductCard[];
  onCopyCommand: (command: string) => void;
  compact?: boolean;
}) {
  const visibleToolCount = props.compact ? 3 : Number.POSITIVE_INFINITY;
  const [selectedClientId, setSelectedClientId] =
    useState<MatterhornMcpClientId>(DEFAULT_MATTERHORN_MCP_CLIENT_ID);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedClient =
    MATTERHORN_MCP_CLIENT_INSTALL_GUIDES.find(
      (client) => client.id === selectedClientId,
    ) ?? MATTERHORN_MCP_CLIENT_INSTALL_GUIDES[0]!;
  const selectedInstallCommand = selectedClient.command;

  if (props.compact) {
    return (
      <section className="@container/matterhorn-mcps grid gap-3">
        <div className="grid gap-1">
          <h3 className="text-base font-semibold text-dls-text">
            Matterhorn MCPs
          </h3>
          <p className="text-xs leading-5 text-dls-secondary">
            Generate config for your coding agent.
          </p>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <label className="grid min-w-0 gap-1 text-[11px] font-medium text-dls-secondary">
            Client
            <select
              aria-label="MCP client"
              value={selectedClientId}
              onChange={(event) =>
                setSelectedClientId(event.target.value as MatterhornMcpClientId)
              }
              className="h-8 min-w-0 rounded-md border-0 bg-dls-surface-muted/[0.22] px-2.5 text-xs text-dls-text outline-none transition-colors hover:bg-dls-surface-muted/[0.28] focus-visible:ring-1 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
            >
              {MATTERHORN_MCP_CLIENT_INSTALL_GUIDES.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md bg-dls-surface-muted/[0.10] text-dls-secondary transition-colors hover:bg-dls-surface-muted/[0.24] hover:text-dls-text focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
            onClick={() => props.onCopyCommand(selectedInstallCommand)}
            aria-label={`Copy ${selectedClient.label} config command`}
            title="Copy config command"
          >
            <Copy size={14} />
          </button>
        </div>

        <details className="group text-[11px] leading-4 text-dls-secondary">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-dls-secondary hover:text-dls-text">
            Setup details
            <ChevronDown
              size={12}
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-2 grid gap-2 rounded-md bg-dls-surface-muted/[0.16] px-3 py-2.5">
            <code className="max-w-full break-words font-mono text-[10px] leading-4 text-dls-text">
              {selectedInstallCommand}
            </code>
            <ol className="grid gap-1.5">
              {selectedClient.steps.map((step, index) => (
                <li
                  key={step}
                  className="grid grid-cols-[1rem_minmax(0,1fr)] gap-1.5"
                >
                  <span className="font-mono text-[10px] text-dls-muted">
                    {index + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </details>

        <div className="matterhorn-mcp-stream grid min-w-0 gap-1">
          {props.cards.map((card) => {
            const expanded = selectedCardId === card.id;
            return (
              <article
                key={card.id}
                className={cn(
                  "rounded-md bg-transparent transition-colors hover:bg-dls-surface-muted/[0.08]",
                  expanded && "bg-dls-surface-muted/[0.12]",
                )}
              >
                <button
                  type="button"
                  className="grid w-full min-w-0 grid-cols-[32px_minmax(0,1fr)_16px] items-center gap-2.5 px-2 py-2.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
                  onClick={() => setSelectedCardId(expanded ? null : card.id)}
                  aria-expanded={expanded}
                  aria-controls={`matterhorn-mcp-detail-${card.id}`}
                >
                  <span className="flex size-8 items-center justify-center rounded-md bg-dls-surface/55">
                    {card.protocolDeskId ? (
                      <ProtocolBrandLogo id={card.protocolDeskId} size={25} />
                    ) : (
                      <Code2 size={15} className="text-dls-text" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-dls-text">
                      {card.name}
                    </span>
                    <span className="mt-0.5 block line-clamp-1 text-[11px] leading-4 text-dls-secondary">
                      {card.description}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-dls-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>

                {expanded ? (
                  <div
                    id={`matterhorn-mcp-detail-${card.id}`}
                    className="grid gap-2 px-3 pb-3 ps-[3.125rem] text-[11px] leading-4 text-dls-secondary"
                  >
                    <p>
                      {card.toolSummary ??
                        `${card.tools.length} tools available.`}
                    </p>
                    <p>
                      <span className="font-medium text-dls-text">
                        Works with:
                      </span>{" "}
                      {card.worksWith.join(", ")}
                    </p>
                    {card.setupNote ? <p>{card.setupNote}</p> : null}
                    <div className="flex flex-wrap items-center gap-3 pt-0.5">
                      <a
                        href={card.docs.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-dls-text hover:text-[rgb(var(--dls-accent-rgb))]"
                      >
                        <BookOpen size={12} />
                        Docs
                        <ExternalLink size={11} />
                      </a>
                      <details>
                        <summary className="cursor-pointer list-none font-medium text-dls-text">
                          Safety
                        </summary>
                        <p className="mt-1.5">{card.boundary}</p>
                      </details>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`@container/matterhorn-mcps ${props.compact ? "space-y-4" : "space-y-5"}`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <h3
            className={
              props.compact
                ? "text-base font-semibold text-dls-text"
                : "text-lg font-semibold text-dls-text"
            }
          >
            Matterhorn MCPs
          </h3>
          <p
            className={
              props.compact
                ? "max-w-full text-xs leading-5 text-dls-secondary"
                : "max-w-2xl text-sm leading-6 text-dls-secondary"
            }
          >
            Install Matterhorn MCPs for Codex, Claude Code, Claude Desktop, and
            Cursor.
          </p>
          <p
            className={
              props.compact
                ? "hidden"
                : "max-w-2xl text-xs leading-5 text-dls-secondary"
            }
          >
            Use them for protocol reads, previews, memory, workflow, evidence,
            and agent control. Cards show command, clients, tools, and safety
            limits.
          </p>
        </div>
        <div className="space-y-2">
          <span
            className={
              props.compact
                ? "text-[10px] font-medium uppercase tracking-[0.14em] text-dls-secondary"
                : "text-[11px] font-medium uppercase tracking-[0.14em] text-dls-secondary"
            }
          >
            Client
          </span>
          <div
            role="tablist"
            aria-label="MCP install client"
            className="grid grid-cols-2 gap-1 rounded-lg bg-dls-surface-muted/35 p-1 @md/matterhorn-mcps:grid-cols-4"
          >
            {MATTERHORN_MCP_CLIENT_INSTALL_GUIDES.map((client) => {
              const selected = client.id === selectedClient.id;
              return (
                <button
                  key={client.id}
                  id={`matterhorn-mcp-client-tab-${client.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`matterhorn-mcp-client-panel-${client.id}`}
                  onClick={() => setSelectedClientId(client.id)}
                  className={
                    props.compact
                      ? `min-w-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)] ${selected ? "bg-[rgb(var(--dls-accent-rgb)/0.18)] text-dls-text shadow-sm ring-1 ring-[rgb(var(--dls-accent-rgb)/0.35)]" : "text-dls-secondary hover:bg-dls-hover/65 hover:text-dls-text"}`
                      : `min-w-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)] ${selected ? "bg-[rgb(var(--dls-accent-rgb)/0.18)] text-dls-text shadow-sm ring-1 ring-[rgb(var(--dls-accent-rgb)/0.35)]" : "text-dls-secondary hover:bg-dls-hover/65 hover:text-dls-text"}`
                  }
                >
                  <span className="block truncate">{client.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section
        id={`matterhorn-mcp-client-panel-${selectedClient.id}`}
        role="tabpanel"
        aria-labelledby={`matterhorn-mcp-client-tab-${selectedClient.id}`}
        className={
          props.compact
            ? "space-y-3 rounded-lg bg-dls-surface-muted/20 p-3"
            : "space-y-3 rounded-lg bg-dls-surface-muted/22 p-4"
        }
      >
        <div className="flex flex-col gap-3 @md/matterhorn-mcps:flex-row @md/matterhorn-mcps:items-start @md/matterhorn-mcps:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-dls-secondary">
              Selected client
            </p>
            <h3
              className={
                props.compact
                  ? "mt-1 text-sm font-semibold text-dls-text"
                  : "mt-1 text-base font-semibold text-dls-text"
              }
            >
              {selectedClient.label}
            </h3>
            <p
              className={
                props.compact
                  ? "mt-1 text-xs leading-5 text-dls-secondary"
                  : "mt-1 max-w-2xl text-xs leading-5 text-dls-secondary"
              }
            >
              {selectedClient.summary}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className={
                props.compact
                  ? "w-fit rounded-full bg-dls-hover/45 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-dls-secondary"
                  : "w-fit rounded-full bg-dls-hover/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-dls-secondary"
              }
            >
              {selectedClient.configSurface}
            </span>
            <button
              type="button"
              className={
                props.compact
                  ? "inline-flex w-fit items-center gap-1 rounded-full bg-dls-hover/55 px-2.5 py-1 text-[11px] text-dls-text transition-colors hover:bg-dls-hover focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
                  : "inline-flex h-8 w-fit max-w-full items-center gap-1.5 rounded-full bg-dls-hover/55 px-3 text-xs text-dls-text transition-colors hover:bg-dls-hover focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
              }
              onClick={() => props.onCopyCommand(selectedInstallCommand)}
            >
              <Copy size={props.compact ? 12 : 13} />
              <span className="truncate">Copy command</span>
            </button>
          </div>
        </div>

        <details
          className={
            props.compact
              ? "text-[11px] leading-4 text-dls-secondary"
              : "text-xs leading-5 text-dls-secondary"
          }
        >
          <summary className="cursor-pointer list-none font-medium text-dls-text">
            Setup and verify
          </summary>
          <div className="mt-3 min-w-0 rounded-lg bg-dls-surface-muted/18 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-dls-secondary">
              Install command
            </div>
            <code
              className={
                props.compact
                  ? "mt-2 block max-w-full break-words rounded-lg bg-dls-surface/45 px-3 py-2 font-mono text-[10px] leading-4 text-dls-text"
                  : "mt-2 block max-w-full break-words rounded-lg bg-dls-surface/45 px-3 py-2 font-mono text-[11px] leading-5 text-dls-text"
              }
            >
              {selectedInstallCommand}
            </code>
          </div>

          <div
            className={
              props.compact
                ? "mt-3 space-y-3"
                : "mt-3 grid gap-4 @lg/matterhorn-mcps:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
            }
          >
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-dls-secondary">
                Setup
              </p>
              <ol className="mt-2 space-y-1.5 text-xs leading-5 text-dls-secondary">
                {selectedClient.steps.map((step, index) => (
                  <li
                    key={step}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2"
                  >
                    <span className="font-mono text-[10px] text-dls-text">
                      {index + 1}.
                    </span>
                    <span className="min-w-0">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-dls-secondary">
                Verify
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                {selectedClient.verifyTools.map((tool) => (
                  <code
                    key={tool}
                    className={
                      props.compact
                        ? "max-w-full break-words rounded-md bg-dls-hover/45 px-1.5 py-0.5 font-mono text-[10px] text-dls-text"
                        : "max-w-full break-words rounded-md bg-dls-hover/45 px-2 py-1 font-mono text-[10px] text-dls-text"
                    }
                  >
                    {tool}
                  </code>
                ))}
              </div>
            </div>
          </div>

          <p
            className={
              props.compact
                ? "mt-3 text-[11px] leading-4 text-dls-secondary"
                : "mt-3 text-xs leading-5 text-dls-secondary"
            }
          >
            {selectedClient.safetyNote}
          </p>
        </details>
      </section>

      <div className="matterhorn-mcp-stream min-w-0 overflow-hidden rounded-lg bg-dls-surface-muted/18 p-1">
        {props.cards.map((card) => {
          const visibleTools = card.tools.slice(0, visibleToolCount);
          const hiddenToolCount = Math.max(
            card.tools.length - visibleTools.length,
            0,
          );
          const isProtocol = Boolean(card.protocolDeskId);
          return (
            <article
              key={card.id}
              className={
                props.compact
                  ? "grid min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-dls-surface-muted/[0.08]"
                  : "grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-dls-surface-muted/[0.08]"
              }
            >
              <div
                className={
                  props.compact
                    ? "flex size-8 shrink-0 items-center justify-center rounded-lg bg-dls-surface/55"
                    : "flex size-11 shrink-0 items-center justify-center rounded-lg bg-dls-surface/55"
                }
              >
                {card.protocolDeskId ? (
                  <ProtocolBrandLogo
                    id={card.protocolDeskId}
                    size={props.compact ? 26 : 34}
                  />
                ) : (
                  <Code2
                    size={props.compact ? 16 : 18}
                    className="text-dls-text"
                  />
                )}
              </div>
              <div className="min-w-0">
                <div
                  className={
                    props.compact
                      ? "flex min-w-0 items-start justify-between gap-2"
                      : "flex min-w-0 flex-wrap items-start justify-between gap-3"
                  }
                >
                  <div className="min-w-0">
                    <h4
                      className={
                        props.compact
                          ? "truncate text-sm font-semibold text-dls-text"
                          : "text-sm font-semibold text-dls-text"
                      }
                    >
                      {card.name}
                    </h4>
                    <p
                      className={
                        props.compact
                          ? "mt-0.5 text-[11px] leading-4 text-dls-secondary"
                          : "mt-1 max-w-2xl text-xs leading-5 text-dls-secondary"
                      }
                    >
                      {card.description}
                    </p>
                  </div>
                  <span
                    className={
                      props.compact
                        ? "shrink-0 rounded-full bg-dls-hover/45 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-dls-secondary"
                        : "shrink-0 rounded-full bg-dls-hover/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-dls-secondary"
                    }
                  >
                    {card.statusLabel ??
                      (card.backendBacked === false
                        ? "Preview"
                        : isProtocol
                          ? "Protocol MCP"
                          : "Server-backed")}
                  </span>
                </div>
                <MatterhornMcpReadinessFacts
                  card={card}
                  compact={props.compact}
                />

                <div
                  className={
                    props.compact
                      ? "mt-3 space-y-2"
                      : "mt-4 grid gap-3 @lg/matterhorn-mcps:grid-cols-[minmax(0,1fr)_auto]"
                  }
                >
                  <div
                    className={
                      props.compact
                        ? "min-w-0 rounded-lg bg-dls-surface-muted/18 px-3 py-2"
                        : "min-w-0 rounded-lg bg-dls-surface-muted/18 px-3 py-2"
                    }
                  >
                    <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-dls-secondary">
                      Install command
                    </div>
                    <code
                      className={
                        props.compact
                          ? "mt-1 block max-w-full break-words font-mono text-[10px] leading-4 text-dls-text"
                          : "mt-1 block max-w-full break-words font-mono text-[11px] leading-5 text-dls-text"
                      }
                    >
                      {selectedInstallCommand}
                    </code>
                  </div>
                  <button
                    type="button"
                    className={
                      props.compact
                        ? "inline-flex w-fit items-center gap-1 rounded-full bg-dls-hover/55 px-2.5 py-1 text-[11px] text-dls-text transition-colors hover:bg-dls-hover focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
                        : "inline-flex h-8 w-fit max-w-full items-center gap-1.5 self-start rounded-full bg-dls-hover/55 px-3 text-xs text-dls-text transition-colors hover:bg-dls-hover focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
                    }
                    onClick={() => props.onCopyCommand(selectedInstallCommand)}
                  >
                    <Copy size={props.compact ? 12 : 13} />
                    <span className="truncate">
                      {props.compact ? "Copy" : "Copy command"}
                    </span>
                  </button>
                </div>

                <div
                  className={
                    props.compact
                      ? "mt-3 space-y-1.5"
                      : "mt-4 grid gap-2 text-xs @lg/matterhorn-mcps:grid-cols-2"
                  }
                >
                  {card.tools.length > 0 ? (
                    <p className="min-w-0 text-dls-secondary">
                      <span className="font-medium text-dls-text">Tools:</span>{" "}
                      <span>
                        {card.toolSummary ??
                          `${card.tools.length} tools available.`}
                      </span>
                      {hiddenToolCount > 0 ? (
                        <span className="sr-only">
                          {" "}
                          {visibleTools.join(", ")} plus {hiddenToolCount} more.
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="min-w-0 text-dls-secondary">
                      <span className="font-medium text-dls-text">Tools:</span>{" "}
                      Published after the desktop bridge is ready.
                    </p>
                  )}
                  <p className="min-w-0 text-dls-secondary">
                    <span className="font-medium text-dls-text">Clients:</span>{" "}
                    {card.worksWith.join(", ")}
                  </p>
                </div>
                {card.setupNote ? (
                  <p className="mt-2 text-[11px] leading-4 text-dls-secondary">
                    {card.setupNote}
                  </p>
                ) : null}

                <MatterhornMcpFullDocs card={card} compact={props.compact} />

                <details
                  className={
                    props.compact
                      ? "mt-3 text-[11px] leading-4 text-dls-secondary"
                      : "mt-4 text-xs leading-5 text-dls-secondary"
                  }
                >
                  <summary className="cursor-pointer list-none font-medium text-dls-text">
                    Safety
                  </summary>
                  <p className="mt-1.5">{card.boundary}</p>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function McpCustomAppCard(props: { compact?: boolean; onOpen: () => void }) {
  return (
    <div
      className={
        props.compact
          ? "px-1 py-2"
          : "rounded-lg bg-dls-surface-muted/24 p-5 sm:px-6"
      }
    >
      <div
        className={
          props.compact
            ? "flex flex-col gap-3"
            : "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        }
      >
        <div className="space-y-1">
          <div
            className={
              props.compact
                ? "text-sm font-semibold text-dls-text"
                : "text-base font-semibold text-dls-text"
            }
          >
            {t("mcp.add_modal_title")}
          </div>
          <div
            className={
              props.compact
                ? "text-xs leading-5 text-dls-secondary"
                : "text-sm text-dls-secondary"
            }
          >
            {t("mcp.custom_app_cta_hint")}
          </div>
        </div>
        <Button
          className={props.compact ? "h-8 w-fit px-2.5 text-xs" : undefined}
          onClick={props.onOpen}
        >
          <Plus size={14} />
          {t("mcp.add_modal_title")}
        </Button>
      </div>
    </div>
  );
}

function McpQuickConnectSection(props: {
  entries: McpDirectoryInfo[];
  installedSkills?: SkillItem[];
  installedPlugins?: CloudImportedPlugin[];
  busy: boolean;
  connectingName: string | null;
  isEntryHidden: (entry: McpDirectoryInfo) => boolean;
  isSkillHidden: (skill: SkillItem) => boolean;
  isPluginHidden: (plugin: CloudImportedPlugin) => boolean;
  disabledReasonForEntry: (entry: McpDirectoryInfo) => string | null;
  isConfigured: (entry: McpDirectoryInfo) => boolean;
  enablementForEntry?: (
    entry: McpDirectoryInfo,
  ) => { active: boolean; results: EnablementResult[] } | null;
  statusForEntry: (
    entry: McpDirectoryInfo,
  ) => { status: ReactMcpStatus } | undefined;
  onConnect: (entry: McpDirectoryInfo) => void;
  onDetail: (entry: McpDirectoryInfo) => void;
  onSkillDetail?: (skill: SkillItem) => void;
  onPluginDetail?: (plugin: CloudImportedPlugin) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm font-semibold text-dls-text">
          {t("mcp.available_apps")}
        </h3>
        <span className="text-xs text-dls-secondary">
          {t("mcp.one_click_connect")}
        </span>
      </div>

      <div className="mcp-marketplace-stream min-w-0 overflow-hidden rounded-lg bg-dls-surface-muted/18 px-3 py-1">
        {/* MCP entries */}
        {props.entries.map((entry) => {
          const configured = props.isConfigured(entry);
          const enablement = props.enablementForEntry?.(entry);
          const connecting = props.connectingName === entry.name;
          const FallbackIcon = serviceIcon(entry.name);
          const hidden = props.isEntryHidden(entry);
          const disabledReason = props.disabledReasonForEntry(entry);
          const webSupportComingSoon =
            getMcpServerName(entry) === "matterhorn-ui" && !isDesktopRuntime();
          const oauthComingSoon =
            Boolean(entry.oauth) &&
            !isPublicOauthConnectorEnabledAtLaunch(getMcpServerName(entry));
          const comingSoon = webSupportComingSoon || oauthComingSoon;

          return (
            <ExtensionCard
              key={getMcpIdentityKey(entry)}
              name={entry.name}
              description={
                webSupportComingSoon
                  ? "Available in the Matterhorn Desks desktop app. Web connection is coming soon."
                  : oauthComingSoon
                    ? `${entry.description} Account connection is coming soon.`
                    : entry.description
              }
              iconSlug={entry.iconSlug}
              iconSrc={entry.iconSrc}
              iconNode={protocolDeskLogoNode(entry)}
              fallbackIcon={FallbackIcon}
              kind={entry.kind ?? "mcp"}
              presentation="stream"
              connected={configured}
              enablement={enablement?.results}
              connecting={connecting}
              muted={comingSoon}
              hidden={hidden}
              preview={entry.preview}
              statusHint={
                comingSoon
                  ? "Coming soon"
                  : availabilityLabelForEntry(entry, configured, disabledReason)
              }
              disabledReason={disabledReason}
              disabled={props.busy || comingSoon}
              actionLabel={
                comingSoon
                  ? undefined
                  : actionLabelForEntry(entry, configured, disabledReason)
              }
              onClick={() => props.onDetail(entry)}
            />
          );
        })}

        {/* Installed skills */}
        {(props.installedSkills ?? []).map((skill) => {
          const hidden = props.isSkillHidden(skill);
          return (
            <ExtensionCard
              key={`skill:${skill.name}`}
              name={skill.name}
              description={skill.description ?? "Installed skill"}
              kind="skill"
              presentation="stream"
              connected={true}
              hidden={hidden}
              statusHint="Installed"
              actionLabel="View details"
              onClick={() => props.onSkillDetail?.(skill)}
            />
          );
        })}

        {(props.installedPlugins ?? []).map((plugin) => {
          const hidden = props.isPluginHidden(plugin);
          const fileCount = plugin.files.length;
          return (
            <ExtensionCard
              key={`plugin:${plugin.pluginId}`}
              name={plugin.name}
              description={
                plugin.description ??
                `Marketplace extension with ${fileCount} installed file${fileCount === 1 ? "" : "s"}.`
              }
              kind="extension"
              presentation="stream"
              connected={true}
              hidden={hidden}
              statusHint="Installed"
              actionLabel="View details"
              onClick={() => props.onPluginDetail?.(plugin)}
            />
          );
        })}

        {props.entries.length === 0 &&
        (props.installedSkills ?? []).length === 0 &&
        (props.installedPlugins ?? []).length === 0 ? (
          <div className="px-4 py-9 text-center">
            <Unplug size={24} className="mx-auto mb-3 text-dls-secondary/30" />
            <div className="text-sm font-medium text-dls-secondary">
              No MCPs or connectors found
            </div>
            <div className="mt-1 text-xs text-dls-secondary/60">
              Try a different search, filter, or add a custom MCP.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function McpConfiguredServersSection(props: {
  compact?: boolean;
  servers: McpServerEntry[];
  statuses: McpStatusMap;
  lastUpdatedAt: number | null;
  selectedMcp: string | null;
  busy: boolean;
  logoutBusy: boolean;
  logoutTarget: string | null;
  togglingMcp: string | null;
  displayName: (name: string) => string;
  resolveStatus: (entry: McpServerEntry) => ReactMcpStatus;
  supportsOauth: (entry: McpServerEntry) => boolean;
  onSelect: (name: string | null) => void;
  onAuthorize: (entry: McpServerEntry) => void;
  onRequestLogout: (name: string) => void;
  onRemove: (name: string) => void;
  onToggleEnabled?: (name: string, enabled: boolean) => Promise<void> | void;
  onToggleBusy: (value: SetStateAction<string | null>) => void;
}) {
  return (
    <div className={props.compact ? "space-y-2.5" : "space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-dls-secondary">
          {t("mcp.your_apps")}
        </h3>
        {props.lastUpdatedAt ? (
          <span className="tabular-nums text-[11px] text-dls-secondary">
            {t("mcp.last_synced")} {formatRelativeTime(props.lastUpdatedAt)}
          </span>
        ) : null}
      </div>

      {props.servers.length ? (
        <div className={props.compact ? "grid gap-1" : "space-y-2"}>
          {props.servers.map((entry) => (
            <McpConfiguredServerRow
              key={entry.name}
              entry={entry}
              compact={props.compact}
              status={props.resolveStatus(entry)}
              errorInfo={readMcpErrorInfo(props.statuses[entry.name])}
              selected={props.selectedMcp === entry.name}
              busy={props.busy}
              logoutBusy={props.logoutBusy}
              logoutTarget={props.logoutTarget}
              togglingMcp={props.togglingMcp}
              displayName={props.displayName}
              supportsOauth={props.supportsOauth}
              onSelect={props.onSelect}
              onAuthorize={props.onAuthorize}
              onRequestLogout={props.onRequestLogout}
              onRemove={props.onRemove}
              onToggleEnabled={props.onToggleEnabled}
              onToggleBusy={props.onToggleBusy}
            />
          ))}
        </div>
      ) : (
        <div
          className={
            props.compact
              ? "flex items-start gap-2 py-1 text-xs leading-5 text-dls-secondary"
              : "rounded-lg border border-dashed border-dls-border px-5 py-10 text-center"
          }
        >
          <Unplug
            size={props.compact ? 14 : 24}
            className={
              props.compact
                ? "mt-0.5 shrink-0 text-dls-muted"
                : "mx-auto mb-3 text-dls-secondary/30"
            }
          />
          <div>
            <div
              className={
                props.compact
                  ? "font-medium text-dls-text"
                  : "text-sm font-medium text-dls-secondary"
              }
            >
              {t("mcp.no_apps_yet")}
            </div>
            <div
              className={
                props.compact
                  ? "text-dls-secondary"
                  : "mt-1 text-xs text-dls-secondary/60"
              }
            >
              {t("mcp.no_apps_hint")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function readMcpErrorInfo(status: McpStatusMap[string] | undefined) {
  if (!status || status.status !== "failed") return null;
  return "error" in status ? status.error : t("mcp.connection_failed");
}

function McpConfiguredServerRow(props: {
  compact?: boolean;
  entry: McpServerEntry;
  status: ReactMcpStatus;
  errorInfo: string | null;
  selected: boolean;
  busy: boolean;
  logoutBusy: boolean;
  logoutTarget: string | null;
  togglingMcp: string | null;
  displayName: (name: string) => string;
  supportsOauth: (entry: McpServerEntry) => boolean;
  onSelect: (name: string | null) => void;
  onAuthorize: (entry: McpServerEntry) => void;
  onRequestLogout: (name: string) => void;
  onRemove: (name: string) => void;
  onToggleEnabled?: (name: string, enabled: boolean) => Promise<void> | void;
  onToggleBusy: (value: SetStateAction<string | null>) => void;
}) {
  const Icon = serviceIcon(props.entry.name);
  return (
    <div
      className={
        props.compact
          ? cn(
              "rounded-md bg-transparent transition-colors",
              props.selected
                ? "bg-dls-surface-muted/[0.12]"
                : "hover:bg-dls-surface-muted/[0.08]",
            )
          : cn(
              "rounded-md bg-dls-surface-muted/[0.14] transition-colors",
              props.selected
                ? "bg-dls-surface-muted/[0.28]"
                : "hover:bg-dls-surface-muted/[0.22]",
            )
      }
    >
      <button
        type="button"
        className={
          props.compact
            ? "w-full px-2.5 py-2.5 text-left"
            : "w-full px-4 py-3.5 text-left"
        }
        onClick={() => props.onSelect(props.selected ? null : props.entry.name)}
      >
        <div className="flex items-center gap-3">
          <div
            className={
              props.compact
                ? cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    props.status === "connected"
                      ? "bg-green-3"
                      : "bg-dls-surface-muted/[0.2]",
                  )
                : cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md",
                    props.status === "connected"
                      ? "bg-green-3"
                      : "bg-dls-surface-muted/[0.34]",
                  )
            }
          >
            <Icon
              size={15}
              className={
                props.status === "connected"
                  ? "text-green-11"
                  : serviceColor(props.entry.name)
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-dls-text">
              {props.displayName(props.entry.name)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className={`size-2 rounded-full ${statusDot(props.status)}`} />
            <span className="text-[11px] text-dls-secondary">
              {friendlyStatus(props.status)}
            </span>
          </div>
          <div
            className={`transition-transform ${props.selected ? "rotate-180" : ""}`}
          >
            <ChevronDown size={14} className="text-dls-secondary/40" />
          </div>
        </div>
      </button>

      {props.selected ? <McpConfiguredServerDetails {...props} /> : null}
    </div>
  );
}

function McpConfiguredServerDetails(
  props: Parameters<typeof McpConfiguredServerRow>[0],
) {
  const managed = props.entry.config.managed === true;
  return (
    <div
      className={
        props.compact
          ? "animate-in fade-in slide-in-from-top-1 space-y-3 px-3 pb-3 ps-[3.25rem] duration-200"
          : "animate-in fade-in slide-in-from-top-1 space-y-3 px-4 pb-4 pt-1 duration-200"
      }
    >
      <div className="flex items-center gap-4 text-xs">
        <span className="text-dls-secondary">{t("mcp.connection_type")}</span>
        <span className="text-dls-text">
          {managed
            ? "Built-in Matterhorn runtime"
            : props.entry.config.type === "remote"
              ? t("mcp.type_cloud")
              : t("mcp.type_local")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-medium text-dls-text">
          {t("mcp.cap_tools")}
        </span>
        {props.entry.config.type === "remote" ? (
          <span className="rounded-md border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-medium text-dls-text">
            {t("mcp.cap_signin")}
          </span>
        ) : null}
      </div>
      {props.errorInfo ? (
        <div className="rounded-lg border border-red-6 bg-red-2 px-3 py-2 text-xs text-red-11">
          {props.errorInfo}
        </div>
      ) : null}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-dls-secondary transition-colors hover:text-dls-text">
          <Code2 size={11} />
          {t("mcp.technical_details")}
          <ChevronDown
            size={10}
            className="transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-1.5 break-all rounded-lg bg-dls-hover px-3 py-2 font-mono text-[11px] text-dls-secondary">
          {managed
            ? "Managed locally by Matterhorn Desks"
            : props.entry.config.type === "remote"
              ? props.entry.config.url
              : props.entry.config.command?.join(" ")}
        </div>
      </details>
      {managed ? (
        <p className="text-[11px] leading-5 text-dls-secondary">
          Available automatically to Matterhorn desk agents while the local
          engine is running.
        </p>
      ) : (
        <McpConfiguredServerAuthActions {...props} />
      )}
      {!managed ? (
        <div className="flex justify-end gap-2 pt-1">
          {props.onToggleEnabled && props.entry.source !== "config.global" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={props.busy || props.togglingMcp === props.entry.name}
              onClick={(event) => {
                event.stopPropagation();
                if (props.togglingMcp) return;
                const next =
                  props.entry.config.enabled !== false ? false : true;
                props.onToggleBusy(props.entry.name);
                void Promise.resolve(
                  props.onToggleEnabled?.(props.entry.name, next),
                ).finally(() => props.onToggleBusy(null));
              }}
            >
              <Power size={13} />
              {props.entry.config.enabled === false
                ? t("mcp.enable_app")
                : t("mcp.disable_app")}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              props.onRemove(props.entry.name);
            }}
          >
            {t("mcp.remove_app")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function McpConfiguredServerAuthActions(
  props: Parameters<typeof McpConfiguredServerRow>[0],
) {
  if (!props.supportsOauth(props.entry)) return null;
  if (props.status !== "connected") {
    return (
      <>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs text-dls-secondary">
            {t("mcp.logout_label")}
          </div>
          <Button
            size="sm"
            disabled={props.busy}
            onClick={() => props.onAuthorize(props.entry)}
          >
            {t("mcp.login_action")}
          </Button>
        </div>
        <div className="text-[11px] text-dls-secondary/70">
          {t("mcp.login_hint")}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-xs text-dls-secondary">
          {t("mcp.logout_label")}
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={props.busy || props.logoutBusy}
          onClick={() => props.onRequestLogout(props.entry.name)}
        >
          {props.logoutBusy && props.logoutTarget === props.entry.name
            ? t("mcp.logout_working")
            : t("mcp.logout_action")}
        </Button>
      </div>
      <div className="text-[11px] text-dls-secondary/70">
        {t("mcp.logout_hint")}
      </div>
    </>
  );
}

function McpAdvancedConfigSection(props: {
  open: boolean;
  configScope: ConfigScope;
  activeConfig: OpencodeConfigFile | null;
  canRevealConfig: boolean;
  revealBusy: boolean;
  revealLabel: string;
  configError: string | null;
  onToggle: () => void;
  onScopeChange: (scope: ConfigScope) => void;
  onReveal: () => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-dls-border bg-dls-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-dls-hover"
        onClick={props.onToggle}
      >
        <div className="flex items-center gap-3">
          <Settings2 size={16} className="text-dls-secondary" />
          <div className="text-left">
            <div className="text-sm font-medium text-dls-text">
              {t("mcp.advanced_settings")}
            </div>
            <div className="text-xs text-dls-secondary">
              {t("mcp.advanced_settings_hint")}
            </div>
          </div>
        </div>
        <div
          className={`transition-transform ${props.open ? "rotate-180" : ""}`}
        >
          <ChevronDown size={16} className="text-dls-secondary" />
        </div>
      </button>
      {props.open ? (
        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 border-t border-dls-border px-5 py-4 duration-200">
          <div className="flex items-center gap-1.5">
            <McpConfigScopeButton
              scope="project"
              activeScope={props.configScope}
              onScopeChange={props.onScopeChange}
            />
            <McpConfigScopeButton
              scope="global"
              activeScope={props.configScope}
              onScopeChange={props.onScopeChange}
            />
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <div className="text-dls-secondary">{t("mcp.config_file")}</div>
            <div className="truncate font-mono text-[11px] text-dls-secondary/80">
              {props.activeConfig?.path ?? t("mcp.config_not_loaded")}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void props.onReveal()}
                disabled={!props.canRevealConfig}
              >
                {props.revealBusy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t("mcp.opening_label")}
                  </>
                ) : (
                  <>
                    <FolderOpen size={14} />
                    {props.revealLabel}
                  </>
                )}
              </Button>
              <a
                href="https://opencode.ai/docs/mcp-servers/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-dls-secondary transition-colors hover:text-dls-text"
              >
                {t("mcp.docs_link")}
                <ExternalLink size={11} />
              </a>
            </div>
            {props.activeConfig && props.activeConfig.exists === false ? (
              <div className="text-[11px] text-dls-secondary">
                {t("mcp.file_not_found")}
              </div>
            ) : null}
          </div>
          {props.configError ? (
            <div className="text-xs text-red-11">{props.configError}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function McpConfigScopeButton(props: {
  scope: ConfigScope;
  activeScope: ConfigScope;
  onScopeChange: (scope: ConfigScope) => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        props.activeScope === props.scope
          ? "bg-dls-active text-dls-text"
          : "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
      }`}
      onClick={() => props.onScopeChange(props.scope)}
    >
      {props.scope === "project"
        ? t("mcp.scope_project")
        : t("mcp.scope_global")}
    </button>
  );
}

export default McpView;
