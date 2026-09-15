import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { workspaceSessionRoute } from "../../shell/workspace-routes";

const desks = [
  { id: "bittensor", name: "Bittensor" },
  { id: "hyperliquid", name: "Hyperliquid" },
  { id: "polymarket", name: "Polymarket" },
  { id: "sui", name: "Sui" },
];

export function CryptoDeskLinks({ workspaceId }: { workspaceId: string }) {
  return (
    <section aria-label="Built-in crypto desks" className="py-6">
      <h2 className="mb-3 text-base font-semibold">Open a desk</h2>
      <div className="divide-y divide-border border-y border-border">
        {desks.map((desk) => (
          <Link key={desk.id} to={`${workspaceSessionRoute(workspaceId)}?panel=${desk.id}`}
            className="flex min-h-12 items-center justify-between gap-3 px-2 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {desk.name}<ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
