/** @jsxImportSource react */
import { useState } from "react";
import { ExternalLink, ArrowRightLeft, Fuel, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";

type ChainOption = { id: number; name: string };

const CHAINS: ChainOption[] = [
  { id: 8453, name: "Base" },
  { id: 1, name: "Ethereum" },
  { id: 42161, name: "Arbitrum" },
];

export default function BridgePanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const [fromChain, setFromChain] = useState<number>(8453);
  const [toChain, setToChain] = useState<number>(42161);
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [loading, setLoading] = useState(false);
  const [quoteData, setQuoteData] = useState<{ fee: string; time: string; receiveAmount: string; totalSent: string; quoteTimestamp: number } | null>(null);

  const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
  const tokens = registry ? Object.entries(registry).map(([symbol, meta]) => ({ symbol, address: meta.address, decimals: meta.decimals })) : [];

  const handleEstimate = async () => {
    if (!amount || !state.address || !state.chainId) return;
    setLoading(true);
    try {
      const meta = tokens.find((t) => t.symbol === selectedToken);
      if (!meta) return;
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch(
        `/api/bridge/quote?originChainId=${fromChain}&destinationChainId=${toChain}&originToken=${meta.address}&amount=${raw}&recipient=${state.address}`,
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
    if (!quoteData || !state.address || !state.chainId) return;
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
          recipient: state.address,
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

        {quoteData && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
              <Fuel className="size-3 text-dls-secondary" />
              <div className="text-dls-text">Fee: {quoteData.fee}</div>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
              <Clock className="size-3 text-dls-secondary" />
              <div className="text-dls-text">Time: {quoteData.time}</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-10" onClick={handleEstimate} disabled={loading || !amount}>
          Estimate
        </Button>
        <Button className="flex-1 h-10 bg-blue-500 hover:bg-blue-600 text-white" onClick={handleBridge} disabled={!amount || !quoteData}>
          <ExternalLink className="size-4 mr-1.5" /> Bridge
        </Button>
      </div>
    </div>
  );
}
