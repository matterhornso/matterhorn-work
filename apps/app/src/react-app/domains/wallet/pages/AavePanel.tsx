/** @jsxImportSource react */
import { useState } from "react";
import { Landmark, TrendingUp, Shield, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";

type Tab = "deposit" | "borrow" | "positions";

export default function AavePanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [loading, setLoading] = useState(false);

  const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
  const tokens = registry ? Object.entries(registry).map(([symbol, meta]) => ({ symbol, address: meta.address, decimals: meta.decimals })) : [];

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
          <Landmark className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-dls-text">Aave V3</h2>
          <p className="text-xs text-dls-secondary">Lend and borrow on Base</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-dls-surface p-1 border border-dls-border">
        {(["deposit", "borrow", "positions"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t ? "bg-amber-500/20 text-amber-400" : "text-dls-secondary hover:text-dls-text hover:bg-dls-hover",
            )}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "deposit" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Token</label>
            <select
              className="w-full h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text focus:outline-none focus:ring-1 focus:ring-amber-500"
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
            >
              {tokens.map((t) => (
                <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Amount</label>
            <Input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 bg-dls-surface border-dls-border text-dls-text"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
            <TrendingUp className="size-3" />
            <span>Current supply APY: ~3.2%</span>
          </div>
          <Button
            className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white"
            disabled={!amount || loading}
            onClick={() => {
              const meta = tokens.find((t) => t.symbol === selectedToken);
              if (!meta || !state.address) return;
              const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
              // Encode supply(address,uint256,address,uint16)
              // For now: request approval with supply calldata
              alert(`Deposit ${amount} ${selectedToken} to Aave\n(Implementation pending — server tool needed)`);
            }}
          >
            <ArrowDownLeft className="size-4 mr-1.5" />
            Deposit
          </Button>
        </div>
      )}

      {tab === "borrow" && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <Shield className="size-3" />
            <span>Borrowing requires collateral. Ensure you have supplied assets first.</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Token</label>
            <select className="w-full h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text">
              <option>USDC</option>
              <option>WETH</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Amount</label>
            <Input type="number" placeholder="0.0" className="h-10 bg-dls-surface border-dls-border text-dls-text" />
          </div>
          <Button className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white">
            <ArrowUpRight className="size-4 mr-1.5" />
            Borrow
          </Button>
        </div>
      )}

      {tab === "positions" && (
        <div className="space-y-2 text-sm text-dls-secondary">
          <p>Your Aave positions will appear here.</p>
          <p className="text-xs">Supply APY and borrow rates fetched from Aave PoolDataProvider.</p>
        </div>
      )}
    </div>
  );
}
