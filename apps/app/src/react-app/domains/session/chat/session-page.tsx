/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePanelRef } from "react-resizable-panels";
import {
  AlertCircle,
  BarChart3,
  BrainCircuit,
  Copy,
  Dumbbell,
  FileText,
  FolderOpen,
  Globe,
  Home,
  Info,
  Mic2,
  PanelRightClose,
  PencilLine,
  Settings2,
  ShieldCheck,
  CircleUserRound,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";

import { t } from "../../../../i18n";
import { OPENWORK_EXTENSION_CATALOG } from "../../../../app/constants";
import { type MatterhornServerClient, type MatterhornServerStatus } from "../../../../app/lib/matterhorn-server";
import { getDisplaySessionTitle } from "../../../../app/lib/session-title";
import type { BootPhase } from "../../../../app/lib/startup-boot";
import type { WorkspaceInfo } from "../../../../app/lib/desktop";
import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapabilityStatus,
  MatterhornWalletRuntime,
  MatterhornWalletRuntimeSupport,
} from "@matterhorn-work/types/backend-capabilities";
import {
  backendCapabilityLabel,
  walletFamilySummary,
  walletRuntimeSupportSummary,
} from "../../settings/backend-capability-status";
import type {
  PendingPermission,
  PendingQuestion,
  ProviderListItem,
  TodoItem,
  WorkspaceConnectionState,
  WorkspaceSessionGroup,
} from "../../../../app/types";
import type { ShareWorkspaceModalProps } from "../../workspace/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import type { ProviderAuthModalProps } from "../../connections/provider-auth/provider-auth-modal";
import { RenameSessionModal } from "../modals/rename-session-modal";
import { AppSidebar } from "../sidebar/app-sidebar";
import { SessionSurface, type SessionSurfaceProps } from "../surface/session-surface";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { StatusBar, type StatusBarProps } from "./status-bar";
import { OwDotTicker } from "../../../shell/dot-ticker";
import { useReactRenderWatchdog } from "../../../shell/react-render-watchdog";
import { useShellConfig } from "../../../shell/shell-config";
import {
  GLOBAL_HOME_SIDE_PANEL_KEY,
  SIDE_PANEL_ITEMS,
  type SidePanelItem,
  useUiStateStore,
} from "../../../shell/ui-state-store";

import { isDesktopRuntime, isElectronRuntime } from "../../../../app/utils";
import { isCollectibleArtifactTarget, isLocalhostBrowserTarget, type OpenTarget } from "../artifacts/open-target";
import {
  mergeOpenTargetsWithWorkflowOutputReceipts,
  normalizeOutputReceiptPath,
  workflowOutputReceiptsFromEvidence,
} from "../artifacts/output-receipts";
import { dispatchMatterhornMemorySuggestions } from "../../memory/memory-suggestion-producers";
import { ProjectHistoryPage } from "../../recent-activity/project-history-page";
import { RecentActivitySection } from "../../recent-activity/recent-activity-section";
import { TransactionApproval } from "../../wallet/TransactionApproval";
import { useSessionWallet } from "../../wallet/useSessionWallet";
import { useWallet } from "../../wallet/WalletProvider";
import { useJobCron } from "../../wallet/hooks/useJobCron";
import { useWorkspaceShellLayout } from "../../../shell/workspace-shell-layout";
import { useControlAction, type MatterhornControlAction } from "../../../shell/control/control-provider";
import { workspaceNotesRoute, workspaceRunHistoryRoute } from "../../../shell/workspace-routes";
import { getExtensionId, isMatterhornExtensionEnabled, MATTERHORN_EXTENSION_STATE_CHANGED } from "../../settings/extension-state";
import { dispatchNotesUpdated, useQuickJot } from "../../notes";
import { cn } from "@/lib/utils";
import {
  buildCustomerBetaDemoStarterCards,
  buildCustomerWorkflowStarterCards,
  fetchCustomerWorkflowTemplates,
  type CustomerWorkflowIconHint,
  type CustomerWorkflowStarterCard,
} from "../workflows/customer-workflow-templates";
import {
  CUSTOMER_LAUNCHER_DESK_VISUALS,
  getCustomerProtocolDeskVisual,
  type CustomerProtocolDeskId,
} from "../workflows/protocol-desk-ui";
import { ProtocolBrandLogo } from "../workflows/protocol-brand-logo";
import { DeskWorkflowStagePanel } from "../workflows/desk-workflow-stage-panel";
import { WorkflowStageCard } from "../workflows/workflow-stage-card";
import {
  stageWorkflowRun,
  startWorkflowRun,
} from "../workflows/workflow-run-client";
import { getArtifactNoteContext } from "../artifacts/artifact-note-context";
import { getChatDraftConfig } from "@matterhorn-work/types";
import { matterhornDeskAgentIdForDesk } from "@matterhorn-work/types/desk-agents";
import type { MatterhornWorkflowRun } from "@matterhorn-work/types/workflow-runs";

const ProviderAuthModal = lazy(() => import("../../connections/provider-auth/provider-auth-modal"));
const ShareWorkspaceModal = lazy(() => import("../../workspace/share-workspace-modal").then((module) => ({
  default: module.ShareWorkspaceModal,
})));
const BrowserPanel = lazy(() => import("../browser/browser-panel").then((module) => ({
  default: module.BrowserPanel,
})));
const ArtifactPanel = lazy(() => import("../artifacts/artifact-panel").then((module) => ({
  default: module.ArtifactPanel,
})));
const VoicePanel = lazy(() => import("../voice/voice-panel").then((module) => ({
  default: module.VoicePanel,
})));
const WalletPanel = lazy(() => import("../../wallet/WalletPanel").then((module) => ({
  default: module.WalletPanel,
})));
const SuiWorkflowPanel = lazy(() => import("../../wallet/sui-workflow-panel").then((module) => ({
  default: module.SuiWorkflowPanel,
})));
const MemoryPanel = lazy(() => import("../../memory/memory-panel").then((module) => ({
  default: module.MemoryPanel,
})));
const NotesPanel = lazy(() => import("../../notes/notes-page").then((module) => ({
  default: module.NotesPage,
})));
const CommandPalette = lazy(() => import("../../wallet/components/CommandPalette").then((module) => ({
  default: module.CommandPalette,
})));

const STARTUP_SKELETON_ROWS = [
  { id: "intro", titleWidth: "42%", bodyWidth: "88%" },
  { id: "middle", titleWidth: "56%", bodyWidth: "88%" },
  { id: "final", titleWidth: "36%", bodyWidth: "74%" },
];
const GLOBAL_VOICE_SIDE_PANEL_KEY = "__matterhorn_voice__";
const VENUE_SIDE_PANELS = ["bittensor", "hyperliquid", "polymarket", "sui"] as const;
type VenueSidePanel = (typeof VENUE_SIDE_PANELS)[number];
const RAIL_BUTTON_CLASS =
  "h-auto min-h-12 w-full flex-col gap-1 rounded-md px-1 py-2 text-dls-text transition-colors hover:bg-dls-hover/45 hover:text-dls-text";
const RAIL_ACTIVE_CLASS = "bg-dls-hover/55 text-dls-text hover:bg-dls-hover/60 hover:text-dls-text";
const RAIL_DESK_BUTTON_CLASS =
  "h-auto min-h-12 w-full flex-col gap-1 rounded-md px-1 py-2 text-dls-text transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.09)] hover:text-[var(--matterhorn-desk-color)]";
const RAIL_LABEL_CLASS = "max-w-full truncate text-[11px] font-medium leading-4 text-current";
const RAIL_OPTIONAL_LABEL_CLASS = `hidden ${RAIL_LABEL_CLASS} 2xl:inline`;
const RAIL_SECTION_LABEL_CLASS =
  "mt-1 w-full border-t border-dls-border/25 pt-2 text-center text-[10px] font-medium tracking-normal text-dls-secondary";

function isVenueSidePanel(panel: SidePanelItem | null): panel is VenueSidePanel {
  return panel === "bittensor" || panel === "hyperliquid" || panel === "polymarket" || panel === "sui";
}

function isLegacyCryptoVenueSidePanel(panel: SidePanelItem | null): panel is Exclude<VenueSidePanel, "sui"> {
  return panel === "bittensor" || panel === "hyperliquid" || panel === "polymarket";
}

function agentIdForDesk(panel: CustomerWorkflowIconHint | VenueSidePanel | string | null | undefined): string | undefined {
  if (!panel) return undefined;
  return matterhornDeskAgentIdForDesk(panel);
}

function LazyPanelFallback({ label = "Loading panel" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background px-4 text-center text-sm text-dls-secondary" role="status">
      {label}
    </div>
  );
}

function LazyModalBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

const CUSTOMER_WORKFLOW_ICON_COMPONENTS: Record<CustomerWorkflowIconHint, typeof BrainCircuit> = {
  bittensor: BrainCircuit,
  hyperliquid: BarChart3,
  polymarket: ShieldCheck,
  sui: WalletIcon,
  wellness: Dumbbell,
  services: FileText,
  blank: FileText,
};

function ProtocolLogo({ venue, size = 18 }: { venue: VenueSidePanel; size?: number }) {
  const visual = getCustomerProtocolDeskVisual(venue);
  return <ProtocolBrandLogo id={venue} visual={visual} size={size} />;
}

function deskToneStyle(iconHint: CustomerWorkflowIconHint | VenueSidePanel | "memory" | "mcp"): CSSProperties {
  const tone = (() => {
    switch (iconHint) {
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
      case "memory":
        return ["--desk-memory", "--desk-memory-rgb", "--desk-memory-secondary"];
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

function joinWorkspaceChildPath(root: string, child: string) {
  const trimmed = root.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return child;
  return trimmed.includes("\\") ? `${trimmed}\\${child}` : `${trimmed}/${child}`;
}

function compactPathSegment(path: string) {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  return trimmed.split(/[\\/]+/).filter(Boolean).at(-1) ?? trimmed;
}

function WorkspaceHomeIconAction(props: {
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={props.label}
          title={props.tooltip}
          disabled={props.disabled}
          onClick={props.onClick}
          className="size-7 rounded-md text-dls-secondary transition-colors hover:bg-dls-hover hover:text-dls-text focus-visible:ring-1 focus-visible:ring-dls-border disabled:text-dls-secondary/45"
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.tooltip}</TooltipContent>
    </Tooltip>
  );
}

type HomeCapabilityStatusItem = {
  id: CustomerWorkflowIconHint;
  title: string;
  statusLabel: string;
  summary: string;
  proof: string;
};

const PROTOCOL_DESK_SUGGESTED_PROMPTS: Record<VenueSidePanel, Array<{ title: string; detail: string; prompt: string }>> = {
  bittensor: [
    {
      title: "Show my TAO balance",
      detail: "Read a public SS58 coldkey balance and explain what is safe to share.",
      prompt: "Show my TAO balance for this SS58 public address: <paste public SS58 address>. Use public wallet context only and do not ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
    },
    {
      title: "Find useful subnets",
      detail: "Explain useful subnets in plain language, including image-generation options.",
      prompt: "Find useful Bittensor subnets for image generation. Explain what each subnet does, why it is useful, and what data source/freshness you used.",
    },
    {
      title: "Compare validators",
      detail: "Compare validators before staking, with risk notes and missing public context.",
      prompt: "Compare Bittensor validators on subnet 14 with a balanced strategy. Show source, freshness, risks, and what extra public context is needed before staking.",
    },
    {
      title: "Prepare staking preview",
      detail: "Build a non-custodial preview that must be reviewed and signed elsewhere.",
      prompt: "Prepare a Bittensor staking preview for 1 TAO on subnet 14. Ask for the public validator hotkey and coldkey if missing. This must be unsigned and require an external Bittensor-compatible signer.",
    },
  ],
  hyperliquid: [
    {
      title: "Show market context",
      detail: "Summarize spread, depth, and stale-data warnings.",
      prompt: "Show BTC orderbook context on Hyperliquid, spread, depth summary, and stale-data warnings. Explain that Matterhorn can prepare an external trade handoff, but Can submit: No and Live submission: Off.",
    },
    {
      title: "Show account exposure",
      detail: "Use public or read-only account context only; never ask for exchange secrets.",
      prompt: "Summarize my public/read-only Hyperliquid account exposure if an address or public account context is available. Do not ask for API secrets, private keys, raw signatures, signed payloads, or exchange custody.",
    },
    {
      title: "Prepare trade handoff",
      detail: "Draft an external-client handoff you can review outside Matterhorn.",
      prompt: "Prepare a Hyperliquid external trade handoff for BTC with Can submit: No, Live submission: Off, and external client required. Ask for missing public order context instead of guessing.",
    },
  ],
  polymarket: [
    {
      title: "Research a market",
      detail: "Explain outcomes, liquidity, orderbook context, and compliance state.",
      prompt: "Summarize this Polymarket market: <paste market URL or slug>. Include outcomes, liquidity/orderbook context, compliance state, source, freshness, and no bet placement.",
    },
    {
      title: "Check compliance",
      detail: "If blocked, do not expose executable price, size, share, or order fields.",
      prompt: "Check whether this Polymarket market is eligible for a handoff. If compliance blocks the flow, do not show executable price, size, share, or order fields.",
    },
    {
      title: "Prepare trade handoff",
      detail: "Draft a non-custodial wallet handoff you can review externally.",
      prompt: "Prepare a Polymarket compliance-gated external-wallet handoff. Keep Can submit: No and Live submission: Off. Never ask for private keys, raw signatures, signed payloads, API secrets, or wallet exports.",
    },
  ],
  sui: [
    {
      title: "Show my Sui wallet",
      detail: "Read a public Sui address, network, and SUI balance without custody.",
      prompt: "Show my Sui wallet for this public address: <paste public Sui address>. Use public account and balance context only. Do not ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
    },
    {
      title: "Prepare transfer preview",
      detail: "Create a non-custodial transfer preview and save it as project evidence.",
      prompt: "Prepare a Sui transfer preview. Ask for the public sender address, recipient address, network, amount, and memo if missing. Signing must happen in my connected Sui wallet on web or an external Sui wallet/client on desktop.",
    },
    {
      title: "Import transaction receipt",
      detail: "Save public transaction metadata after signing in an external wallet.",
      prompt: "Import a Sui transaction receipt from this public transaction digest: <paste transaction digest>. Use only public receipt metadata and save the receipt as project evidence.",
    },
  ],
};

function homeCapabilityStatusItems(): HomeCapabilityStatusItem[] {
  return CUSTOMER_LAUNCHER_DESK_VISUALS.map((visual) => ({
    id: visual.id as CustomerWorkflowIconHint,
    title: visual.displayName,
    statusLabel: visual.statusLabel,
    summary: visual.shortDescription,
    proof: visual.safetySummary,
  }));
}

function homeWalletRuntime(): MatterhornWalletRuntime {
  if (isElectronRuntime()) return "electron";
  if (isDesktopRuntime()) return "desktop";
  return "web";
}

function homeWalletTone(status: MatterhornCapabilityStatus | null): string {
  switch (status) {
    case "working":
      return "bg-emerald-500/10 text-emerald-300";
    case "needs_setup":
      return "bg-sky-500/10 text-sky-300";
    case "preview":
      return "bg-amber-500/10 text-amber-300";
    case "error":
      return "bg-red-500/10 text-red-300";
    case "unsupported":
    default:
      return "bg-dls-surface-muted text-dls-secondary";
  }
}

function homeWalletRuntimeSummary(support: MatterhornWalletRuntimeSupport | undefined) {
  const summary = walletRuntimeSupportSummary(support);
  if (summary.status) return summary;
  return {
    label: "Runtime status unavailable",
    detail: "Open Wallet settings to see the full wallet-family readiness contract.",
    status: null,
  };
}

function HomeWalletRuntimeStatus({
  capabilities,
  loading,
  error,
  runtime,
  onOpenWallet,
}: {
  capabilities?: MatterhornBackendCapabilitiesResponse | null;
  loading?: boolean;
  error?: boolean;
  runtime: MatterhornWalletRuntime;
  onOpenWallet: () => void;
}) {
  const rows = capabilities ? walletFamilySummary(capabilities) : [];
  const sui = rows.find((row) => row.family === "Sui");
  const suiRuntime = homeWalletRuntimeSummary(sui?.runtimeSupport?.[runtime]);
  const headline = loading
    ? "Checking wallet readiness"
    : error
      ? "Wallet readiness unavailable"
      : rows.length
        ? rows.map((row) => `${row.family}: ${backendCapabilityLabel(row.status)}`).join(" · ")
        : "Wallet readiness not reported";

  return (
    <details className="group rounded-lg bg-dls-surface-muted/25 px-3 py-2.5 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <WalletIcon className="size-4 shrink-0 text-dls-secondary" />
          <span className="font-medium text-dls-text">Wallet readiness</span>
          <span className="min-w-0 truncate text-xs text-dls-secondary">{headline}</span>
        </span>
        <span className="shrink-0 text-xs text-dls-secondary transition-colors group-open:text-dls-text">
          Details
        </span>
      </summary>
      <div className="mt-3 grid gap-2 border-t border-dls-border/35 pt-3">
        {rows.length ? rows.map((row) => {
          const runtimeSummary = homeWalletRuntimeSummary(row.runtimeSupport?.[runtime]);
          return (
            <div key={row.family} className="grid gap-1 text-xs leading-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-start">
              <span className="font-medium text-dls-text">{row.family}</span>
              <span className="min-w-0 text-dls-secondary">{row.family === "Sui" ? suiRuntime.detail : runtimeSummary.detail}</span>
              <span className={cn("w-fit rounded-md px-2 py-0.5 font-medium", homeWalletTone(row.status))}>
                {backendCapabilityLabel(row.status)}
              </span>
            </div>
          );
        }) : (
          <p className="text-xs leading-5 text-dls-secondary">
            Start the Matterhorn Work engine to read wallet-family status.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs leading-5 text-dls-secondary">
            Sui signing stays in your wallet; desktop uses external handoff.
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-dls-text transition-colors hover:bg-dls-hover"
            onClick={onOpenWallet}
          >
            Open wallet
          </button>
        </div>
      </div>
    </details>
  );
}

function DeskBrandMark({
  id,
  size = 24,
}: {
  id: CustomerWorkflowIconHint | VenueSidePanel | "memory" | "mcp";
  size?: number;
}) {
  const visual = getCustomerProtocolDeskVisual(id);
  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[id as CustomerWorkflowIconHint] ?? FileText;
  if (visual) return <ProtocolBrandLogo id={visual.id} visual={visual} size={size} />;
  return <Icon className="size-4" />;
}

function HomeCapabilityOverview({
  onOpenCapability,
}: {
  onOpenCapability?: (id: CustomerWorkflowIconHint) => void;
}) {
  return (
    <section
      className="matterhorn-capability-overview space-y-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "360px" } as CSSProperties}
      aria-label="Desk capability overview"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-dls-text">Open a desk</h3>
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="Open a desk details"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-dls-hover/35 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dls-text/30"
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            }
          />
          <PopoverContent
            side="right"
            align="start"
            className="w-60 gap-1 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-left text-[11px] leading-5 text-dls-text shadow-none"
          >
            <span>Each desk starts a focused agent task.</span>
            <span>Risk details stay behind each info button.</span>
            <span>Outputs and receipts stay with this project.</span>
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {homeCapabilityStatusItems().map((item) => {
          return (
            <article
              key={item.id}
              style={deskToneStyle(item.id)}
              className="matterhorn-capability-card group grid min-w-0 gap-3 relative rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.055)] transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.10)]"
            >
              <button
                type="button"
                className="grid w-full min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-lg p-3.5 pr-10 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--matterhorn-desk-color)]"
                aria-label={`Open ${item.title}`}
                onClick={() => onOpenCapability?.(item.id)}
              >
                <span className="flex size-8 items-center justify-center rounded-md bg-dls-surface/45 text-[var(--matterhorn-desk-color)]">
                  <DeskBrandMark id={item.id} size={24} />
                </span>
                <div className="min-w-0">
                  <span className="text-[13px] font-semibold text-dls-text">{item.title}</span>
                  <p className="mt-1 text-[12px] leading-5 text-dls-secondary">{item.summary}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--matterhorn-desk-color)]">
                    {item.id === "wellness" ? "Start workflow" : "Open desk"}
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </button>
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`${item.title} details`}
                      className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.13)] hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
                    >
                      <Info className="size-3.5" aria-hidden="true" />
                    </button>
                  }
                />
                <PopoverContent
                  side="right"
                  align="start"
                  className="w-72 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-left text-xs leading-5 text-dls-secondary shadow-none"
                >
                  <p className="font-medium text-dls-text">{item.statusLabel}</p>
                  <p className="mt-1">{item.proof}</p>
                </PopoverContent>
              </Popover>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function WorkflowDeskHomeSurface({
  deskId,
  launchState,
  matterhornServerClient,
  runtimeWorkspaceId,
  onBackHome,
  onStartStage,
}: {
  deskId: WorkflowDeskId;
  launchState: WorkflowDeskLaunchState | null;
  matterhornServerClient: MatterhornServerClient | null;
  runtimeWorkspaceId: string | null;
  onBackHome: () => void;
  onStartStage: (stageId: string, prompt: string) => void;
}) {
  const visual = getCustomerProtocolDeskVisual(deskId);
  const readinessWorkspaceId = runtimeWorkspaceId?.trim() ?? "";
  const readinessQuery = useQuery({
    queryKey: ["workflow-desk-readiness", readinessWorkspaceId],
    enabled: Boolean(matterhornServerClient && readinessWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!matterhornServerClient || !readinessWorkspaceId) throw new Error("Open a workspace to start desk tasks.");
      return matterhornServerClient.workspaceReadiness(readinessWorkspaceId);
    },
  });
  const startTaskFeature = readinessQuery.data?.features.start_desk_task;
  const startTaskBlocked = Boolean(
    !matterhornServerClient ||
    !readinessWorkspaceId ||
    (startTaskFeature && !startTaskFeature.ready),
  );
  const startTaskBlocker = !matterhornServerClient
    ? "Matterhorn Work engine is offline."
    : !readinessWorkspaceId
      ? "Open a workspace before starting a desk task."
      : startTaskFeature && !startTaskFeature.ready
        ? `Start task needs ${startTaskFeature.blockingCheckIds
          .map((checkId) => readinessQuery.data?.checks[checkId]?.label ?? checkId)
          .join(", ")}.`
        : null;
  const taskStatus = launchState?.run?.status ?? (
    launchState?.status === "staging"
      ? "staged"
      : launchState?.status === "failed"
        ? "failed"
        : "idle"
  );

  return (
    <div
      className="absolute inset-0 flex min-w-0 w-full justify-center overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-24 pt-5 sm:px-6 sm:pb-28 sm:pt-7"
      style={{ ...deskToneStyle(deskId), scrollbarGutter: "stable" } as CSSProperties}
    >
      <div className="w-full max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-transparent px-1 py-1.5 text-xs font-semibold text-dls-secondary transition-colors hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
            onClick={onBackHome}
            aria-label="Back to Home"
          >
            <span aria-hidden="true">←</span>
            Back to Home
          </button>
        </div>

        <section className="rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.06)] px-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.12)] text-[var(--matterhorn-desk-color)]">
              <ProtocolBrandLogo id={deskId} visual={visual ?? undefined} size={34} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-dls-text">{visual?.agentName ?? "Longevity Agent"}</h2>
                {taskStatus === "failed" ? (
                  <span className="text-[11px] font-semibold text-rose-300">Needs attention</span>
                ) : taskStatus === "idle" ? null : (
                  <span className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)]">Started</span>
                )}
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-dls-secondary">
                {visual?.agentDescription ?? "Run a standardized workflow with visible stages, outputs, and safety boundaries."}
              </p>
              {launchState?.message ? (
                <p className={cn(
                  "mt-1 text-xs leading-5",
                  launchState.status === "failed" ? "text-red-300" : "text-dls-secondary",
                )}>
                  {launchState.message}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {startTaskBlocker ? (
          <div className="flex items-start gap-2 rounded-lg bg-dls-surface/50 px-3 py-2 text-xs leading-5 text-dls-secondary">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[var(--matterhorn-desk-color)]" />
            <span>{startTaskBlocker}</span>
          </div>
        ) : null}

        <DeskWorkflowStagePanel
          deskId={deskId}
          currentStageId={launchState?.run?.stageId}
          taskStatus={taskStatus}
          stageActionDisabled={startTaskBlocked}
          stageActionTitle={startTaskBlocker ?? undefined}
          onStartStage={onStartStage}
        />
      </div>
    </div>
  );
}

function ProtocolDeskEmptyState({
  panel,
  matterhornServerClient,
  runtimeWorkspaceId,
  onUsePrompt,
  onBackHome,
}: {
  panel: VenueSidePanel;
  matterhornServerClient: MatterhornServerClient | null;
  runtimeWorkspaceId: string | null;
  onUsePrompt: (prompt: string, title?: string) => void;
  onBackHome: () => void;
}) {
  const visual = getCustomerProtocolDeskVisual(panel);
  const prompts = PROTOCOL_DESK_SUGGESTED_PROMPTS[panel];
  const draftConfig = getChatDraftConfig(panel);
  const [launchingTaskTitle, setLaunchingTaskTitle] = useState<string | null>(null);
  const readinessWorkspaceId = runtimeWorkspaceId?.trim() ?? "";
  const readinessQuery = useQuery({
    queryKey: ["protocol-desk-readiness", readinessWorkspaceId],
    enabled: Boolean(matterhornServerClient && readinessWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!matterhornServerClient || !readinessWorkspaceId) throw new Error("Open a workspace to start desk tasks.");
      return matterhornServerClient.workspaceReadiness(readinessWorkspaceId);
    },
  });
  const startTaskFeature = readinessQuery.data?.features.start_desk_task;
  const startTaskBlocked = Boolean(
    !matterhornServerClient ||
    !readinessWorkspaceId ||
    (startTaskFeature && !startTaskFeature.ready),
  );
  const startTaskBlocker = !matterhornServerClient
    ? "Matterhorn Work engine is offline."
    : !readinessWorkspaceId
      ? "Open a workspace before starting a desk task."
      : startTaskFeature && !startTaskFeature.ready
        ? `Start task needs ${startTaskFeature.blockingCheckIds
          .map((checkId) => readinessQuery.data?.checks[checkId]?.label ?? checkId)
          .join(", ")}.`
        : null;
  const deskSafetyInfo = panel === "bittensor"
    ? "Runs public SS58 reads and unsigned previews. Signing stays in an external Bittensor-compatible wallet."
    : panel === "polymarket"
      ? "Runs market research, compliance checks, and external-wallet handoffs. Matterhorn never places bets inside the app."
      : panel === "sui"
        ? "Runs public Sui account reads and transfer previews. Web signing happens in your connected Sui wallet; desktop signing stays external."
        : "Runs read-only market/account checks and prepares external-client handoffs. Matterhorn never submits orders inside the app.";

  return (
    <section
      className="mx-auto flex min-w-0 w-full max-w-[min(56rem,100%)] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-7"
      style={deskToneStyle(panel)}
      aria-label={`${visual?.displayName ?? panel} desk start`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-dls-secondary transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.10)] hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
          onClick={onBackHome}
          aria-label="Back to Home"
        >
          <span aria-hidden="true">←</span>
          Back to Home
        </button>
      </div>
      <div className="matterhorn-focused-desk-hero px-1 py-2">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center text-[var(--matterhorn-desk-color)]">
              <ProtocolLogo venue={panel} size={52} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-dls-text sm:text-2xl">
                  {visual?.displayName ?? panel} desk
                </h2>
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`${visual?.displayName ?? panel} desk safety info`}
                        className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.11)] hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
                      >
                        <Info className="size-3.5" aria-hidden="true" />
                      </button>
                    }
                  />
                  <PopoverContent
                    side="right"
                    align="start"
                    className="w-72 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-left text-xs leading-5 text-dls-secondary shadow-none"
                  >
                    <p>{deskSafetyInfo}</p>
                  </PopoverContent>
                </Popover>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-dls-secondary text-pretty">
                {visual?.shortDescription ?? "Focused protocol workspace."} Choose a task to start this desk agent.
              </p>
            </div>
          </div>
        </div>
      </div>

      {startTaskBlocker ? (
        <div className="mx-1 flex items-start gap-2 rounded-md bg-dls-surface-muted/35 px-3 py-2 text-xs leading-5 text-dls-secondary">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[var(--matterhorn-desk-color)]" />
          <span>{startTaskBlocker}</span>
        </div>
      ) : null}
      {launchingTaskTitle ? (
        <div className="mx-1 text-xs leading-5 text-dls-secondary" role="status">
          Starting {launchingTaskTitle} in a new chat.
        </div>
      ) : null}

      <div className="matterhorn-focused-desk-prompt-list space-y-2" aria-label="Agent tasks">
        {prompts.map((item) => {
          const isLaunching = launchingTaskTitle === item.title;
          const evidenceHint = panel === "bittensor"
            ? "reads: public SS58 and subnet context"
            : panel === "hyperliquid"
              ? "reads: public market and account context"
              : panel === "polymarket"
                ? "reads: public market and compliance context"
                : panel === "sui"
                  ? "reads: public Sui account and receipt context"
                  : "reads: public context";
          return (
            <WorkflowStageCard
              key={item.title}
              title={item.title}
              objective={item.detail}
              status="idle"
              evidenceHints={[evidenceHint]}
              actionLabel={isLaunching ? "Starting..." : startTaskBlocked ? "Needs setup" : draftConfig?.confirmCtaLabel ?? "Start task"}
              actionDisabled={startTaskBlocked || Boolean(launchingTaskTitle)}
              actionTitle={startTaskBlocker ?? undefined}
              onAction={() => {
                setLaunchingTaskTitle(item.title);
                onUsePrompt(item.prompt, item.title);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

type StatusBarOverrides = Pick<
  StatusBarProps,
  | "loading"
  | "showSettingsButton"
  | "settingsOpen"
>;

type WorkflowDeskLaunchState = {
  deskId: WorkflowDeskId;
  status: "idle" | "staging" | "running" | "failed";
  run: MatterhornWorkflowRun | null;
  message: string | null;
  intent: string | null;
};

type WorkflowDeskId = Extract<CustomerProtocolDeskId, CustomerWorkflowIconHint>;

export type SessionPageHistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  busyAction: "undo" | "redo" | null;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;
};

export type SessionPageSidebarProps = {
  workspaceSessionGroups: WorkspaceSessionGroup[];
  selectedWorkspaceId: string;
  selectedSessionId: string | null;
  developerMode: boolean;
  sessionStatusById: Record<string, string>;
  connectingWorkspaceId: string | null;
  workspaceConnectionStateById: Record<string, WorkspaceConnectionState>;
  newTaskDisabled: boolean;
  sidebarHydratedFromCache: boolean;
  startupPhase: BootPhase;
  onSelectWorkspace: (workspaceId: string) => Promise<boolean> | boolean | void;
  onOpenWorkspaceHome?: (workspaceId: string) => void;
  onOpenWorkspaceHistory?: (workspaceId: string) => void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  onPrefetchSession?: (workspaceId: string, sessionId: string) => void;
  onCreateTaskInWorkspace: (workspaceId: string) => void;
  // Stable launcher contract: onCreateTaskWithPrompt?: (workspaceId: string, prompt: string, options?: { title?: string; agent?: string }) => void
  onCreateTaskWithPrompt?: (workspaceId: string, prompt: string, options?: { title?: string; agent?: string; sendImmediately?: boolean }) => void;
  onOpenRenameWorkspace: (workspaceId: string) => void;
  onShareWorkspace: (workspaceId: string) => void;
  onRevealWorkspace: (workspaceId: string) => void;
  onRecoverWorkspace: (workspaceId: string) => Promise<boolean> | boolean | void;
  onTestWorkspaceConnection: (workspaceId: string) => Promise<boolean> | boolean | void;
  onEditWorkspaceConnection: (workspaceId: string) => void;
  onForgetWorkspace: (workspaceId: string) => void;
  onOpenCreateWorkspace: () => void;
  onReorderWorkspaces?: (workspaceIds: string[]) => void;
};

export type SessionPageSurfaceProps = Omit<
  SessionSurfaceProps,
  "client" | "workspaceId" | "sessionId" | "opencodeBaseUrl" | "matterhornToken"
>;

export type SessionPageProps = {
  selectedSessionId: string | null;
  workspaceHomeView?: "home" | "history";
  selectedWorkspaceId: string;
  selectedWorkspaceDisplay: {
    id?: string;
    name?: string;
    displayName?: string;
    workspaceType?: WorkspaceInfo["workspaceType"];
  };
  selectedWorkspaceRoot: string;
  selectedWorkspaceError?: string | null;
  runtimeWorkspaceId: string | null;
  /**
   * Pre-built OpenCode SDK base URL for the selected workspace's owning
   * server. The parent route resolves this through `resolveWorkspaceEndpoint`
   * so we never compose `<baseUrl>/workspace/<id>/opencode` here.
   */
  opencodeBaseUrl?: string | null;
  workspaces: WorkspaceInfo[];
  clientConnected: boolean;
  matterhornServerStatus: MatterhornServerStatus;
  matterhornServerClient: MatterhornServerClient | null;
  matterhornServerToken?: string | null;
  developerMode: boolean;
  headerStatus: string;
  busyHint: string | null;
  startupPhase: BootPhase;
  providerConnectedIds: string[];
  providers?: ProviderListItem[];
  mcpConnectedCount: number;
  onSendFeedback: () => void;
  onOpenSettings: () => void;
  sidebar: SessionPageSidebarProps;
  surface?: SessionPageSurfaceProps | null;
  history?: SessionPageHistoryControls | null;
  todos: TodoItem[];
  sessionLoadingById: (sessionId: string | null) => boolean;
  shareWorkspaceModal?: ShareWorkspaceModalProps | null;
  providerAuthModal?: ProviderAuthModalProps | null;
  activePermission?: PendingPermission | null;
  permissionReplyBusy?: boolean;
  respondPermission?: (requestID: string, reply: "once" | "always" | "reject") => void;
  safeStringify?: (value: unknown) => string;
  activeQuestion?: PendingQuestion | null;
  questionReplyBusy?: boolean;
  respondQuestion?: (requestID: string, answers: string[][]) => void;
  statusBar?: Partial<StatusBarOverrides>;
  notFoundMessage?: string | null;
  onRevealPath?: (path: string, label: string) => Promise<void> | void;
  onRenameSession?: (sessionId: string, title: string) => Promise<void> | void;
  onDeleteSession?: (sessionId: string) => Promise<void> | void;
  onAccessibleTargetsChange?: (targets: OpenTarget[]) => void;
  /** Settings content rendered inside the right pane when the settings rail icon is active. */
  settingsSlot?: React.ReactNode;
  /** Settings content rendered inside the right pane for a specific compact settings route. */
  settingsSlotForPath?: (initialPath: "general" | "cloud-account" | "wallet" | "extensions") => React.ReactNode;
};

function getSidebarInitialLoading(props: SessionPageSidebarProps) {
  if (props.workspaceSessionGroups.some((group) => group.sessions.length > 0)) {
    return false;
  }
  if (props.sidebarHydratedFromCache) return false;
  if (
    props.startupPhase !== "sessionIndexReady" &&
    props.startupPhase !== "firstSessionReady" &&
    props.startupPhase !== "ready"
  ) {
    return true;
  }
  return props.workspaceSessionGroups.some(
    (group) => group.status === "loading" || group.status === "idle",
  );
}

function sessionTitleForId(groups: WorkspaceSessionGroup[], id: string | null | undefined) {
  if (!id) return "";
  const sessionsById = new Map(groups.flatMap((group) => group.sessions.map((session) => [session.id, session] as const)));
  const match = sessionsById.get(id);
  return match ? getDisplaySessionTitle(match.title) : "";
}

function isTrackableAccessibleTarget(target: OpenTarget) {
  return isCollectibleArtifactTarget(target) || isLocalhostBrowserTarget(target);
}

function hiddenAccessibleTargetsStorageKey(workspaceId: string | null | undefined, sessionId: string | null | undefined) {
  if (!workspaceId || !sessionId) return null;
  return `matterhorn.session.hiddenAccessibleTargets.v1:${workspaceId}:${sessionId}`;
}

function readHiddenAccessibleTargetIds(workspaceId: string | null | undefined, sessionId: string | null | undefined): Set<string> {
  const key = hiddenAccessibleTargetsStorageKey(workspaceId, sessionId);
  if (!key || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function writeHiddenAccessibleTargetIds(workspaceId: string | null | undefined, sessionId: string | null | undefined, ids: Set<string>) {
  const key = hiddenAccessibleTargetsStorageKey(workspaceId, sessionId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage failures
  }
}

export function SessionPage(props: SessionPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { config: shellConfig } = useShellConfig();
  const wallet = useWallet();
  const sessionWallet = useSessionWallet(wallet.store);
  useJobCron(wallet.store);
  const currentWalletRuntime = useMemo(() => homeWalletRuntime(), []);
  const [commandOpen, setCommandOpen] = useState(false);

  // Cmd+K / Ctrl+K command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { openQuickJot } = useQuickJot();
  const addArtifactNote = useCallback(
    async (artifactPath: string, desk?: string, sessionSlug?: string) => {
      const noteContext = getArtifactNoteContext(artifactPath);
      const workspaceId = (props.runtimeWorkspaceId ?? props.selectedWorkspaceId).trim();
      const client = props.matterhornServerClient;

      if (!workspaceId || !client) {
        openQuickJot({
          type: "output",
          id: noteContext.path,
          label: noteContext.fileName,
        });
        return;
      }

      try {
        await client.createNote(workspaceId, {
          title: `Note about ${noteContext.fileName}`.slice(0, 150),
          body: `Linked output: ${noteContext.path}`,
          tags: ["output", desk ?? noteContext.desk ?? ""].filter(Boolean),
          desk: desk ?? noteContext.desk ?? null,
          sessionId: sessionSlug ?? noteContext.sessionSlug ?? null,
          outputPath: noteContext.path,
          source: "output",
        });
        dispatchNotesUpdated(workspaceId);
        navigate(workspaceNotesRoute(workspaceId));
      } catch {
        openQuickJot({
          type: "output",
          id: noteContext.path,
          label: noteContext.fileName,
        });
      }
    },
    [navigate, openQuickJot, props.matterhornServerClient, props.runtimeWorkspaceId, props.selectedWorkspaceId],
  );

  const sidePanelScopeId = props.selectedSessionId?.trim() || GLOBAL_HOME_SIDE_PANEL_KEY;
  const sidebarOpen = useUiStateStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStateStore((state) => state.setSidebarOpen);
  const sessionSidePanel = useUiStateStore((state) => (
    state.sidePanelState[sidePanelScopeId] ?? null
  ));
  const voiceSidePanelOpen = useUiStateStore((state) => state.sidePanelState[GLOBAL_VOICE_SIDE_PANEL_KEY] === "voice");
  const setSidePanelState = useUiStateStore((state) => state.setSidePanelState);
  const toggleSidePanelState = useUiStateStore((state) => state.toggleSidePanelState);
  const [artifactTarget, setArtifactTarget] = useState<OpenTarget | null>(null);
  const [openTargets, setOpenTargets] = useState<OpenTarget[]>([]);
  const [hiddenAccessibleTargetIds, setHiddenAccessibleTargetIds] = useState<Set<string>>(() => new Set());
  const [, setExtensionStateVersion] = useState(0);
  const loadedHiddenTargetsKeyRef = useRef<string | null>(null);
  const outputReceiptWorkspaceId = (props.runtimeWorkspaceId ?? props.selectedWorkspaceId).trim();
  const homeWalletCapabilitiesQuery = useQuery({
    queryKey: ["home-wallet-backend-capabilities", outputReceiptWorkspaceId] as const,
    queryFn: () => props.matterhornServerClient!.backendCapabilities(),
    enabled: Boolean(props.matterhornServerClient && outputReceiptWorkspaceId),
    staleTime: 30_000,
  });
  const outputReceiptsQuery = useQuery({
    queryKey: ["workflow-output-receipts", outputReceiptWorkspaceId] as const,
    queryFn: () => props.matterhornServerClient!.listProjectEvidence(outputReceiptWorkspaceId, { limit: 200 }),
    enabled: Boolean(props.matterhornServerClient && outputReceiptWorkspaceId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const workflowOutputReceipts = useMemo(
    () => workflowOutputReceiptsFromEvidence(outputReceiptsQuery.data?.items ?? []),
    [outputReceiptsQuery.data?.items],
  );
  const messageAccessibleTargets = useMemo(
    () => openTargets.filter((target) => isTrackableAccessibleTarget(target) && !hiddenAccessibleTargetIds.has(target.id)),
    [hiddenAccessibleTargetIds, openTargets],
  );
  const artifactFileTargets = useMemo(
    () => mergeOpenTargetsWithWorkflowOutputReceipts(
      messageAccessibleTargets.filter(isCollectibleArtifactTarget),
      workflowOutputReceipts,
    ).filter((target) => isCollectibleArtifactTarget(target) && !hiddenAccessibleTargetIds.has(target.id)),
    [hiddenAccessibleTargetIds, messageAccessibleTargets, workflowOutputReceipts],
  );
  const accessibleTargets = useMemo(
    () => {
      const targetsById = new Map<string, OpenTarget>();
      for (const target of messageAccessibleTargets) {
        if (!isCollectibleArtifactTarget(target)) {
          targetsById.set(target.id, target);
        }
      }
      for (const target of artifactFileTargets) {
        targetsById.set(target.id, target);
      }
      return Array.from(targetsById.values());
    },
    [artifactFileTargets, messageAccessibleTargets],
  );
  const visibleArtifactTarget = artifactTarget ?? artifactFileTargets[0] ?? null;
  const artifactTargetCount = artifactFileTargets.length;
  const hasArtifactTargets = artifactTargetCount > 0;
  const routeSidePanel = useMemo(() => {
    const requestedPanel = new URLSearchParams(location.search).get("panel");
    return SIDE_PANEL_ITEMS.includes(requestedPanel as SidePanelItem)
      ? requestedPanel as SidePanelItem
      : null;
  }, [location.search]);
  const activeSidePanel = voiceSidePanelOpen ? "voice" : routeSidePanel ?? sessionSidePanel;
  const browserRailActive = activeSidePanel === "browser";
  const artifactRailActive = activeSidePanel === "artifacts";
  const showArtifactRailItem = hasArtifactTargets || artifactRailActive;
  const extensionsRailActive = activeSidePanel === "extensions";
  const voiceRailActive = activeSidePanel === "voice";
  const profileRailActive = activeSidePanel === "profile";
  const memoryRailActive = activeSidePanel === "memory";
  const notesRailActive = activeSidePanel === "notes";
  const walletRailActive = activeSidePanel === "wallet";
  const focusedProtocolPanel = !props.selectedSessionId && isVenueSidePanel(activeSidePanel) ? activeSidePanel : null;
  const visibleSidePanel = focusedProtocolPanel ? null : activeSidePanel;
  const sidePanelOpen = visibleSidePanel !== null;
  const isMobileViewport = useIsMobile();
  const dockedSidePanelOpen = sidePanelOpen && !isMobileViewport;
  const mobileSidePanelOpen = sidePanelOpen && isMobileViewport;
  const protocolSidePanelOpen = isVenueSidePanel(visibleSidePanel);
  const sidePanelTitle = visibleSidePanel === "profile"
    ? "Settings"
    : visibleSidePanel === "wallet"
      ? "Wallet"
      : visibleSidePanel === "extensions"
        ? "MCPs & Tools"
        : visibleSidePanel === "memory"
          ? "Memory"
          : visibleSidePanel === "notes"
            ? "Notes"
            : visibleSidePanel === "artifacts"
              ? "Outputs"
              : visibleSidePanel === "voice"
                ? "Voice"
                : visibleSidePanel === "browser"
                  ? "Browser"
                  : isVenueSidePanel(visibleSidePanel)
                    ? `${getCustomerProtocolDeskVisual(visibleSidePanel)?.displayName ?? "Desk"} desk`
                    : "Panel";
  const renderCompactSettingsRail = (initialPath: "general" | "cloud-account" | "wallet" | "extensions") => {
    const slot = props.settingsSlotForPath?.(initialPath)
      ?? (initialPath === "extensions" ? props.settingsSlot : null);
    return slot ? (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        {slot}
      </div>
    ) : null;
  };
  const voiceExtension = useMemo(
    () => OPENWORK_EXTENSION_CATALOG.find((entry) => getExtensionId(entry) === "matterhorn-voice") ?? null,
    [],
  );
  const voiceExtensionEnabled = voiceExtension ? isMatterhornExtensionEnabled(voiceExtension) : false;
  const customerWorkflowTemplatesQuery = useQuery({
    queryKey: ["matterhorn-customer-workflow-templates"],
    queryFn: fetchCustomerWorkflowTemplates,
    staleTime: 60_000,
  });
  const customerWorkflowStarterCards = useMemo(
    () => buildCustomerWorkflowStarterCards(customerWorkflowTemplatesQuery.data),
    [customerWorkflowTemplatesQuery.data],
  );
  const mondayBetaDemoCards = useMemo(
    () => buildCustomerBetaDemoStarterCards(customerWorkflowTemplatesQuery.data),
    [customerWorkflowTemplatesQuery.data],
  );
  const customerWorkflowLaunchers = useMemo(
    () => customerWorkflowStarterCards.filter((card) => card.id !== "blank_chat_workflow"),
    [customerWorkflowStarterCards],
  );
  const protocolWorkflowLaunchers = useMemo(
    () => customerWorkflowStarterCards.filter((card) => card.panel === "bittensor" || card.panel === "hyperliquid" || card.panel === "polymarket" || card.panel === "sui"),
    [customerWorkflowStarterCards],
  );
  const [memorySuggestionUnreadCount, setMemorySuggestionUnreadCount] = useState(0);
  const refreshMemorySuggestionUnreadCount = useCallback(async () => {
    const client = props.matterhornServerClient;
    if (!client) {
      setMemorySuggestionUnreadCount(0);
      return;
    }
    try {
      const response = await client.listMemorySuggestions({ status: "pending", limit: 50 });
      setMemorySuggestionUnreadCount((response.entries ?? []).filter((entry) => entry.status === "pending").length);
    } catch {
      setMemorySuggestionUnreadCount(0);
    }
  }, [props.matterhornServerClient]);
  useEffect(() => {
    void refreshMemorySuggestionUnreadCount();
  }, [refreshMemorySuggestionUnreadCount]);
  useEffect(() => {
    const refresh = () => {
      void refreshMemorySuggestionUnreadCount();
    };
    window.addEventListener("matterhorn:memory-suggestions-updated", refresh);
    window.addEventListener("matterhorn:memory-suggestion", refresh);
    window.addEventListener("matterhorn:memory-suggestions-changed", refresh);
    return () => {
      window.removeEventListener("matterhorn:memory-suggestions-updated", refresh);
      window.removeEventListener("matterhorn:memory-suggestion", refresh);
      window.removeEventListener("matterhorn:memory-suggestions-changed", refresh);
    };
  }, [refreshMemorySuggestionUnreadCount]);
  const memoryInboxLabel = memorySuggestionUnreadCount > 0
    ? `Memory review: ${memorySuggestionUnreadCount > 99 ? "99+" : memorySuggestionUnreadCount} pending suggestions`
    : "Memory review: no pending suggestions";

  const businessWorkflowLaunchers = useMemo(
    () => customerWorkflowStarterCards.filter((card) => card.id === "wellness_creator_workflow"),
    [customerWorkflowStarterCards],
  );
  const blankWorkflowLauncher = useMemo(
    () => customerWorkflowStarterCards.find((card) => card.id === "blank_chat_workflow") ?? null,
    [customerWorkflowStarterCards],
  );
  const wellnessRailLauncher = useMemo(
    () => customerWorkflowStarterCards.find((card) => card.id === "wellness_creator_workflow") ?? null,
    [customerWorkflowStarterCards],
  );

  useReactRenderWatchdog("SessionPage", {
    selectedSessionId: props.selectedSessionId,
    selectedWorkspaceId: props.selectedWorkspaceId,
    clientConnected: props.clientConnected,
    startupPhase: props.startupPhase,
    hasSurface: Boolean(props.surface),
    workspaceCount: props.workspaces.length,
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [homePathCopyLabel, setHomePathCopyLabel] = useState<string | null>(null);
  const [activeWorkflowDeskId, setActiveWorkflowDeskId] = useState<WorkflowDeskId | null>(null);
  const [workflowLaunchState, setWorkflowLaunchState] = useState<WorkflowDeskLaunchState | null>(null);
  const browserPanelRef = usePanelRef();
  const preserveSidePanelOnPanelOpenRef = useRef(false);
  const pendingProtocolRailPanelRef = useRef<VenueSidePanel | null>(null);
  const focusedDeskHistoryRef = useRef<VenueSidePanel | null>(null);
  const homeProjectPath = props.selectedWorkspaceRoot.trim();
  const homeOutputsPath = homeProjectPath ? joinWorkspaceChildPath(homeProjectPath, "outputs") : "outputs/";
  const homeProjectName = props.selectedWorkspaceDisplay.displayName || props.selectedWorkspaceDisplay.name || "Current project";
  const homeFolderLabel = compactPathSegment(homeProjectPath) || "No local folder";
  const goHome = useCallback(() => {
    props.sidebar.onOpenWorkspaceHome?.(props.selectedWorkspaceId);
  }, [props.selectedWorkspaceId, props.sidebar]);

  const openRunHistory = useCallback(() => {
    if (props.sidebar.onOpenWorkspaceHistory) {
      props.sidebar.onOpenWorkspaceHistory(props.selectedWorkspaceId);
      return;
    }
    navigate(workspaceRunHistoryRoute(props.selectedWorkspaceId));
  }, [navigate, props.selectedWorkspaceId, props.sidebar]);

  const copyHomePath = useCallback(async (value: string, label: string) => {
    if (!value.trim()) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setHomePathCopyLabel(label);
      window.setTimeout(() => setHomePathCopyLabel((current) => current === label ? null : current), 1600);
    } catch {
      setHomePathCopyLabel("Copy failed");
      window.setTimeout(() => setHomePathCopyLabel((current) => current === "Copy failed" ? null : current), 2200);
    }
  }, []);

  const setCurrentSidePanel = useCallback((panel: SidePanelItem | null) => {
    setSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, panel === "voice" ? "voice" : null);
    if (panel === "voice") return;
    setSidePanelState(sidePanelScopeId, panel);
  }, [setSidePanelState, sidePanelScopeId]);

  useEffect(() => {
    const requestedPanel = new URLSearchParams(location.search).get("panel");
    if (SIDE_PANEL_ITEMS.includes(requestedPanel as SidePanelItem)) {
      setCurrentSidePanel(requestedPanel as SidePanelItem);
    }
  }, [location.search, setCurrentSidePanel]);

  useEffect(() => {
    setActiveWorkflowDeskId(null);
    setWorkflowLaunchState(null);
  }, [props.selectedWorkspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!focusedProtocolPanel) {
      focusedDeskHistoryRef.current = null;
      return;
    }
    if (focusedDeskHistoryRef.current === focusedProtocolPanel) return;

    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state as Record<string, unknown>
      : {};
    if (currentState.matterhornFocusedDesk !== focusedProtocolPanel) {
      window.history.pushState(
        { ...currentState, matterhornFocusedDesk: focusedProtocolPanel },
        "",
        window.location.href,
      );
    }
    focusedDeskHistoryRef.current = focusedProtocolPanel;
  }, [focusedProtocolPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = (event: PopStateEvent) => {
      const state = event.state && typeof event.state === "object" ? event.state as Record<string, unknown> : {};
      if (!state.matterhornFocusedDesk && focusedDeskHistoryRef.current) {
        focusedDeskHistoryRef.current = null;
        setCurrentSidePanel(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setCurrentSidePanel]);

  const returnToProjectHome = useCallback(() => {
    if (typeof window !== "undefined" && focusedDeskHistoryRef.current) {
      const state = window.history.state && typeof window.history.state === "object"
        ? window.history.state as Record<string, unknown>
        : {};
      if (state.matterhornFocusedDesk) {
        focusedDeskHistoryRef.current = null;
        setCurrentSidePanel(null);
        window.history.back();
        return;
      }
    }
    setCurrentSidePanel(null);
  }, [setCurrentSidePanel]);

  const closeWorkflowDesk = useCallback(() => {
    setActiveWorkflowDeskId(null);
    setWorkflowLaunchState(null);
    returnToProjectHome();
  }, [returnToProjectHome]);

  const openWorkflowDesk = useCallback((
    deskId: WorkflowDeskId,
    prompt: string,
    options?: { title?: string; stageId?: string; actionId?: string; sourceId?: string },
  ) => {
    const visibleUserIntent = prompt.trim();
    if (!visibleUserIntent) return;

    props.sidebar.onOpenWorkspaceHome?.(props.selectedWorkspaceId);
    setCurrentSidePanel(null);
    setActiveWorkflowDeskId(deskId);

    const baseState: WorkflowDeskLaunchState = {
      deskId,
      status: props.matterhornServerClient ? "staging" : "failed",
      run: null,
      message: props.matterhornServerClient
        ? `Starting ${options?.title ?? getCustomerProtocolDeskVisual(deskId)?.agentName ?? "workflow"}...`
        : "Matterhorn Work engine is unavailable for this project. Retry the connection or restart Matterhorn Work if it stays offline.",
      intent: visibleUserIntent,
    };
    setWorkflowLaunchState(baseState);

    if (!props.matterhornServerClient) return;

    const sessionId = `workflow_${deskId}_${Date.now().toString(36)}`;
    if (deskId === "wellness") {
      dispatchMatterhornMemorySuggestions({
        desk: "wellness",
        prompt: visibleUserIntent,
        source: "workflow_output",
        sourceId: options?.sourceId ?? "wellness-workflow-launcher",
        workspaceId: props.selectedWorkspaceId,
        sessionId,
        templateId: "wellness_creator_workflow",
      });
    }

    void stageWorkflowRun(props.matterhornServerClient, {
      workspaceId: props.selectedWorkspaceId,
      sessionId,
      deskId,
      actionId: options?.actionId,
      stageId: options?.stageId,
      visibleUserIntent,
    })
      .then((run) => startWorkflowRun(props.matterhornServerClient!, run.workflowRunId))
      .then((run) => {
        setWorkflowLaunchState({
          deskId,
          status: "running",
          run,
          message: `Started. Outputs will save under ${run.outputBasePath}`,
          intent: visibleUserIntent,
        });
        window.dispatchEvent(new Event("matterhorn:task-log-updated"));
      })
      .catch((error) => {
        setWorkflowLaunchState({
          deskId,
          status: "failed",
          run: null,
          message: error instanceof Error ? error.message : String(error),
          intent: visibleUserIntent,
        });
      });
  }, [
    props.matterhornServerClient,
    props.selectedWorkspaceId,
    props.sidebar,
    setCurrentSidePanel,
  ]);

  const toggleCurrentSidePanel = useCallback((panel: SidePanelItem) => {
    if (panel === "voice") {
      toggleSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, "voice");
      return;
    }
    setSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, null);
    toggleSidePanelState(props.selectedSessionId ?? GLOBAL_HOME_SIDE_PANEL_KEY, panel);
  }, [props.selectedSessionId, setSidePanelState, toggleSidePanelState]);

  // Sync browser panel state with Electron main process IPC events.
  // When the agent calls a built-in browser tool, the main process opens
  // the WebContentsView and sends panel-opened; when hide_browser is called
  // it sends panel-closed.  Without this listener the React UI never knows
  // the panel opened and doesn't render the BrowserPanel toolbar.
  useEffect(() => {
    if (!isElectronRuntime()) return;
    const browser = (window as Window).__OPENWORK_ELECTRON__?.browser;
    if (!browser) return;
    const unsubOpen = browser.onPanelOpened?.(() => {
      if (preserveSidePanelOnPanelOpenRef.current) {
        preserveSidePanelOnPanelOpenRef.current = false;
        return;
      }
      setCurrentSidePanel("browser");
    });
    const unsubClose = browser.onPanelClosed?.(() => setCurrentSidePanel(null));
    return () => { unsubOpen?.(); unsubClose?.(); };
  }, [setCurrentSidePanel]);
  const {
    leftSidebarResizing,
    leftSidebarWidth,
    rightSidebarExpandedWidth: browserPanelWidth,
    setRightSidebarExpandedWidth: setBrowserPanelWidth,
    startLeftSidebarResize,
  } = useWorkspaceShellLayout({
    expandedRightWidth: 520,
    minRightWidth: 320,
  });
  const [browserPanelDefaultWidth, setBrowserPanelDefaultWidth] = useState(browserPanelWidth);
  const sidebarProviderStyle: CSSProperties & Record<"--sidebar-width", string> = {
    "--sidebar-width": `${leftSidebarWidth}px`,
  };
  useEffect(() => {
    if (sidePanelOpen) return;
    setBrowserPanelDefaultWidth(browserPanelWidth);
  }, [sidePanelOpen, browserPanelWidth]);
  useEffect(() => {
    loadedHiddenTargetsKeyRef.current = hiddenAccessibleTargetsStorageKey(props.selectedWorkspaceId, props.selectedSessionId);
    setArtifactTarget(null);
    setOpenTargets([]);
    setHiddenAccessibleTargetIds(readHiddenAccessibleTargetIds(props.selectedWorkspaceId, props.selectedSessionId));
  }, [props.selectedSessionId, props.selectedWorkspaceId]);
  useEffect(() => {
    if (loadedHiddenTargetsKeyRef.current !== hiddenAccessibleTargetsStorageKey(props.selectedWorkspaceId, props.selectedSessionId)) return;
    writeHiddenAccessibleTargetIds(props.selectedWorkspaceId, props.selectedSessionId, hiddenAccessibleTargetIds);
  }, [hiddenAccessibleTargetIds, props.selectedSessionId, props.selectedWorkspaceId]);
  useEffect(() => {
    props.onAccessibleTargetsChange?.(accessibleTargets);
  }, [accessibleTargets, props.onAccessibleTargetsChange]);
  useEffect(() => {
    if (!props.selectedSessionId) return;
    const pendingPanel = pendingProtocolRailPanelRef.current;
    if (!pendingPanel) return;
    pendingProtocolRailPanelRef.current = null;
    setCurrentSidePanel(pendingPanel);
  }, [props.selectedSessionId, setCurrentSidePanel]);
  const commitBrowserPanelWidth = useCallback(() => {
    const size = browserPanelRef.current?.getSize();
    if (size?.inPixels) setBrowserPanelWidth(Math.round(size.inPixels));
  }, [browserPanelRef, setBrowserPanelWidth]);
  const browserUrlForTarget = useCallback((target: OpenTarget) => {
    if (/^wss?:\/\//i.test(target.value)) return target.value.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
    return target.value;
  }, []);
  const openTarget = useCallback((target: OpenTarget, options?: { auto?: boolean }) => {
    if (target.kind === "url" || target.preview === "browser") {
      const url = browserUrlForTarget(target);
      if (isElectronRuntime()) {
        setCurrentSidePanel("browser");
        void window.__OPENWORK_ELECTRON__?.browser?.createTab?.(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (options?.auto && artifactTarget?.id === target.id) return;
    setArtifactTarget(target);
    preserveSidePanelOnPanelOpenRef.current = true;
    setCurrentSidePanel("artifacts");
  }, [artifactTarget?.id, browserUrlForTarget, setCurrentSidePanel]);
  const openOutputPathFromActivity = useCallback((outputPath: string) => {
    const normalizedPath = normalizeOutputReceiptPath(outputPath).toLowerCase();
    const target = artifactFileTargets.find((candidate) => (
      normalizeOutputReceiptPath(candidate.value).toLowerCase() === normalizedPath
    ));

    if (target) {
      openTarget(target);
    }
  }, [artifactFileTargets, openTarget]);
  const handleOpenTargetsChange = useCallback((targets: OpenTarget[]) => {
    setOpenTargets(targets);
    setArtifactTarget((current) => {
      if (!current) return current;
      const updated = targets.find((target) => target.id === current.id || target.value === current.value);
      if (!updated) return current;
      return isCollectibleArtifactTarget(updated) ? updated : null;
    });
  }, []);
  const closeRightPane = useCallback(() => {
    setCurrentSidePanel(null);
    if (!routeSidePanel) return;
    const params = new URLSearchParams(location.search);
    params.delete("panel");
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate, routeSidePanel, setCurrentSidePanel]);
  const openBrowserRailPane = useCallback(() => {
    toggleCurrentSidePanel("browser");
  }, [toggleCurrentSidePanel]);
  const canExposeBrowserControlActions = isElectronRuntime() && Boolean(window.__OPENWORK_ELECTRON__?.browser);
  const openBrowserPanelControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "browser.open_panel",
    label: "Open browser panel",
    description: "Open the built-in Matterhorn Work browser side panel.",
    sideEffect: "navigation",
    execute: () => {
      setCurrentSidePanel("browser");
      return { ok: true };
    },
  }), [setCurrentSidePanel]);
  useControlAction(canExposeBrowserControlActions ? openBrowserPanelControlAction : null);

  const openBrowserUrlControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "browser.open",
    label: "Open browser URL",
    description: "Open a URL in the built-in Matterhorn Work browser and reveal the browser panel.",
    sideEffect: "navigation",
    requiresArgs: true,
    args: [
      { name: "url", type: "string", required: true, description: "URL to open in the built-in browser." },
      { name: "newTab", type: "boolean", required: false, description: "When false, navigate the active tab instead of creating a new tab." },
    ],
    previewArgs: { url: "https://matterhorn.so", newTab: true },
    execute: async (args) => {
      const payload = args && typeof args === "object" ? args as { url?: unknown; newTab?: unknown } : {};
      const url = typeof payload.url === "string" ? payload.url.trim() : "";
      if (!url) return { ok: false, error: "browser.open requires a non-empty url." };
      setCurrentSidePanel("browser");
      if (payload.newTab === false) {
        await window.__OPENWORK_ELECTRON__?.browser?.navigate?.(url);
        return { url, newTab: false };
      }
      const tab = await window.__OPENWORK_ELECTRON__?.browser?.createTab?.(url);
      return { url, newTab: true, tabId: tab?.tabId ?? null };
    },
  }), [setCurrentSidePanel]);
  useControlAction(canExposeBrowserControlActions ? openBrowserUrlControlAction : null);

  const openArtifactRailPane = useCallback(() => {
    if (!hasArtifactTargets) return;
    if (!artifactRailActive) {
      preserveSidePanelOnPanelOpenRef.current = true;
    }
    toggleCurrentSidePanel("artifacts");
  }, [artifactRailActive, hasArtifactTargets, toggleCurrentSidePanel]);
  const openExtensionsRailPane = useCallback(() => {
    toggleCurrentSidePanel("extensions");
  }, [toggleCurrentSidePanel]);
  const openVoiceRailPane = useCallback(() => {
    toggleCurrentSidePanel("voice");
  }, [toggleCurrentSidePanel]);
  const openMemoryRailPane = useCallback(() => {
    toggleCurrentSidePanel("memory");
  }, [toggleCurrentSidePanel]);
  const openNotesRailPane = useCallback(() => {
    toggleCurrentSidePanel("notes");
  }, [toggleCurrentSidePanel]);
  const primeProtocolRailPrompt = useCallback((
    panel: VenueSidePanel,
    options?: { prompt?: string; source?: string; title?: string },
  ) => {
    const launcher = protocolWorkflowLaunchers.find((item) => item.panel === panel);
    const prompt = options?.prompt ?? launcher?.prompt;
    const title = options?.title ?? launcher?.title;
    if (!prompt) return;
    pendingProtocolRailPanelRef.current = panel;
    if (props.sidebar.onCreateTaskWithPrompt) {
      props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, prompt, {
        title,
        agent: agentIdForDesk(panel),
        sendImmediately: true,
      });
      return;
    }
    props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId);
  }, [props.selectedSessionId, props.selectedWorkspaceId, props.sidebar, props.surface, protocolWorkflowLaunchers]);
  const openVenueRailPane = useCallback((panel: VenueSidePanel, options?: { primePrompt?: boolean; prompt?: string; source?: string; title?: string }) => {
    if (options?.primePrompt && !(props.selectedSessionId && props.surface)) {
      pendingProtocolRailPanelRef.current = panel;
    }
    setCurrentSidePanel(panel);
    if (options?.primePrompt) primeProtocolRailPrompt(panel, options);
  }, [primeProtocolRailPrompt, props.selectedSessionId, props.surface, setCurrentSidePanel]);
  const removeAccessibleTarget = useCallback((target: OpenTarget) => {
    setHiddenAccessibleTargetIds((current) => new Set(current).add(target.id));
    setArtifactTarget((current) => current?.id === target.id ? null : current);
  }, []);
  const sidePanelContent = visibleSidePanel === "extensions" && (props.settingsSlotForPath || props.settingsSlot) ? (
    renderCompactSettingsRail("extensions")
  ) : visibleSidePanel === "voice" ? (
    <VoicePanel
      client={props.matterhornServerClient}
      sessionId={props.selectedSessionId}
      onClose={closeRightPane}
    />
  ) : visibleSidePanel === "profile" && props.settingsSlotForPath ? (
    renderCompactSettingsRail("general")
  ) : visibleSidePanel === "wallet" && props.settingsSlotForPath ? (
    renderCompactSettingsRail("wallet")
  ) : visibleSidePanel === "memory" ? (
    <MemoryPanel
      client={props.matterhornServerClient}
      sessionId={props.selectedSessionId}
      workspaceId={props.runtimeWorkspaceId ?? props.selectedWorkspaceId}
      onClose={closeRightPane}
    />
  ) : visibleSidePanel === "notes" ? (
    <NotesPanel
      client={props.matterhornServerClient}
      workspaceId={props.runtimeWorkspaceId ?? props.selectedWorkspaceId}
    />
  ) : visibleSidePanel === "artifacts" && visibleArtifactTarget && props.matterhornServerClient && props.runtimeWorkspaceId ? (
    <ArtifactPanel
      client={props.matterhornServerClient}
      workspaceId={props.runtimeWorkspaceId}
      workspaceRoot={props.selectedWorkspaceRoot}
      workspaceName={props.selectedWorkspaceDisplay.displayName ?? props.selectedWorkspaceDisplay.name ?? ""}
      isRemoteWorkspace={props.surface?.isRemoteWorkspace ?? false}
      target={visibleArtifactTarget}
      targets={artifactFileTargets}
      outputReceipts={workflowOutputReceipts}
      onSelectTarget={openTarget}
      onAddNote={(artifactPath, desk, sessionSlug) => void addArtifactNote(artifactPath, desk, sessionSlug)}
      onRevealPath={props.onRevealPath}
      onDeletedTarget={removeAccessibleTarget}
      onClose={closeRightPane}
    />
  ) : visibleSidePanel === "sui" ? (
    <div
      data-testid="protocol-side-panel-scroll-root"
      className="flex h-full min-h-0 max-h-full flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain"
    >
      <SuiWorkflowPanel
        matterhornServerClient={props.matterhornServerClient}
        workspaceId={props.runtimeWorkspaceId ?? props.selectedWorkspaceId}
        sessionId={props.selectedSessionId}
        compact
        onEvidenceSaved={() => void outputReceiptsQuery.refetch()}
      />
    </div>
  ) : isLegacyCryptoVenueSidePanel(visibleSidePanel) ? (
    <div
      data-testid="protocol-side-panel-scroll-root"
      className="flex h-full min-h-0 max-h-full flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain"
    >
      <WalletPanel
        store={wallet.store}
        gasPriceGwei={sessionWallet.gasPriceGwei}
        blockExplorerUrl={sessionWallet.blockExplorerUrl}
        initialVenue={visibleSidePanel}
      />
    </div>
  ) : (
    <BrowserPanel onClose={closeRightPane} />
  );
  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<OpenTarget>).detail;
      const target = accessibleTargets.find((item) => item.id === requested?.id || item.value === requested?.value) ?? (
        requested?.kind && requested?.value ? requested : null
      );
      if (target) openTarget(target);
    };
    const hide = (event: Event) => {
      const requested = (event as CustomEvent<OpenTarget>).detail;
      const target = accessibleTargets.find((item) => item.id === requested?.id || item.value === requested?.value);
      if (target) removeAccessibleTarget(target);
    };
    window.addEventListener("openwork-open-accessible-target", open);
    window.addEventListener("openwork-hide-accessible-target", hide);
    return () => {
      window.removeEventListener("openwork-open-accessible-target", open);
      window.removeEventListener("openwork-hide-accessible-target", hide);
    };
  }, [accessibleTargets, openTarget, removeAccessibleTarget]);
  useEffect(() => {
    const handler = () => setCurrentSidePanel(null);
    window.addEventListener("openwork-close-right-pane", handler);
    return () => window.removeEventListener("openwork-close-right-pane", handler);
  }, [setCurrentSidePanel]);
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
    if (activeSidePanel === "voice" && !voiceExtensionEnabled) {
      setCurrentSidePanel(null);
    }
  }, [activeSidePanel, setCurrentSidePanel, voiceExtensionEnabled]);

  const openVoicePanelControlAction = useMemo<MatterhornControlAction | null>(() => (
    voiceExtensionEnabled ? {
      id: "voice.panel.open",
      label: "Open Voice Mode",
      description: "Open the sticky Voice Mode right-side panel.",
      sideEffect: "none",
      execute: () => {
        setCurrentSidePanel("voice");
        return { open: true };
      },
    } : null
  ), [setCurrentSidePanel, voiceExtensionEnabled]);
  useControlAction(openVoicePanelControlAction);

  const closeVoicePanelControlAction = useMemo<MatterhornControlAction | null>(() => (
    voiceExtensionEnabled && activeSidePanel === "voice" ? {
      id: "voice.panel.close",
      label: "Close Voice Mode",
      description: "Close the Voice Mode right-side panel.",
      sideEffect: "none",
      execute: () => {
        setCurrentSidePanel(null);
        return { open: false };
      },
    } : null
  ), [activeSidePanel, setCurrentSidePanel, voiceExtensionEnabled]);
  useControlAction(closeVoicePanelControlAction);
  const [showDelayedSessionLoadingState, setShowDelayedSessionLoadingState] = useState(false);

  const selectedSessionTitle = useMemo(
    () => sessionTitleForId(props.sidebar.workspaceSessionGroups, props.selectedSessionId),
    [props.selectedSessionId, props.sidebar.workspaceSessionGroups],
  );
  const sessionActionTitle = useMemo(
    () => sessionTitleForId(props.sidebar.workspaceSessionGroups, sessionActionId),
    [props.sidebar.workspaceSessionGroups, sessionActionId],
  );
  const providerCount = props.providerConnectedIds.length;
  const messageCountVisible = props.selectedSessionId ? 1 : 0;
  const showWorkspaceSetupEmptyState = props.workspaces.length === 0 && !props.selectedSessionId;
  const showStartupSkeleton =
    !props.selectedSessionId &&
    !props.clientConnected &&
    props.startupPhase !== "sessionIndexReady" &&
    props.startupPhase !== "firstSessionReady" &&
    props.startupPhase !== "ready";
  const showSessionLoadingState =
    Boolean(props.selectedSessionId) && props.sessionLoadingById(props.selectedSessionId) && !showWorkspaceSetupEmptyState;
  const sidebarInitialLoading = useMemo(() => getSidebarInitialLoading(props.sidebar), [props.sidebar]);
  // Derive the main-pane error from the same data the sidebar uses so the two
  // panes can never disagree. We check (in priority order):
  // 1. selectedWorkspaceError (errorsByWorkspaceId[selectedWorkspaceId])
  // 2. workspaceConnectionStateById[selectedWorkspaceId].message (covers test/recover paths)
  // 3. group.error from workspaceSessionGroups (the same source the sidebar reads)
  const selectedWorkspaceConnectionMessage = (() => {
    const state = props.sidebar.workspaceConnectionStateById[props.selectedWorkspaceId];
    if (state?.status === "error") return state.message?.trim() ?? "";
    return "";
  })();
  const selectedWorkspaceGroupError = (() => {
    const group = props.sidebar.workspaceSessionGroups.find(
      (item) => item.workspace.id === props.selectedWorkspaceId,
    );
    return group?.error?.trim() ?? "";
  })();
  const selectedWorkspaceErrorMessage =
    props.selectedWorkspaceError?.trim() ||
    selectedWorkspaceConnectionMessage ||
    selectedWorkspaceGroupError ||
    "";
  const showSelectedWorkspaceError = Boolean(selectedWorkspaceErrorMessage);
  const selectedWorkspaceErrorTitle =
    props.selectedWorkspaceDisplay.workspaceType === "remote"
      ? "Remote workspace unavailable"
      : "Matterhorn Work engine unavailable";

  const reactSessionBaseUrl = props.opencodeBaseUrl?.trim() ?? "";
  const reactSessionToken =
    props.matterhornServerToken?.trim() ||
    props.matterhornServerClient?.token?.trim() ||
    "";
  const canRenderReactSurface = Boolean(
    props.selectedSessionId &&
      props.runtimeWorkspaceId &&
      props.matterhornServerClient &&
      reactSessionBaseUrl &&
      reactSessionToken &&
      props.surface,
  );

  useEffect(() => {
    if (!showSessionLoadingState) {
      setShowDelayedSessionLoadingState(false);
      return;
    }
    const id = window.setTimeout(() => {
      setShowDelayedSessionLoadingState(true);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [showSessionLoadingState]);

  useEffect(() => {
    setRenameOpen(false);
    setDeleteOpen(false);
    setRenameBusy(false);
    setDeleteBusy(false);
    setSessionActionId(null);
  }, [props.selectedSessionId]);

  const openRenameModal = (sessionId: string) => {
    if (!props.onRenameSession) return;
    setSessionActionId(sessionId);
    setRenameTitle(sessionTitleForId(props.sidebar.workspaceSessionGroups, sessionId));
    setRenameOpen(true);
  };

  const submitRename = async () => {
    const sessionId = sessionActionId;
    const nextTitle = renameTitle.trim();
    if (!sessionId || !props.onRenameSession || !nextTitle || nextTitle === sessionActionTitle.trim()) return;
    setRenameBusy(true);
    try {
      await props.onRenameSession(sessionId, nextTitle);
      setRenameOpen(false);
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    const sessionId = sessionActionId;
    if (!sessionId || !props.onDeleteSession) return;
    setDeleteBusy(true);
    try {
      await props.onDeleteSession(sessionId);
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(var(--matterhorn-blue-rgb),0.08),transparent_38%),var(--app-bg,#0b1020)] text-dls-text mac:bg-transparent">
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        className={cn(
          "relative min-h-0 flex-1 mac:bg-transparent",
          leftSidebarResizing &&
            "**:data-[slot=sidebar-container]:transition-none **:data-[slot=sidebar-gap]:transition-none",
          !shellConfig.sidebar && "**:data-[slot=sidebar-container]:hidden **:data-[slot=sidebar-gap]:hidden",
        )}
        style={sidebarProviderStyle}
      >
        <AppSidebar
          workspaceSessionGroups={props.sidebar.workspaceSessionGroups}
          selectedWorkspaceId={props.sidebar.selectedWorkspaceId}
          developerMode={props.sidebar.developerMode}
          selectedSessionId={props.sidebar.selectedSessionId}
          showInitialLoading={sidebarInitialLoading}
          showSessionActions={Boolean(props.onRenameSession || props.onDeleteSession)}
          sessionStatusById={props.sidebar.sessionStatusById}
          connectingWorkspaceId={props.sidebar.connectingWorkspaceId}
          workspaceConnectionStateById={props.sidebar.workspaceConnectionStateById}
          newTaskDisabled={props.sidebar.newTaskDisabled}
          onSelectWorkspace={props.sidebar.onSelectWorkspace}
          onOpenSession={props.sidebar.onOpenSession}
          onPrefetchSession={props.sidebar.onPrefetchSession}
          onCreateTaskInWorkspace={props.sidebar.onCreateTaskInWorkspace}
          onOpenRenameSession={props.onRenameSession ? openRenameModal : undefined}
          onOpenDeleteSession={props.onDeleteSession ? (sessionId) => {
            setSessionActionId(sessionId);
            setDeleteOpen(true);
          } : undefined}
          onOpenRenameWorkspace={props.sidebar.onOpenRenameWorkspace}
          onShareWorkspace={props.sidebar.onShareWorkspace}
          onRevealWorkspace={props.sidebar.onRevealWorkspace}
          onRecoverWorkspace={props.sidebar.onRecoverWorkspace}
          onTestWorkspaceConnection={props.sidebar.onTestWorkspaceConnection}
          onEditWorkspaceConnection={props.sidebar.onEditWorkspaceConnection}
          onForgetWorkspace={props.sidebar.onForgetWorkspace}
          onOpenCreateWorkspace={props.sidebar.onOpenCreateWorkspace}
          onReorderWorkspaces={props.sidebar.onReorderWorkspaces}
          onStartResize={startLeftSidebarResize}
        />
        <SidebarInset className="min-h-0 overflow-hidden bg-background mac:bg-background/80 mac:[&_header]:transition-[padding-left] mac:[&_header]:duration-200 mac:[&_header]:ease-linear mac:peer-data-[state=collapsed]:[&_header]:pl-28 mac:max-md:[&_header]:pl-28">
          <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup
            orientation="horizontal"
            onLayoutChanged={dockedSidePanelOpen ? commitBrowserPanelWidth : undefined}
            className="min-h-0 flex-1"
          >
            <ResizablePanel minSize="360px" className="min-w-0">
              <main className="flex h-full min-w-0 flex-col overflow-hidden bg-dls-surface">
          <header className="z-10 flex h-10 shrink-0 items-center justify-between bg-dls-surface/95 px-4 shadow-[0_1px_0_rgba(var(--matterhorn-blue-rgb),0.08)] md:px-6 mac:titlebar-drag @container/titlebar">
            <div className="flex min-w-0 items-center gap-3">
              {shellConfig.sidebar ? <SidebarTrigger className="mac:hidden" /> : null}
              {!showWorkspaceSetupEmptyState ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 rounded-md px-2 text-xs font-semibold text-dls-secondary hover:bg-dls-hover hover:text-dls-text mac:titlebar-no-drag"
                  onClick={goHome}
                  title="Go to project Home"
                  aria-label="Go to project Home"
                >
                  <Home className="size-3.5" />
                  <span>Home</span>
                </Button>
              ) : null}
              {!showWorkspaceSetupEmptyState ? (
                <span
                  className="hidden max-w-[18rem] truncate text-[12px] font-medium text-dls-secondary lg:inline"
                  title={homeProjectName}
                >
                  {homeProjectName}
                </span>
              ) : null}
              <h1 className="min-w-0 truncate text-[15px] font-semibold text-dls-text">
                {showWorkspaceSetupEmptyState
                  ? t("session.create_or_connect_workspace")
                  : props.workspaceHomeView === "history" && !props.selectedSessionId
                    ? "Project history"
                    : selectedSessionTitle || t("session.default_title")}
              </h1>
              {props.selectedSessionId && props.onRenameSession && !showWorkspaceSetupEmptyState ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 text-dls-secondary hover:text-dls-text mac:titlebar-no-drag"
                  onClick={() => openRenameModal(props.selectedSessionId!)}
                  title={t("session.rename_title")}
                  aria-label={t("session.rename_title")}
                >
                  <PencilLine className="size-3.5" />
                </Button>
              ) : null}
              {props.developerMode ? (
                <span className="hidden text-[12px] text-dls-secondary lg:inline">
                  {props.headerStatus}
                </span>
              ) : null}
              {props.busyHint ? (
                <span className="hidden text-[12px] text-dls-secondary lg:inline">
                  {props.busyHint}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 text-gray-10 mac:titlebar-no-drag">
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-dls-secondary hover:text-dls-text"
                onClick={() =>
                  openQuickJot(
                    props.selectedSessionId
                      ? { type: "session", id: props.selectedSessionId, label: selectedSessionTitle }
                      : undefined,
                  )
                }
                title={t("notes.quick_jot_button_title")}
                aria-label={t("notes.quick_jot_button_title")}
              >
                <PencilLine className="size-3.5" />
              </Button>
              {/* Revert/redo moved to per-message actions */}
              {props.developerMode ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    try {
                      window.localStorage.removeItem("openwork.acknowledgedProviders");
                      window.localStorage.removeItem("openwork.orgOnboardingSeen");
                    } catch {}
                  }}
                  title="Clears acknowledged providers + org onboarding so they trigger again"
                >
                  Reset notifications
                </Button>
              ) : null}
            </div>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative min-w-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,var(--dls-surface)_0%,var(--dls-background)_100%)] mac:bg-dls-surface/85 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
              {showStartupSkeleton ? (
                <div className="px-6 py-14" role="status" aria-live="polite">
                  <div className="mx-auto max-w-2xl space-y-6">
                    <div className="space-y-2">
                      <div className="h-4 w-32 animate-pulse rounded-full bg-dls-hover/80" />
                      <div className="h-3 w-64 animate-pulse rounded-full bg-dls-hover/60" />
                    </div>
                    <div className="space-y-3">
                      {STARTUP_SKELETON_ROWS.map((row) => (
                        <div key={row.id} className="rounded-lg bg-dls-hover/35 p-4">
                          <div
                            className="mb-3 h-3 animate-pulse rounded-full bg-dls-hover/80"
                            style={{ width: row.titleWidth }}
                          />
                          <div className="space-y-2">
                            <div className="h-2.5 animate-pulse rounded-full bg-dls-hover/70" />
                            <div
                              className="h-2.5 animate-pulse rounded-full bg-dls-hover/60"
                              style={{ width: row.bodyWidth }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {showDelayedSessionLoadingState ? (
                <div className="px-6 py-16">
                  <div
                    className="mx-auto flex max-w-[320px] flex-col items-center gap-3 text-center"
                    role="status"
                    aria-live="polite"
                  >
                    <OwDotTicker size="md" />
                    <div className="text-[12px] leading-5 text-dls-secondary">
                      {t("session.loading_detail")}
                    </div>
                  </div>
                </div>
              ) : null}

              {!showDelayedSessionLoadingState && canRenderReactSurface ? (
                <SessionSurface
                  // Spread `surface` first so the explicit per-workspace
                  // routing props below CAN'T be silently overridden by
                  // anything that leaks into `surface`. SessionSurface's
                  // server target (client/workspaceId/sessionId/opencodeBaseUrl/matterhornToken)
                  // must come from the resolved workspace endpoint passed by
                  // SessionRoute, not from anything in `surface`.
                  {...props.surface!}
                  client={props.matterhornServerClient!}
                  workspaceId={props.runtimeWorkspaceId!}
                  sessionId={props.selectedSessionId!}
                  opencodeBaseUrl={reactSessionBaseUrl}
                  matterhornToken={reactSessionToken}
                  todos={props.todos}
                  activePermission={props.activePermission}
                  permissionReplyBusy={props.permissionReplyBusy}
                  respondPermission={props.respondPermission}
                  activeQuestion={props.activeQuestion}
                  questionReplyBusy={props.questionReplyBusy}
                  respondQuestion={props.respondQuestion}
                  safeStringify={props.safeStringify}
                  onOpenTarget={openTarget}
                  onOpenTargetsChange={handleOpenTargetsChange}
                  onCreateDeskTask={(prompt, options) => {
                    props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, prompt, options);
                  }}
                />
              ) : null}

              {!showDelayedSessionLoadingState && !canRenderReactSurface && !showStartupSkeleton ? (
                <div className={`mx-auto max-w-[800px] px-6 ${showWorkspaceSetupEmptyState ? "pt-20" : "pt-10"}`}>
                  {props.notFoundMessage ? (
                    <div className="px-6 py-16 text-center">
                      <div className="mx-auto max-w-md rounded-lg bg-dls-card px-5 py-6">
                        <h3 className="text-base font-medium text-dls-text">Workspace or session not found</h3>
                        <p className="mt-2 text-sm leading-6 text-dls-secondary">{props.notFoundMessage}</p>
                      </div>
                    </div>
                  ) : showWorkspaceSetupEmptyState ? (
                    <div className="space-y-6 px-6 text-center">
                      <div className="mx-auto flex size-16 items-center justify-center rounded-xl bg-dls-hover text-dls-secondary">
                        <Zap className="text-dls-secondary" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-medium">{t("session.create_or_connect_workspace")}</h3>
                        <p className="mx-auto max-w-sm text-sm text-dls-secondary">
                          {t("workspace.empty_state_body")}
                        </p>
                      </div>
                      <div className="flex justify-center">
                        <Button onClick={props.sidebar.onOpenCreateWorkspace}>{t("workspace.create_workspace")}</Button>
                      </div>
                    </div>
                  ) : showSelectedWorkspaceError ? (
                    <div className="px-6 py-16">
                      <div className="mx-auto max-w-lg rounded-lg bg-red-1/40 p-5 text-left ring-1 ring-red-7/25">
                        <div className="text-sm font-medium text-red-11">{selectedWorkspaceErrorTitle}</div>
                        <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-red-11/90">
                          {selectedWorkspaceErrorMessage}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId)}
                          >
                            Retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void Promise.resolve(props.sidebar.onTestWorkspaceConnection(props.selectedWorkspaceId))}
                          >
                            {t("workspace_list.test_connection")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => props.sidebar.onEditWorkspaceConnection(props.selectedWorkspaceId)}
                          >
                            {t("workspace_list.edit_connection")}
                          </Button>
                          {props.sidebar.workspaceConnectionStateById[props.selectedWorkspaceId]?.status === "error" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void Promise.resolve(props.sidebar.onRecoverWorkspace(props.selectedWorkspaceId))}
                            >
                              {t("workspace_list.recover")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : props.workspaceHomeView === "history" && !props.selectedSessionId ? (
                    <ProjectHistoryPage
                      matterhornServerClient={props.matterhornServerClient}
                      runtimeWorkspaceId={props.runtimeWorkspaceId}
                    />
                  ) : activeWorkflowDeskId ? (
                    <WorkflowDeskHomeSurface
                      deskId={activeWorkflowDeskId}
                      launchState={workflowLaunchState}
                      matterhornServerClient={props.matterhornServerClient}
                      runtimeWorkspaceId={props.runtimeWorkspaceId}
                      onBackHome={closeWorkflowDesk}
                      onStartStage={(stageId, prompt) => {
                        openWorkflowDesk(activeWorkflowDeskId, prompt, {
                          stageId,
                          title: getCustomerProtocolDeskVisual(activeWorkflowDeskId)?.agentName,
                          sourceId: `${activeWorkflowDeskId}-${stageId}`,
                        });
                      }}
                    />
                  ) : props.selectedSessionId ? (
                    <div className="px-6 py-16 text-center text-sm text-dls-secondary">
                      {t("session.loading_detail")}
                    </div>
                  ) : focusedProtocolPanel ? (
                    <div
                      className="absolute inset-0 flex min-w-0 w-full justify-center overflow-y-auto overflow-x-hidden overscroll-y-contain pb-24 sm:pb-28"
                      style={{ scrollbarGutter: "stable" } as CSSProperties}
                    >
                      <ProtocolDeskEmptyState
                        panel={focusedProtocolPanel}
                        matterhornServerClient={props.matterhornServerClient}
                        runtimeWorkspaceId={props.runtimeWorkspaceId}
                        onBackHome={returnToProjectHome}
                        onUsePrompt={(prompt, title) => {
                          if (typeof window !== "undefined") {
                            const state = window.history.state && typeof window.history.state === "object"
                              ? window.history.state as Record<string, unknown>
                              : {};
                            if (state.matterhornFocusedDesk) {
                              const nextState = { ...state };
                              delete nextState.matterhornFocusedDesk;
                              window.history.replaceState(nextState, "", window.location.href);
                            }
                          }
                          focusedDeskHistoryRef.current = null;
                          setCurrentSidePanel(null);
                          props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, prompt, {
                            title,
                            agent: agentIdForDesk(focusedProtocolPanel),
                            sendImmediately: true,
                          });
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="absolute inset-0 flex items-start justify-center overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-24 pt-6 sm:px-6 sm:pb-28 sm:pt-8"
                      style={{ scrollbarGutter: "stable" } as CSSProperties}
                    >
                      <div className="relative w-full max-w-5xl space-y-6">
                        <section className="space-y-3" aria-label="Workspace home">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <h2 className="truncate text-lg font-semibold leading-7 text-dls-text">
                                {homeProjectName}
                              </h2>
                              <p className="max-w-2xl text-sm leading-6 text-dls-secondary">
                                Start a desk task, continue a chat, or collect notes and outputs for this workspace.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 md:justify-end">
                              <button
                                type="button"
                                className="inline-flex items-center rounded-md bg-[var(--matterhorn-blue)] px-3 py-1.5 text-sm font-semibold text-[var(--matterhorn-ink)] transition-colors hover:bg-[#e7f8ff] disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={props.sidebar.newTaskDisabled}
                                onClick={() => {
                                  if (blankWorkflowLauncher && props.sidebar.onCreateTaskWithPrompt) {
                                    props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, blankWorkflowLauncher.prompt, {
                                      title: blankWorkflowLauncher.title,
                                      sendImmediately: true,
                                    });
                                    return;
                                  }
                                  props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId);
                                }}
                              >
                                New chat
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-md bg-dls-surface-muted/45 px-3 py-1.5 text-sm font-medium text-dls-text transition-colors hover:bg-dls-hover"
                                onClick={props.sidebar.onOpenCreateWorkspace}
                              >
                                New project
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-md bg-transparent px-3 py-1.5 text-sm font-medium text-dls-text transition-colors hover:bg-dls-hover"
                                onClick={() => openQuickJot()}
                              >
                                Jot note
                              </button>
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-col gap-2 text-xs text-dls-secondary sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="inline-flex min-w-0 items-baseline gap-2">
                                <span className="font-medium text-dls-text">Project</span>
                                <span
                                  className="min-w-0 max-w-[18rem] truncate font-mono text-[11px] leading-4 text-dls-secondary"
                                  title={homeProjectPath || "No local project folder selected"}
                                >
                                  {homeFolderLabel}
                                </span>
                              </span>
                              <span className="hidden h-3 w-px bg-dls-border/30 sm:block" aria-hidden="true" />
                              <span className="inline-flex min-w-0 items-baseline gap-2">
                                <span className="font-mono text-[11px] leading-4 text-dls-secondary" title={homeOutputsPath}>outputs/</span>
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <WorkspaceHomeIconAction
                                label={homePathCopyLabel === "Project path" ? "Project path copied" : "Copy project path"}
                                tooltip={homePathCopyLabel === "Project path" ? "Copied" : "Copy project path"}
                                disabled={!homeProjectPath}
                                onClick={() => void copyHomePath(homeProjectPath, "Project path")}
                              >
                                <Copy className="size-3.5" />
                              </WorkspaceHomeIconAction>
                              <WorkspaceHomeIconAction
                                label="Open project folder"
                                tooltip="Open project folder"
                                disabled={!homeProjectPath}
                                onClick={() => props.sidebar.onRevealWorkspace(props.selectedWorkspaceId)}
                              >
                                <FolderOpen className="size-3.5" />
                              </WorkspaceHomeIconAction>
                              <WorkspaceHomeIconAction
                                label={homePathCopyLabel === "Outputs path" ? "Outputs path copied" : "Copy outputs path"}
                                tooltip={homePathCopyLabel === "Outputs path" ? "Copied" : "Copy outputs path"}
                                onClick={() => void copyHomePath(homeOutputsPath, "Outputs path")}
                              >
                                <Copy className="size-3.5" />
                              </WorkspaceHomeIconAction>
                              <WorkspaceHomeIconAction
                                label="Open outputs folder"
                                tooltip="Open outputs folder"
                                disabled={!homeProjectPath || !props.onRevealPath}
                                onClick={() => {
                                  if (!props.onRevealPath) return;
                                  void props.onRevealPath(homeOutputsPath, "Outputs folder");
                                }}
                              >
                                <FolderOpen className="size-3.5" />
                              </WorkspaceHomeIconAction>
                              <WorkspaceHomeIconAction
                                label="Jot a note about outputs"
                                tooltip="Jot a note about outputs"
                                onClick={() =>
                                  openQuickJot({
                                    type: "output",
                                    id: homeOutputsPath,
                                    label: "Outputs",
                                  })
                                }
                              >
                                <PencilLine className="size-3.5" />
                              </WorkspaceHomeIconAction>
                            </div>
                          </div>
                        </section>
                        <HomeWalletRuntimeStatus
                          capabilities={homeWalletCapabilitiesQuery.data ?? null}
                          loading={homeWalletCapabilitiesQuery.isLoading}
                          error={homeWalletCapabilitiesQuery.isError}
                          runtime={currentWalletRuntime}
                          onOpenWallet={() => setCurrentSidePanel("wallet")}
                        />
                        {props.matterhornServerClient && props.runtimeWorkspaceId ? (
                          <RecentActivitySection
                            matterhornServerClient={props.matterhornServerClient}
                            runtimeWorkspaceId={props.runtimeWorkspaceId}
                            limit={8}
                            title="Project Activity"
                            description="Recent notes, outputs, memory reviews, and desk runs."
                            defaultExpanded={false}
                            onOpenOutputPath={openOutputPathFromActivity}
                            onOpenHistory={openRunHistory}
                          />
                        ) : null}
                        <HomeCapabilityOverview
                          onOpenCapability={(id) => {
                            if (id === "bittensor" || id === "hyperliquid" || id === "polymarket" || id === "sui") {
                              openVenueRailPane(id);
                              return;
                            }
                            if (id === "wellness" && wellnessRailLauncher) {
                              openWorkflowDesk("wellness", wellnessRailLauncher.prompt, {
                                title: wellnessRailLauncher.title,
                                sourceId: "home-capability",
                              });
                            }
                          }}
                        />
                        {props.developerMode ? (
                          <>
                            <details className="group rounded-lg bg-dls-surface-muted/35 px-3.5 py-3">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-dls-text marker:hidden">
                                <span>Monday beta demos</span>
                                <span className="rounded-md bg-dls-surface px-2 py-0.5 text-[10px] font-medium text-dls-secondary">
                                  Public/redacted only
                                </span>
                              </summary>
                              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                                Guided runs for the first 10 test customers. Each inserts an editable prompt and points to an evidence command.
                              </p>
                              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-2">
                                {mondayBetaDemoCards.map((demo) => {
                                  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[demo.iconHint];
                                  return (
                                    <button
                                      key={demo.id}
                                      type="button"
                                      style={deskToneStyle(demo.iconHint)}
                                      className="relative isolate flex min-h-[144px] w-full flex-col items-start overflow-hidden rounded-lg border-0 bg-[rgba(var(--matterhorn-desk-rgb),0.075)] p-3 text-left transition-colors duration-150 hover:bg-[rgba(var(--matterhorn-desk-rgb),0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
                                      onClick={() => {
                                        if (demo.panel) {
                                          openVenueRailPane(demo.panel, { primePrompt: true, prompt: demo.prompt, source: "monday-beta-demo", title: demo.title });
                                          return;
                                        }
                                        if (demo.iconHint === "wellness") {
                                          openWorkflowDesk("wellness", demo.prompt, {
                                            title: demo.title,
                                            sourceId: `monday-beta-demo-${demo.id}`,
                                          });
                                          return;
                                        }
                                        props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, demo.prompt, {
                                          title: demo.title,
                                          agent: demo.agentId ?? agentIdForDesk(demo.iconHint),
                                          sendImmediately: true,
                                        });
                                      }}
                                    >
                                      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_44%)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                                      <span className="pointer-events-none absolute -right-4 -top-4 opacity-[0.07]" aria-hidden="true">
                                        {demo.panel ? <ProtocolLogo venue={demo.panel} size={92} /> : <Icon className="size-24 text-[var(--matterhorn-desk-color)]" />}
                                      </span>
                                      <span className="relative flex w-full items-start gap-3">
                                        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.16)] text-[var(--matterhorn-desk-color)]">
                                          {demo.panel ? <ProtocolLogo venue={demo.panel} size={25} /> : <Icon className="size-4" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="flex flex-wrap items-center gap-2">
                                            <span className="text-[13px] font-semibold text-dls-text">{demo.title}</span>
                                            <span className="rounded-full bg-[rgba(var(--matterhorn-desk-rgb),0.16)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--matterhorn-desk-color)]">
                                              {demo.statusLabel}
                                            </span>
                                          </span>
                                          <span className="mt-1 block text-[11px] leading-relaxed text-dls-secondary">{demo.persona}</span>
                                        </span>
                                      </span>
                                      <span className="relative mt-3 block text-[11px] leading-5 text-dls-secondary">
                                        <span className="font-medium text-dls-text">Customers:</span> {demo.customers}
                                      </span>
                                      <span className="relative mt-2 block text-[11px] leading-5 text-dls-secondary">
                                        <span className="font-medium text-dls-text">Expected:</span> {demo.artifactSummary}
                                      </span>
                                      <span className="sr-only">{demo.safetySummary}</span>
                                      <span className="relative mt-3 block max-w-full truncate rounded-md bg-dls-surface px-2.5 py-1.5 font-mono text-[10px] text-dls-secondary">
                                        {demo.evidenceCommand}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </details>
                            <details className="group rounded-lg bg-dls-surface-muted/35 px-3.5 py-3">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-dls-text marker:hidden">
                                <span>Business workflows</span>
                                <span className="rounded-md bg-dls-surface px-2 py-0.5 text-[10px] font-medium text-dls-secondary">
                                  Planned services only
                                </span>
                              </summary>
                              <p className="mt-1 max-w-2xl text-xs leading-5 text-dls-secondary">
                                Longevity is a standalone service workflow desk for trainers, yoga instructors, and dieticians. It is not Web3, not markets, and not medical care.
                              </p>
                              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                                {businessWorkflowLaunchers.map((task) => {
                                  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[task.iconHint];
                                  return (
                                    <button
                                      key={task.id}
                                      type="button"
                                      style={deskToneStyle(task.iconHint)}
                                      className="relative isolate flex min-h-[162px] w-full flex-col gap-3 overflow-hidden rounded-lg border-0 bg-[rgba(var(--matterhorn-desk-rgb),0.08)] p-3 text-left transition-colors duration-150 hover:bg-[rgba(var(--matterhorn-desk-rgb),0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
                                      onClick={() => {
                                        openWorkflowDesk("wellness", task.prompt, {
                                          title: task.title,
                                          sourceId: `business-workflow-${task.id}`,
                                        });
                                      }}
                                    >
                                      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_44%)] opacity-0 transition-opacity hover:opacity-100" aria-hidden="true" />
                                      <span className="flex items-start gap-3">
                                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--matterhorn-desk-color)] text-white shadow-sm">
                                          <Icon className="size-4" />
                                        </span>
                                        <span className="min-w-0">
                                          <span className="flex flex-wrap items-center gap-2">
                                            <span className="text-[14px] font-semibold text-dls-text">Longevity workflow desk</span>
                                            <span className="rounded-full bg-[rgba(var(--matterhorn-desk-rgb),0.16)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--matterhorn-desk-color)]">
                                              {task.statusLabel}
                                            </span>
                                          </span>
                                          <span className="mt-1.5 block text-[12px] leading-5 text-dls-secondary">{task.description}</span>
                                        </span>
                                      </span>
                                      <span className="grid gap-1.5 sm:grid-cols-2">
                                        {[
                                          "Service offer packet",
                                          "Onboarding questionnaire",
                                          "Weekly program plan",
                                          "Progress check-in",
                                          "Renewal/follow-up note",
                                          "Client handoff packet",
                                        ].map((artifact) => (
                                          <span
                                            key={artifact}
                                            className="rounded-md bg-dls-surface/52 px-2.5 py-1.5 text-[11px] font-medium text-dls-text"
                                          >
                                            {artifact}
                                          </span>
                                        ))}
                                      </span>
                                      <span className="rounded-lg bg-dls-surface/60 px-3 py-2 text-[11px] leading-5 text-dls-secondary">
                                        {task.safetySummary} No diagnosis, prescription, guaranteed outcomes, or live payment/email/hosting/token gating.
                                      </span>
                                      <span className="mt-auto text-[12px] font-semibold text-[var(--matterhorn-desk-color)]">
                                        Start longevity workflow -&gt;
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </details>
                          </>
                        ) : null}
                        <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-2">
                          {blankWorkflowLauncher ? (
                            <button
                              type="button"
                              className="flex min-h-[92px] w-full items-start gap-3 rounded-xl bg-dls-surface-muted/70 p-3.5 text-left transition-colors hover:bg-dls-hover"
                              onClick={() => {
                                props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, blankWorkflowLauncher.prompt, {
                                  title: blankWorkflowLauncher.title,
                                  sendImmediately: true,
                                });
                              }}
                            >
                              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--matterhorn-blue-rgb),0.12)] text-primary">
                                <FileText className="size-4" />
                              </span>
                              <span>
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="text-[13px] font-medium text-dls-text">{blankWorkflowLauncher.title}</span>
                                  <span className="rounded-md bg-dls-hover px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                                    {blankWorkflowLauncher.statusLabel}
                                  </span>
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-relaxed text-dls-secondary">{blankWorkflowLauncher.description}</span>
                                <span className="mt-2 block text-[10px] leading-relaxed text-dls-secondary/90">{blankWorkflowLauncher.safetySummary}</span>
                              </span>
                            </button>
                          ) : null}
                        </section>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {shellConfig.statusBar ? (
            <StatusBar
              clientConnected={props.clientConnected}
              matterhornServerStatus={props.matterhornServerStatus}
              developerMode={props.developerMode}
              settingsOpen={props.statusBar?.settingsOpen ?? false}
              onSendFeedback={props.onSendFeedback}
              onOpenSettings={props.onOpenSettings}
              providerConnectedIds={props.providerConnectedIds}
              mcpConnectedCount={props.mcpConnectedCount}
              walletStatus={{
                address: wallet.snapshot.address,
                chainId: wallet.snapshot.chainId,
                connector: wallet.snapshot.connector,
                isConnected: wallet.snapshot.isConnected,
                isConnecting: wallet.snapshot.isConnecting,
              }}
              onOpenWallet={() => setCurrentSidePanel("wallet")}
              loading={props.statusBar?.loading ?? false}
              showSettingsButton={props.statusBar?.showSettingsButton}
              showWalletButton={false}
              showAccountActions={false}
            />
          ) : null}
              </main>
            </ResizablePanel>
              {dockedSidePanelOpen ? (
              <>
                <ResizableHandle withHandle className="hidden lg:flex" />
                <ResizablePanel
                  panelRef={browserPanelRef}
                  defaultSize={`${visibleSidePanel === "extensions" || visibleSidePanel === "memory" || visibleSidePanel === "notes" ? Math.max(browserPanelDefaultWidth, 400) : protocolSidePanelOpen ? Math.max(browserPanelDefaultWidth, 400) : browserPanelDefaultWidth}px`}
                  minSize={visibleSidePanel === "extensions" || visibleSidePanel === "memory" || visibleSidePanel === "notes" ? "340px" : protocolSidePanelOpen ? "340px" : "320px"}
                  maxSize={protocolSidePanelOpen || visibleSidePanel === "memory" || visibleSidePanel === "notes" || visibleSidePanel === "extensions" ? "500px" : "70%"}
                  className="hidden h-full min-h-0 overflow-hidden lg:flex lg:flex-col"
                >
                  <Suspense fallback={<LazyPanelFallback />}>
                    {sidePanelContent}
                  </Suspense>
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
          <aside className="hidden w-[var(--nav-rail-width-compact)] shrink-0 flex-col items-center gap-1 border-l border-white/[0.06] bg-dls-sidebar/80 px-2 py-2 text-dls-text mac:titlebar-no-drag lg:flex 2xl:w-[var(--nav-rail-width)]">
            {sidePanelOpen ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={RAIL_BUTTON_CLASS}
                onClick={closeRightPane}
                title="Back to chat"
                aria-label="Back to chat"
              >
                <PanelRightClose size={17} />
                <span className={RAIL_LABEL_CLASS}>Chat</span>
              </Button>
            ) : null}
            <div className="flex w-full flex-col items-center gap-1 border-b border-white/[0.06] pb-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  RAIL_BUTTON_CLASS,
                  profileRailActive && RAIL_ACTIVE_CLASS,
                )}
                onClick={() => setCurrentSidePanel("profile")}
                title="Profile, settings, and task logs"
                aria-label="Profile, settings, and task logs"
                aria-pressed={profileRailActive}
              >
                <CircleUserRound size={17} />
                <span className={RAIL_LABEL_CLASS}>Profile</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  RAIL_BUTTON_CLASS,
                  walletRailActive && RAIL_ACTIVE_CLASS,
                )}
                onClick={() => setCurrentSidePanel("wallet")}
                title="Wallet details"
                aria-label="Wallet details"
                aria-pressed={walletRailActive}
              >
                <WalletIcon size={17} />
                <span className={RAIL_LABEL_CLASS}>Wallet</span>
              </Button>
            </div>
            {isElectronRuntime() ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  RAIL_BUTTON_CLASS,
                  browserRailActive && RAIL_ACTIVE_CLASS,
                )}
                onClick={openBrowserRailPane}
                title="Browser"
                aria-label="Browser"
                aria-pressed={browserRailActive}
              >
                <Globe size={17} />
                <span className={RAIL_OPTIONAL_LABEL_CLASS}>Browser</span>
              </Button>
            ) : null}
            {voiceExtensionEnabled ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  RAIL_BUTTON_CLASS,
                  voiceRailActive && RAIL_ACTIVE_CLASS,
                )}
                onClick={openVoiceRailPane}
                title="Voice Mode"
                aria-label="Voice Mode"
                aria-pressed={voiceRailActive}
              >
                <Mic2 size={17} />
                <span className={RAIL_OPTIONAL_LABEL_CLASS}>Voice</span>
              </Button>
            ) : null}
            {showArtifactRailItem ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  RAIL_BUTTON_CLASS,
                  artifactRailActive && RAIL_ACTIVE_CLASS,
                )}
                onClick={openArtifactRailPane}
                title={hasArtifactTargets ? `Outputs (${artifactTargetCount})` : "Outputs"}
                aria-label={hasArtifactTargets ? `Outputs (${artifactTargetCount})` : "Outputs"}
                aria-pressed={artifactRailActive}
                disabled={!hasArtifactTargets}
              >
                <FileText size={17} />
                <span className={RAIL_LABEL_CLASS}>Outputs</span>
                {artifactTargetCount > 0 ? (
                  <span className="absolute right-0 top-0 flex min-w-3.5 translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-3 text-primary-foreground">
                    {artifactTargetCount > 9 ? "9+" : artifactTargetCount}
                  </span>
                ) : null}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                RAIL_BUTTON_CLASS,
                extensionsRailActive && RAIL_ACTIVE_CLASS,
              )}
              onClick={props.settingsSlot ? openExtensionsRailPane : props.onOpenSettings}
              title="MCPs & Connectors"
              aria-label="MCPs & Connectors"
              aria-pressed={extensionsRailActive}
            >
              <Settings2 size={17} />
              <span className={RAIL_LABEL_CLASS}>MCPs</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                `relative ${RAIL_BUTTON_CLASS}`,
                memoryRailActive && RAIL_ACTIVE_CLASS,
              )}
              onClick={openMemoryRailPane}
              title={`${memoryInboxLabel}. Review remembered context, use selected memories in chat, forget records, and export evidence.`}
              aria-label={`${memoryInboxLabel}. Review remembered context, use selected memories in chat, forget records, and export evidence.`}
              aria-pressed={memoryRailActive}
            >
              <BrainCircuit size={17} />
              <span className={RAIL_LABEL_CLASS}>Memory</span>
              {memorySuggestionUnreadCount > 0 ? (
                <span className="absolute right-1 top-1 flex min-w-3 items-center justify-center rounded-md bg-dls-hover px-1 text-[9px] font-semibold leading-3 text-dls-secondary ring-1 ring-dls-border/40">
                  {memorySuggestionUnreadCount > 99 ? "99+" : memorySuggestionUnreadCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                `relative ${RAIL_BUTTON_CLASS}`,
                notesRailActive && RAIL_ACTIVE_CLASS,
              )}
              onClick={openNotesRailPane}
              title={t("notes.rail_title")}
              aria-label={t("notes.rail_title")}
              aria-pressed={notesRailActive}
            >
              <PencilLine size={17} />
              <span className={RAIL_LABEL_CLASS}>{t("notes.rail_label")}</span>
            </Button>
            <div className={RAIL_SECTION_LABEL_CLASS}>
              Desks
            </div>
            {VENUE_SIDE_PANELS.map((panel) => {
              const visual = getCustomerProtocolDeskVisual(panel);
              const item = {
                panel,
                label: visual?.displayName ?? panel,
                title: visual?.railTitle ?? `${panel}: protocol desk`,
                active:
                  activeSidePanel === panel,
              };
              return (
                <Button
                  key={item.panel}
                  variant="ghost"
                  size="icon-sm"
                  style={deskToneStyle(item.panel)}
                  className={cn(
                    RAIL_DESK_BUTTON_CLASS,
                    item.active && "bg-[rgba(var(--matterhorn-desk-rgb),0.12)] text-[var(--matterhorn-desk-color)] hover:bg-[rgba(var(--matterhorn-desk-rgb),0.16)] hover:text-[var(--matterhorn-desk-color)]",
                  )}
                  onClick={() => openVenueRailPane(item.panel)}
                  title={item.title}
                  aria-label={item.title}
                  aria-pressed={item.active}
                >
                  <ProtocolLogo venue={item.panel} size={22} />
                  <span className={RAIL_LABEL_CLASS}>{item.label}</span>
                </Button>
              );
            })}
            {([
              {
                id: "wellness_creator_workflow",
                label: getCustomerProtocolDeskVisual("wellness")?.displayName ?? "Longevity",
                title: getCustomerProtocolDeskVisual("wellness")?.railTitle ?? "Longevity workflow desk",
                icon: Dumbbell,
                launcher: wellnessRailLauncher,
              },
            ]).map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  size="icon-sm"
                  style={deskToneStyle("wellness")}
                  className={RAIL_DESK_BUTTON_CLASS}
                  onClick={() => {
                    if (item.launcher) {
                      dispatchMatterhornMemorySuggestions({
                        desk: "wellness",
                        prompt: item.launcher.prompt,
                        source: "workflow_output",
                        sourceId: "wellness-rail-launcher",
                        workspaceId: props.selectedWorkspaceId,
                        sessionId: props.selectedSessionId,
                        templateId: item.id,
                      });
                    }
                    if (item.launcher) {
                      openWorkflowDesk("wellness", item.launcher.prompt, {
                        title: item.launcher.title,
                        sourceId: "wellness-rail-launcher",
                      });
                      return;
                    }
                    props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId);
                  }}
                  title={item.title}
                  aria-label={item.title}
                >
                  <Icon size={17} />
                  <span className={RAIL_LABEL_CLASS}>{item.label}</span>
                </Button>
              );
            })}
          </aside>
          </div>
          {mobileSidePanelOpen ? (
            <div className="fixed inset-0 z-40 flex bg-background lg:hidden">
              <div className="flex h-full min-h-0 w-full flex-col bg-background">
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-dls-border/35 px-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-dls-text">
                    {sidePanelTitle}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8 rounded-md text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
                    onClick={closeRightPane}
                    title="Back to workspace"
                    aria-label="Back to workspace"
                  >
                    <PanelRightClose className="size-4" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Suspense fallback={<LazyPanelFallback />}>
                    {sidePanelContent}
                  </Suspense>
                </div>
              </div>
            </div>
          ) : null}
        </SidebarInset>
        {shellConfig.sidebar ? <SidebarTrigger className="hidden mac:absolute mac:left-[64px] top-[3px] z-50 mac:flex titlebar-no-drag" /> : null}
      </SidebarProvider>

      {props.providerAuthModal ? (
        <LazyModalBoundary>
          <ProviderAuthModal {...props.providerAuthModal} />
        </LazyModalBoundary>
      ) : null}

      {props.onRenameSession ? (
        <RenameSessionModal
          open={renameOpen}
          title={renameTitle}
          busy={renameBusy}
          canSave={renameTitle.trim().length > 0 && renameTitle.trim() !== sessionActionTitle.trim()}
          onClose={() => {
            if (!renameBusy) setRenameOpen(false);
          }}
          onSave={() => void submitRename()}
          onTitleChange={setRenameTitle}
        />
      ) : null}

      {props.onDeleteSession ? (
        <ConfirmModal
          open={deleteOpen}
          title={t("session.delete_session_title")}
          message={
            sessionActionTitle.trim()
              ? t("session.delete_named_session_message", { title: sessionActionTitle.trim() })
              : t("session.delete_session_generic")
          }
          confirmLabel={deleteBusy ? t("session.deleting") : t("session.delete")}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (!deleteBusy) setDeleteOpen(false);
          }}
        />
      ) : null}

      {props.shareWorkspaceModal ? (
        <LazyModalBoundary>
          <ShareWorkspaceModal {...props.shareWorkspaceModal} />
        </LazyModalBoundary>
      ) : null}

      {/* Feature 3: TX Pipeline — modal overlay for transaction approval */}
      <TransactionApproval
        store={wallet.store}
        onApprove={() => { void sessionWallet.approveTx(); }}
        onReject={sessionWallet.rejectTx}
        onExecuteBatchStep={sessionWallet.executeBatchStep}
      />

      {commandOpen ? (
        <LazyModalBoundary>
          <CommandPalette
            open={commandOpen}
            onClose={() => setCommandOpen(false)}
            commands={[
              { id: "send", label: "Send tokens", shortcut: "→ Send", action: () => {/* open send panel */} },
              { id: "swap", label: "Swap tokens (CoW)", shortcut: "→ Swap", action: () => {/* open swap panel */} },
              { id: "aave", label: "Aave deposits", shortcut: "→ Aave", action: () => {/* open aave panel */} },
              { id: "bridge", label: "Bridge assets", shortcut: "→ Bridge", action: () => {/* open bridge panel */} },
              { id: "agent", label: "Agent workspace", shortcut: "→ Agent", action: () => {/* open agent panel */} },
            ]}
          />
        </LazyModalBoundary>
      ) : null}

      {/* Cloud provider notifications are now handled globally by CloudProvidersToast in app-root.tsx */}
    </div>
  );
}
