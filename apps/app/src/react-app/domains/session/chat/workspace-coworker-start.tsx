/** @jsxImportSource react */

import type { MatterhornCoworkerTemplateId } from "@matterhorn-work/types";
import { BarChart3, ChevronRight, FileText, ShieldCheck, Wallet } from "lucide-react";

const HOME_COWORKER_CHOICES: ReadonlyArray<{
  id: MatterhornCoworkerTemplateId;
  title: string;
  description: string;
  icon: typeof BarChart3;
}> = [
  {
    id: "market_analyst",
    title: "Research markets",
    description: "Compare current public evidence and save cited notes.",
    icon: BarChart3,
  },
  {
    id: "risk_monitor",
    title: "Watch risk",
    description: "Track approved account data and tell you when something changes.",
    icon: ShieldCheck,
  },
  {
    id: "transaction_coordinator",
    title: "Prepare a wallet review",
    description: "Build an exact testnet preview for your wallet to approve and send.",
    icon: FileText,
  },
  {
    id: "treasury_coworker",
    title: "Track balances",
    description: "Organize approved Sui and Bittensor testnet balances and activity.",
    icon: Wallet,
  },
];

export function WorkspaceCoworkerStart({
  disabled,
  onChoose,
}: {
  disabled?: boolean;
  onChoose: (templateId: MatterhornCoworkerTemplateId) => void;
}) {
  return (
    <section className="border-y border-dls-border/55 py-4" aria-labelledby="workspace-coworker-start-title">
      <h3 id="workspace-coworker-start-title" className="text-base font-semibold text-dls-text">Start with a coworker</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-dls-secondary">
        Choose one job. Your coworker will ask what it needs before starting work.
      </p>
      <ul className="mt-4 overflow-hidden rounded-lg bg-dls-canvas/35 ring-1 ring-inset ring-dls-border/45">
        {HOME_COWORKER_CHOICES.map((choice) => {
          const Icon = choice.icon;
          return (
            <li key={choice.id} className="border-b border-dls-border/40 last:border-b-0">
              <button
                type="button"
                className="grid min-h-16 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-dls-hover/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dls-text/35 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2"
                disabled={disabled}
                onClick={() => onChoose(choice.id)}
                aria-label={`Choose ${choice.title}`}
              >
                <Icon className="size-4 text-dls-secondary" strokeWidth={1.7} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-dls-text">{choice.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-dls-secondary">{choice.description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-dls-secondary" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-5 text-dls-secondary">
        Coworkers use only the access you approve. They cannot see private keys or send funds on their own.
      </p>
    </section>
  );
}
