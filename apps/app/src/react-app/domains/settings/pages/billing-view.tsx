/** @jsxImportSource react */
import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, CreditCard, ExternalLink, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import type {
  MatterhornBillingPlan,
  MatterhornBillingPlanId,
  MatterhornBillingStatus,
} from "@matterhorn-work/types/billing";
import {
  SettingsInset,
  SettingsPill,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSectionHeaderContent,
  SettingsSectionHeaderDescription,
  SettingsSectionHeaderTitle,
  SettingsStack,
} from "../settings-section";
import { backendCapabilityTone } from "../backend-capability-status";
import {
  formatEntitlementLimit,
  formatEntitlementUsage,
} from "../../billing/entitlements";

export type BillingSettingsViewProps = {
  matterhornServerClient?: MatterhornServerClient | null;
};

function formatPrice(amountCents: number, currency: string, interval: string): string {
  if (amountCents === 0) return "Free";
  const amount = (amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2);
  return `$${amount} ${currency.toUpperCase()}/${interval}`;
}

function PlanCard(props: {
  plan: MatterhornBillingPlan;
  current: boolean;
  mode: MatterhornBillingStatus["mode"];
  onSelect: (planId: MatterhornBillingPlanId) => void;
  busy: boolean;
}) {
  const isLive = props.mode === "live";
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-lg border p-4",
        props.current
          ? "border-dls-border/80 bg-dls-surface"
          : "border-dls-border/40 bg-dls-surface/50",
        props.plan.popular && !props.current && "border-amber-500/30",
      )}
    >
      {props.plan.popular ? (
        <span className="absolute -top-2 right-3 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          Popular
        </span>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-dls-text">{props.plan.name}</h3>
        {props.current ? (
          <SettingsPill>
            <Check size={12} />
            Current plan
          </SettingsPill>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{props.plan.tagline}</p>
      <div className="text-lg font-semibold text-dls-text">
        {formatPrice(props.plan.price.amountCents, props.plan.price.currency, props.plan.price.interval)}
      </div>
      <ul className="flex flex-col gap-1.5">
        {props.plan.entitlements.slice(0, 6).map((entitlement) => (
          <li key={entitlement.key} className="flex items-center gap-2 text-xs text-dls-secondary">
            <Check size={12} className={entitlement.included ? "text-emerald-300" : "text-gray-7"} />
            <span className={entitlement.included ? "" : "text-muted-foreground line-through"}>
              {entitlement.label}
              {entitlement.limit != null && entitlement.included ? (
                <span className="ml-1 text-muted-foreground">({formatEntitlementLimit(entitlement.limit)})</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <Button
        variant={props.current ? "outline" : "default"}
        size="sm"
        className="mt-auto h-8 text-xs"
        disabled={props.current || props.busy || isLive}
        onClick={() => props.onSelect(props.plan.id)}
      >
        {props.busy ? <Loader2 size={12} className="animate-spin" /> : null}
        {props.current ? "Current plan" : isLive ? "Unavailable" : props.plan.ctaLabel}
      </Button>
    </div>
  );
}

export function BillingSettingsView(props: BillingSettingsViewProps) {
  const client = props.matterhornServerClient;
  const plansQuery = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => client?.billingPlans(),
    enabled: Boolean(client),
  });
  const statusQuery = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => client?.billingStatus(),
    enabled: Boolean(client),
  });

  const checkoutMutation = useMutation({
    mutationFn: (planId: MatterhornBillingPlanId) =>
      client?.billingCheckout({ planId, interval: "month" }) ?? Promise.reject(new Error("No client")),
    onSuccess: (data) => {
      if (data?.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    },
  });

  const portalMutation = useMutation({
    mutationFn: () => client?.billingPortal() ?? Promise.reject(new Error("No client")),
    onSuccess: (data) => {
      if (data?.portalUrl) {
        window.open(data.portalUrl, "_blank", "noopener,noreferrer");
      }
    },
  });

  const plans = plansQuery.data?.plans ?? [];
  const status = statusQuery.data?.status;
  const currentPlanId = status?.subscription.planId ?? plansQuery.data?.currentPlanId ?? "free";
  const billingTone = status ? backendCapabilityTone(status.mode === "phase1_stripe_test" ? "working" : "preview") : "neutral";

  const usageItems = useMemo(() => {
    if (!status) return [];
    return [
      { label: "Generated images", ...status.usage.generatedImages },
      { label: "NFT drafts", ...status.usage.nftDrafts },
      { label: "Team members", ...status.usage.teamMembers },
    ];
  }, [status]);

  return (
    <SettingsStack>
      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>
              <CreditCard size={16} />
              Billing
            </SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Manage your Matterhorn plan. Live payments are disabled in this build.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeaderContent>
        </SettingsSectionHeader>
      </SettingsSection>

      <SettingsInset>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Current plan</span>
              <span className="text-sm font-medium text-dls-text">
                {plans.find((p) => p.id === currentPlanId)?.name ?? currentPlanId}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <SettingsPill>
                <ShieldCheck size={12} />
                {status?.mode === "phase1_stripe_test" ? "Stripe test" : "Mock mode"}
              </SettingsPill>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={!client || portalMutation.isPending || status?.mode === "live"}
                onClick={() => portalMutation.mutate()}
              >
                {portalMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                Manage billing
              </Button>
            </div>
          </div>
        </div>
      </SettingsInset>

      <SettingsSection>
        <h3 className="text-sm font-medium text-dls-text">Available plans</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={plan.id === currentPlanId}
              mode={status?.mode ?? "phase0_mock"}
              onSelect={(id) => checkoutMutation.mutate(id)}
              busy={checkoutMutation.isPending}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-medium text-dls-text">Usage</h3>
        <div className="flex flex-col gap-2">
          {usageItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md border border-dls-border/40 p-3">
              <span className="text-xs text-dls-secondary">{item.label}</span>
              <span className="text-xs font-medium text-dls-text">
                {formatEntitlementUsage(item.used, item.limit)}
              </span>
            </div>
          ))}
          {usageItems.length === 0 ? (
            <div className="text-xs text-muted-foreground">Usage data is not available.</div>
          ) : null}
        </div>
      </SettingsSection>

      {status?.mode !== "live" ? (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">
          <Sparkles size={12} className="mr-1 inline" />
          Billing is running in {status?.mode === "phase1_stripe_test" ? "Stripe test" : "mock"} mode. No real charges
          will be processed.
        </div>
      ) : null}
    </SettingsStack>
  );
}
