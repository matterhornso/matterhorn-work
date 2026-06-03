/** @jsxImportSource react */
import { useState, useCallback } from "react";
import { TrendingUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";

const COW_LOGO = (
  <svg viewBox="0 0 24 24" className="size-5" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M8 12c0-2 1.5-4 4-4s4 2 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type CowQuoteData = {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  validTo: number;
} | null;

export default function CowSwapPanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const [sellAmount, setSellAmount] = useState("");
  const [selectedSell, setSelectedSell] = useState("USDC");
  const [selectedBuy, setSelectedBuy] = useState("WETH");
  const [quote, setQuote] = useState<CowQuoteData>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
  const tokens = registry ? Object.entries(registry).map(([symbol, meta]) => ({ symbol, address: meta.address, decimals: meta.decimals })) : [];

  const handleGetQuote = useCallback(async () => {
    if (!state.chainId || !state.address || !sellAmount) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const sellMeta = tokens.find((t) => t.symbol === selectedSell);
      const buyMeta = tokens.find((t) => t.symbol === selectedBuy);
      if (!sellMeta || !buyMeta) throw new Error("Token not found");
      const rawAmount = String(Math.round(Number(sellAmount) * 10 ** sellMeta.decimals));
      const res = await fetch(
        `/api/cow/quote?chainId=${state.chainId}&sellToken=${sellMeta.address}&buyToken=${buyMeta.address}&sellAmount=${rawAmount}&receiver=${state.address}`,
      );
      const json = await res.json();
      if (json.success) {
        setQuote(json.quote);
        setQuoteId(json.quoteId ?? null);
      } else {
        setError(json.error ?? "Quote failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote request failed");
    } finally {
      setLoading(false);
    }
  }, [state.chainId, state.address, sellAmount, selectedSell, selectedBuy, tokens]);

  const handleSubmit = useCallback(() => {
    if (!quote || !state.address) return;
    const order = { ...quote, from: state.address, signingScheme: "eip712" as const };
    alert(`Order ready!\n${JSON.stringify(order, null, 2)}`);
  }, [quote, state.address]);

  const sellDecimals = tokens.find((t) => t.symbol === selectedSell)?.decimals ?? 18;
  const buyDecimals = tokens.find((t) => t.symbol === selectedBuy)?.decimals ?? 18;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
          {COW_LOGO}
        </div>
        <div>
          <h2 className="text-base font-semibold text-dls-text">CoW Swap</h2>
          <p className="text-xs text-dls-secondary">MEV-protected batch auctions</p>
        </div>
      </div>

      {/* Sell */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Sell</label>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text focus:outline-none focus:ring-1 focus:ring-violet-500"
            value={selectedSell}
            onChange={(e) => setSelectedSell(e.target.value)}
          >
            {tokens.map((t) => (
              <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
            ))}
          </select>
          <Input
            type="number"
            placeholder="0.0"
            value={sellAmount}
            onChange={(e) => setSellAmount(e.target.value)}
            className="flex-1 h-10 bg-dls-surface border-dls-border text-dls-text"
          />
        </div>
      </div>

      {/* Buy */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Buy</label>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text focus:outline-none focus:ring-1 focus:ring-violet-500"
            value={selectedBuy}
            onChange={(e) => setSelectedBuy(e.target.value)}
          >
            {tokens.map((t) => (
              <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
            ))}
          </select>
          <div className="flex-1 h-10 flex items-center rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text">
            {quote ? (Number(quote.buyAmount) / 10 ** buyDecimals).toFixed(6) : "—"}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {quote && (
        <div className="space-y-2 rounded-xl border border-dls-border bg-dls-surface p-3">
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Shield className="size-3" />
            <span>MEV Protected</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-dls-secondary mb-0.5">You Sell</div>
              <div className="font-mono text-dls-text">{(Number(quote.sellAmount) / 10 ** sellDecimals).toFixed(4)} {selectedSell}</div>
            </div>
            <div>
              <div className="text-dls-secondary mb-0.5">You Receive</div>
              <div className="font-mono text-dls-text">{(Number(quote.buyAmount) / 10 ** buyDecimals).toFixed(6)} {selectedBuy}</div>
            </div>
            <div>
              <div className="text-dls-secondary mb-0.5">Fee</div>
              <div className="font-mono text-dls-text">{(Number(quote.feeAmount) / 10 ** sellDecimals).toFixed(4)}</div>
            </div>
            <div>
              <div className="text-dls-secondary mb-0.5">Valid Until</div>
              <div className="font-mono text-dls-text">{new Date(quote.validTo * 1000).toLocaleTimeString()}</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 h-10"
          onClick={handleGetQuote}
          disabled={loading || !sellAmount}
        >
          <TrendingUp className="size-4 mr-1.5" />
          Get Quote
        </Button>
        <Button
          className={cn("flex-1 h-10 bg-violet-500 hover:bg-violet-600 text-white", !quote && "opacity-50 cursor-not-allowed")}
          onClick={handleSubmit}
          disabled={loading || !quote}
        >
          Submit Order
        </Button>
      </div>
    </div>
  );
}
