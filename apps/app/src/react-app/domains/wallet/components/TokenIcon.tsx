/** @jsxImportSource react */
import { useState } from "react";
import { cn } from "@/lib/utils";

export function TokenIcon({
  symbol,
  logoUrl,
  size = "md",
  className,
}: {
  symbol: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const sizeMap = {
    sm: "w-5 h-5 text-[9px]",
    md: "w-8 h-8 text-[10px]",
    lg: "w-10 h-10 text-xs",
  };

  const bgMap: Record<string, string> = {
    USDC: "bg-sky-500/10 text-sky-400",
    WETH: "bg-blue-500/10 text-blue-400",
    ETH: "bg-blue-500/10 text-blue-400",
    cbETH: "bg-emerald-500/10 text-emerald-400",
  };

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={symbol}
        className={cn("rounded-full object-contain", sizeMap[size], className)}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl font-bold",
        sizeMap[size],
        bgMap[symbol] ?? "bg-slate-500/10 text-slate-400",
        className
      )}
    >
      {symbol[0]}
    </div>
  );
}
