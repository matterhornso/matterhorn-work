/** @jsxImportSource react */
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Address } from "viem";
import type { WalletStore } from "../state/wallet-store";
import { tokensForChain } from "../../../infra/token-registry";

function getTokenMeta(chainId: number, symbol: string): { address: Address; decimals: number; symbol: string } | null {
  const registry = tokensForChain(chainId);
  if (!registry) return null;
  const meta = registry[symbol];
  if (!meta) return null;
  return { address: meta.address, decimals: meta.decimals, symbol: meta.symbol };
}

export default function YieldSheet({
  open,
  onOpenChange,
  tokenSymbol,
  chainId,
  address,
  balance,
  depositAmount,
  supplyApy,
  store,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tokenSymbol: string | null;
  chainId?: number;
  address?: Address;
  balance: number;
  depositAmount: number;
  supplyApy: number;
  store?: WalletStore;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);

  const token = tokenSymbol && chainId ? getTokenMeta(chainId, tokenSymbol) : null;
  const isDeposit = mode === "deposit";
  const maxAmount = isDeposit ? balance : depositAmount;

  const handleAction = async () => {
    if (!token || !address || !chainId || !store || !amount) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** token.decimals));
      const endpoint = isDeposit ? "/api/aave/deposit" : "/api/aave/withdraw";
      const body = isDeposit
        ? { chainId, asset: token.address, amount: raw, onBehalfOf: address }
        : { chainId, asset: token.address, amount: raw, to: address };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        store.requestApproval(
          json.to,
          json.value,
          json.data,
          chainId,
          isDeposit ? "aave_supply" : "aave_withdraw",
          isDeposit ? "low" : "medium",
        );
        onOpenChange(false);
        setAmount("");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton className="bg-dls-sidebar border-dls-border">
        <SheetHeader className="px-0 pt-0">
          <SheetTitle className="text-dls-text">{token.symbol} Yield</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("deposit")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                mode === "deposit" ? "bg-violet-500 text-white" : "bg-dls-surface text-dls-secondary"
              )}
            >
              Deposit
            </button>
            <button
              onClick={() => setMode("withdraw")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                mode === "withdraw" ? "bg-violet-500 text-white" : "bg-dls-surface text-dls-secondary"
              )}
            >
              Withdraw
            </button>
          </div>

          {supplyApy > 0 && (
            <div className="text-center text-sm text-emerald-400">
              {supplyApy.toFixed(1)}% APY
            </div>
          )}

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-dls-secondary">
              <span>Amount</span>
              <button onClick={() => setAmount(String(maxAmount))} className="text-violet-400 hover:text-violet-300">
                Max: {maxAmount.toFixed(6)} {token.symbol}
              </button>
            </div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`0 ${token.symbol}`}
              className="bg-dls-surface border-dls-border text-dls-text"
            />
          </div>

          <Button
            onClick={handleAction}
            disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxAmount}
            className="w-full bg-violet-500 hover:bg-violet-600 text-white"
          >
            {loading ? "Processing..." : isDeposit ? `Deposit ${token.symbol}` : `Withdraw ${token.symbol}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
