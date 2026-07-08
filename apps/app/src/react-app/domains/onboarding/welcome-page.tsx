/** @jsxImportSource react */
import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

import { t } from "../../../i18n";
import {
  Page,
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { ScrollArea } from "@/components/ui/scroll-area";

const principles = [
  "Understand complex domains without becoming an expert first.",
  "Keep risky work review-first, with safety boundaries visible before action.",
  "Turn useful conversations into saved project context, files, and receipts.",
];

function ShowcasePanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
            Matterhorn Work
          </h2>
          <p className="mt-2 max-w-[46ch] text-sm leading-6 text-muted-foreground">
            A workspace for AI-assisted work that needs judgment, context, and
            review before anything serious happens.
          </p>
        </div>
        <img
          className="size-12 rounded-xl border border-border bg-[var(--matterhorn-blue)] p-1"
          src="/matterhorn-logo-square.svg"
          alt="Matterhorn Work"
        />
      </div>

      <div className="rounded-lg border border-border bg-background p-5">
        <div className="text-[17px] font-semibold leading-7 text-foreground">
          Matterhorn turns chat into an operating layer for projects, protocols,
          workflows, and real-world decisions.
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The aim is not just faster answers. It is safer progress: clear
          context, visible evidence, editable next steps, and outputs that stay
          attached to the project.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-5">
        <div className="text-sm font-semibold text-foreground">
          How it helps people
        </div>
        <div className="mt-3 space-y-3">
          {principles.map((principle) => (
            <div
              key={principle}
              className="text-sm leading-6 text-muted-foreground"
            >
              {principle}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type WelcomePageProps = {
  onGetStarted: () => void;
};

type OnboardingStepProps = {
  title: string;
  children: ReactNode;
};

function OnboardingStep({ title, children }: OnboardingStepProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-foreground">
        <CheckCircle2 className="size-4" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-0.5 pt-1">
        <div className="text-base font-medium text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function WelcomePage({ onGetStarted }: WelcomePageProps) {
  return (
    <Page className="min-h-screen">
      <PageBackground />

      <PageTitlebarRegion />

      <ScrollArea className="relative z-10">
        <div className="flex min-h-screen">
        {/* ---- Left: onboarding steps ---- */}
        <div className="flex w-full flex-col items-center justify-center px-8 py-16 lg:w-[45%] lg:px-12">
          <div className="flex w-full max-w-md flex-col gap-10">
            {/* Header */}
            <PageHeader className="text-left">
              <PageTitle>{t("welcome.title")}</PageTitle>
              <PageDescription>{t("welcome.subtitle")}</PageDescription>
            </PageHeader>

            {/* Steps */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Get started
                </h2>
              </div>
              <OnboardingStep title="Create your workspace">
                Pick a folder where Matterhorn saves chats, artifacts, receipts, QA evidence, and workflow files.
              </OnboardingStep>
              <OnboardingStep title="Choose a product lane">
                Open Bittensor, Hyperliquid, Polymarket, longevity workflows, or a blank chat.
              </OnboardingStep>
              <OnboardingStep title="Review before action">
                Inspect evidence and external-signer handoffs before anything sensitive happens. Matterhorn never holds your keys.
              </OnboardingStep>
            </div>

            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 focus:outline-none focus:ring-2 focus:ring-ring/30"
              onClick={onGetStarted}
            >
              {t("welcome.get_started")}
            </button>
          </div>
        </div>

        {/* ---- Right: Matterhorn capability card ---- */}
        <div className="hidden lg:flex lg:w-[55%] lg:items-center lg:justify-center lg:p-6">
          <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-[rgba(var(--matterhorn-blue-rgb),0.35)] bg-[var(--matterhorn-blue)] p-2">
            <div className="relative z-10 rounded-lg border border-border bg-background p-7">
              <ShowcasePanel />
            </div>
          </div>
        </div>
        </div>
      </ScrollArea>
    </Page>
  );
}
