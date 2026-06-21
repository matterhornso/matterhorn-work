/** @jsxImportSource react */
import type { ComponentType, ReactNode } from "react";
import {
  BarChart3,
  BrainCircuit,
  ClipboardCheck,
  Coins,
  Dumbbell,
  Eye,
  ShieldCheck,
} from "lucide-react";

import { t } from "../../../i18n";
import {
  Page,
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const capabilities = [
  {
    icon: BrainCircuit,
    title: "Bittensor workspace",
    desc: "Explore subnets, inspect TAO wallets, compare validators, and prepare safe staking previews.",
  },
  {
    icon: BarChart3,
    title: "Hyperliquid desk",
    desc: "Read account, orderbook, funding, and preview data with live submission clearly off.",
  },
  {
    icon: Eye,
    title: "Polymarket desk",
    desc: "Summarize prediction markets, outcomes, liquidity, receipts, and compliance status.",
  },
  {
    icon: Dumbbell,
    title: "Wellness builder",
    desc: "Create training, yoga, dietician, check-in, and customer-management workflows.",
  },
  {
    icon: Coins,
    title: "Create artifacts",
    desc: "Generate plans, reports, packets, scripts, and reusable workflow bundles.",
  },
  {
    icon: ClipboardCheck,
    title: "Collect evidence",
    desc: "Export customer-safe receipts, QA packets, and readiness reports.",
  },
  {
    icon: ShieldCheck,
    title: "Stay non-custodial",
    desc: "Matterhorn never asks for seed phrases, private keys, or raw signatures.",
  },
];

function ShowcasePanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
            Separate workspaces,
            <br />
            one Matterhorn chat.
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Pick Bittensor, Hyperliquid, Polymarket, or a workflow builder,
            then ask in plain English.
          </p>
        </div>
        <img
          className="size-12 rounded-xl border border-border bg-[var(--matterhorn-blue)] p-1"
          src="/matterhorn-logo-square.svg"
          alt="Matterhorn Work"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {capabilities.map((cap) => {
          const Icon = cap.icon as ComponentType<{ className?: string }>;
          return (
          <div
            key={cap.title}
            className="flex min-h-[118px] flex-col gap-2.5 rounded-xl border border-border bg-background/70 p-3"
          >
            <Icon className="size-4 text-primary" />
            <div className="text-sm font-medium leading-tight text-foreground">
              {cap.title}
            </div>
            <div className="text-xs leading-snug text-muted-foreground">
              {cap.desc}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

type WelcomePageProps = {
  onGetStarted: () => void;
};

type OnboardingStepProps = {
  number: string;
  title: string;
  children: ReactNode;
};

function OnboardingStep({ number, title, children }: OnboardingStepProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-sm font-medium text-foreground">
        {number}
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
              <OnboardingStep number="1" title="Create your workspace">
                Pick a folder where Matterhorn saves chats, artifacts, receipts, QA evidence, and workflow files.
              </OnboardingStep>
              <OnboardingStep number="2" title="Choose a product lane">
                Open Bittensor, Hyperliquid, Polymarket, wellness workflows, or a blank chat.
              </OnboardingStep>
              <OnboardingStep number="3" title="Review before action">
                Inspect evidence, preview-only actions, and external-signer handoffs. Matterhorn never holds your keys.
              </OnboardingStep>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={onGetStarted}
            >
              {t("welcome.get_started")}
            </Button>
          </div>
        </div>

        {/* ---- Right: Matterhorn capability card ---- */}
        <div className="hidden lg:flex lg:w-[55%] lg:items-center lg:justify-center lg:p-6">
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[rgba(var(--matterhorn-blue-rgb),0.35)] bg-[var(--matterhorn-blue)] p-3 shadow-[0_24px_80px_rgba(var(--matterhorn-blue-rgb),0.18)]">
            <div className="absolute right-0 top-0 size-40 -translate-y-1/3 translate-x-1/3 rounded-full bg-background/50 blur-3xl" />
            <div className="relative z-10 rounded-2xl border border-border bg-background p-7">
              <ShowcasePanel />
            </div>
          </div>
        </div>
        </div>
      </ScrollArea>
    </Page>
  );
}
