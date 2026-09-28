/** @jsxImportSource react */
import { Brain, ChevronRight } from "lucide-react";
import { PRIMARY_DESKS, type PrimaryDeskId } from "@/app/lib/minimal-ui";
import { getCustomerProtocolDeskVisual } from "./protocol-desk-ui";
import { ProtocolDeskMark } from "./protocol-brand-logo";

/** Navigation only: opening a desk is not a claim about runtime readiness. */
export function PrimaryDeskLauncher({ onOpenDesk }: { onOpenDesk?: (id: PrimaryDeskId) => void }) {
  return <section aria-label="Desks" className="matterhorn-desk-launcher divide-y divide-dls-border">
    {PRIMARY_DESKS.map((desk) => {
      const visual = getCustomerProtocolDeskVisual(desk.id);
      return <button key={desk.id} type="button" data-testid={`open-${desk.id}-desk`}
        className="flex min-h-20 w-full items-center gap-4 px-2 py-3 text-left hover:bg-dls-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-dls-text"
        onClick={() => onOpenDesk?.(desk.id)}>
        {visual ? <ProtocolDeskMark id={visual.id} visual={visual} size={28} /> : <Brain className="size-4" />}
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{desk.name}</span><span className="block text-sm text-dls-secondary">{desk.purpose}</span></span>
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </button>;
    })}
  </section>;
}
