/** @jsxImportSource react */
import { useState, useCallback, useMemo } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { WalletStore } from "../../wallet/state/wallet-store";
import { useWalletStore } from "../../wallet/state/wallet-store";
import { CHAIN_NAMES, CHAIN_LIST } from "../../../infra/chains";
import { SettingsSection, SettingsSectionHeader, SettingsSectionHeaderTitle, SettingsSectionHeaderDescription, SettingsStack } from "../settings-section";
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
  onTxApprove?: (tx: { to: string; value: string; data?: string; chainId: number }) => void;
  onTxReject?: () => void;
  compact?: boolean;
};

function WalletBoundaryList({ safetyCopy }: {
  safetyCopy: WalletRuntimeCapability["safetyCopy"];
}) {
  const items = [
    { label: "Public reads", body: safetyCopy.publicAddressLine },
    { label: "External signer", body: safetyCopy.externalSignerLine },
    { label: "Never paste", body: safetyCopy.forbiddenSecretsLine },
  ];

  return (
    <div className="divide-y divide-dls-border/45 text-xs leading-5 text-dls-secondary">
      {items.map((item) => (
        <p key={item.label} className="py-2">
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
  const readLabel = cap.canRead ? "Read" : "—";
  const previewLabel = cap.canPreview ? "Preview" : "—";
  const submitLabel = cap.canSubmit ? "Submit" : cap.canPreview ? "Preview only" : "—";
  const signerNote =
    cap.signerRequirement === "external_signer"
      ? " External signer required for writes."
      : cap.signerRequirement === "client_signer"
        ? " Client signer required."
        : "";

  switch (protocol) {
    case "bittensor":
      return {
        label: "Bittensor",
        detail: `${readLabel} public SS58/coldkey data. ${previewLabel} extrinsics and receipt evidence. ${submitLabel}.${signerNote}`,
        tone: cap.canRead ? "text-cyan-300 bg-cyan-500/10" : "text-gray-500 bg-gray-500/10",
      };
    case "hyperliquid":
      return {
        label: "Hyperliquid",
        detail: `${readLabel} markets, orderbooks, and funding. ${previewLabel} orders. ${submitLabel}.${signerNote}`,
        tone: cap.canRead ? "text-blue-300 bg-blue-500/10" : "text-gray-500 bg-gray-500/10",
      };
    case "polymarket":
      return {
        label: "Polymarket",
        detail: `${readLabel} markets, compliance, and liquidity. ${previewLabel} orders. ${submitLabel}.${signerNote}`,
        tone: cap.canRead ? "text-violet-300 bg-violet-500/10" : "text-gray-500 bg-gray-500/10",
      };
  }
}

function evmConnectorStatusLabel(state: string, connected: boolean): { label: string; tone: string } {
  if (connected) return { label: "Connected", tone: "text-emerald-300 bg-emerald-500/10" };
  switch (state) {
    case "available": return { label: "Needs setup", tone: "text-sky-300 bg-sky-500/10" };
    case "needs_extension": return { label: "Extension needed", tone: "text-amber-300 bg-amber-500/10" };
    case "unsupported_runtime": return { label: "Not supported here", tone: "text-gray-400 bg-gray-500/10" };
    default: return { label: "Unavailable", tone: "text-gray-500 bg-gray-500/10" };
  }
}

function WalletProtocolSupportMap(props: {
  capability: WalletRuntimeCapability;
  connected: boolean;
}) {
  const evm = evmConnectorStatusLabel(props.capability.evmConnectorState, props.connected);
  const rows: { label: string; status: string; detail: string; tone: string }[] = [
    {
      label: "EVM wallet",
      status: evm.label,
      detail: props.capability.supportsInjectedEvm
        ? "Browser extension wallets such as MetaMask or Rabby can appear when installed and allowed."
        : "Injected wallets are not available in this runtime. Use the external signer flow.",
      tone: evm.tone,
    },
    ...(Object.entries(props.capability.protocols) as [WalletProtocol, WalletProtocolCapability][]).map(
      ([protocol, cap]) => {
        const { label, detail, tone } = protocolLabelAndDetail(protocol, cap);
        const submitStatus =
          cap.canSubmit
            ? "Submit"
            : cap.canPreview
              ? "Preview only"
              : cap.canRead
                ? "Read only"
                : "Unavailable";
        return { label, status: submitStatus, detail, tone };
      },
    ),
  ];

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-dls-surface-muted/30 px-3 py-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-dls-secondary">Protocol support</h4>
        <p className="mt-1 text-xs leading-5 text-dls-secondary">
          One wallet surface; each desk keeps its own safety boundary.
        </p>
      </div>
      <div className="divide-y divide-dls-border/35">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 py-2 text-xs leading-5">
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

const RUNTIME_LABELS: Record<WalletRuntime, { label: string; icon: typeof Globe; detail: string }> = {
  web: {
    label: "Web browser",
    icon: Globe,
    detail: "Injected wallets appear when their extension is installed and allowed on Matterhorn.",
  },
  desktop: {
    label: "Desktop app",
    icon: MonitorSmartphone,
    detail: "Browser wallet extensions do not inject into Electron. Use external signing today.",
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
    switch (props.capability.desktopWalletStrategy) {
      case "external_signer": return "External signer handoffs are available here.";
      case "walletconnect_planned": return "WalletConnect support is planned for this runtime.";
      case "deep_link_planned": return "Deep-link support is planned for this runtime.";
      default: return "Native wallet support is not available in this runtime.";
    }
  })();

  return (
    <section className={cn(
      "rounded-xl bg-sky-500/10",
      props.compact ? "px-3 py-3" : "px-4 py-4",
    )}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-300" />
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Wallet runtime behavior</h4>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Matterhorn shows where signing happens before any handoff.
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2 divide-y divide-sky-400/15">
        <div className="flex items-start gap-2 py-2 text-xs leading-5">
          <RuntimeIcon className="mt-0.5 size-3.5 shrink-0 text-sky-300" />
          <div>
            <span className="font-medium text-dls-text">{label}</span>
            <span className="text-dls-secondary"> — {detail}</span>
          </div>
        </div>
        <div className="py-2 text-xs leading-5 text-dls-secondary">{strategyNote}</div>
      </div>
    </section>
  );
}

function WalletRailMetric(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-dls-secondary">{props.label}</div>
      <div className="mt-1 truncate font-mono text-sm text-dls-text">{props.value}</div>
    </div>
  );
}

export function WalletSettingsView({ compact = false, store, onTxApprove, onTxReject }: WalletSettingsViewProps) {
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
      store.setConnected(
        wagmiAddress,
        chainId,
        connectorName ?? "connected",
      );
      if (ethBalance) {
        store.setBalances(
          Number(formatUnits(ethBalance.value, 18)).toFixed(4),
          "—", // USDC balance requires separate call
        );
      }
    }
  }, [wagmiAddress, chainId, ethBalance, store, connectors]);

  // Keep store synced
  useState(() => { syncStore(); return null; });

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

  const runtimeBadgeLabel: Record<WalletRuntime, string> = {
    web: "Web",
    desktop: "Desktop",
    electron: "Desktop",
    unknown: "Unknown",
  };

  if (compact) {
    return (
      <SettingsStack className="matterhorn-wallet-rail max-w-none gap-4">
        <section className="flex flex-col gap-3 border-b border-dls-border/45 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-dls-text">Matterhorn Wallet</h3>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                EVM handoffs live here. Bittensor uses public SS58 reads and external signing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-md border border-dls-border/30 bg-dls-surface-muted/30 px-2 py-0.5 text-[10px] font-medium text-dls-secondary">
                {runtimeBadgeLabel[runtime]}
              </span>
              <span className={cn(
                "shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium",
                state.isConnected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-300",
              )}>
                {state.isConnected ? "Connected" : "Needs setup"}
              </span>
            </div>
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
            <div className="grid grid-cols-2 gap-3">
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
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={handleDisconnect}>
                <Unplug className="size-3" />
                Disconnect
              </Button>
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-3">
            {connectors.length > 0 ? (
              connectors.map((connector) => (
                <Button
                  key={connector.id}
                  variant="outline"
                  className="h-auto justify-start gap-3 rounded-lg px-3 py-3"
                  disabled={state.isConnecting}
                  onClick={() => handleConnect(connector.id)}
                >
                  <Plug className="size-4" />
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium">{connector.name}</span>
                    <span className="block truncate text-xs text-dls-secondary">
                      {connector.id.includes("injected") ? "Browser wallet extension" : "WalletConnect"}
                    </span>
                  </span>
                  {state.isConnecting ? <RefreshCw className="ml-auto size-3.5 animate-spin" /> : null}
                </Button>
              ))
            ) : (
              <div className="rounded-lg bg-dls-surface-muted/55 px-3 py-3 text-sm leading-6 text-dls-secondary">
                <div className="flex items-center gap-2 font-medium text-dls-text">
                  <Wallet className="size-4" />
                  No EVM wallet connector detected
                </div>
                <p className="mt-2 text-xs leading-5">
                  Install or enable MetaMask, Rabby, or another injected wallet. Public reads and market previews still work.
                </p>
              </div>
            )}
          </section>
        )}

        <WalletProtocolSupportMap capability={capability} connected={state.isConnected} />
        <WalletRuntimeExplainer capability={capability} compact />

        <WalletBoundaryList safetyCopy={capability.safetyCopy} />
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
              Connect an EVM wallet for handoffs. Bittensor actions stay external-signer only.
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
                <Plug className="size-5" />
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">
                    {connector.name}
                  </span>
                  <span className="text-xs text-gray-8">
                    {connector.id.includes("injected") ? "Browser wallet extension" : "WalletConnect"}
                  </span>
                </div>
                {state.isConnecting && <RefreshCw className="size-4 ml-auto animate-spin" />}
              </Button>
            ))}

            {connectors.length === 0 && (
              <div className="rounded-lg border border-dls-border p-6 text-center">
                <Wallet className="size-8 mx-auto mb-2 text-dls-secondary" />
                <p className="text-sm font-medium text-dls-text">
                  No EVM wallet connector detected.
                </p>
                <p className="mt-2 text-xs leading-5 text-dls-secondary">
                  Install or enable MetaMask, Rabby, or another injected wallet.
                </p>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  Public Bittensor reads and market previews still work.
                </p>
              </div>
            )}
          </div>
        </SettingsSection>
        <SettingsSection>
          <SettingsSectionHeader>
            <SettingsSectionHeaderTitle>Safety boundaries</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Current read, preview, and signing limits.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeader>
          <WalletProtocolSupportMap capability={capability} connected={state.isConnected} />
          <WalletRuntimeExplainer capability={capability} />
          <WalletBoundaryList safetyCopy={capability.safetyCopy} />
        </SettingsSection>
      </SettingsStack>
    );
  }

  const chainName = state.chainId ? CHAIN_NAMES[state.chainId] ?? "Unknown Chain" : "Unknown Chain";

  return (
    <SettingsStack>
      {/* Connected wallet header */}
      <Card className="border-dls-border bg-dls-sidebar">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-green-500" />
              Connected
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="shrink-0 rounded-md border border-dls-border/30 bg-dls-surface-muted/30 px-2 py-0.5 text-[10px] font-medium text-dls-secondary">
                {runtimeBadgeLabel[runtime]}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleDisconnect}
              >
                <Unplug className="size-3 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Address */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-8">Address</span>
            <button
              type="button"
              className="flex items-center gap-1.5 font-mono text-sm text-gray-10 hover:text-dls-text transition-colors"
              onClick={copyAddress}
            >
              {wagmiAddress ? truncateAddress(wagmiAddress) : "—"}
              <Copy className="size-3" />
            </button>
          </div>

          {/* Chain */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-8">Chain</span>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-green-500" />
              <span className="text-sm text-gray-10">{chainName}</span>
              <ChevronDown className="size-3 text-gray-8" />
            </div>
          </div>

          {/* Balances */}
          <Separator className="border-dls-border" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-8 mb-1">ETH Balance</div>
              <div className="font-mono text-lg text-dls-text">
                {ethBalance ? Number(formatUnits(ethBalance.value, 18)).toFixed(4) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-8 mb-1">USDC Balance</div>
              <div className="font-mono text-lg text-dls-text">{state.usdcBalance ?? "—"}</div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3 mr-1", refreshing && "animate-spin")} />
            Refresh balances
          </Button>
        </CardContent>
      </Card>

      {/* Network switcher */}
      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderTitle>Network</SettingsSectionHeaderTitle>
          <SettingsSectionHeaderDescription>
            Switch between Base mainnet and Base Sepolia testnet.
          </SettingsSectionHeaderDescription>
        </SettingsSectionHeader>

        <div className="grid grid-cols-2 gap-3">
          {CHAIN_LIST.map((chain) => (
            <button
              key={chain.id}
              type="button"
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-4 text-center transition-colors",
                chain.id === chainId
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-dls-border hover:border-dls-border-hover bg-dls-surface hover:bg-dls-surface-hover",
              )}
              onClick={() => handleSwitchChain(chain.id)}
              disabled={chain.id === chainId}
            >
              <span className="text-sm font-medium text-dls-text">{chain.name}</span>
              <span className="text-xs text-gray-8">
                {chain.id === 8453 ? "Mainnet" : "Testnet"}
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
          <div className="rounded-lg border border-dls-border p-6 text-center">
            <Clock className="size-8 mx-auto mb-2 text-gray-8" />
            <p className="text-sm text-gray-8">No transactions yet.</p>
            <p className="text-xs text-gray-8 mt-1">
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
