/** @jsxImportSource react */
import { useState, useEffect } from "react";
import { Send, User, Wallet, ArrowUpRight, CheckCircle, Star, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";
import { useAddressBook } from "../hooks/useAddressBook";
import { TokenIcon } from "../components/TokenIcon";
import { useEnsResolution } from "../hooks/useEnsResolution";

const NATIVE_OPTION = { symbol: "ETH", address: "native" as const, decimals: 18 };

const TOKEN_ICONS: Record<string, { color: string; bg: string }> = {
  ETH: { color: "text-blue-400", bg: "bg-blue-500/10" },
  USDC: { color: "text-sky-400", bg: "bg-sky-500/10" },
  WETH: { color: "text-blue-400", bg: "bg-blue-500/10" },
};

export default function TransferPanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const { addresses, toggleFavorite } = useAddressBook();
  const [token, setToken] = useState<"native" | string>("native");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAddressBook, setShowAddressBook] = useState(false);

  const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
  const tokenList = registry
    ? [NATIVE_OPTION, ...Object.entries(registry).map(([symbol, meta]) => ({ symbol, address: meta.address, decimals: meta.decimals }))]
    : [NATIVE_OPTION];

  const selectedMeta = token === "native" ? NATIVE_OPTION : tokenList.find((t) => t.address === token);
  const maxAmount =
    selectedMeta && state.address
      ? selectedMeta.symbol === "ETH"
        ? Number(state.ethBalance ?? 0)
        : selectedMeta.symbol === "USDC"
          ? Number(state.usdcBalance ?? 0)
          : 0
      : 0;

  const { resolvedAddress, resolvedName, resolvedFor, isResolving, resolve } = useEnsResolution();

  const [error, setError] = useState<string | null>(null);

  // Debounce ENS resolution
  useEffect(() => {
    const timer = setTimeout(() => {
      resolve(to);
    }, 400);
    return () => clearTimeout(timer);
  }, [to, resolve]);

  const normalizedRecipient = to.trim();
  const hasFreshResolution = resolvedFor === normalizedRecipient;
  const effectiveAddress = resolvedFor === normalizedRecipient && resolvedAddress
    ? resolvedAddress
    : normalizedRecipient.startsWith("0x") && normalizedRecipient.length === 42
      ? normalizedRecipient
      : "";

  const handleSend = async () => {
    if (!selectedMeta || !state.address || !state.chainId || !effectiveAddress) return;
    setError(null);
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** selectedMeta.decimals));
      const res = await fetch("/api/transfer/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: state.chainId,
          token: selectedMeta.address,
          to: effectiveAddress,
          amount: raw,
        }),
      });
      const json = await res.json();
      if (json.success) {
        store.requestApproval(json.to, json.value, json.data, state.chainId, "transfer", "low");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto animate-fade-in">
      {/* Header */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
            <Send className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dls-text">Send</h2>
            <p className="text-xs text-dls-secondary">Same-chain transfer</p>
          </div>
        </div>
      </div>

      {/* Token selector */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="ow-section-heading">Select Token</div>
        <div className="flex gap-2 flex-wrap">
          {tokenList.map((t) => {
            const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
            const meta = registry?.[t.symbol];
            return (
              <button
                key={t.address}
                onClick={() => setToken(t.address)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors",
                  token === t.address
                    ? "bg-violet-500/15 text-violet-100"
                    : "bg-dls-surface-muted/15 text-dls-text hover:bg-dls-hover/45"
                )}
              >
                <TokenIcon symbol={t.symbol} logoUrl={meta?.logoUrl} size="sm" />
                {t.symbol}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recipient */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="ow-section-heading">Recipient</div>
        <div className="relative">
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x... or vitalik.eth"
            className="h-12 bg-dls-surface border-dls-border text-dls-text text-sm font-mono pr-28"
          />
          {isResolving && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-dls-secondary">
              <div className="size-3.5 rounded-full border-2 border-dls-border border-t-violet-400 animate-spin" />
              ENS
            </div>
          )}
          {!isResolving && hasFreshResolution && resolvedName && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-medium truncate max-w-[100px]">
              {resolvedName}
            </div>
          )}
          {!isResolving && hasFreshResolution && to.includes(".") && !resolvedAddress && to.length > 3 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-red-400 font-medium">
              Not found
            </div>
          )}
        </div>
        {hasFreshResolution && resolvedAddress && (
          <div className="flex items-center gap-2 text-xs text-dls-secondary">
            <div className="flex size-5 items-center justify-center rounded-md bg-emerald-500/10">
              <CheckCircle className="size-3 text-emerald-400" />
            </div>
            <span className="font-mono">{resolvedAddress}</span>
          </div>
        )}
        {showAddressBook && addresses.length > 0 && (
          <div className="space-y-1 rounded-lg border border-dls-border bg-dls-surface p-2">
            {addresses.map((a) => (
              <button
                key={a.address}
                onClick={() => { setTo(a.address); setShowAddressBook(false); }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs text-dls-text hover:bg-dls-hover transition-colors flex items-center gap-2"
              >
                <div className="flex size-6 items-center justify-center rounded-md bg-violet-500/10">
                  <User className="size-3 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{a.name}</span>
                  {a.ensName && <span className="text-emerald-400 ml-1.5 text-[11px] font-medium">{a.ensName}</span>}
                  {a.favorite && <Star className="size-3 text-amber-400 inline ml-1 fill-amber-400" />}
                  {a.group && <span className="text-[10px] text-dls-secondary ml-1.5 bg-dls-hover px-1.5 py-0.5 rounded">{a.group}</span>}
                  <span className="text-dls-secondary ml-2 font-mono">{a.address.slice(0, 6)}...{a.address.slice(-4)}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(a.address); }}
                  className="p-1 rounded-md hover:bg-dls-hover transition-colors"
                  title={a.favorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <Star className={cn("size-3.5", a.favorite ? "text-amber-400 fill-amber-400" : "text-dls-secondary")} />
                </button>
                <ArrowUpRight className="size-3 text-dls-secondary" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="ow-section-heading">Amount</div>
          <button
            onClick={() => maxAmount > 0 && setAmount(String(maxAmount))}
            disabled={maxAmount <= 0}
            className={cn(
              "text-xs font-medium transition-colors",
              maxAmount > 0 ? "text-violet-400 hover:text-violet-300" : "text-dls-secondary cursor-not-allowed"
            )}
          >
            {maxAmount > 0 ? `Max: ${maxAmount.toFixed(4)} ${selectedMeta?.symbol}` : "Balance unavailable"}
          </button>
        </div>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`0 ${selectedMeta?.symbol ?? "ETH"}`}
          className="h-14 bg-dls-surface border-dls-border text-dls-text text-xl font-mono"
        />
        <div className="flex items-center gap-2 text-xs text-dls-secondary">
          <Wallet className="size-3" />
          <span>{selectedMeta?.symbol === "ETH" ? state.ethBalance ?? "0.00" : state.usdcBalance ?? "0.00"} {selectedMeta?.symbol} available</span>
        </div>
      </div>

      {/* Review + Send */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-300">
          <div className="flex size-5 items-center justify-center rounded-md bg-red-500/10">
            <span className="text-red-400 font-bold">!</span>
          </div>
          {error}
        </div>
      )}
      <Button
        onClick={handleSend}
        disabled={loading || !to || !amount || Number(amount) <= 0}
        className="w-full h-12 font-semibold"
      >
        <Send className="size-4 mr-1.5" />
        {loading ? "Building..." : `Send ${selectedMeta?.symbol ?? "ETH"}`}
      </Button>
    </div>
  );
}
