/** @jsxImportSource react */
import { useState, useCallback } from "react";
import { TrendingUp, Shield, Zap, ArrowRightLeft, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";
import { useSignTypedData } from "wagmi";

const COW_LOGO = (
  <svg viewBox="0 0 24 24" className="size-5" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M8 12c0-2 1.5-4 4-4s4 2 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const TOKEN_ICONS: Record<string, { color: string; bg: string }> = {
  USDC: { color: "text-sky-400", bg: "bg-sky-500/10" },
  WETH: { color: "text-blue-400", bg: "bg-blue-500/10" },
  ETH: { color: "text-blue-400", bg: "bg-blue-500/10" },
  cbETH: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
};

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
  const { signTypedDataAsync } = useSignTypedData();

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

  const handleSubmit = useCallback(async () => {
    if (!quote || !state.address || !quoteId || !state.chainId) return;
    try {
      const domain = {
        name: "Gnosis Protocol",
        version: "v2",
        chainId: state.chainId,
        verifyingContract: "0x9008D19f58AAbd9eD0D60971565AA8510560ab41" as `0x${string}`,
      };
      const types = {
        Order: [
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "receiver", type: "address" },
          { name: "sellAmount", type: "uint256" },
          { name: "buyAmount", type: "uint256" },
          { name: "validTo", type: "uint32" },
          { name: "appData", type: "bytes32" },
          { name: "feeAmount", type: "uint256" },
          { name: "kind", type: "string" },
          { name: "partiallyFillable", type: "bool" },
          { name: "sellTokenBalance", type: "string" },
          { name: "buyTokenBalance", type: "string" },
        ],
      };
      const message = {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        receiver: state.address,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        validTo: quote.validTo,
        appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
        feeAmount: quote.feeAmount,
        kind: "sell",
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      };
      const signature = await signTypedDataAsync({ domain, types, message, primaryType: "Order" });
      const res = await fetch("/api/cow/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: state.chainId,
          order: { ...quote, from: state.address, signingScheme: "eip712" },
          signature,
        }),
      });
      const json = await res.json();
      if (json.success) {
        store.setError?.(`Order submitted! ID: ${json.orderId}`);
      } else {
        setError(json.error ?? "Submission failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    }
  }, [quote, state.address, state.chainId, quoteId, signTypedDataAsync]);

  const sellDecimals = tokens.find((t) => t.symbol === selectedSell)?.decimals ?? 18;
  const buyDecimals = tokens.find((t) => t.symbol === selectedBuy)?.decimals ?? 18;

  return (
    <div className="flex flex-col gap-4 p-4 animate-fade-in">
      {/* Header */}
      <div className="ow-glass-card ow-glow-border p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/20">
            <ArrowRightLeft className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dls-text">CoW Swap</h2>
            <p className="text-xs text-dls-secondary">MEV-protected batch auctions</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10">
            <Shield className="size-3.5 text-emerald-400" />
          </div>
          <span className="text-xs text-emerald-300">MEV protected — No slippage front-running</span>
        </div>
      </div>

      <div className="ow-glass-card p-4 space-y-4">
        <div className="space-y-2">
          <div className="ow-section-heading">Sell</div>
          <div className="flex gap-2">
            <select
              className="h-11 rounded-xl bg-dls-surface border border-dls-border px-3 text-sm text-dls-text font-medium appearance-none cursor-pointer hover:border-emerald-500/30 transition-colors shrink-0 w-28"
              value={selectedSell}
              onChange={(e) => setSelectedSell(e.target.value)}
            >
              {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
            <Input
              type="number"
              placeholder="0.0"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              className="flex-1 h-11 bg-dls-surface border-dls-border text-dls-text text-lg font-mono"
            />
          </div>
        </div>

        <div className="flex justify-center">
          <div className="flex size-8 items-center justify-center rounded-full bg-dls-surface-muted border border-dls-border">
            <ArrowRightLeft className="size-3.5 text-dls-secondary" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="ow-section-heading">Buy</div>
          <div className="flex gap-2">
            <select
              className="h-11 rounded-xl bg-dls-surface border border-dls-border px-3 text-sm text-dls-text font-medium appearance-none cursor-pointer hover:border-emerald-500/30 transition-colors shrink-0 w-28"
              value={selectedBuy}
              onChange={(e) => setSelectedBuy(e.target.value)}
            >
              {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
            <div className="flex-1 h-11 flex items-center rounded-xl bg-dls-surface border border-dls-border px-3 text-sm text-dls-text font-mono">
              {quote ? (Number(quote.buyAmount) / 10 ** buyDecimals).toFixed(6) : "—"}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-300">
            <div className="flex size-5 items-center justify-center rounded-md bg-red-500/10">
              <span className="text-red-400 font-bold">!</span>
            </div>
            {error}
          </div>
        )}

        {quote && (
          <div className="ow-glass-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <Zap className="size-4 text-emerald-400" />
              </div>
              <span className="text-sm font-semibold text-dls-text">Quote ready</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-dls-surface-muted/50 border border-dls-border px-3 py-2 space-y-1">
                <div className="text-[10px] text-dls-secondary uppercase tracking-wider">You Sell</div>
                <div className="font-mono font-semibold text-dls-text">{(Number(quote.sellAmount) / 10 ** sellDecimals).toFixed(4)} {selectedSell}</div>
              </div>
              <div className="rounded-xl bg-dls-surface-muted/50 border border-dls-border px-3 py-2 space-y-1">
                <div className="text-[10px] text-dls-secondary uppercase tracking-wider">You Receive</div>
                <div className="font-mono font-semibold text-emerald-400">{(Number(quote.buyAmount) / 10 ** buyDecimals).toFixed(6)} {selectedBuy}</div>
              </div>
              <div className="rounded-xl bg-dls-surface-muted/50 border border-dls-border px-3 py-2 space-y-1">
                <div className="text-[10px] text-dls-secondary uppercase tracking-wider">Fee</div>
                <div className="font-mono font-semibold text-dls-text">{(Number(quote.feeAmount) / 10 ** sellDecimals).toFixed(4)}</div>
              </div>
              <div className="rounded-xl bg-dls-surface-muted/50 border border-dls-border px-3 py-2 space-y-1">
                <div className="text-[10px] text-dls-secondary uppercase tracking-wider">Valid Until</div>
                <div className="font-mono font-semibold text-dls-text">{new Date(quote.validTo * 1000).toLocaleTimeString()}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 h-12 rounded-xl border-dls-border hover:bg-dls-hover"
          onClick={handleGetQuote}
          disabled={loading || !sellAmount}
        >
          <TrendingUp className="size-4 mr-1.5" />
          {loading ? "Quoting..." : "Get Quote"}
        </Button>
        <Button
          className={cn(
            "flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20",
            !quote && "opacity-50 cursor-not-allowed"
          )}
          onClick={handleSubmit}
          disabled={loading || !quote}
        >
          Submit Order
        </Button>
      </div>
    </div>
  );
}
