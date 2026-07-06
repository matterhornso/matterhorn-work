/** @jsxImportSource react */
import { useState, useEffect } from "react";
import { ExternalLink, ArrowRightLeft, Fuel, Clock, User, Wallet, ArrowUpRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";
import { useAddressBook } from "../hooks/useAddressBook";

import { useEnsResolution } from "../hooks/useEnsResolution";

type ChainOption = { id: number; name: string; color: string };

const CHAINS: ChainOption[] = [
  { id: 8453, name: "Base", color: "text-blue-400" },
  { id: 1, name: "Ethereum", color: "text-violet-400" },
  { id: 42161, name: "Arbitrum", color: "text-sky-400" },
];

export default function BridgePanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const { addresses } = useAddressBook();
  const { resolvedAddress, resolvedName, isResolving, resolve } = useEnsResolution();
  const [fromChain, setFromChain] = useState<number>(8453);
  const [toChain, setToChain] = useState<number>(42161);
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [recipient, setRecipient] = useState("");
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quoteData, setQuoteData] = useState<{ fee: string; time: string; receiveAmount: string; totalSent: string; quoteTimestamp: number } | null>(null);

  const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
  const tokens = registry ? Object.entries(registry).map(([symbol, meta]) => ({ symbol, address: meta.address, decimals: meta.decimals })) : [];

  const effectiveRecipient = resolvedAddress || (recipient.startsWith("0x") && recipient.length === 42 ? recipient : "");

  // Debounce ENS resolution
  useEffect(() => {
    const timer = setTimeout(() => {
      resolve(recipient);
    }, 400);
    return () => clearTimeout(timer);
  }, [recipient, resolve]);

  const handleEstimate = async () => {
    if (!amount || !effectiveRecipient || !state.chainId) return;
    setLoading(true);
    try {
      const meta = tokens.find((t) => t.symbol === selectedToken);
      if (!meta) return;
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch(
        `/api/bridge/quote?originChainId=${fromChain}&destinationChainId=${toChain}&originToken=${meta.address}&amount=${raw}&recipient=${effectiveRecipient}`,
      );
      const json = await res.json();
      if (json.success) {
        setQuoteData({
          fee: json.fee,
          time: json.time,
          receiveAmount: json.receiveAmount,
          totalSent: json.totalSent,
          quoteTimestamp: Math.floor(Date.now() / 1000),
        });
      }
    } finally { setLoading(false); }
  };

  const handleBridge = async () => {
    if (!quoteData || !effectiveRecipient || !state.chainId) return;
    const meta = tokens.find((t) => t.symbol === selectedToken);
    if (!meta) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch("/api/bridge/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: fromChain,
          destinationChainId: toChain,
          inputToken: meta.address,
          outputToken: meta.address,
          inputAmount: raw,
          outputAmount: quoteData.receiveAmount,
          recipient: effectiveRecipient,
          quoteTimestamp: quoteData.quoteTimestamp,
        }),
      });
      const json = await res.json();
      if (json.success) {
        store.requestApproval(json.to, json.value, json.data, state.chainId, "across_bridge", "medium");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto animate-fade-in">
      {/* Header */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-dls-surface-muted/35 text-primary">
            <ExternalLink className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dls-text">Bridge</h2>
            <p className="text-xs text-dls-secondary">Cross-chain transfers</p>
          </div>
        </div>
      </div>

      <div className="ow-soft-card p-4 space-y-4">
        {/* Chain selector */}
        <div className="space-y-2">
          <div className="ow-section-heading">Route</div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
            <div className="space-y-1">
              <div className="text-[10px] text-dls-secondary uppercase tracking-wider">From</div>
              <select
                className="w-full h-11 rounded-xl bg-dls-surface border border-dls-border px-3 text-sm text-dls-text font-medium appearance-none cursor-pointer hover:border-blue-500/30 transition-colors"
                value={fromChain}
                onChange={(e) => setFromChain(Number(e.target.value))}
              >
                {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-center">
              <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/10">
                <ArrowRightLeft className="size-4 text-blue-400" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] text-dls-secondary uppercase tracking-wider">To</div>
              <select
                className="w-full h-11 rounded-xl bg-dls-surface border border-dls-border px-3 text-sm text-dls-text font-medium appearance-none cursor-pointer hover:border-blue-500/30 transition-colors"
                value={toChain}
                onChange={(e) => setToChain(Number(e.target.value))}
              >
                {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="ow-section-heading">Token & Amount</div>
          <div className="flex gap-2">
            <select
              className="h-11 rounded-xl bg-dls-surface border border-dls-border px-3 text-sm text-dls-text font-medium appearance-none cursor-pointer hover:border-blue-500/30 transition-colors shrink-0 w-28"
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
            >
              {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
            <Input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 h-11 bg-dls-surface border-dls-border text-dls-text text-lg font-mono"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="ow-section-heading">Recipient</div>
          <div className="relative">
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x... or vitalik.eth"
              className="h-11 bg-dls-surface border-dls-border text-dls-text text-sm font-mono pr-28"
            />
            {isResolving && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-dls-secondary">
                <div className="size-3.5 rounded-full border-2 border-dls-border border-t-blue-400 animate-spin" />
                ENS
              </div>
            )}
            {!isResolving && resolvedName && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-medium truncate max-w-[100px]">
                {resolvedName}
              </div>
            )}
            {!isResolving && recipient.includes(".") && !resolvedAddress && recipient.length > 3 && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-red-400 font-medium">
                Not found
              </div>
            )}
          </div>
          {effectiveRecipient && (
            <div className="flex items-center gap-2 text-xs text-dls-secondary">
              <div className="flex size-5 items-center justify-center rounded-md bg-emerald-500/10">
                <CheckCircle className="size-3 text-emerald-400" />
              </div>
              <span className="font-mono">{effectiveRecipient}</span>
            </div>
          )}
          {showAddressBook && addresses.length > 0 && (
            <div className="space-y-1 rounded-xl border border-dls-border bg-dls-surface p-2">
              {addresses.map((a) => (
                <button
                  key={a.address}
                  onClick={() => { setRecipient(a.address); setShowAddressBook(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-dls-text hover:bg-dls-hover transition-colors flex items-center gap-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md bg-blue-500/10">
                    <User className="size-3 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{a.name}</span>
                    {a.ensName && <span className="text-emerald-400 ml-1.5 text-[11px] font-medium">{a.ensName}</span>}
                    <span className="text-dls-secondary ml-2 font-mono">{a.address.slice(0, 6)}...{a.address.slice(-4)}</span>
                  </div>
                  <ArrowUpRight className="size-3 text-dls-secondary" />
                </button>
              ))}
            </div>
          )}
        </div>

        {quoteData && (
          <div className="ow-soft-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <Clock className="size-4 text-emerald-400" />
              </div>
              <span className="text-sm font-semibold text-dls-text">Quote ready</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-dls-secondary">You send</span>
                <span className="text-dls-text font-mono font-semibold">{amount} {selectedToken}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dls-secondary flex items-center gap-1">
                  <Fuel className="size-3" /> Fee
                </span>
                <span className="text-dls-text font-mono">{quoteData.fee}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dls-secondary flex items-center gap-1">
                  <Clock className="size-3" /> Time
                </span>
                <span className="text-dls-text">{quoteData.time}</span>
              </div>
              <div className="pt-2 border-t border-dls-border flex items-center justify-between">
                <span className="text-dls-secondary">Recipient gets</span>
                <span className="text-emerald-400 font-mono font-bold text-base">
                  {(() => {
                    const meta = tokens.find((t) => t.symbol === selectedToken);
                    const dec = meta ? meta.decimals : 18;
                    return (Number(quoteData.receiveAmount) / 10 ** dec).toFixed(dec >= 8 ? 6 : 4);
                  })()} {selectedToken}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 h-12 rounded-xl border-dls-border hover:bg-dls-hover"
          onClick={handleEstimate}
          disabled={loading || !amount || !effectiveRecipient}
        >
          {loading ? "Getting quote..." : "Get Quote"}
        </Button>
        <Button
          className="flex-1 h-12 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20"
          onClick={handleBridge}
          disabled={!amount || !quoteData || !effectiveRecipient}
        >
          <ExternalLink className="size-4 mr-1.5" /> Bridge
        </Button>
      </div>
    </div>
  );
}
