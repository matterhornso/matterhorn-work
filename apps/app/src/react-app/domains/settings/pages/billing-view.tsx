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
  MatterhornBillingSubscription,
} from "@matterhorn-work/types/billing";
import { buildMatterhornBillingPlans } from "@matterhorn-work/types/billing";
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
} from "../../billing/entitlements";

const LOCAL_BILLING_PLANS = buildMatterhornBillingPlans();

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
  return "Local preview";
}

function billingPlanDisplayName(planId: MatterhornBillingPlanId): string {
  if (planId === "plus") return "Matterhorn Plus";
  if (planId === "max") return "Matterhorn Max";
  return "Free";
}

function shortBillingPlanName(plan: MatterhornBillingPlan): string {
  return plan.name.replace(/^Matterhorn\s+/i, "").trim() || billingPlanDisplayName(plan.id);
}

function formatBillingDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function subscriptionStatusLabel(status: MatterhornBillingSubscription["status"]): string {
  if (status === "active") return "Active";
  if (status === "trialing") return "Trial";
  if (status === "past_due") return "Past due";
  if (status === "canceled") return "Canceled";
  if (status === "paused") return "Paused";
  return "No subscription";
}

function subscriptionPeriodCopy(subscription?: MatterhornBillingSubscription | null): string | null {
  if (!subscription || subscription.status === "none") return null;
  const periodEnd = formatBillingDate(subscription.currentPeriodEnd);
  if (periodEnd) {
    if (subscription.cancelAtPeriodEnd || subscription.status === "canceled") {
      return `Ends ${periodEnd}`;
    }
    return `Renews ${periodEnd}`;
  }
  const periodStart = formatBillingDate(subscription.currentPeriodStart);
  return periodStart ? `Active since ${periodStart}` : null;
}

function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function includedEntitlements(plan: MatterhornBillingPlan) {
  return plan.entitlements.filter((entitlement) => entitlement.included).slice(0, 4);
}

function billingPlanActionLabel(props: {
  mode: MatterhornBillingStatus["mode"];
  plan: MatterhornBillingPlan;
}): string {
  if (props.mode === "phase0_mock") return `Preview ${shortBillingPlanName(props.plan)}`;
  if (props.mode === "phase1_stripe_test") return `Start ${shortBillingPlanName(props.plan)} checkout`;
  return `Start ${shortBillingPlanName(props.plan)}`;
}

function billingPortalActionLabel(status?: MatterhornBillingStatus | null, portalReady = false): string {
  if (status?.mode === "phase0_mock") return "Billing account not connected";
  if (!portalReady) return "Portal setup needed";
  if (status?.mode === "phase1_stripe_test") return "Manage test plan";
  return "Manage billing";
}

function PaymentReadinessSummary(props: {
  status?: MatterhornBillingStatus | null;
  checkoutReady: boolean;
  portalReady: boolean;
  hasClient: boolean;
  hasWorkspace: boolean;
}) {
  const mode = props.status?.mode ?? "phase0_mock";
  const checkoutLabel = !props.hasClient
    ? "Engine offline"
    : !props.hasWorkspace
      ? "Open a workspace"
    : !props.status
      ? "Checking"
    : props.checkoutReady
      ? mode === "phase1_stripe_test"
        ? "Stripe test checkout"
        : "Local plan preview"
      : "Platform setup";
  const checkoutDetail = !props.hasClient
    ? "Connect the Matterhorn Desks engine to open checkout."
    : !props.hasWorkspace
      ? "Billing checkout is tied to a workspace so subscriptions can reconcile."
    : !props.status
      ? "Reading the workspace billing configuration."
    : props.checkoutReady
      ? mode === "phase1_stripe_test"
        ? "Uses Stripe test sessions only. No live charges."
        : "Lets you try plan changes locally. No payment provider is contacted."
      : "Finish the billing setup checks before checkout opens.";
  const portalRowLabel = "Billing portal";
  const portalLabel = !props.status
    ? "Checking"
    : mode === "phase0_mock"
      ? "Not connected"
      : !props.portalReady
        ? "Portal setup needed"
        : mode === "phase1_stripe_test"
          ? "Stripe test portal"
          : "Billing portal ready";
  const portalDetail = !props.status
    ? "Looking for a provider customer or local preview mode."
    : mode === "phase0_mock"
      ? "Matterhorn has not connected a payment provider. There is no billing account to manage."
      : !props.portalReady
        ? "A test customer must be connected by Matterhorn before the billing portal can open."
        : mode === "phase1_stripe_test"
          ? "Subscription management opens in Stripe test mode. No live charges."
          : "Subscription management opens in the configured billing portal.";
  const liveLabel = !props.status
    ? "Checking"
    : props.status.setup.livePaymentsEnabled
      ? "Live charges enabled"
      : "Live charges off";
  const liveDetail = !props.status
    ? "Live payment status comes from the Matterhorn billing setup."
    : props.status.setup.livePaymentsEnabled
    ? "Live billing is enabled for this workspace."
    : "Live Stripe mode stays blocked until keys, webhooks, prices, and review are complete.";
  const rows = [
    { label: "Checkout", value: checkoutLabel, detail: checkoutDetail },
    { label: portalRowLabel, value: portalLabel, detail: portalDetail },
    { label: "Live charging", value: liveLabel, detail: liveDetail },
  ];

  return (
    <div className="rounded-lg bg-dls-surface-muted/[0.06] px-3 py-2">
      <div className="pb-1">
        <p className="text-sm font-medium text-dls-text">Payment flow</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          Local previews are available now. Stripe checkout requires Matterhorn platform setup.
        </p>
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 py-2 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4"
        >
          <div className="text-xs font-medium leading-5 text-dls-secondary">{row.label}</div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-5 text-dls-text">{row.value}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{row.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
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
  const canSelectPlan = !props.current && !isLive && props.checkoutReady;
  const features = includedEntitlements(props.plan);
  const actionLabel = billingPlanActionLabel({
    mode: props.mode,
    plan: props.plan,
  });
  return (
    <div
      className={cn(
        "relative flex min-h-[250px] flex-col gap-3 rounded-lg px-4 py-4 transition-colors",
        props.current
          ? "bg-dls-hover/20 ring-1 ring-dls-border/25"
          : "bg-dls-surface-muted/[0.06] hover:bg-dls-hover/10",
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
      {canSelectPlan ? (
        <Button
          variant="default"
          size="sm"
          className="mt-auto h-8 rounded-md text-xs shadow-none"
          disabled={props.busy}
          onClick={() => props.onSelect(props.plan.id)}
        >
          {props.busy ? <Loader2 size={12} className="animate-spin" /> : null}
          {actionLabel}
        </Button>
      ) : (
        <p className="mt-auto text-xs leading-5 text-dls-secondary">
          {props.current
            ? "Active for this workspace"
            : isLive
              ? "Plan changes are unavailable in this build"
              : "Matterhorn must connect billing before plan changes open"}
        </p>
      )}
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
  const isHistoricalOnly = props.limit === 0 && props.used > 0;
  const valueLabel = isHistoricalOnly ? `${props.used} historical` : `${props.used} used`;
  const limitLabel = props.limit === null
    ? "Unlimited on this plan"
    : props.limit === 0
      ? "Not included on this plan"
      : `Plan includes ${props.limit}`;
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)] sm:items-center">
      <div className="min-w-0">
        <div className="text-sm font-medium text-dls-text">{props.label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{limitLabel}</span>
          {resetLabel ? <span>{resetLabel}</span> : null}
          {status ? (
            <span className={status.tone === "error" ? "text-red-300" : "text-amber-300"}>
              {status.label}
            </span>
          ) : null}
        </div>
      </div>
      {percent === null ? (
        <div className="text-right text-xs font-medium tabular-nums text-dls-secondary">{valueLabel}</div>
      ) : (
        <div className="grid gap-1.5">
          <div className="text-right text-xs font-medium tabular-nums text-dls-secondary">{valueLabel}</div>
          <Progress
            aria-label={`${props.label} usage`}
            value={percent}
            className="gap-0 [&_[data-slot=progress-indicator]]:bg-dls-text [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-dls-hover/55"
          />
        </div>
      )}
    </div>
  );
}

function PolicyRow(props: {
  label: string;
  detail: string;
  state: string;
}) {
  return (
    <div className="grid gap-2 rounded-md px-2.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-dls-text">{props.label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{props.detail}</div>
      </div>
      <div className="text-xs leading-5 text-dls-secondary sm:text-right">{props.state}</div>
    </div>
  );
}

function PlanPolicySection(props: { status?: MatterhornBillingStatus | null }) {
  const generatedImageUsage = props.status
    ? formatPlanAllowance(props.status.usage.generatedImages.limit)
    : "Free 10 / Plus 100 / Max unlimited";
  const nftUsage = props.status
    ? formatPlanAllowance(props.status.usage.nftDrafts.limit)
    : "Plus / Max";
  const teamUsage = props.status
    ? formatPlanAllowance(props.status.usage.teamMembers.limit)
    : "1 on Free and Plus / 10 on Max";

  return (
    <SettingsSection>
      <div>
        <h3 className="text-sm font-medium text-dls-text">What billing changes</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Paid plans unlock metered creation and publishing. Local workspace control stays available.
        </p>
      </div>
      <div className="grid gap-1 rounded-lg bg-dls-surface-muted/[0.08] p-2">
        <PolicyRow
          label="Always available"
          detail="Chat, local notes, memory review, protocol reads, exports, and settings are not blocked by billing."
          state="Never gated"
        />
        <PolicyRow
          label="Generated images"
          detail="Image generation can call paid providers, so usage is counted per billing period."
          state={generatedImageUsage}
        />
        <PolicyRow
          label="NFT publishing"
          detail="NFT drafts stay local. Mint previews require Plus or Max; Walrus upload and marketplace listing require Max."
          state={nftUsage}
        />
        <PolicyRow
          label="Team access"
          detail="Team member limits apply to shared workspace access only, not local notes or memory."
          state={teamUsage}
        />
      </div>
    </SettingsSection>
  );
}

function formatPlanAllowance(limit: number | null): string {
  if (limit === null) return "Unlimited on this plan";
  if (limit === 0) return "Not included on this plan";
  return `${limit} included on this plan`;
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
    mutationFn: (planId: MatterhornBillingPlanId) => {
      if (!workspaceId) {
        return Promise.reject(new Error("Open a workspace before changing plans."));
      }
      return client?.workspaceBillingCheckout(workspaceId, { planId, interval: "month" }) ??
        Promise.reject(new Error("No client"));
    },
    onSuccess: (data) => {
      if (data?.checkoutUrl) {
        const isMock = data.mode === "mock";
        if (!isMock) {
          window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
        }
        showToast({
          title: isMock ? "Plan preview saved" : "Test checkout opened",
          description: isMock
            ? "This does not change access or contact a payment provider."
            : "Complete the Stripe test checkout, then Matterhorn will refresh this workspace plan.",
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
        const isMock = data.mode === "mock";
        if (!isMock) {
          window.open(data.portalUrl, "_blank", "noopener,noreferrer");
        }
        showToast({
          title: isMock ? "Plan management opened" : "Billing portal opened",
          description: isMock
            ? "This is local plan management. No payment provider account is contacted."
            : "Subscription management opens in a hosted billing page.",
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

  const serverPlans = plansQuery.data?.plans ?? [];
  const plans = serverPlans.length ? serverPlans : LOCAL_BILLING_PLANS;
  const usingLocalPlanCatalog = serverPlans.length === 0;
  const status = statusQuery.data?.status;
  const billingLoadError = plansQuery.error ?? statusQuery.error ?? (!client ? "Matterhorn Desks engine is offline" : null);
  const currentPlanId = status?.subscription.planId ?? plansQuery.data?.currentPlanId ?? "free";
  const pendingPlan = status?.pendingCheckout?.planId
    ? plans.find((plan) => plan.id === status.pendingCheckout?.planId)
    : null;
  const setupChecks = status?.setup.checks ?? [];
  const checkoutReady = Boolean(workspaceId) && (status?.mode === "phase0_mock" || status?.setup.readyForTestCheckout === true);
  const portalReady =
    status?.mode !== "phase0_mock" && (
      Boolean(status?.subscription.providerCustomerId?.trim()) ||
      setupChecks.some((check) => check.id === "stripe_test_customer" && check.status === "working")
    );
  const portalCanOpen = Boolean(client && status?.mode !== "live" && portalReady);
  const accountLinkage = status?.accountLinkage;
  const subscriptionCopy = subscriptionPeriodCopy(status?.subscription);
  const subscriptionLabel = status ? subscriptionStatusLabel(status.subscription.status) : null;
  const pendingCheckoutExpiryCopy = formatBillingDate(status?.pendingCheckout?.expiresAt);
  const pendingCheckoutCopy = status?.pendingCheckout
    ? status.pendingCheckout.mode === "stripe_test"
      ? `The plan changes after the Stripe test webhook confirms it${pendingCheckoutExpiryCopy ? `, or expires ${pendingCheckoutExpiryCopy}` : ""}.`
      : `This is a local preview and does not change plan access${pendingCheckoutExpiryCopy ? `; it expires ${pendingCheckoutExpiryCopy}` : ""}.`
    : null;

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
      <SettingsInset className="rounded-lg bg-dls-surface-muted/[0.08]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Current plan</span>
              <span className="text-lg font-semibold tracking-tight text-dls-text">
                {plans.find((p) => p.id === currentPlanId)?.name ?? billingPlanDisplayName(currentPlanId)}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {billingModeLabel(status)}. No raw card data is handled by Matterhorn.
              </span>
              {accountLinkage ? (
                <span className="text-xs leading-5 text-muted-foreground">
                  {accountLinkage.label}. {accountLinkage.description}
                </span>
              ) : null}
              {subscriptionLabel ? (
                <span className="text-xs leading-5 text-muted-foreground">
                  Plan status: {subscriptionLabel}{subscriptionCopy ? `. ${subscriptionCopy}.` : "."}
                </span>
              ) : null}
            </div>
            {status?.pendingCheckout ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs leading-5 text-amber-200">
                <span>
                  Checkout pending for {pendingPlan?.name ?? billingPlanDisplayName(status.pendingCheckout.planId)}. {pendingCheckoutCopy}
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
            <SettingsPill className="bg-dls-surface-muted/[0.13] text-dls-secondary">
              <ShieldCheck size={12} />
              {billingModeLabel(status)}
            </SettingsPill>
            {portalCanOpen ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 border-0 bg-dls-surface-muted/[0.13] px-2 text-xs text-dls-secondary shadow-none hover:bg-dls-surface-muted/[0.2] hover:text-dls-text"
                disabled={portalMutation.isPending}
                onClick={() => portalMutation.mutate()}
              >
                {portalMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                {billingPortalActionLabel(status, portalReady)}
              </Button>
            ) : (
              <span className="text-xs text-dls-secondary">
                {billingPortalActionLabel(status, portalReady)}
              </span>
            )}
          </div>
        </div>
        <PaymentReadinessSummary
          status={status}
          checkoutReady={checkoutReady}
          portalReady={portalReady}
          hasClient={Boolean(client)}
          hasWorkspace={Boolean(workspaceId)}
        />
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
        {usingLocalPlanCatalog ? (
          <div className="rounded-lg bg-dls-surface-muted/[0.08] px-3 py-2 text-xs leading-5 text-muted-foreground">
            Showing the local Matterhorn plan catalog. Connect the Matterhorn Desks engine to open checkout,
            refresh usage, or manage a subscription.
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          {!plans.length ? (
            <ErrorState
              className="sm:col-span-2 lg:col-span-3"
              error={billingLoadError ?? "Billing plans are not available."}
              title="Billing plans could not load"
              detail={client ? "Retry once the workspace engine is available." : "Connect the Matterhorn Desks engine to view plans."}
              onRetry={client ? () => {
                void plansQuery.refetch();
                void statusQuery.refetch();
              } : undefined}
            />
          ) : null}
        </div>
      </SettingsSection>

      <PlanPolicySection status={status} />

      <SettingsSection>
        <h3 className="text-sm font-medium text-dls-text">Usage</h3>
        <div className="grid gap-1">
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
                  {status?.mode === "phase0_mock"
                    ? "Local plan previews work now. Matterhorn must connect Stripe before checkout is available."
                    : "Stripe test checkout is safe; live payments remain disabled."}
                </p>
              </div>
              <CollapsibleTrigger
                render={(
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground">
                    {status?.mode === "phase0_mock"
                      ? "Local preview"
                      : status?.setup.readyForTestCheckout
                        ? "Stripe test ready"
                        : "Platform setup"}
                    <ChevronDown
                      size={13}
                      className={cn("transition-transform", readinessOpen && "rotate-180")}
                    />
                  </Button>
                )}
              />
            </div>
            <CollapsibleContent>
              <div className="mt-3 grid gap-1">
                {setupChecks.map((check) => (
                  <div key={check.id} className="flex items-start justify-between gap-3 rounded-md px-2.5 py-2.5">
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
        <div className="flex items-start gap-2 rounded-lg bg-dls-hover/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            {status?.mode === "phase1_stripe_test"
              ? "Stripe test mode is active. Test cards only; no real charges are processed."
              : "Local billing preview is active. No checkout, payment account, or real charge is involved."}
          </span>
        </div>
      ) : null}
    </SettingsStack>
  );
}
