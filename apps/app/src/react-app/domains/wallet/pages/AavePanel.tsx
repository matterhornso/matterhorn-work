/** @jsxImportSource react */
import { useState, useCallback, useEffect, useMemo } from "react";
import { Landmark, TrendingUp, Shield, ArrowDownLeft, ArrowUpRight, Wallet, Sprout, Activity, RotateCcw, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";

type Tab = "deposit" | "borrow" | "repay" | "positions";

type AavePosition = {
  healthFactor: string;
  totalCollateral: string;
  totalDebt: string;
  availableBorrows: string;
};

type AaveDeposit = {
  asset: string;
  aToken: string;
  amount: string;
  symbol: string;
};

const TOKEN_ICONS: Record<string, { color: string; bg: string }> = {
  USDC: { color: "text-sky-400", bg: "bg-sky-500/10" },
  WETH: { color: "text-blue-400", bg: "bg-blue-500/10" },
  ETH: { color: "text-blue-400", bg: "bg-blue-500/10" },
  cbETH: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
};

export default function AavePanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<AavePosition | null>(null);
  const [deposits, setDeposits] = useState<AaveDeposit[]>([]);
  const [apyMap, setApyMap] = useState<Record<string, string>>({});

  const registry = state.chainId ? tokensForChain(state.chainId) : undefined;
  const tokens = registry ? Object.entries(registry).map(([symbol, meta]) => ({ symbol, address: meta.address, decimals: meta.decimals })) : [];

  const fetchPositions = useCallback(async () => {
    if (!state.chainId || !state.address) return;
    try {
      const [posRes, depRes] = await Promise.all([
        fetch(`/api/aave/positions?chainId=${state.chainId}&address=${state.address}`),
        fetch(`/api/aave/deposits?chainId=${state.chainId}&address=${state.address}`),
      ]);
      const posJson = await posRes.json();
      const depJson = await depRes.json();
      if (posJson.success) setPositions(posJson);
      if (depJson.success) setDeposits(depJson.deposits ?? []);
    } catch { /* silent fail */ }
  }, [state.chainId, state.address]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  // Fetch real APY for each token
  useEffect(() => {
    if (!state.chainId) return;
    const newApy: Record<string, string> = {};
    Promise.all(
      tokens.map(async (t) => {
        try {
          const res = await fetch(`/api/aave/apy?chainId=${state.chainId}&asset=${t.address}`);
          const json = await res.json();
          if (json.success) newApy[t.symbol] = json.supplyApy;
        } catch { /* skip */ }
      })
    ).then(() => setApyMap(newApy));
  }, [state.chainId, tokens]);

  const selectedApy = apyMap[selectedToken];

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

  const handleRepay = async () => {
    const meta = tokens.find((t) => t.symbol === selectedToken);
    if (!meta || !state.address || !state.chainId || !amount) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch("/api/aave/repay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: state.chainId, asset: meta.address, amount: raw, onBehalfOf: state.address }),
      });
      const json = await res.json();
      if (json.success) {
        store.requestApproval(json.to, json.value, json.data, state.chainId, "aave_repay", "medium");
      }
    } finally { setLoading(false); }
  };

  const handleWithdraw = async (symbol: string, depositAmount: string, decimals: number) => {
    const meta = tokens.find((t) => t.symbol === symbol);
    if (!meta || !state.address || !state.chainId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/aave/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: state.chainId, asset: meta.address, amount: depositAmount, to: state.address }),
      });
      const json = await res.json();
      if (json.success) {
        store.requestApproval(json.to, json.value, json.data, state.chainId, "aave_withdraw", "low");
      }
    } finally { setLoading(false); }
  };

  const TokenSelector = () => (
    <div className="space-y-2">
      <div className="ow-section-heading">Token</div>
      <div className="flex gap-2 flex-wrap">
        {tokens.map((t) => (
          <button
            key={t.symbol}
            onClick={() => setSelectedToken(t.symbol)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all border",
              selectedToken === t.symbol
                ? "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20"
                : "bg-dls-surface text-dls-text border-dls-border hover:border-amber-500/30"
            )}
          >
            <div className={cn("w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold", TOKEN_ICONS[t.symbol]?.bg ?? "bg-slate-500/10", TOKEN_ICONS[t.symbol]?.color ?? "text-slate-400")}>
              {t.symbol[0]}
            </div>
            {t.symbol}
          </button>
        ))}
      </div>
    </div>
  );

  const AmountInput = () => (
    <div className="space-y-2">
      <div className="ow-section-heading">Amount</div>
      <Input
        type="number"
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-12 bg-dls-surface border-dls-border text-dls-text text-lg font-mono"
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto animate-fade-in">
      {/* Header */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-dls-surface-muted/35 text-primary">
            <Landmark className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dls-text">Aave V3</h2>
            <p className="text-xs text-dls-secondary">Lend and borrow on Base</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg bg-dls-surface-muted/50 border border-dls-border px-3 py-2 space-y-0.5">
            <div className="text-[10px] text-dls-secondary uppercase tracking-wider">APY</div>
            <div className="ow-apy-tag">{selectedApy ? `▲ ${selectedApy}%` : "—"}</div>
          </div>
          <div className="flex-1 rounded-lg bg-dls-surface-muted/50 border border-dls-border px-3 py-2 space-y-0.5">
            <div className="text-[10px] text-dls-secondary uppercase tracking-wider">Positions</div>
            <div className="text-sm font-mono font-semibold text-dls-text">{positions ? "Active" : "—"}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-dls-surface p-1 border border-dls-border">
        {(["deposit", "borrow", "repay", "positions"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all",
              tab === t
                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                : "text-dls-secondary hover:text-dls-text hover:bg-dls-hover"
            )}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Deposit Tab */}
      {tab === "deposit" && (
        <div className="ow-soft-card p-4 space-y-4">
          <TokenSelector />
          <AmountInput />
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10">
              <TrendingUp className="size-4 text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium text-emerald-300">
                {selectedApy ? `Earn ${selectedApy}% APY` : "Earn yield on Aave V3"}
              </div>
              <div className="text-[10px] text-emerald-400/60">Supply {selectedToken} to Aave V3 pool</div>
            </div>
            <Sprout className="size-4 text-emerald-400/40" />
          </div>
          <Button
            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20"
            disabled={!amount || loading}
            onClick={handleDeposit}
          >
            <ArrowDownLeft className="size-4 mr-1.5" />
            {loading ? "Building..." : `Deposit ${selectedToken}`}
          </Button>
        </div>
      )}

      {/* Borrow Tab */}
      {tab === "borrow" && (
        <div className="ow-soft-card p-4 space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-500/10">
              <Shield className="size-4 text-red-400" />
            </div>
            <span className="text-xs text-red-300">Borrowing requires collateral. Ensure you have supplied assets first.</span>
          </div>
          <TokenSelector />
          <AmountInput />
          <Button
            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20"
            disabled={!amount || loading}
            onClick={handleBorrow}
          >
            <ArrowUpRight className="size-4 mr-1.5" />
            {loading ? "Building..." : `Borrow ${selectedToken}`}
          </Button>
        </div>
      )}

      {/* Repay Tab */}
      {tab === "repay" && (
        <div className="ow-soft-card p-4 space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10">
              <RotateCcw className="size-4 text-emerald-400" />
            </div>
            <span className="text-xs text-emerald-300">Repay borrowed tokens to improve your health factor.</span>
          </div>
          <TokenSelector />
          <AmountInput />
          <Button
            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20"
            disabled={!amount || loading}
            onClick={handleRepay}
          >
            <RotateCcw className="size-4 mr-1.5" />
            {loading ? "Building..." : `Repay ${selectedToken}`}
          </Button>
        </div>
      )}

      {/* Positions Tab */}
      {tab === "positions" && (
        <div className="ow-soft-card p-4 space-y-3">
          {positions ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-dls-surface-muted/50 border border-dls-border px-3 py-3 space-y-1">
                  <div className="text-[10px] text-dls-secondary uppercase tracking-wider">Health Factor</div>
                  <div className={cn("text-lg font-mono font-bold", Number(positions.healthFactor) < 1.1 ? "text-red-400" : "text-emerald-400")}>
                    {positions.healthFactor}
                  </div>
                </div>
                <div className="rounded-lg bg-dls-surface-muted/50 border border-dls-border px-3 py-3 space-y-1">
                  <div className="text-[10px] text-dls-secondary uppercase tracking-wider">Collateral</div>
                  <div className="text-lg font-mono font-bold text-dls-text">${positions.totalCollateral}</div>
                </div>
                <div className="rounded-lg bg-dls-surface-muted/50 border border-dls-border px-3 py-3 space-y-1">
                  <div className="text-[10px] text-dls-secondary uppercase tracking-wider">Debt</div>
                  <div className="text-lg font-mono font-bold text-red-400">${positions.totalDebt}</div>
                </div>
                <div className="rounded-lg bg-dls-surface-muted/50 border border-dls-border px-3 py-3 space-y-1">
                  <div className="text-[10px] text-dls-secondary uppercase tracking-wider">Available</div>
                  <div className="text-lg font-mono font-bold text-dls-text">${positions.availableBorrows}</div>
                </div>
              </div>

              {/* Deposits list */}
              {deposits.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-dls-border">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-dls-secondary">Your Deposits</div>
                  {deposits.map((d) => {
                    const meta = tokens.find((t) => t.symbol === d.symbol);
                    const dec = meta ? meta.decimals : 18;
                    const fmt = (Number(d.amount) / 10 ** dec).toFixed(dec > 8 ? 6 : 4);
                    return (
                      <div key={d.symbol} className="flex items-center justify-between rounded-lg bg-dls-surface-muted/30 border border-dls-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={cn("flex size-7 items-center justify-center rounded-lg text-[10px] font-bold", TOKEN_ICONS[d.symbol]?.bg ?? "bg-slate-500/10", TOKEN_ICONS[d.symbol]?.color ?? "text-slate-400")}>
                            {d.symbol[0]}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-dls-text">{d.symbol}</div>
                            <div className="text-[11px] text-dls-secondary font-mono">{fmt} deposited</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleWithdraw(d.symbol, d.amount, dec)}
                          disabled={loading}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                        >
                          <Coins className="size-3 inline mr-1" />
                          Withdraw
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 rounded-lg border border-dls-border bg-dls-surface-muted/30 px-3 py-2">
                <Activity className="size-3.5 text-dls-secondary" />
                <span className="text-xs text-dls-secondary">Positions update on-chain</span>
              </div>
            </>
          ) : (
            <div className="ow-empty-state py-8">
              <div className="ow-empty-state-icon">
                <Wallet className="size-5" />
              </div>
              <div className="ow-empty-state-title">No positions</div>
              <div className="ow-empty-state-desc">Deposit assets to Aave to see your position data here.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
