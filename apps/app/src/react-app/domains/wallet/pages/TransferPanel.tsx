/** @jsxImportSource react */
import { useState } from "react";
import { Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";
import { useAddressBook } from "../hooks/useAddressBook";

const NATIVE_OPTION = { symbol: "ETH", address: "native" as const, decimals: 18 };

export default function TransferPanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const { addresses } = useAddressBook();
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

  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!selectedMeta || !state.address || !state.chainId || !to || !amount) return;
    if (!to.startsWith("0x") || to.length !== 42) {
      setError("Invalid recipient address. Please enter a valid 0x address.");
      return;
    }
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
          to,
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
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10">
          <Send className="size-5 text-violet-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-dls-text">Send</h2>
          <p className="text-xs text-dls-secondary">Same-chain transfer</p>
        </div>
      </div>

      {/* Token selector */}
      <div className="space-y-1">
        <label className="text-xs text-dls-secondary">Token</label>
        <div className="flex gap-2 flex-wrap">
          {tokenList.map((t) => (
            <button
              key={t.address}
              onClick={() => setToken(t.address)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                token === t.address
                  ? "bg-violet-500 text-white border-violet-500"
                  : "bg-dls-surface text-dls-secondary border-dls-border hover:text-dls-text"
              )}
            >
              {t.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Recipient */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <label className="text-xs text-dls-secondary">Recipient</label>
          {addresses.length > 0 && (
            <button
              onClick={() => setShowAddressBook(!showAddressBook)}
              className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
            >
              <User className="size-3" />
              {showAddressBook ? "Hide" : "Address book"}
            </button>
          )}
        </div>
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="0x..."
          className="bg-dls-surface border-dls-border text-dls-text text-sm"
        />
        {showAddressBook && addresses.length > 0 && (
          <div className="mt-1 space-y-1 rounded-lg border border-dls-border bg-dls-surface p-2">
            {addresses.map((a) => (
              <button
                key={a.address}
                onClick={() => { setTo(a.address); setShowAddressBook(false); }}
                className="w-full text-left px-2 py-1.5 rounded-md text-xs text-dls-text hover:bg-dls-hover transition-colors"
              >
                <span className="font-medium">{a.name}</span>
                <span className="text-dls-secondary ml-2">{a.address.slice(0, 6)}...{a.address.slice(-4)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <label className="text-xs text-dls-secondary">Amount</label>
          <button
            onClick={() => maxAmount > 0 && setAmount(String(maxAmount))}
            disabled={maxAmount <= 0}
            className={cn(
              "text-xs",
              maxAmount > 0 ? "text-violet-400 hover:text-violet-300" : "text-dls-secondary cursor-not-allowed"
            )}
          >
            {maxAmount > 0 ? `Max: ${maxAmount.toFixed(4)} ${selectedMeta?.symbol}` : `Balance unavailable`}
          </button>
        </div>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`0 ${selectedMeta?.symbol ?? "ETH"}`}
          className="bg-dls-surface border-dls-border text-dls-text"
        />
      </div>

      {/* Review + Send */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}
      <Button
        onClick={handleSend}
        disabled={loading || !to || !amount || Number(amount) <= 0}
        className="w-full bg-violet-500 hover:bg-violet-600 text-white mt-2"
      >
        {loading ? "Building..." : `Send ${selectedMeta?.symbol ?? "ETH"}`}
      </Button>
    </div>
  );
}
