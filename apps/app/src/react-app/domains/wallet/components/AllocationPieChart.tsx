/** @jsxImportSource react */
import { useMemo } from "react";
import { PieChart } from "lucide-react";

const TOKEN_COLORS: Record<string, string> = {
  ETH: "#6366f1",
  WETH: "#8b5cf6",
  USDC: "#0ea5e9",
  WBTC: "#f59e0b",
  DAI: "#fbbf24",
  default: "#94a3b8",
};

type PieDatum = { label: string; value: number };

export function AllocationPieChart({
  data,
  size = 180,
}: {
  data: PieDatum[];
  size?: number;
}) {
  const { arcs, total } = useMemo(() => {
    const t = data.reduce((sum, d) => sum + Math.max(d.value, 0), 0);
    if (t === 0) return { arcs: [], total: 0 };

    let angle = 0;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.4;
    const innerR = size * 0.22;
    const arcsOut: Array<{
      d: string;
      color: string;
      label: string;
      pct: number;
      startAngle: number;
      endAngle: number;
    }> = [];

    for (const d of data) {
      const pct = Math.max(d.value, 0) / t;
      const startAngle = angle;
      const endAngle = angle + pct * Math.PI * 2;
      // Donut arc path
      const dPath = describeArc(cx, cy, radius, innerR, startAngle, endAngle);
      const color = TOKEN_COLORS[d.label] ?? TOKEN_COLORS.default;
      arcsOut.push({ d: dPath, color, label: d.label, pct, startAngle, endAngle });
      angle = endAngle;
    }

    return { arcs: arcsOut, total: t };
  }, [data, size]);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-dls-secondary py-6">
        <PieChart className="size-10 mb-2 opacity-30" />
        <span className="text-xs">No allocation data yet</span>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((a, i) => (
          <g key={i}>
            <path
              d={a.d}
              fill={a.color}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={1.5}
              className="transition-all duration-500 hover:opacity-80"
            />
            {/* Percent label for slices > 8% */}
            {a.pct > 0.08 && (
              <text
                x={cx + Math.cos((a.startAngle + a.endAngle) / 2) * (size * 0.32)}
                y={cy + Math.sin((a.startAngle + a.endAngle) / 2) * (size * 0.32)}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white text-[10px] font-bold pointer-events-none"
              >
                {(a.pct * 100).toFixed(0)}%
              </text>
            )}
          </g>
        ))}
        {/* Center hole text */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-dls-text text-xs font-bold"
        >
          {data.length}
        </text>
        <text
          x={cx}
          y={cy + 9}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-dls-secondary text-[9px] uppercase"
        >
          Assets
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {arcs.map((a, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
            <span className="text-[11px] text-dls-text">{a.label}</span>
            <span className="text-[11px] text-dls-secondary">{(a.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const x1 = cx + Math.cos(startAngle) * r;
  const y1 = cy + Math.sin(startAngle) * r;
  const x2 = cx + Math.cos(endAngle) * r;
  const y2 = cy + Math.sin(endAngle) * r;
  const x3 = cx + Math.cos(endAngle) * innerR;
  const y3 = cy + Math.sin(endAngle) * innerR;
  const x4 = cx + Math.cos(startAngle) * innerR;
  const y4 = cy + Math.sin(startAngle) * innerR;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}
