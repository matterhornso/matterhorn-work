/** @jsxImportSource react */

import { useMemo, useState } from "react";
import type { MatterhornCoworkerTemplateId } from "@matterhorn-work/types";
import { BarChart3, Check, FileText, ShieldCheck, Wallet } from "lucide-react";
import { suggestCoworkerTemplate } from "./workspace-coworker-suggestion";

export type WorkspaceCoworkerStartRequest = {
  templateId: MatterhornCoworkerTemplateId;
  outcome: string;
};

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

const HOME_START_EXAMPLES: ReadonlyArray<{
  label: string;
  outcome: string;
  templateId: MatterhornCoworkerTemplateId;
}> = [
  {
    label: "Compare validators",
    outcome: "Compare Bittensor validators and save a cited recommendation.",
    templateId: "market_analyst",
  },
  {
    label: "Review account risk",
    outcome: "Review my Hyperliquid account risk and alert me to important changes.",
    templateId: "risk_monitor",
  },
  {
    label: "Prepare a transfer",
    outcome: "Prepare a Sui testnet transfer for my wallet to review.",
    templateId: "transaction_coordinator",
  },
];

export function WorkspaceCoworkerStart({
  disabled,
  onChoose,
}: {
  disabled?: boolean;
  onChoose: (request: WorkspaceCoworkerStartRequest) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [chosenTemplateId, setChosenTemplateId] = useState<MatterhornCoworkerTemplateId | null>(null);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const suggestedTemplateId = useMemo(() => suggestCoworkerTemplate(outcome), [outcome]);
  const selectedTemplateId = chosenTemplateId ?? suggestedTemplateId;
  const selectedChoice = HOME_COWORKER_CHOICES.find((choice) => choice.id === selectedTemplateId)!;
  const trimmedOutcome = outcome.trim();

  return (
    <section className="border-y border-dls-border/55 py-3" aria-labelledby="workspace-coworker-start-title">
      <h3 id="workspace-coworker-start-title" className="text-sm font-semibold text-dls-text">Start something</h3>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedOutcome || disabled) return;
          onChoose({ templateId: selectedTemplateId, outcome: trimmedOutcome });
        }}
      >
        <label htmlFor="workspace-coworker-outcome" className="sr-only">Outcome</label>
        <textarea
          id="workspace-coworker-outcome"
          className="min-h-20 w-full resize-y rounded-md border border-dls-border bg-dls-canvas/35 px-3 py-2.5 text-sm leading-6 text-dls-text outline-none placeholder:text-dls-secondary focus:border-ring focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
          value={outcome}
          maxLength={1_200}
          disabled={disabled}
          placeholder="Compare Bittensor validators and save a recommendation."
          onChange={(event) => {
            const nextOutcome = event.currentTarget.value;
            setOutcome(nextOutcome);
            if (!nextOutcome.trim()) {
              setChosenTemplateId(null);
              setChoicesOpen(false);
            }
          }}
        />

        {!trimmedOutcome ? (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Example goals">
              {HOME_START_EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium text-dls-secondary transition-colors hover:bg-dls-hover/30 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8"
                  disabled={disabled}
                  onClick={() => {
                    setOutcome(example.outcome);
                    setChosenTemplateId(example.templateId);
                    setChoicesOpen(false);
                  }}
                >
                  {example.label}
                </button>
              ))}
          </div>
        ) : null}

        {trimmedOutcome ? (
          <div className="mt-3 border-t border-dls-border/40 pt-3">
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 truncate text-xs text-dls-secondary">
                Coworker: <span className="font-medium text-dls-text">{selectedChoice.title}</span>
              </p>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center rounded-md border border-dls-border px-3 text-xs font-medium text-dls-text transition-colors hover:bg-dls-hover/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
                aria-expanded={choicesOpen}
                aria-controls="workspace-coworker-choices"
                disabled={disabled}
                onClick={() => setChoicesOpen((open) => !open)}
              >
                {choicesOpen ? "Close" : "Change"}
              </button>
            </div>

            {choicesOpen ? (
              <fieldset id="workspace-coworker-choices" className="mt-3 border-t border-dls-border/40 pt-3">
                <legend className="text-xs font-medium text-dls-text">Choose a coworker</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {HOME_COWORKER_CHOICES.map((choice) => {
                    const Icon = choice.icon;
                    const selected = choice.id === selectedTemplateId;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        className={`grid min-h-14 grid-cols-[20px_minmax(0,1fr)_20px] items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? "border-dls-text/45 bg-dls-hover/45 text-dls-text"
                            : "border-dls-border/70 bg-transparent text-dls-secondary hover:bg-dls-hover/30 hover:text-dls-text"
                        }`}
                        onClick={() => {
                          setChosenTemplateId(choice.id);
                          setChoicesOpen(false);
                        }}
                      >
                        <Icon className="mt-0.5 size-4" strokeWidth={1.7} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-dls-text">{choice.title}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-dls-secondary">{choice.description}</span>
                        </span>
                        {selected ? <Check className="mt-0.5 size-4" strokeWidth={1.8} aria-hidden="true" /> : <span aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-3 border-t border-dls-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p id="workspace-coworker-safety" className="text-xs text-dls-secondary">
            You review access before anything starts.
          </p>
          <button
            type="submit"
            aria-describedby="workspace-coworker-safety"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-dls-text px-4 text-sm font-medium text-dls-background transition-colors hover:bg-dls-text/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={disabled || !trimmedOutcome}
          >
            Continue
          </button>
        </div>
      </form>
    </section>
  );
}
