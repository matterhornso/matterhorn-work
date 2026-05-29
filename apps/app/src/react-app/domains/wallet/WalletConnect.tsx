/** @jsxImportSource react */
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { Copy, ExternalLink, LogOut, Wallet } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WalletStore } from "./state/wallet-store";
import { useWalletStore } from "./state/wallet-store";
import { CHAIN_NAMES } from "../../infra/chains";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export type WalletConnectProps = {
  store: WalletStore;
};

export function WalletConnect({ store }: WalletConnectProps) {
  const state = useWalletStore(store);
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const handleConnect = (connectorName: string) => {
    store.setConnecting(true);
    const connector = connectors.find((c) => c.name === connectorName || c.id === connectorName);
    if (connector) {
      connect({ connector });
    }
  };

  const handleDisconnect = () => {
    disconnect();
    store.disconnect();
    setOpen(false);
  };

  const chainName = state.chainId ? CHAIN_NAMES[state.chainId] ?? "Unknown Chain" : null;

  if (!state.isConnected) {
    return (
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(!open)}
          disabled={state.isConnecting}
          className="gap-2"
        >
          <Wallet className="size-4" />
          {state.isConnecting ? "Connecting..." : "Connect Wallet"}
        </Button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-dls-border bg-dls-sidebar p-2 shadow-lg">
            {connectors.map((connector) => (
              <button
                key={connector.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-10 hover:bg-dls-surface hover:text-dls-text transition-colors"
                onClick={() => {
                  handleConnect(connector.id);
                  setOpen(false);
                }}
              >
                {connector.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
          "border border-dls-border bg-dls-sidebar text-gray-10 hover:bg-dls-surface",
        )}
        onClick={() => setOpen(!open)}
      >
        {chainName && (
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-8">{chainName}</span>
          </span>
        )}
        <span className="font-mono">{state.address ? truncateAddress(state.address) : ""}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-dls-border bg-dls-sidebar p-2 shadow-lg">
          <div className="border-b border-dls-border px-3 py-2">
            <div className="text-xs text-gray-8">Connected with {state.connector}</div>
            <div className="font-mono text-sm text-gray-10">{state.address ? truncateAddress(state.address) : ""}</div>
          </div>
          <div className="space-y-1 py-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-10 hover:bg-dls-surface hover:text-dls-text transition-colors"
              onClick={() => {
                if (state.address) {
                  navigator.clipboard.writeText(state.address);
                }
                setOpen(false);
              }}
            >
              <Copy className="size-4" />
              Copy Address
            </button>
            {chainId && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-10 hover:bg-dls-surface hover:text-dls-text transition-colors"
                onClick={() => {
                  switchChain?.({ chainId: chainId === 8453 ? 84532 : 8453 });
                  setOpen(false);
                }}
              >
                <ExternalLink className="size-4" />
                Switch to {chainId === 8453 ? "Base Sepolia" : "Base"}
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-dls-surface hover:text-red-300 transition-colors"
              onClick={handleDisconnect}
            >
              <LogOut className="size-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
      {state.error && (
        <div className="absolute right-0 top-full z-50 mt-1 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-400">
          {state.error}
        </div>
      )}
    </div>
  );
}
