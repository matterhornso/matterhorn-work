/** @jsxImportSource react */
import { useState } from "react";
import { ExternalLink, ArrowRightLeft, Fuel, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";
import { useAddressBook } from "../hooks/useAddressBook";

type ChainOption = { id: number; name: string };

const CHAINS: ChainOption[] = [
  { id: 8453, name: "Base" },
  { id: 1, name: "Ethereum" },
  { id: 42161, name: "Arbitrum" },
];

export default function BridgePanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const { addresses } = useAddressBook();
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

  const handleEstimate = async () => {
    if (!amount || !recipient || !state.chainId) return;
    setLoading(true);
    try {
      const meta = tokens.find((t) => t.symbol === selectedToken);
      if (!meta) return;
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch(
        `/api/bridge/quote?originChainId=${fromChain}&destinationChainId=${toChain}&originToken=${meta.address}&amount=${raw}&recipient=${recipient}`,
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
    if (!quoteData || !recipient || !state.chainId) return;
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
          recipient,
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
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
          <ArrowRightLeft className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-dls-text">Bridge</h2>
          <p className="text-xs text-dls-secondary">Cross-chain transfers</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">From</label>
            <select className="w-full h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text" value={fromChain} onChange={(e) => setFromChain(Number(e.target.value))}>
              {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">To</label>
            <select className="w-full h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text" value={toChain} onChange={(e) => setToChain(Number(e.target.value))}>
              {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Token</label>
          <select className="w-full h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text" value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
            {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Amount</label>
          <Input type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 bg-dls-surface border-dls-border text-dls-text" />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Recipient</label>
            {addresses.length > 0 && (
              <button
                onClick={() => setShowAddressBook(!showAddressBook)}
                className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                <User className="size-3" />
                {showAddressBook ? "Hide" : "Address book"}
              </button>
            )}
          </div>
          <Input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="h-10 bg-dls-surface border-dls-border text-dls-text text-sm"
          />
          {showAddressBook && addresses.length > 0 && (
            <div className="mt-1 space-y-1 rounded-lg border border-dls-border bg-dls-surface p-2">
              {addresses.map((a) => (
                <button
                  key={a.address}
                  onClick={() => { setRecipient(a.address); setShowAddressBook(false); }}
                  className="w-full text-left px-2 py-1.5 rounded-md text-xs text-dls-text hover:bg-dls-hover transition-colors"
                >
                  <span className="font-medium">{a.name}</span>
                  <span className="text-dls-secondary ml-2">{a.address.slice(0, 6)}...{a.address.slice(-4)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {quoteData && (
          <div className="rounded-lg border border-dls-border bg-dls-surface p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-dls-secondary">You send</span>
              <span className="text-dls-text font-mono">{amount} {selectedToken}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dls-secondary flex items-center gap-1"><Fuel className="size-3" /> Fee</span>
              <span className="text-dls-text font-mono">{quoteData.fee}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dls-secondary flex items-center gap-1"><Clock className="size-3" /> Time</span>
              <span className="text-dls-text">{quoteData.time}</span>
            </div>
            <div className="pt-2 border-t border-dls-border flex items-center justify-between">
              <span className="text-dls-secondary">Recipient gets</span>
              <span className="text-emerald-400 font-mono font-medium">
                {(() => {
                  const meta = tokens.find((t) => t.symbol === selectedToken);
                  const dec = meta ? meta.decimals : 18;
                  return (Number(quoteData.receiveAmount) / 10 ** dec).toFixed(dec >= 8 ? 6 : 4);
                })()} {selectedToken}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-10" onClick={handleEstimate} disabled={loading || !amount || !recipient}>
          {loading ? "..." : "Estimate"}
        </Button>
        <Button className="flex-1 h-10 bg-blue-500 hover:bg-blue-600 text-white" onClick={handleBridge} disabled={!amount || !quoteData || !recipient}>
          <ExternalLink className="size-4 mr-1.5" /> Bridge
        </Button>
      </div>
    </div>
  );
}
