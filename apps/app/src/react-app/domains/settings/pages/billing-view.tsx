/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, ExternalLink, Info, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import type {
  MatterhornBillingInterval,
  MatterhornBillingPlan,
  MatterhornBillingPlanId,
  MatterhornBillingSetupCheck,
  MatterhornBillingStatus,
} from "@matterhorn-work/types/billing";
import {
  SettingsInset,
  SettingsPill,
  SettingsSection,
  SettingsStack,
  SettingsStatusBadge,
} from "../settings-section";
import { backendCapabilityLabel, backendCapabilityTone } from "../backend-capability-status";
import { useStatusToasts } from "../../shell-feedback/status-toasts";
import { ErrorState } from "../../shell/error-state";
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

function formatPrice(amountCents: number, currency: string, interval: MatterhornBillingInterval): string {
  if (amountCents === 0) return "Free";
  const amount = (amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2);
  return `$${amount}/${interval}`;
}

function setupBadgeTone(status: MatterhornBillingSetupCheck["status"]): "ready" | "warning" | "neutral" | "error" {
  const tone = backendCapabilityTone(status);
  if (tone === "setup" || tone === "preview") return "warning";
  return tone;
}

function billingActionErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message) return fallback;
  if (/billing_provider_unavailable|portal requires|needs setup/i.test(message)) {
    return "Billing portal setup is not complete yet. Test checkout still works when enabled.";
  }
  if (/live mode|live payments/i.test(message)) {
    return "Live billing is intentionally disabled in this build.";
  }
  return message;
}

function billingModeLabel(status?: MatterhornBillingStatus | null): string {
  if (status?.mode === "phase1_stripe_test") return "Stripe test";
  if (status?.mode === "live") return "Live";
  return "Test mode";
}

function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function includedEntitlements(plan: MatterhornBillingPlan) {
  return plan.entitlements.filter((entitlement) => entitlement.included).slice(0, 4);
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
  const features = includedEntitlements(props.plan);
  return (
    <div
      className={cn(
        "relative flex min-h-[250px] flex-col gap-3 rounded-lg border px-4 py-4 transition-colors",
        props.current
          ? "border-dls-border/55 bg-dls-hover/20"
          : "border-dls-border/20 bg-transparent hover:border-dls-border/40 hover:bg-dls-hover/10",
      )}
    >
      {props.plan.popular ? (
        <span className="absolute right-4 top-4 text-xs font-medium text-amber-300">
          Best fit
        </span>
      ) : null}
      <div className="flex min-h-6 items-start justify-between gap-3 pr-16">
        <h3 className="text-sm font-semibold leading-6 text-dls-text">{props.plan.name}</h3>
        {props.current ? (
          <SettingsPill className="absolute right-4 top-4 bg-dls-hover/35">
            <Check size={12} />
            Current
          </SettingsPill>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-dls-secondary">{props.plan.tagline}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tracking-tight text-dls-text">
          {formatPrice(props.plan.price.amountCents, props.plan.price.currency, props.plan.price.interval)}
        </span>
        {props.plan.price.amountCents > 0 ? (
          <span className="text-xs text-muted-foreground">{props.plan.price.currency.toUpperCase()}</span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5 pt-1">
        {features.map((entitlement) => (
          <li key={entitlement.key} className="flex items-start gap-2 text-xs leading-5 text-dls-secondary">
            <Check size={12} className="mt-1 shrink-0 text-emerald-300" />
            <span>
              {entitlement.label}
              {entitlement.limit != null ? (
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
        {props.current ? "Current plan" : isLive ? "Unavailable" : !props.checkoutReady ? "Setup needed" : props.plan.ctaLabel}
      </Button>
    </div>
  );
}

function UsageRow(props: {
  label: string;
  used: number;
  limit: number | null;
  resetsAt?: string | null;
}) {
  const resetLabel = formatEntitlementReset(props.resetsAt);
  const status = entitlementUsageStatus(props.used, props.limit);
  const percent = usagePercent(props.used, props.limit);
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)] sm:items-center">
      <div className="min-w-0">
        <div className="text-sm font-medium text-dls-text">{props.label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatEntitlementUsage(props.used, props.limit)}</span>
          {resetLabel ? <span>{resetLabel}</span> : null}
          {status ? (
            <span className={status.tone === "error" ? "text-red-300" : "text-amber-300"}>
              {status.label}
            </span>
          ) : null}
        </div>
      </div>
      {percent === null ? (
        <div className="text-right text-xs text-muted-foreground">
          {props.limit === null ? "Unlimited" : "Not included"}
        </div>
      ) : (
        <Progress
          aria-label={`${props.label} usage`}
          value={percent}
          className="gap-0 [&_[data-slot=progress-indicator]]:bg-dls-text [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-dls-hover/55"
        />
      )}
    </div>
  );
}

export function BillingSettingsView(props: BillingSettingsViewProps) {
  const client = props.matterhornServerClient;
  const workspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const [readinessOpen, setReadinessOpen] = useState(false);
  const { showToast } = useStatusToasts();
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
        showToast({
          title: "Checkout opened",
          description: "Complete the hosted checkout, then Matterhorn will refresh this workspace plan.",
          tone: "info",
        });
      }
      void statusQuery.refetch();
    },
    onError: (error) => {
      showToast({
        title: "Checkout could not open",
        description: billingActionErrorMessage(error, "Billing checkout failed."),
        tone: "error",
      });
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
        showToast({
          title: "Billing portal opened",
          description: "Subscription management opens in a hosted billing page.",
          tone: "info",
        });
      }
    },
    onError: (error) => {
      showToast({
        title: "Billing portal unavailable",
        description: billingActionErrorMessage(error, "Billing portal failed."),
        tone: "warning",
      });
    },
  });
  const clearPendingCheckoutMutation = useMutation({
    mutationFn: () =>
      workspaceId && client?.workspaceBillingPendingCheckoutClear
        ? client.workspaceBillingPendingCheckoutClear(workspaceId)
        : Promise.reject(new Error("No workspace billing client")),
    onSuccess: () => {
      void statusQuery.refetch();
      showToast({
        title: "Pending checkout cleared",
        description: "The workspace is back to its confirmed billing plan.",
        tone: "success",
      });
    },
    onError: (error) => {
      showToast({
        title: "Pending checkout was not cleared",
        description: billingActionErrorMessage(error, "Could not clear pending checkout."),
        tone: "error",
      });
    },
  });

  const plans = plansQuery.data?.plans ?? [];
  const status = statusQuery.data?.status;
  const billingLoadError = plansQuery.error ?? statusQuery.error ?? (!client ? "Matterhorn Work engine is offline" : null);
  const currentPlanId = status?.subscription.planId ?? plansQuery.data?.currentPlanId ?? "free";
  const pendingPlan = status?.pendingCheckout?.planId
    ? plans.find((plan) => plan.id === status.pendingCheckout?.planId)
    : null;
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
      <SettingsInset className="rounded-lg bg-dls-surface-muted/10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Current plan</span>
              <span className="text-lg font-semibold tracking-tight text-dls-text">
                {plans.find((p) => p.id === currentPlanId)?.name ?? currentPlanId}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {billingModeLabel(status)}. No raw card data is handled by Matterhorn.
              </span>
            </div>
            {status?.pendingCheckout ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs leading-5 text-amber-200">
                <span>
                  Checkout pending for {pendingPlan?.name ?? status.pendingCheckout.planId}. The plan changes after the
                  Stripe test webhook confirms it.
                </span>
                {workspaceId ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 px-2 text-[11px] text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                    disabled={clearPendingCheckoutMutation.isPending}
                    onClick={() => clearPendingCheckoutMutation.mutate()}
                  >
                    {clearPendingCheckoutMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : null}
                    Clear pending
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SettingsPill>
              <ShieldCheck size={12} />
              {billingModeLabel(status)}
            </SettingsPill>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={portalDisabled}
              title={portalReady ? undefined : "Billing portal needs setup before it can open."}
              onClick={() => portalMutation.mutate()}
            >
              {portalMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
              {portalReady ? "Manage billing" : "Portal setup needed"}
            </Button>
          </div>
        </div>
      </SettingsInset>

      <SettingsSection>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-dls-text">Plans</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Local notes, memory, and reads stay available on every plan.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          {plans.length === 0 ? (
            <ErrorState
              className="sm:col-span-2 lg:col-span-3"
              error={billingLoadError ?? "Billing plans are not available."}
              title="Billing plans could not load"
              detail={client ? "Retry once the workspace engine is available." : "Connect the Matterhorn Work engine to view plans."}
              onRetry={client ? () => {
                void plansQuery.refetch();
                void statusQuery.refetch();
              } : undefined}
            />
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-medium text-dls-text">Usage</h3>
        <div className="divide-y divide-dls-border/25">
          {usageItems.map((item) => (
            <UsageRow
              key={item.label}
              label={item.label}
              used={item.used}
              limit={item.limit}
              resetsAt={item.resetsAt}
            />
          ))}
          {usageItems.length === 0 ? (
            <div className="text-xs text-muted-foreground">Usage data is not available.</div>
          ) : null}
        </div>
      </SettingsSection>

      {setupChecks.length ? (
        <SettingsSection>
          <Collapsible open={readinessOpen} onOpenChange={setReadinessOpen}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-dls-text">Billing readiness</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Test checkout is safe; live payments remain disabled.
                </p>
              </div>
              <CollapsibleTrigger
                render={(
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground">
                    {status?.setup.readyForTestCheckout ? "Test checkout ready" : "Needs setup"}
                    <ChevronDown
                      size={13}
                      className={cn("transition-transform", readinessOpen && "rotate-180")}
                    />
                  </Button>
                )}
              />
            </div>
            <CollapsibleContent>
              <div className="mt-3 divide-y divide-dls-border/25">
                {setupChecks.map((check) => (
                  <div key={check.id} className="flex items-start justify-between gap-3 py-2.5">
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
            </CollapsibleContent>
          </Collapsible>
        </SettingsSection>
      ) : null}

      {status?.mode !== "live" ? (
        <div className="flex items-start gap-2 rounded-lg bg-dls-hover/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Billing is running in {status?.mode === "phase1_stripe_test" ? "Stripe test" : "test"} mode. No real
            charges will be processed.
          </span>
        </div>
      ) : null}
    </SettingsStack>
  );
}
