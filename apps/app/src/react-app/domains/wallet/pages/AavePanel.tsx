/** @jsxImportSource react */
import { useState, useCallback, useEffect } from "react";
import { Landmark, TrendingUp, Shield, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";

type Tab = "deposit" | "borrow" | "positions";

type AavePosition = {
  healthFactor: string;
  totalCollateral: string;
  totalDebt: string;
  availableBorrows: string;
};

export default function AavePanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<AavePosition | null>(null);

  const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
  const tokens = registry ? Object.entries(registry).map(([symbol, meta]) => ({ symbol, address: meta.address, decimals: meta.decimals })) : [];

  const fetchPositions = useCallback(async () => {
    if (!state.chainId || !state.address) return;
    try {
      const res = await fetch(`/api/aave/positions?chainId=${state.chainId}&address=${state.address}`);
      const json = await res.json();
      if (json.success) setPositions(json);
    } catch { /* silent fail */ }
  }, [state.chainId, state.address]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  const handleDeposit = async () => {
    const meta = tokens.find((t) => t.symbol === selectedToken);
    if (!meta || !state.address || !state.chainId || !amount) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch("/api/aave/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: state.chainId, asset: meta.address, amount: raw, onBehalfOf: state.address }),
      });
      const json = await res.json();
      if (json.success) {
        store.requestApproval(json.to, json.value, json.data, state.chainId, "aave_supply", "low");
      }
    } finally { setLoading(false); }
  };

  const handleBorrow = async () => {
    const meta = tokens.find((t) => t.symbol === selectedToken);
    if (!meta || !state.address || !state.chainId || !amount) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch("/api/aave/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: state.chainId, asset: meta.address, amount: raw, onBehalfOf: state.address }),
      });
      const json = await res.json();
      if (json.success) {
        store.requestApproval(json.to, json.value, json.data, state.chainId, "aave_borrow", "medium");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
          <Landmark className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-dls-text">Aave V3</h2>
          <p className="text-xs text-dls-secondary">Lend and borrow on Base</p>
        </div>
      </div>

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
            <select className="w-full h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text" value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
              {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Amount</label>
            <Input type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 bg-dls-surface border-dls-border text-dls-text" />
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
            <TrendingUp className="size-3" />
            <span>Current supply APY: ~3.2%</span>
          </div>
          <Button className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white" disabled={!amount || loading} onClick={handleDeposit}>
            <ArrowDownLeft className="size-4 mr-1.5" /> Deposit
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
            <select className="w-full h-10 rounded-lg bg-dls-surface border border-dls-border px-3 text-sm text-dls-text" value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
              {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Amount</label>
            <Input type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 bg-dls-surface border-dls-border text-dls-text" />
          </div>
          <Button className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white" disabled={!amount || loading} onClick={handleBorrow}>
            <ArrowUpRight className="size-4 mr-1.5" /> Borrow
          </Button>
        </div>
      )}

      {tab === "positions" && (
        <div className="space-y-3">
          {positions ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Health Factor</div>
                <div className={cn("font-mono text-dls-text", Number(positions.healthFactor) < 1.1 && "text-red-400")}>{positions.healthFactor}</div>
              </div>
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Collateral</div>
                <div className="font-mono text-dls-text">${positions.totalCollateral}</div>
              </div>
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Debt</div>
                <div className="font-mono text-dls-text">${positions.totalDebt}</div>
              </div>
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Available</div>
                <div className="font-mono text-dls-text">${positions.availableBorrows}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-dls-secondary">Connect wallet to view positions.</p>
          )}
        </div>
      )}
    </div>
  );
}
