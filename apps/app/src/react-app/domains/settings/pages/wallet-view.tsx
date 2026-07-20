/** @jsxImportSource react */
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  useCurrentAccount,
  useCurrentNetwork,
  useCurrentWallet,
  useWalletConnection,
  useWallets,
  type UiWallet,
} from "@mysten/dapp-kit-react";
import { useAccount, useBalance, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  Wallet,
  Plug,
  Unplug,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  ShieldCheck,
  MonitorSmartphone,
  Globe,
  Waves,
} from "lucide-react";
import type { MatterhornProjectDataLedgerEntry } from "@matterhorn-work/types/project-data-ledger";
import type { MatterhornWalletSafetyPolicy } from "@matterhorn-work/types/wallet-safety-policy";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WalletStore } from "../../wallet/state/wallet-store";
import { useWalletStore } from "../../wallet/state/wallet-store";
import {
  getSecurityLog,
  subscribeSecurityLog,
  type SecurityLogEntry,
  type WalletSafetyReviewTrail,
} from "../../wallet/state/security-log";
import { useStatusToasts } from "../../shell-feedback/status-toasts";
import { CHAIN_NAMES, CHAIN_LIST } from "../../../infra/chains";
import { SUI_NETWORKS, suiDAppKit, type SuiMatterhornNetwork } from "../../../infra/sui-dapp-kit";
import { SettingsSection, SettingsSectionHeader, SettingsSectionHeaderTitle, SettingsSectionHeaderDescription, SettingsStack } from "../settings-section";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { SuiWorkflowPanel } from "../../wallet/sui-workflow-panel";
import { usePhantomSui } from "../../wallet/phantom-sui-provider";
import {
  backendCapabilityLabel,
  walletRuntimeSupportSummary,
  walletFamilySummary,
} from "../backend-capability-status";
import {
  getWalletRuntimeCapability,
  type WalletRuntimeCapability,
  type WalletRuntime,
  type WalletProtocol,
  type WalletProtocolCapability,
} from "@matterhorn-work/types";
import { isDesktopRuntime, isElectronRuntime } from "../../../../app/utils";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatSuiBalance(totalBalance: string | number | bigint | null | undefined): string {
  if (totalBalance === null || totalBalance === undefined) return "—";
  try {
    const mist = BigInt(totalBalance);
    const whole = mist / 1_000_000_000n;
    const fraction = mist % 1_000_000_000n;
    const fractionText = fraction.toString().padStart(9, "0").slice(0, 4).replace(/0+$/g, "");
    return `${whole.toString()}${fractionText ? `.${fractionText}` : ""} SUI`;
  } catch {
    return "—";
  }
}

function isSuiMatterhornNetwork(value: unknown): value is SuiMatterhornNetwork {
  return typeof value === "string" && SUI_NETWORKS.includes(value as SuiMatterhornNetwork);
}

function txStatusIcon(status: string) {
  switch (status) {
    case "confirmed": return <CheckCircle2 className="size-3 text-green-500" />;
    case "pending": return <Clock className="size-3 text-yellow-500" />;
    case "failed": return <AlertCircle className="size-3 text-red-500" />;
    default: return <Clock className="size-3 text-gray-500" />;
  }
}

export type WalletSettingsViewProps = {
  store: WalletStore;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
  sessionId?: string | null;
  onTxApprove?: (tx: { to: string; value: string; data?: string; chainId: number }) => void;
  onTxReject?: () => void;
  compact?: boolean;
};

type BackendWalletFamilyRow = ReturnType<typeof walletFamilySummary>[number];

function WalletBoundaryList({ safetyCopy, compact = false }: {
  safetyCopy: WalletRuntimeCapability["safetyCopy"];
  compact?: boolean;
}) {
  const items = [
    { label: "Public reads", body: safetyCopy.publicAddressLine },
    { label: "External signer", body: safetyCopy.externalSignerLine },
    { label: "Never paste", body: safetyCopy.forbiddenSecretsLine },
  ];

  return (
    <div className="grid gap-1 text-xs leading-5 text-dls-secondary">
      {items.map((item) => (
        <p key={item.label} className={cn(
          compact ? "py-1" : "rounded-md bg-dls-surface-muted/[0.08] px-3 py-2",
        )}>
          <span className="font-medium text-dls-text">{item.label}:</span> {item.body}
        </p>
      ))}
    </div>
  );
}

function protocolLabelAndDetail(
  protocol: WalletProtocol,
  cap: WalletProtocolCapability,
): { label: string; detail: string; tone: string } {
  switch (protocol) {
    case "bittensor":
      return {
        label: "Bittensor",
        detail: cap.canPreview
          ? "Read public SS58 data and prepare unsigned actions. Review, sign, and submit them with your own Bittensor signer."
          : "Read public SS58 and coldkey data.",
        tone: cap.canRead ? "text-cyan-300 bg-cyan-500/10" : "text-dls-secondary bg-dls-surface/75",
      };
    case "hyperliquid":
      return {
        label: "Hyperliquid",
        detail: cap.canSubmit
          ? "Read markets, prepare the exact order, and review it in the trade ticket. Matterhorn submits only after your connected wallet signs the short-lived intent; agents and watches cannot submit."
          : cap.canPreview
          ? "Read markets, orderbooks, and funding, then prepare an order draft. Review and submit it in your Hyperliquid client."
          : "Read markets, orderbooks, and funding.",
        tone: cap.canRead ? "text-blue-300 bg-blue-500/10" : "text-dls-secondary bg-dls-surface/75",
      };
    case "polymarket":
      return {
        label: "Polymarket",
        detail: cap.canPreview
          ? "Read markets, compliance, and liquidity, then prepare an order draft. Review and submit it in your Polymarket client."
          : "Read markets, compliance, and liquidity.",
        tone: cap.canRead ? "text-violet-300 bg-violet-500/10" : "text-dls-secondary bg-dls-surface/75",
      };
    case "sui":
      return {
        label: "Sui",
        detail: cap.canSubmit
          ? "Connect a supported Sui wallet, review the transaction, and approve it in that wallet."
          : "Read public account data and prepare an action to finish in your own Sui wallet.",
        tone: cap.canRead ? "text-cyan-300 bg-cyan-500/10" : "text-dls-secondary bg-dls-surface/75",
      };
  }
}

function evmConnectorStatusLabel(state: string, connected: boolean): { label: string; tone: string } {
  if (connected) return { label: "Connected", tone: "text-emerald-300 bg-emerald-500/10" };
  switch (state) {
    case "available": return { label: "Connect wallet", tone: "text-sky-300 bg-sky-500/10" };
    case "needs_extension": return { label: "Extension needed", tone: "text-amber-300 bg-amber-500/10" };
    case "unsupported_runtime": return { label: "Not supported here", tone: "text-gray-400 bg-gray-500/10" };
    default: return { label: "Unavailable", tone: "text-gray-500 bg-gray-500/10" };
  }
}

function WalletProtocolSupportMap(props: {
  capability: WalletRuntimeCapability;
  connected: boolean;
  backendWallets?: BackendWalletFamilyRow[];
  compact?: boolean;
}) {
  const evm = evmConnectorStatusLabel(props.capability.evmConnectorState, props.connected);
  const backendSui = props.backendWallets?.find((wallet) => wallet.family === "Sui");
  const backendSuiRuntime =
    props.capability.runtime === "unknown" ? undefined : backendSui?.runtimeSupport?.[props.capability.runtime];
  const backendSuiRuntimeCopy = walletRuntimeSupportSummary(backendSuiRuntime);
  const evmDetail = props.capability.supportsInjectedEvm
    ? "Browser extension wallets such as MetaMask or Rabby can appear when installed and allowed."
    : "Desktop does not connect browser extensions. Use a public address here, then review and submit actions in your own wallet.";
  const rows: { label: string; status: string; detail: string; tone: string }[] = [
    {
      label: "EVM wallet",
      status: evm.label,
      detail: evmDetail,
      tone: evm.tone,
    },
    ...(backendSui ? [{
      label: "Sui wallet",
      status: backendSuiRuntimeCopy.status ? backendSuiRuntimeCopy.label : backendCapabilityLabel(backendSui.status),
      detail: backendSuiRuntimeCopy.status
        ? backendSuiRuntimeCopy.detail
        : backendSui.status === "preview"
          ? "Connect a supported Sui wallet here. You still review and sign every transaction in that wallet. Wallet compatibility is still expanding."
          : backendSui.label,
      tone: (backendSuiRuntimeCopy.status ?? backendSui.status) === "unsupported"
        ? "text-gray-400 bg-gray-500/10"
        : (backendSuiRuntimeCopy.status ?? backendSui.status) === "preview"
          ? "text-amber-300 bg-amber-500/10"
          : (backendSuiRuntimeCopy.status ?? backendSui.status) === "working"
            ? "text-emerald-300 bg-emerald-500/10"
            : "text-sky-300 bg-sky-500/10",
    }] : []),
    ...(Object.entries(props.capability.protocols) as [WalletProtocol, WalletProtocolCapability][])
      .filter(([protocol]) => protocol !== "sui")
      .map(
      ([protocol, cap]) => {
        const { label, detail, tone } = protocolLabelAndDetail(protocol, cap);
        const submitStatus =
          cap.canSubmit
            ? "Review & submit"
            : cap.canPreview
              ? "Prepare only"
              : cap.canRead
                ? "Read only"
                : "Unavailable";
        return { label, status: submitStatus, detail, tone };
      },
    ),
  ];

  if (props.compact) {
    return (
      <details className="group matterhorn-rail-section">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm transition-colors hover:text-dls-text">
          <span>
            <span className="block font-medium text-dls-text">Supported wallets and desks</span>
            <span className="mt-0.5 block text-xs text-dls-secondary">What works here and what you finish elsewhere</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-dls-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-3 border-t border-dls-border/40 pt-3">
          <p className="text-xs leading-5 text-dls-secondary">
            <span className="font-medium text-dls-text">Review &amp; submit</span> still requires your approval in a connected wallet; agents and watches never submit automatically. <span className="font-medium text-dls-text">Prepare only</span> creates a draft for you to finish elsewhere. <span className="font-medium text-dls-text">Limited release</span> means wallet compatibility is still expanding.
          </p>
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 text-xs leading-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-dls-text">{row.label}</span>
                <span className={cn("shrink-0 font-medium", row.tone.split(" ")[0])}>{row.status}</span>
              </div>
              <p className="text-dls-secondary">{row.detail}</p>
            </div>
          ))}
        </div>
      </details>
    );
  }

  return (
    <section className={cn(
      "flex flex-col gap-3",
      "rounded-lg bg-dls-surface-muted/30 px-3 py-3",
    )}>
      <div>
        <h4 className="text-sm font-semibold text-dls-text">Protocol support</h4>
        <p className="mt-1 text-xs leading-5 text-dls-secondary">
          Matterhorn either completes the action here or prepares it for you to finish elsewhere.
        </p>
      </div>
      <p className="text-xs leading-5 text-dls-secondary">
        <span className="font-medium text-dls-text">Review &amp; submit</span> still requires your approval in a connected wallet; agents and watches never submit automatically. <span className="font-medium text-dls-text">Prepare only</span> creates a draft for you to finish elsewhere. <span className="font-medium text-dls-text">Limited release</span> means wallet compatibility is still expanding.
      </p>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 rounded-md py-1.5 text-xs leading-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-dls-text">{row.label}</span>
              <span className={`shrink-0 rounded-md px-2 py-0.5 font-medium ${row.tone}`}>{row.status}</span>
            </div>
            <p className="text-dls-secondary">{row.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SuiWalletPreviewSection(props: {
  compact?: boolean;
  matterhornServerClient?: MatterhornServerClient | null;
  runtime?: WalletRuntime;
  workspaceId?: string | null;
  sessionId?: string | null;
}) {
  const connection = useWalletConnection();
  const wallets = useWallets();
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const phantomSui = usePhantomSui();
  const reportedNetwork = useCurrentNetwork();
  const network = isSuiMatterhornNetwork(reportedNetwork) ? reportedNetwork : "testnet";
  const client = suiDAppKit.getClient(network);
  const [error, setError] = useState<string | null>(null);
  const runtime = props.runtime ?? "web";
  const directSuiWalletAvailable = runtime === "web";
  const suiAddress = account?.address ?? phantomSui.address;
  const suiWalletName = account?.address ? wallet?.name ?? "Sui" : phantomSui.address ? "Phantom" : "Sui";
  const walletStandardPhantom = wallets.find((availableWallet) =>
    availableWallet.name.toLowerCase().includes("phantom"),
  );
  const otherSuiWallets = wallets.filter((availableWallet) =>
    !availableWallet.name.toLowerCase().includes("phantom"),
  );

  const balanceQuery = useQuery({
    queryKey: ["sui-wallet-balance", network, suiAddress, props.matterhornServerClient ? "matterhorn" : "wallet"],
    enabled: Boolean(directSuiWalletAvailable && suiAddress),
    queryFn: async () => {
      if (!suiAddress) throw new Error("No Sui account connected.");
      if (props.matterhornServerClient) {
        try {
          const response = await props.matterhornServerClient.suiAccount(suiAddress, { network });
          return {
            balanceMist: response.account.balance.balanceMist,
            sourceLabel: "Matterhorn engine",
          };
        } catch {
          // If the local engine is restarting, keep the wallet preview useful by
          // falling back to the client-side Sui read.
        }
      }
      const response = await client.getBalance({ owner: suiAddress });
      return {
        balanceMist: response.balance.balance,
        sourceLabel: "Wallet client",
      };
    },
    staleTime: 30_000,
  });

  const connectSuiWallet = useCallback(async (nextWallet: UiWallet) => {
    setError(null);
    try {
      await suiDAppKit.connectWallet({ wallet: nextWallet });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Sui wallet.");
    }
  }, []);

  const disconnectSuiWallet = useCallback(async () => {
    setError(null);
    try {
      if (account?.address) {
        await suiDAppKit.disconnectWallet();
      } else {
        await phantomSui.disconnect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect Sui wallet.");
    }
  }, [account?.address, phantomSui]);

  const busy = connection.isConnecting || connection.isReconnecting || phantomSui.connecting;
  if (!directSuiWalletAvailable) {
    return (
      <section className={cn(
        "flex flex-col gap-3",
        props.compact ? "matterhorn-rail-section" : "rounded-md bg-dls-surface-muted/[0.045] px-4 py-4",
      )}>
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <Waves className="mt-0.5 size-4 shrink-0 text-dls-secondary" />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-dls-text">Prepare Sui actions</h4>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Matterhorn prepares the action and receipt evidence. Review, sign, and submit it in your Sui wallet or protocol client.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-1 text-xs leading-5 text-dls-secondary">
          <p><span className="font-medium text-dls-text">Available here:</span> public reads, transfer drafts, copyable transaction details, and receipt import.</p>
          <p><span className="font-medium text-dls-text">Not here:</span> wallet-extension connect, seed phrases, private keys, raw signatures, or live submit by Matterhorn.</p>
        </div>
        <SuiWorkflowPanel
          embedded
          matterhornServerClient={props.matterhornServerClient}
          workspaceId={props.workspaceId}
          sessionId={props.sessionId}
          runtime={runtime}
        />
      </section>
    );
  }

  return (
    <section className={cn(
      "flex flex-col gap-3",
      props.compact ? "matterhorn-rail-section" : "rounded-md bg-dls-surface-muted/[0.045] px-4 py-4",
    )}>
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Waves className="mt-0.5 size-4 shrink-0 text-dls-secondary" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-dls-text">Sui wallet</h4>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">
              Connect your Sui wallet to view its balance and prepare transfers.
            </p>
          </div>
        </div>
      </div>

      {suiAddress ? (
        <div className="grid gap-3">
          <div className="grid gap-3 rounded-md bg-dls-surface-muted/[0.055] px-3 py-3 sm:grid-cols-3">
            <WalletRailMetric label="Wallet" value={suiWalletName} />
            <WalletRailMetric label="Network" value={String(network)} />
            <WalletRailMetric label="Balance" value={balanceQuery.isError ? "Unavailable" : formatSuiBalance(balanceQuery.data?.balanceMist)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full truncate rounded-md bg-background/60 px-2 py-1 font-mono text-xs text-dls-secondary">
              {truncateAddress(suiAddress)}
            </code>
            <span className="text-xs text-dls-secondary">
              {balanceQuery.data?.sourceLabel ?? "Read-only"}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text"
              onClick={() => void balanceQuery.refetch()}
              aria-label="Refresh Sui balance"
              title="Refresh Sui balance"
            >
              <RefreshCw className={cn("size-3", balanceQuery.isFetching && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={disconnectSuiWallet}>
              <Unplug className="size-3" />
              Disconnect
            </Button>
          </div>
          {balanceQuery.isError ? (
            <p className="text-xs leading-5 text-amber-300">
              Sui balance could not be read. The wallet connection remains local and non-custodial.
            </p>
          ) : null}
          <SuiWorkflowPanel
            embedded
            matterhornServerClient={props.matterhornServerClient}
            workspaceId={props.workspaceId}
            sessionId={props.sessionId}
            runtime={runtime}
          />
        </div>
      ) : (
        <div className="grid gap-2">
          {walletStandardPhantom || phantomSui.detected ? (
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 rounded-md border-0 bg-dls-surface-muted/[0.20] px-3 py-3 shadow-none hover:bg-dls-surface-muted/[0.30]"
              disabled={busy}
              onClick={() => {
                if (walletStandardPhantom) {
                  void connectSuiWallet(walletStandardPhantom);
                  return;
                }
                void phantomSui.connect();
              }}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#ab9ff2]/15 text-[#c9c2ff]">
                <Wallet className="size-4" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-medium">Phantom</span>
                <span className="block truncate text-xs text-dls-secondary">Connect Phantom for Sui</span>
              </span>
              {phantomSui.connecting ? <RefreshCw className="ml-auto size-3.5 animate-spin" /> : null}
            </Button>
          ) : (
            <a
              href="https://phantom.app/download"
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-3 rounded-md bg-dls-surface-muted/[0.20] px-3 py-3 text-dls-text transition-colors hover:bg-dls-surface-muted/[0.30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ab9ff2]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#ab9ff2]/15 text-[#c9c2ff]">
                <Wallet className="size-4" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-medium">Phantom</span>
                <span className="block text-xs text-dls-secondary">Install or enable Phantom for Sui</span>
              </span>
              <ExternalLink className="ml-auto size-3.5 shrink-0 text-dls-secondary" />
            </a>
          )}
          {otherSuiWallets.map((availableWallet) => (
            <Button
              key={`${availableWallet.name}-${availableWallet.version}`}
              variant="outline"
              className="h-auto justify-start gap-3 rounded-md border-0 bg-dls-surface-muted/[0.08] px-3 py-3 shadow-none hover:bg-dls-surface-muted/[0.14]"
              disabled={busy}
              onClick={() => connectSuiWallet(availableWallet)}
            >
              {availableWallet.icon ? (
                <img src={availableWallet.icon} alt="" className="size-5 shrink-0 rounded-md" />
              ) : (
                <Waves className="size-4 shrink-0" />
              )}
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-medium">{availableWallet.name}</span>
                <span className="block truncate text-xs text-dls-secondary">
                  {availableWallet.chains.length} supported {availableWallet.chains.length === 1 ? "chain" : "chains"}
                </span>
              </span>
              {busy ? <RefreshCw className="ml-auto size-3.5 animate-spin" /> : null}
            </Button>
          ))}
        </div>
      )}

      {error || phantomSui.error ? (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error ?? phantomSui.error}</span>
        </div>
      ) : null}
    </section>
  );
}

const RUNTIME_LABELS: Record<WalletRuntime, { label: string; icon: typeof Globe; detail: string }> = {
  web: {
    label: "Web browser",
    icon: Globe,
    detail: "Injected wallets appear when their extension is installed and allowed on Matterhorn.",
  },
  desktop: {
    label: "Desktop app",
    icon: MonitorSmartphone,
    detail: "Browser wallet extensions do not inject into desktop. Use external signing for on-chain actions.",
  },
  electron: {
    label: "Desktop app",
    icon: MonitorSmartphone,
    detail: "Electron builds do not support injected wallets. Use external signing for on-chain actions.",
  },
  unknown: {
    label: "Unknown runtime",
    icon: MonitorSmartphone,
    detail: "Wallet capabilities are unknown here. Use web or desktop for full support.",
  },
};

function WalletRuntimeExplainer(props: { capability: WalletRuntimeCapability; compact?: boolean }) {
  const { label, icon: RuntimeIcon, detail } = RUNTIME_LABELS[props.capability.runtime];
  const strategyNote = (() => {
    if (props.capability.supportsInjectedEvm) {
      return "Browser wallet extensions are available when installed and allowed.";
    }
    switch (props.capability.desktopWalletStrategy) {
      case "external_signer": return "Matterhorn can prepare actions here. Review, sign, and submit them in your own wallet or protocol client.";
      case "walletconnect_planned": return "WalletConnect support is planned for this runtime.";
      case "deep_link_planned": return "Deep-link support is planned for this runtime.";
      default: return "Direct wallet connection is not available in this runtime.";
    }
  })();

  if (props.compact) {
    return (
      <details className="group matterhorn-rail-section">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm transition-colors hover:text-dls-text">
          <span>
            <span className="block font-medium text-dls-text">How signing works</span>
            <span className="mt-0.5 block text-xs text-dls-secondary">{label} · keys stay in your wallet</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-dls-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-2 border-t border-dls-border/40 pt-3 text-xs leading-5 text-dls-secondary">
          <p>{detail}</p>
          <p>{strategyNote}</p>
          <WalletBoundaryList compact safetyCopy={props.capability.safetyCopy} />
        </div>
      </details>
    );
  }

  return (
    <section className={cn(
      "rounded-lg bg-dls-surface-muted/25 px-4 py-4",
    )}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-dls-secondary" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-dls-text">Wallet runtime</h4>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Matterhorn shows where each action is reviewed, signed, and submitted.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="flex items-start gap-2 rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2 text-xs leading-5">
          <RuntimeIcon className="mt-0.5 size-3.5 shrink-0 text-dls-secondary" />
          <div>
            <span className="font-medium text-dls-text">{label}</span>
            <span className="text-dls-secondary"> — {detail}</span>
          </div>
        </div>
        <div className="rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2 text-xs leading-5 text-dls-secondary">{strategyNote}</div>
        {!props.capability.supportsInjectedEvm ? (
          <div className="rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2 text-xs leading-5 text-dls-secondary">
            <span className="font-medium text-dls-text">Remote worker:</span> use public addresses in Matterhorn and complete signing in your own wallet or protocol client.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function noEvmConnectorCopy(capability: WalletRuntimeCapability): { title: string; body: string } {
  if (capability.supportsInjectedEvm) {
    return {
      title: "No EVM wallet connector detected",
      body: "Install or enable MetaMask, Rabby, or another injected wallet. Public reads and market previews still work.",
    };
  }
  return {
    title: "Finish wallet actions outside Matterhorn",
    body: "Browser extensions do not connect inside the desktop app. Use public addresses here, then review, sign, and submit in your own wallet or protocol client.",
  };
}

function WalletRailMetric(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-dls-secondary">{props.label}</div>
      <div className="mt-1 truncate font-mono text-sm text-dls-text">{props.value}</div>
    </div>
  );
}

function walletSafetyTitle(action: SecurityLogEntry["action"]): string {
  const labels: Record<SecurityLogEntry["action"], string> = {
    tx_proposed: "Transaction proposed",
    tx_approved: "Transaction approved",
    tx_rejected: "Transaction rejected",
    chain_mismatch: "Chain mismatch blocked",
    mainnet_blocked: "Mainnet blocked",
    wallet_unavailable: "Wallet unavailable",
    limit_hit: "Spend limit blocked",
    whitelist_denied: "Allowlist blocked",
    rate_limit_hit: "Rate limit blocked",
    simulation_failed: "Simulation failed",
    countdown_expired: "Approval expired",
  };
  return labels[action] ?? "Wallet safety event";
}

function walletSafetyTone(riskLevel?: string | null): string {
  switch (riskLevel) {
    case "high":
      return "text-red-300 bg-red-500/10";
    case "medium":
      return "text-amber-300 bg-amber-500/10";
    default:
      return "text-dls-secondary bg-dls-surface-muted/35";
  }
}

function formatWalletSafetyTime(timestamp: string | number | null | undefined): string {
  const time = typeof timestamp === "number" ? timestamp : timestamp ? Date.parse(timestamp) : Number.NaN;
  if (!Number.isFinite(time)) return "Recent";
  const diffMs = Date.now() - time;
  if (diffMs < 60_000) return "Just now";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(time).toLocaleDateString();
}

function formatWalletSafetyValue(value: unknown): string | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount);
}

function shortWalletAuditText(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

type WalletSafetyPolicyForm = {
  maxPerTransactionUSD: string;
  maxDailySpendUSD: string;
  maxSlippageBps: string;
  preferredNetwork: "84532" | "8453";
  mainnetEnabled: boolean;
};

function walletSafetyPolicyFormFromState(state: WalletStoreSnapshotLike): WalletSafetyPolicyForm {
  return {
    maxPerTransactionUSD: String(state.maxPerTransactionUSD),
    maxDailySpendUSD: String(state.maxDailySpendUSD),
    maxSlippageBps: String(state.maxSlippageBps),
    preferredNetwork: state.preferredNetwork === 8453 ? "8453" : "84532",
    mainnetEnabled: state.mainnetEnabled,
  };
}

type WalletStoreSnapshotLike = {
  maxPerTransactionUSD: number;
  maxDailySpendUSD: number;
  dailySpendUSD: number;
  maxSlippageBps: number;
  preferredNetwork: number | null;
  mainnetEnabled: boolean;
};

function walletSafetyPolicyFormFromServer(policy: MatterhornWalletSafetyPolicy): WalletSafetyPolicyForm {
  return {
    maxPerTransactionUSD: String(policy.maxPerTransactionUSD),
    maxDailySpendUSD: String(policy.maxDailySpendUSD),
    maxSlippageBps: String(policy.maxSlippageBps),
    preferredNetwork: policy.preferredNetwork === 8453 ? "8453" : "84532",
    mainnetEnabled: policy.mainnetEnabled,
  };
}

function positiveFormNumber(value: string, fallback: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.min(next, max);
}

function applyWalletSafetyPolicyToStore(store: WalletStore, policy: MatterhornWalletSafetyPolicy): void {
  store.setMaxPerTransactionUSD(policy.maxPerTransactionUSD);
  store.setMaxDailySpendUSD(policy.maxDailySpendUSD);
  store.setMaxSlippageBps(policy.maxSlippageBps);
  store.setPreferredNetwork(policy.preferredNetwork === 8453 ? 8453 : 84532);
  store.setMainnetEnabled(policy.mainnetEnabled);
}

function WalletSafetyPolicyControls(props: {
  compact?: boolean;
  store: WalletStore;
  state: WalletStoreSnapshotLike;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
}) {
  const { showToast } = useStatusToasts();
  const [form, setForm] = useState<WalletSafetyPolicyForm>(() => walletSafetyPolicyFormFromState(props.state));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const policyQuery = useQuery({
    queryKey: ["wallet-safety-policy", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      if (!props.matterhornServerClient || !props.runtimeWorkspaceId) {
        throw new Error("Matterhorn Desks engine is offline.");
      }
      return props.matterhornServerClient.getWalletSafetyPolicy(props.runtimeWorkspaceId);
    },
    staleTime: 20_000,
  });

  const serverPolicy = policyQuery.data?.policy;
  useEffect(() => {
    if (!serverPolicy) return;
    applyWalletSafetyPolicyToStore(props.store, serverPolicy);
    setForm(walletSafetyPolicyFormFromServer(serverPolicy));
  }, [
    props.store,
    serverPolicy?.maxPerTransactionUSD,
    serverPolicy?.maxDailySpendUSD,
    serverPolicy?.mainnetEnabled,
    serverPolicy?.maxSlippageBps,
    serverPolicy?.preferredNetwork,
    serverPolicy?.updatedAt,
  ]);

  const canWriteWorkspacePolicy = Boolean(
    props.matterhornServerClient
    && props.runtimeWorkspaceId
    && policyQuery.data?.controls.writable !== false,
  );
  const sourceLabel = policyQuery.data
    ? policyQuery.data.storage.exists
      ? "Workspace policy"
      : "Workspace defaults"
    : props.matterhornServerClient && props.runtimeWorkspaceId
      ? policyQuery.isError
        ? "Local fallback"
        : "Loading"
      : "Local only";

  const updateForm = useCallback((key: keyof WalletSafetyPolicyForm, value: string | boolean) => {
    setSaveError(null);
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const savePolicy = useCallback(async () => {
    const next = {
      maxPerTransactionUSD: positiveFormNumber(form.maxPerTransactionUSD, 50, 1_000_000),
      maxDailySpendUSD: positiveFormNumber(form.maxDailySpendUSD, 100, 10_000_000),
      mainnetEnabled: form.mainnetEnabled,
      maxSlippageBps: positiveFormNumber(form.maxSlippageBps, 100, 10_000),
      preferredNetwork: form.preferredNetwork === "8453" ? 8453 : 84532,
    };
    setSaving(true);
    setSaveError(null);
    props.store.setMaxPerTransactionUSD(next.maxPerTransactionUSD);
    props.store.setMaxDailySpendUSD(next.maxDailySpendUSD);
    props.store.setMaxSlippageBps(next.maxSlippageBps);
    props.store.setPreferredNetwork(next.preferredNetwork);
    props.store.setMainnetEnabled(next.mainnetEnabled);

    try {
      if (!props.matterhornServerClient || !props.runtimeWorkspaceId) {
        showToast({
          title: "Safety boundaries applied locally",
          description: "Create or connect a workspace to save them to the project ledger.",
          tone: "warning",
          durationMs: 3600,
        });
        return;
      }
      const response = await props.matterhornServerClient.updateWalletSafetyPolicy(props.runtimeWorkspaceId, next);
      applyWalletSafetyPolicyToStore(props.store, response.policy);
      setForm(walletSafetyPolicyFormFromServer(response.policy));
      showToast({
        title: "Safety boundaries saved",
        description: "Future Base transaction reviews will use this workspace policy.",
        tone: "success",
        durationMs: 2400,
      });
      await policyQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet safety policy could not be saved.";
      setSaveError(message);
      showToast({
        title: "Safety boundaries were not saved",
        description: message,
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [
    form,
    policyQuery,
    props.matterhornServerClient,
    props.runtimeWorkspaceId,
    props.store,
    showToast,
  ]);

  const fieldClass =
    "h-9 border-0 bg-dls-surface-muted/[0.24] text-dls-text shadow-none hover:bg-dls-surface-muted/[0.30] focus-visible:bg-dls-surface-muted/[0.30] focus-visible:ring-1 focus-visible:ring-dls-border-hover dark:bg-dls-surface-muted/[0.24] dark:hover:bg-dls-surface-muted/[0.30] dark:focus-visible:bg-dls-surface-muted/[0.30]";

  return (
    <section className={cn(
      props.compact
        ? "matterhorn-rail-section"
        : "rounded-lg bg-dls-surface-muted/[0.045] px-4 py-4",
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-dls-text">EVM transaction limits</h4>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Applied to Base transactions before they reach your browser wallet. Sui and Bittensor use their own review checks before you finish actions in those wallets.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-dls-secondary">{sourceLabel}</span>
      </div>

      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))]">
        <label className="grid gap-1.5 text-xs font-medium text-dls-secondary">
          Per transaction (USD)
          <Input
            className={fieldClass}
            inputMode="decimal"
            min={1}
            type="number"
            value={form.maxPerTransactionUSD}
            onChange={(event) => updateForm("maxPerTransactionUSD", event.currentTarget.value)}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-dls-secondary">
          Daily limit (USD)
          <Input
            className={fieldClass}
            inputMode="decimal"
            min={1}
            type="number"
            value={form.maxDailySpendUSD}
            onChange={(event) => updateForm("maxDailySpendUSD", event.currentTarget.value)}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-dls-secondary">
          Max slippage (bps)
          <Input
            className={fieldClass}
            inputMode="numeric"
            min={1}
            max={10000}
            type="number"
            value={form.maxSlippageBps}
            onChange={(event) => updateForm("maxSlippageBps", event.currentTarget.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-dls-secondary">Base network</span>
          <div className="flex rounded-lg bg-dls-surface-muted/[0.16] p-1">
            {[
              ["84532", "Sepolia"],
              ["8453", "Mainnet"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  form.preferredNetwork === value
                    ? "bg-dls-surface-muted/45 text-dls-text"
                    : "text-dls-secondary hover:bg-dls-surface-muted/[0.16] hover:text-dls-text",
                )}
                onClick={() => updateForm("preferredNetwork", value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            form.mainnetEnabled
              ? "bg-amber-500/12 text-amber-200"
              : "bg-dls-surface-muted/[0.16] text-dls-secondary hover:bg-dls-surface-muted/[0.22] hover:text-dls-text",
          )}
          onClick={() => updateForm("mainnetEnabled", !form.mainnetEnabled)}
        >
          {form.mainnetEnabled ? "Mainnet enabled" : "Mainnet blocked"}
        </button>
      </div>

      {saveError ? (
        <p className="mt-3 text-xs leading-5 text-red-300">{saveError}</p>
      ) : policyQuery.isError ? (
        <p className="mt-3 text-xs leading-5 text-amber-300">
          Workspace policy could not load. Local limits still protect this session.
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs leading-5 text-dls-secondary">
          Current spend today: {formatWalletSafetyValue(props.state.dailySpendUSD) ?? "$0.00"}.
        </p>
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-md"
          disabled={saving || (Boolean(props.matterhornServerClient && props.runtimeWorkspaceId) && policyQuery.isLoading)}
          onClick={savePolicy}
        >
          {saving ? "Saving..." : canWriteWorkspacePolicy ? "Save policy" : "Apply"}
        </Button>
      </div>
    </section>
  );
}

type WalletSafetyRow =
  | {
      id: string;
      title: string;
      reason: string;
      timestamp: string | number;
      chainId: number | null;
      valueUSD: number | null;
      riskLevel: string | null;
      txHash: string | null;
      review: WalletSafetyReviewTrail | null;
      source: "Project ledger";
    }
  | {
      id: string;
      title: string;
      reason: string;
      timestamp: number;
      chainId: number;
      valueUSD: number;
      riskLevel: SecurityLogEntry["riskLevel"];
      txHash: string | null;
      review: WalletSafetyReviewTrail | null;
      source: "Local log";
    };

function walletSafetyRowFromLedger(item: MatterhornProjectDataLedgerEntry): WalletSafetyRow {
  const metadata = item.metadata ?? {};
  const chainId = typeof metadata.chainId === "number" ? metadata.chainId : null;
  const valueUSD = typeof metadata.valueUSD === "number" ? metadata.valueUSD : null;
  const riskLevel = typeof metadata.riskLevel === "string" ? metadata.riskLevel : null;
  const txHash = typeof metadata.txHash === "string" ? metadata.txHash : null;
  const reviewedChainId = typeof metadata.reviewedChainId === "number" ? metadata.reviewedChainId : null;
  const reviewedTo = typeof metadata.reviewedTo === "string" ? metadata.reviewedTo : null;
  const reviewedValue = typeof metadata.reviewedValue === "string" ? metadata.reviewedValue : null;
  const review = reviewedChainId && reviewedTo && reviewedValue
    ? {
      reviewed: {
        chainId: reviewedChainId,
        to: reviewedTo,
        value: reviewedValue,
        valueUSD: typeof metadata.reviewedValueUSD === "number" ? metadata.reviewedValueUSD : valueUSD ?? 0,
        dataSelector: typeof metadata.reviewedDataSelector === "string" ? metadata.reviewedDataSelector : null,
        displayValue: typeof metadata.reviewedDisplayValue === "string" ? metadata.reviewedDisplayValue : null,
        proposedBy: typeof metadata.reviewedProposedBy === "string" ? metadata.reviewedProposedBy : null,
      },
      submitted: typeof metadata.submittedChainId === "number" && typeof metadata.submittedTo === "string" && typeof metadata.submittedValue === "string"
        ? {
          chainId: metadata.submittedChainId,
          to: metadata.submittedTo,
          value: metadata.submittedValue,
          dataSelector: typeof metadata.submittedDataSelector === "string" ? metadata.submittedDataSelector : null,
          txHash: typeof metadata.submittedTxHash === "string" ? metadata.submittedTxHash : txHash,
        }
        : null,
    } satisfies WalletSafetyReviewTrail
    : null;
  return {
    id: item.id,
    title: item.title,
    reason: item.summary ?? "Wallet safety event recorded.",
    timestamp: item.timestamp,
    chainId,
    valueUSD,
    riskLevel,
    txHash,
    review,
    source: "Project ledger",
  };
}

function walletSafetyRowFromLocal(entry: SecurityLogEntry, index: number): WalletSafetyRow {
  return {
    id: `${entry.timestamp}-${entry.action}-${index}`,
    title: walletSafetyTitle(entry.action),
    reason: entry.reason,
    timestamp: entry.timestamp,
    chainId: entry.chainId,
    valueUSD: entry.valueUSD,
    riskLevel: entry.riskLevel,
    txHash: entry.txHash ?? null,
    review: entry.review ?? null,
    source: "Local log",
  };
}

function WalletSafetyLedger(props: {
  compact?: boolean;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
}) {
  const [localLog, setLocalLog] = useState<SecurityLogEntry[]>(() => getSecurityLog(5));
  useEffect(() => subscribeSecurityLog(() => setLocalLog(getSecurityLog(5))), []);

  const ledgerQuery = useQuery({
    queryKey: ["wallet-safety-ledger", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      if (!props.matterhornServerClient || !props.runtimeWorkspaceId) throw new Error("Matterhorn Desks engine is offline.");
      return props.matterhornServerClient.listProjectDataLedger(props.runtimeWorkspaceId, {
        kind: "wallet",
        source: "audit",
        limit: 8,
      });
    },
    staleTime: 15_000,
  });

  const ledgerRows = (ledgerQuery.data?.items ?? [])
    .filter((item) =>
      item.eventType === "workspace.wallet.safety_event"
      || item.metadata?.auditAction === "workspace.wallet.safety_event"
    )
    .slice(0, 5)
    .map(walletSafetyRowFromLedger);
  const localRows = localLog.slice(0, 5).map(walletSafetyRowFromLocal);
  const rows = ledgerRows.length > 0 ? ledgerRows : localRows;
  const sourceLabel = ledgerRows.length > 0
    ? "Project ledger"
    : ledgerQuery.isError
      ? "Local fallback"
      : localRows.length > 0
        ? "Local log"
        : "Ready";

  if (props.compact && rows.length === 0) return null;

  if (props.compact) {
    const latest = rows[0];
    return (
      <details className="group matterhorn-rail-section">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm transition-colors hover:text-dls-text">
          <span className="min-w-0">
            <span className="block font-medium text-dls-text">Safety activity</span>
            <span className="mt-0.5 block truncate text-xs text-dls-secondary">
              {latest.title} · {formatWalletSafetyTime(latest.timestamp)}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-dls-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-2 border-t border-dls-border/40 pt-3">
          {rows.map((row) => {
            const value = formatWalletSafetyValue(row.valueUSD);
            return (
              <div key={row.id} className="grid gap-1.5 py-1 text-xs leading-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-dls-text">{row.title}</p>
                  <span className={cn("shrink-0 text-[10px] font-medium", walletSafetyTone(row.riskLevel).split(" ")[0])}>
                    {row.riskLevel ?? "low"}
                  </span>
                </div>
                <p className="text-dls-secondary">{row.reason}</p>
                <div className="flex flex-wrap gap-x-3 text-[11px] text-dls-muted">
                  <span>{formatWalletSafetyTime(row.timestamp)}</span>
                  {row.chainId ? <span>Chain {row.chainId}</span> : null}
                  {value ? <span>{value}</span> : null}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-dls-muted">Source: {sourceLabel}</p>
        </div>
      </details>
    );
  }

  return (
    <section className={cn(
      props.compact
        ? "matterhorn-rail-section"
        : "rounded-lg bg-dls-surface-muted/[0.055] px-4 py-4",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-dls-text">Safety ledger</h4>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Recent approvals, blocks, and wallet handoff guardrails.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-dls-surface-muted/30 px-2 py-0.5 text-[10px] font-medium text-dls-secondary">
          {sourceLabel}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-md bg-dls-surface-muted/[0.08] px-3 py-3 text-xs leading-5 text-dls-secondary">
          <p className="font-medium text-dls-text">No wallet safety events yet</p>
          <p className="mt-1">
            Chain blocks, approval expiry, rejected sends, and confirmed approvals will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {rows.map((row) => {
            const value = formatWalletSafetyValue(row.valueUSD);
            return (
              <div key={row.id} className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-dls-text">{row.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-dls-secondary">{row.reason}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium", walletSafetyTone(row.riskLevel))}>
                    {row.riskLevel ?? "low"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dls-muted">
                  <span>{formatWalletSafetyTime(row.timestamp)}</span>
                  {row.chainId ? <span>Chain {row.chainId}</span> : null}
                  {value ? <span>{value}</span> : null}
                  <span>{row.source}</span>
                </div>
                {row.review ? (
                  <div className="mt-2 rounded-md bg-dls-surface-muted/[0.12] px-2.5 py-2 text-[11px] leading-5 text-dls-secondary">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-dls-text">Reviewed</span>
                      <span>{row.review.reviewed.displayValue ?? formatWalletSafetyValue(row.review.reviewed.valueUSD) ?? "Transaction"}</span>
                      {shortWalletAuditText(row.review.reviewed.to) ? <span>{shortWalletAuditText(row.review.reviewed.to)}</span> : null}
                      {row.review.reviewed.dataSelector ? <span>{row.review.reviewed.dataSelector}</span> : null}
                    </div>
                    {row.review.submitted ? (
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-dls-text">Sent</span>
                        {shortWalletAuditText(row.review.submitted.to) ? <span>{shortWalletAuditText(row.review.submitted.to)}</span> : null}
                        {row.review.submitted.dataSelector ? <span>{row.review.submitted.dataSelector}</span> : null}
                        {shortWalletAuditText(row.review.submitted.txHash ?? row.txHash) ? (
                          <span>{shortWalletAuditText(row.review.submitted.txHash ?? row.txHash)}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function evmConnectorKindLabel(connector: { id: string; name: string }) {
  const id = connector.id.toLowerCase();
  const name = connector.name.toLowerCase();
  if (id.includes("walletconnect")) return "WalletConnect";
  if (id.includes("coinbase") || name.includes("coinbase")) return "Coinbase Wallet";
  if (id.includes("injected")) return "Browser wallet extension";
  return "Wallet connector";
}

function WalletConnectorMark({
  connector,
  className,
}: {
  connector: { id: string; name: string };
  className?: string;
}) {
  const identity = `${connector.id} ${connector.name}`.toLowerCase();
  const brandAsset = identity.includes("metamask")
    ? "/wallet-metamask.svg"
    : identity.includes("coinbase")
      ? "/wallet-coinbase.svg"
      : null;

  if (!brandAsset) return <Plug className={cn("shrink-0", className)} aria-hidden="true" />;

  return (
    <img
      src={brandAsset}
      alt=""
      className={cn("shrink-0 object-contain", className)}
      aria-hidden="true"
    />
  );
}

export function WalletSettingsView({
  compact = false,
  matterhornServerClient,
  runtimeWorkspaceId,
  sessionId,
  store,
  onTxApprove,
  onTxReject,
}: WalletSettingsViewProps) {
  const state = useWalletStore(store);
  const { address: wagmiAddress } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: ethBalance } = useBalance({ address: wagmiAddress });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sync wagmi state → wallet store
  const syncStore = useCallback(() => {
    if (wagmiAddress && chainId) {
      const connectorName = connectors.find((c) => c.id === (store.getSnapshot().connector))?.name ?? null;
      const nextConnector = connectorName ?? "connected";
      const current = store.getSnapshot();
      const needsConnectionSync =
        current.address !== wagmiAddress
        || current.chainId !== chainId
        || current.connector !== nextConnector
        || !current.isConnected
        || current.isConnecting
        || Boolean(current.error);

      if (needsConnectionSync) {
        store.setConnected(
          wagmiAddress,
          chainId,
          nextConnector,
        );
      }

      if (ethBalance) {
        const nextEthBalance = Number(formatUnits(ethBalance.value, 18)).toFixed(4);
        const balanceSnapshot = store.getSnapshot();
        if (balanceSnapshot.ethBalance !== nextEthBalance || balanceSnapshot.usdcBalance !== "—") {
          store.setBalances(
            nextEthBalance,
            "—", // USDC balance requires separate call
          );
        }
      }
    }
  }, [wagmiAddress, chainId, ethBalance, store, connectors]);

  useEffect(() => {
    syncStore();
  }, [syncStore]);

  const handleConnect = useCallback(async (connectorId: string) => {
    setError(null);
    try {
      store.setConnecting(true);
      const connector = connectors.find((c) => c.id === connectorId);
      if (!connector) throw new Error("Connector not found");
      await connect({ connector });
      syncStore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      setError(msg);
      store.setError(msg);
    } finally {
      store.setConnecting(false);
    }
  }, [connect, connectors, store, syncStore]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      store.disconnect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to disconnect";
      setError(msg);
    }
  }, [disconnect, store]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      syncStore();
    } finally {
      setRefreshing(false);
    }
  }, [syncStore]);

  const handleSwitchChain = useCallback(async (targetChainId: number) => {
    try {
      await switchChain({ chainId: targetChainId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch chain");
    }
  }, [switchChain]);

  const copyAddress = useCallback(() => {
    if (wagmiAddress) {
      navigator.clipboard.writeText(wagmiAddress);
    }
  }, [wagmiAddress]);

  const runtime: WalletRuntime = isElectronRuntime()
    ? "electron"
    : isDesktopRuntime()
      ? "desktop"
      : "web";
  const capability = useMemo(() => getWalletRuntimeCapability(runtime), [runtime]);
  const noConnectorCopy = useMemo(() => noEvmConnectorCopy(capability), [capability]);
  const backendCapabilitiesQuery = useQuery({
    queryKey: ["wallet-backend-capabilities"],
    enabled: Boolean(matterhornServerClient),
    queryFn: async () => {
      if (!matterhornServerClient) throw new Error("Matterhorn Desks engine is offline.");
      return matterhornServerClient.backendCapabilities();
    },
    staleTime: 30_000,
  });
  const backendWallets = backendCapabilitiesQuery.data
    ? walletFamilySummary(backendCapabilitiesQuery.data)
    : undefined;

  const runtimeBadgeLabel: Record<WalletRuntime, string> = {
    web: "Web",
    desktop: "Desktop",
    electron: "Desktop",
    unknown: "Unknown",
  };

  if (compact) {
    return (
      <SettingsStack className="matterhorn-wallet-rail max-w-none gap-5">
        <section className="matterhorn-rail-section flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-dls-text">Matterhorn Wallet</h3>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Connect an EVM or Sui wallet. Bittensor uses public SS58 reads and external signing.
              </p>
            </div>
            <span className="shrink-0 pt-0.5 text-[11px] font-medium text-dls-secondary">
              {runtimeBadgeLabel[runtime]}
            </span>
          </div>
        </section>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-400">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {state.isConnected ? (
          <section className="flex flex-col gap-4">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr))]">
              <WalletRailMetric label="Address" value={wagmiAddress ? truncateAddress(wagmiAddress) : "—"} />
              <WalletRailMetric label="Network" value={state.chainId ? CHAIN_NAMES[state.chainId] ?? "Unknown" : "Unknown"} />
              <WalletRailMetric label="ETH" value={ethBalance ? Number(formatUnits(ethBalance.value, 18)).toFixed(4) : state.ethBalance ?? "—"} />
              <WalletRailMetric label="USDC" value={state.usdcBalance ?? "—"} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyAddress} disabled={!wagmiAddress}>
                <Copy className="size-3" />
                Copy address
              </Button>
              <Button variant="ghost" size="icon-sm" className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text" onClick={handleRefresh} disabled={refreshing} aria-label="Refresh wallet" title="Refresh wallet">
                <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
              </Button>
              <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={handleDisconnect}>
                <Unplug className="size-3" />
                Disconnect
              </Button>
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-1.5 rounded-lg bg-dls-surface-muted/[0.14] p-1.5">
            {connectors.length > 0 ? (
              connectors.map((connector) => (
                <Button
                  key={connector.id}
                  variant="outline"
                  className="h-auto justify-start gap-3 rounded-md border-0 bg-dls-surface-muted/[0.10] px-3 py-2.5 shadow-none hover:bg-dls-surface-muted/[0.22]"
                  disabled={state.isConnecting}
                  onClick={() => handleConnect(connector.id)}
                >
                  <WalletConnectorMark connector={connector} className="size-4" />
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium">{connector.name}</span>
                    <span className="block truncate text-xs text-dls-secondary">
                      {evmConnectorKindLabel(connector)}
                    </span>
                  </span>
                  {state.isConnecting ? <RefreshCw className="ml-auto size-3.5 animate-spin" /> : null}
                </Button>
              ))
            ) : (
              <div className="rounded-md bg-dls-surface-muted/[0.14] px-3 py-3 text-sm leading-6 text-dls-secondary">
                <div className="flex items-center gap-2 font-medium text-dls-text">
                  <Wallet className="size-4" />
                  {noConnectorCopy.title}
                </div>
                <p className="mt-2 text-xs leading-5">
                  {noConnectorCopy.body}
                </p>
              </div>
            )}
          </section>
        )}

        <SuiWalletPreviewSection
          compact
          matterhornServerClient={matterhornServerClient}
          runtime={runtime}
          workspaceId={runtimeWorkspaceId}
          sessionId={sessionId}
        />
        <WalletSafetyPolicyControls
          compact
          store={store}
          state={state}
          matterhornServerClient={matterhornServerClient}
          runtimeWorkspaceId={runtimeWorkspaceId}
        />
        <WalletSafetyLedger
          compact
          matterhornServerClient={matterhornServerClient}
          runtimeWorkspaceId={runtimeWorkspaceId}
        />
        <WalletProtocolSupportMap compact capability={capability} connected={state.isConnected} backendWallets={backendWallets} />
        <WalletRuntimeExplainer capability={capability} compact />
      </SettingsStack>
    );
  }

  if (!state.isConnected) {
    return (
      <SettingsStack>
        <SettingsSection>
          <SettingsSectionHeader>
            <SettingsSectionHeaderTitle>Matterhorn Wallet</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Connect EVM and Sui wallets where this runtime supports direct wallet connect. Bittensor actions stay external-signer only.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeader>

          <div className="flex flex-col gap-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}

            {connectors.map((connector) => (
              <Button
                key={connector.id}
                variant="outline"
                className="flex items-center justify-start gap-3 h-14 px-4"
                disabled={state.isConnecting}
                onClick={() => handleConnect(connector.id)}
              >
                <WalletConnectorMark connector={connector} className="size-5" />
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">
                    {connector.name}
                  </span>
                  <span className="text-xs text-gray-8">
                    {evmConnectorKindLabel(connector)}
                  </span>
                </div>
                {state.isConnecting && <RefreshCw className="size-4 ml-auto animate-spin" />}
              </Button>
            ))}

            {connectors.length === 0 && (
              <div className="rounded-lg bg-dls-surface-muted/[0.055] px-4 py-6 text-center">
                <Wallet className="mx-auto mb-2 size-7 text-dls-secondary" />
                <p className="text-sm font-medium text-dls-text">
                  {noConnectorCopy.title}.
                </p>
                <p className="mt-2 text-xs leading-5 text-dls-secondary">
                  {noConnectorCopy.body}
                </p>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  Public Bittensor reads and market previews still work. You can also prepare Sui actions and import receipts.
                </p>
              </div>
            )}
          </div>
        </SettingsSection>
        <SettingsSection>
          <SuiWalletPreviewSection
            matterhornServerClient={matterhornServerClient}
            runtime={runtime}
            workspaceId={runtimeWorkspaceId}
            sessionId={sessionId}
          />
        </SettingsSection>
        <SettingsSection>
          <SettingsSectionHeader>
            <SettingsSectionHeaderTitle>Wallet safety</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Base transaction limits and recent review events. Other wallets use their own review checks before you finish an action.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeader>
          <WalletSafetyPolicyControls
            store={store}
            state={state}
            matterhornServerClient={matterhornServerClient}
            runtimeWorkspaceId={runtimeWorkspaceId}
          />
          <WalletSafetyLedger
            matterhornServerClient={matterhornServerClient}
            runtimeWorkspaceId={runtimeWorkspaceId}
          />
          <WalletProtocolSupportMap capability={capability} connected={state.isConnected} backendWallets={backendWallets} />
          <WalletRuntimeExplainer capability={capability} />
          <WalletBoundaryList safetyCopy={capability.safetyCopy} />
        </SettingsSection>
      </SettingsStack>
    );
  }

  const chainName = state.chainId ? CHAIN_NAMES[state.chainId] ?? "Unknown Chain" : "Unknown Chain";

  return (
    <SettingsStack>
      <SettingsSection className="gap-4">
        <SettingsSectionHeader className="gap-3">
          <div className="min-w-0">
            <SettingsSectionHeaderTitle>
              <ShieldCheck className="size-4 text-green-400" />
              Connected wallet
            </SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Account, network, and balances for this workspace.
            </SettingsSectionHeaderDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-md bg-dls-surface-muted/30 px-2 py-0.5 text-[10px] font-medium text-dls-secondary">
              {runtimeBadgeLabel[runtime]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 border-0 bg-transparent text-xs text-red-400 shadow-none hover:bg-red-500/10 hover:text-red-300"
              onClick={handleDisconnect}
            >
              <Unplug className="mr-1 size-3" />
              Disconnect
            </Button>
          </div>
        </SettingsSectionHeader>

        <div className="grid gap-3 rounded-lg bg-dls-surface-muted/[0.055] px-3 py-3">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
            <div className="min-w-0 rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2.5">
              <div className="text-xs text-dls-muted">Address</div>
              <button
                type="button"
                className="mt-1 flex max-w-full items-center gap-1.5 font-mono text-sm text-dls-secondary transition-colors hover:text-dls-text"
                onClick={copyAddress}
              >
                <span className="min-w-0 truncate">{wagmiAddress ? truncateAddress(wagmiAddress) : "—"}</span>
                <Copy className="size-3 shrink-0" />
              </button>
            </div>

            <div className="min-w-0 rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2.5">
              <div className="text-xs text-dls-muted">Chain</div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <span className="size-1.5 rounded-full bg-green-400" />
                <span className="min-w-0 truncate text-sm text-dls-secondary">{chainName}</span>
                <ChevronDown className="size-3 shrink-0 text-dls-muted" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))]">
            <div className="rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2.5">
              <div className="mb-1 text-xs text-dls-muted">ETH Balance</div>
              <div className="font-mono text-base text-dls-text">
                {ethBalance ? Number(formatUnits(ethBalance.value, 18)).toFixed(4) : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2.5">
              <div className="mb-1 text-xs text-dls-muted">USDC Balance</div>
              <div className="font-mono text-base text-dls-text">{state.usdcBalance ?? "—"}</div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh balances"
            title="Refresh balances"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection>
        <SuiWalletPreviewSection
          matterhornServerClient={matterhornServerClient}
          runtime={runtime}
          workspaceId={runtimeWorkspaceId}
          sessionId={sessionId}
        />
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderTitle>Wallet safety</SettingsSectionHeaderTitle>
          <SettingsSectionHeaderDescription>
            Base transaction limits and recent review events. Other wallets use their own review checks before you finish an action.
          </SettingsSectionHeaderDescription>
        </SettingsSectionHeader>
        <WalletSafetyPolicyControls
          store={store}
          state={state}
          matterhornServerClient={matterhornServerClient}
          runtimeWorkspaceId={runtimeWorkspaceId}
        />
        <WalletSafetyLedger
          matterhornServerClient={matterhornServerClient}
          runtimeWorkspaceId={runtimeWorkspaceId}
        />
      </SettingsSection>

      {/* Network switcher */}
      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderTitle>Network</SettingsSectionHeaderTitle>
          <SettingsSectionHeaderDescription>
            Base Sepolia is the default. Enable mainnet only when you intend to spend real funds.
          </SettingsSectionHeaderDescription>
        </SettingsSectionHeader>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
          {CHAIN_LIST.map((chain) => (
            <button
              key={chain.id}
              type="button"
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg p-4 text-center transition-colors ring-1",
                chain.id === chainId
                  ? "bg-violet-500/10 ring-violet-500/35"
                  : "bg-dls-surface-muted/20 ring-dls-border/35 hover:bg-dls-hover/40 hover:ring-dls-border-hover/50",
                chain.id === 8453 && !state.mainnetEnabled && "opacity-55",
              )}
              onClick={() => handleSwitchChain(chain.id)}
              disabled={chain.id === chainId || (chain.id === 8453 && !state.mainnetEnabled)}
            >
              <span className="text-sm font-medium text-dls-text">{chain.name}</span>
              <span className="text-xs text-gray-8">
                {chain.id === 8453 ? (state.mainnetEnabled ? "Mainnet" : "Mainnet locked") : "Testnet"}
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Transaction history */}
      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderTitle>Transaction History</SettingsSectionHeaderTitle>
          <SettingsSectionHeaderDescription>
            Recent transactions from this wallet. Max 50 shown.
          </SettingsSectionHeaderDescription>
        </SettingsSectionHeader>

        {state.transactions.length === 0 ? (
          <div className="rounded-lg bg-dls-surface-muted/[0.055] px-4 py-6 text-center">
            <Clock className="mx-auto mb-2 size-7 text-dls-muted" />
            <p className="text-sm text-dls-secondary">No transactions yet.</p>
            <p className="mt-1 text-xs text-dls-muted">
              Transactions will appear here after you approve them in-session.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {state.transactions.map((tx) => (
              <div
                key={tx.hash}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-dls-surface transition-colors"
              >
                {txStatusIcon(tx.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-dls-text truncate">
                      {truncateAddress(tx.hash)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-8">
                    {new Date(tx.timestamp).toLocaleDateString()} — {tx.status}
                  </div>
                </div>
                <a
                  href={
                    tx.chainId === 8453
                      ? `https://basescan.org/tx/${tx.hash}`
                      : `https://sepolia.basescan.org/tx/${tx.hash}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-gray-8 hover:text-gray-10 transition-colors"
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="size-4 shrink-0" />
          {error}
          <button
            type="button"
            className="ml-auto text-xs underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </SettingsStack>
  );
}
