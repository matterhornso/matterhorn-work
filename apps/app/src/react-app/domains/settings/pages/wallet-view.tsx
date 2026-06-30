/** @jsxImportSource react */
import { useState, useCallback } from "react";
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { WalletStore, WalletStoreSnapshot } from "../../wallet/state/wallet-store";
import { useWalletStore } from "../../wallet/state/wallet-store";
import { CHAIN_NAMES, CHAIN_LIST } from "../../../infra/chains";
import { USDC_BY_CHAIN } from "../../../infra/contracts";
import { SettingsSection, SettingsSectionHeader, SettingsSectionHeaderTitle, SettingsSectionHeaderDescription, SettingsStack } from "../settings-section";

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

function WalletBoundaryList() {
  return (
    <div className="divide-y divide-dls-border/45 text-xs leading-5 text-dls-secondary">
      <p className="py-2">
        <span className="font-medium text-dls-text">Bittensor:</span> public SS58 reads and external Bittensor-compatible signing only.
      </p>
      <p className="py-2">
        <span className="font-medium text-dls-text">Hyperliquid and Polymarket:</span> read, preview, receipt, and handoff flows; live submission stays off.
      </p>
      <p className="py-2">
        <span className="font-medium text-dls-text">Never paste:</span> seed phrases, private keys, raw signatures, signed payloads, API secrets, or wallet exports.
      </p>
    </div>
  );
}

function WalletProtocolSupportMap(props: { connected: boolean }) {
  const rows = [
    {
      label: "EVM tools",
      status: props.connected ? "Connected" : "Needs setup",
      detail: "Web browser builds can use MetaMask, Rabby, or another injected wallet when the extension injects into the page. Desktop app builds do not get browser extension injection; use an external signer now, with WalletConnect or deep-link bridge support as the next wallet path.",
      tone: props.connected ? "text-emerald-300 bg-emerald-500/10" : "text-sky-300 bg-sky-500/10",
    },
    {
      label: "Bittensor",
      status: "External signer",
      detail: "Use public SS58/coldkey reads here; stake, transfer, and receipt flows stay unsigned until you review elsewhere.",
      tone: "text-cyan-300 bg-cyan-500/10",
    },
    {
      label: "Hyperliquid",
      status: "Preview only",
      detail: "Read orderbooks, exposure, and funding context. Live market submission remains off in Matterhorn.",
      tone: "text-blue-300 bg-blue-500/10",
    },
    {
      label: "Polymarket",
      status: "Preview only",
      detail: "Research markets, compliance, liquidity, and handoff context. Bet placement stays outside Matterhorn.",
      tone: "text-violet-300 bg-violet-500/10",
    },
  ];

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-dls-surface-muted/30 px-3 py-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-dls-secondary">Protocol support</h4>
        <p className="mt-1 text-xs leading-5 text-dls-secondary">
          One wallet surface, different safety boundary per desk. Matterhorn never stores keys, API secrets, raw signatures, signed payloads, or wallet exports.
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

function WalletRuntimeExplainer(props: { compact?: boolean }) {
  const rows = [
    {
      label: "Web browser",
      detail: "Injected wallets such as MetaMask or Rabby can appear when their extension is installed and allowed on the Matterhorn page.",
    },
    {
      label: "Desktop app",
      detail: "Browser wallet extensions do not inject into Electron. Desktop users should use the external signer flow today; WalletConnect or deep-link bridge support is the planned native wallet path.",
    },
    {
      label: "Remote worker",
      detail: "A remote worker can read public data and prepare previews, but signing still happens in the user's own wallet or protocol client.",
    },
  ];

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
            Matterhorn keeps wallet behavior explicit so web and desktop users know where signing actually happens.
          </p>
        </div>
      </div>
      <div className="mt-3 divide-y divide-sky-400/15">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 py-2 text-xs leading-5">
            <span className="font-medium text-dls-text">{row.label}</span>
            <span className="text-dls-secondary">{row.detail}</span>
          </div>
        ))}
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

  if (compact) {
    return (
      <SettingsStack className="matterhorn-wallet-rail max-w-none gap-4">
        <section className="flex flex-col gap-3 border-b border-dls-border/45 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-dls-text">Matterhorn Wallet</h3>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                One wallet surface for EVM handoffs. Bittensor still uses public SS58 reads and external signing.
              </p>
            </div>
            <span className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium",
              state.isConnected
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-sky-500/30 bg-sky-500/10 text-sky-300",
            )}>
              {state.isConnected ? "Connected" : "Needs setup"}
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
                  Install or enable MetaMask, Rabby, or another injected wallet in this runtime. You can still use public Bittensor reads and market previews without connecting one.
                </p>
              </div>
            )}
          </section>
        )}

        <WalletProtocolSupportMap connected={state.isConnected} />
        <WalletRuntimeExplainer compact />

        <WalletBoundaryList />
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
              Connect an EVM wallet for supported handoff flows. Bittensor coldkeys/hotkeys still use external Bittensor-compatible signing, and Matterhorn never asks for seed phrases or private keys.
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
                <Wallet className="size-8 mx-auto mb-2 text-gray-8" />
                <p className="text-sm text-gray-8">
                  No EVM wallet connectors detected. Install or enable an injected browser wallet such as MetaMask or Rabby in this runtime.
                </p>
                <p className="mt-2 text-xs text-gray-9">
                  Public Bittensor reads, Hyperliquid previews, and Polymarket previews still work without connecting an EVM wallet.
                </p>
              </div>
            )}
          </div>
        </SettingsSection>
        <SettingsSection>
          <SettingsSectionHeader>
            <SettingsSectionHeaderTitle>Safety boundaries</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              What this wallet surface can and cannot do today.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeader>
          <WalletProtocolSupportMap connected={state.isConnected} />
          <WalletRuntimeExplainer />
          <WalletBoundaryList />
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
