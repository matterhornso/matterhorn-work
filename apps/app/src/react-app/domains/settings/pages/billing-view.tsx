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
  MatterhornBillingSetupCheck,
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
  SettingsStatusBadge,
} from "../settings-section";
import { backendCapabilityLabel, backendCapabilityTone } from "../backend-capability-status";
import {
  entitlementUsageStatus,
  formatEntitlementLimit,
  formatEntitlementReset,
  formatEntitlementUsage,
} from "../../billing/entitlements";

export type BillingSettingsViewProps = {
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
};

function formatPrice(amountCents: number, currency: string, interval: string): string {
  if (amountCents === 0) return "Free";
  const amount = (amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2);
  return `$${amount} ${currency.toUpperCase()}/${interval}`;
}

function setupBadgeTone(status: MatterhornBillingSetupCheck["status"]): "ready" | "warning" | "neutral" | "error" {
  const tone = backendCapabilityTone(status);
  if (tone === "setup" || tone === "preview") return "warning";
  return tone;
}

function PlanCard(props: {
  plan: MatterhornBillingPlan;
  current: boolean;
  mode: MatterhornBillingStatus["mode"];
  checkoutReady: boolean;
  onSelect: (planId: MatterhornBillingPlanId) => void;
  busy: boolean;
}) {
  const isLive = props.mode === "live";
  const disabled = props.current || props.busy || isLive || !props.checkoutReady;
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-lg p-4",
        props.current
          ? "bg-dls-hover/35 ring-1 ring-dls-border/35"
          : "bg-dls-surface-muted/15",
        props.plan.popular && !props.current && "ring-1 ring-amber-500/20",
      )}
    >
      {props.plan.popular ? (
        <span className="absolute right-3 top-3 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
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
        disabled={disabled}
        onClick={() => props.onSelect(props.plan.id)}
      >
        {props.busy ? <Loader2 size={12} className="animate-spin" /> : null}
        {props.current ? "Current plan" : isLive ? "Unavailable" : !props.checkoutReady ? "Needs setup" : props.plan.ctaLabel}
      </Button>
    </div>
  );
}

export function BillingSettingsView(props: BillingSettingsViewProps) {
  const client = props.matterhornServerClient;
  const workspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const plansQuery = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => client?.billingPlans(),
    enabled: Boolean(client),
  });
  const statusQuery = useQuery({
    queryKey: ["billing", "status", workspaceId || "global"],
    queryFn: () => workspaceId
      ? client?.workspaceBillingStatus(workspaceId)
      : client?.billingStatus(),
    enabled: Boolean(client),
  });

  const checkoutMutation = useMutation({
    mutationFn: (planId: MatterhornBillingPlanId) =>
      workspaceId
        ? client?.workspaceBillingCheckout(workspaceId, { planId, interval: "month" }) ??
          Promise.reject(new Error("No client"))
        : client?.billingCheckout({ planId, interval: "month" }) ?? Promise.reject(new Error("No client")),
    onSuccess: (data) => {
      if (data?.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
      }
      void statusQuery.refetch();
    },
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      workspaceId
        ? client?.workspaceBillingPortal(workspaceId) ?? Promise.reject(new Error("No client"))
        : client?.billingPortal() ?? Promise.reject(new Error("No client")),
    onSuccess: (data) => {
      if (data?.portalUrl) {
        window.open(data.portalUrl, "_blank", "noopener,noreferrer");
      }
    },
  });

  const plans = plansQuery.data?.plans ?? [];
  const status = statusQuery.data?.status;
  const currentPlanId = status?.subscription.planId ?? plansQuery.data?.currentPlanId ?? "free";
  const setupChecks = status?.setup.checks ?? [];
  const checkoutReady = status?.mode === "phase0_mock" || status?.setup.readyForTestCheckout === true;
  const portalReady =
    status?.mode === "phase0_mock" ||
    Boolean(status?.subscription.providerCustomerId?.trim()) ||
    setupChecks.some((check) => check.id === "stripe_test_customer" && check.status === "working");
  const portalDisabled = !client || portalMutation.isPending || status?.mode === "live" || !portalReady;

  const usageItems = useMemo(() => {
    if (!status) return [];
    return [
      {
        label: "Generated images",
        used: status.usage.generatedImages.used,
        limit: status.usage.generatedImages.limit,
        resetsAt: status.usage.generatedImages.resetsAt ?? null,
      },
      {
        label: "NFT mint previews",
        used: status.usage.nftDrafts.used,
        limit: status.usage.nftDrafts.limit,
        resetsAt: status.usage.nftDrafts.resetsAt ?? null,
      },
      {
        label: "Team members",
        used: status.usage.teamMembers.used,
        limit: status.usage.teamMembers.limit,
        resetsAt: null,
      },
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
              Manage your Matterhorn plan and workspace usage. Live payments are disabled in this build.
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
                disabled={portalDisabled}
                onClick={() => portalMutation.mutate()}
              >
                {portalMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                {portalReady ? "Manage billing" : "Portal needs setup"}
              </Button>
            </div>
          </div>
          {checkoutMutation.error || portalMutation.error ? (
            <p className="text-xs leading-5 text-red-300">
              {(checkoutMutation.error ?? portalMutation.error) instanceof Error
                ? (checkoutMutation.error ?? portalMutation.error)?.message
                : "Billing action failed."}
            </p>
          ) : null}
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
              checkoutReady={checkoutReady}
              onSelect={(id) => checkoutMutation.mutate(id)}
              busy={checkoutMutation.isPending}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-medium text-dls-text">Usage</h3>
        <div className="flex flex-col gap-2">
          {usageItems.map((item) => {
            const resetLabel = formatEntitlementReset(item.resetsAt);
            const usageStatus = entitlementUsageStatus(item.used, item.limit);
            return (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 rounded-md bg-dls-surface-muted/15 px-3 py-2.5"
              >
                <span className="text-xs text-dls-secondary">{item.label}</span>
                <span className="flex flex-col items-end gap-0.5 text-right">
                  <span className="text-xs font-medium text-dls-text">
                    {formatEntitlementUsage(item.used, item.limit)}
                  </span>
                  {usageStatus ? (
                    <span
                      className={cn(
                        "text-[11px]",
                        usageStatus.tone === "error" ? "text-red-300" : "text-amber-300",
                      )}
                    >
                      {usageStatus.label}
                    </span>
                  ) : null}
                  {resetLabel ? <span className="text-[11px] text-muted-foreground">{resetLabel}</span> : null}
                </span>
              </div>
            );
          })}
          {usageItems.length === 0 ? (
            <div className="text-xs text-muted-foreground">Usage data is not available.</div>
          ) : null}
        </div>
      </SettingsSection>

      {setupChecks.length ? (
        <SettingsSection>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-dls-text">Setup</h3>
            <SettingsPill>
              <ShieldCheck size={12} />
              {status?.setup.readyForTestCheckout ? "Test checkout ready" : "Needs setup"}
            </SettingsPill>
          </div>
          <div className="flex flex-col gap-2">
            {setupChecks.map((check) => (
              <div key={check.id} className="flex items-start justify-between gap-3 rounded-md bg-dls-surface-muted/15 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-dls-text">{check.label}</div>
                  <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{check.description}</div>
                </div>
                <SettingsStatusBadge
                  className="min-h-6 px-1.5"
                  label={backendCapabilityLabel(check.status)}
                  tone={setupBadgeTone(check.status)}
                />
              </div>
            ))}
          </div>
        </SettingsSection>
      ) : null}

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
