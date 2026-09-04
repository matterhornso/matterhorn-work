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

export function WorkspaceCoworkerStart({
  disabled,
  onChoose,
}: {
  disabled?: boolean;
  onChoose: (request: WorkspaceCoworkerStartRequest) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [chosenTemplateId, setChosenTemplateId] = useState<MatterhornCoworkerTemplateId | null>(null);
  const suggestedTemplateId = useMemo(() => suggestCoworkerTemplate(outcome), [outcome]);
  const selectedTemplateId = chosenTemplateId ?? suggestedTemplateId;
  const selectedChoice = HOME_COWORKER_CHOICES.find((choice) => choice.id === selectedTemplateId)!;
  const trimmedOutcome = outcome.trim();

  return (
    <section className="border-y border-dls-border/55 py-4" aria-labelledby="workspace-coworker-start-title">
      <h3 id="workspace-coworker-start-title" className="text-base font-semibold text-dls-text">What do you want done?</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-dls-secondary">
        Describe the outcome in one sentence. Matterhorn will choose a coworker, then ask what it may use.
      </p>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedOutcome || disabled) return;
          onChoose({ templateId: selectedTemplateId, outcome: trimmedOutcome });
        }}
      >
        <label htmlFor="workspace-coworker-outcome" className="sr-only">Outcome</label>
        <textarea
          id="workspace-coworker-outcome"
          className="min-h-24 w-full resize-y rounded-lg border border-dls-border bg-dls-canvas/35 px-3 py-3 text-sm leading-6 text-dls-text outline-none placeholder:text-dls-secondary focus:border-ring focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
          value={outcome}
          maxLength={1_200}
          disabled={disabled}
          placeholder="For example: Compare Bittensor validators and save a cited recommendation."
          onChange={(event) => setOutcome(event.currentTarget.value)}
        />

        {trimmedOutcome ? (
          <div className="mt-3 border-y border-dls-border/55 py-3">
            <p className="text-xs font-medium text-dls-secondary">Suggested coworker</p>
            <p className="mt-1 text-sm font-medium text-dls-text">{selectedChoice.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-dls-secondary">{selectedChoice.description}</p>
            <details className="mt-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-dls-text outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
                Change coworker
              </summary>
              <fieldset className="pb-1 pt-2">
                <legend className="sr-only">Choose a coworker</legend>
                <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Coworker role">
                  {HOME_COWORKER_CHOICES.map((choice) => {
                    const Icon = choice.icon;
                    const selected = choice.id === selectedTemplateId;
                    const suggested = choice.id === suggestedTemplateId;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        className={`grid min-h-11 grid-cols-[20px_minmax(0,1fr)_20px] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? "border-dls-text/45 bg-dls-hover/45 text-dls-text"
                            : "border-dls-border/70 bg-transparent text-dls-secondary hover:bg-dls-hover/30 hover:text-dls-text"
                        }`}
                        onClick={() => setChosenTemplateId(choice.id)}
                      >
                        <Icon className="size-4" strokeWidth={1.7} aria-hidden="true" />
                        <span className="min-w-0 truncate font-medium">
                          {choice.title}{suggested ? <span className="ml-2 font-normal text-dls-secondary">· Suggested</span> : null}
                        </span>
                        {selected ? <Check className="size-4" strokeWidth={1.8} aria-hidden="true" /> : <span aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </details>
          </div>
        ) : null}

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-dls-text px-4 text-sm font-medium text-dls-background transition-colors hover:bg-dls-text/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={disabled || !trimmedOutcome}
          >
            Set up coworker
          </button>
        </div>
      </form>
      <p id="workspace-coworker-safety" className="mt-3 text-xs leading-5 text-dls-secondary">
        You choose what it can access next. It cannot see private keys or send funds on its own.
      </p>
    </section>
  );
}
