/** @jsxImportSource react */
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ModelBehaviorSelect } from "@/components/model-behavior-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, KeyRound, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { t } from "@/i18n";
import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
import { recordModelReasoningLevelSelection } from "@/app/lib/model-operation-metrics";
import type { ModelBehaviorOption } from "@/app/types";
import { resolveProviderDisplayName } from "@/app/utils";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "../../../design-system/provider-icon";
import { SettingsNotice, SettingsStatusBadge } from "../settings-section";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemFootnote,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
  LayoutStack,
} from "../settings-layout";
import { notifyWorkspaceModelSelectionChanged } from "../model-selection-events";
import {
  buildModelReadinessSummary,
  countConnectedCatalogModels,
  type ModelReadinessDetail,
} from "../state/model-readiness-summary";

type ConnectedProvider = {
  id: string;
  name: string;
  source?: "env" | "api" | "config" | "custom";
  modelCount?: number;
};

export type AiSettingsViewProps = {
  busy: boolean;
  providerAuthBusy: boolean;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
  defaultModelLabel: string;
  defaultModelRef: string;
  defaultModelProviderId?: string | null;
  defaultModelId?: string | null;
  modelBehaviorTitle?: string | null;
  modelBehaviorOptions?: ModelBehaviorOption[];
  currentAppModelVariant?: string | null;
  providerDefaultModelVariant?: string | null;
  providerDefaultModelVariantLabel?: string | null;
  onCurrentAppModelVariantChange?: (variant: string | null) => void;
  hasLocalModelOverride?: boolean;
  connectedModelCount: number;
  providerStatusLabel: string;
  providerStatusStyle: string;
  providerSummary: string;
  connectedProviders: ConnectedProvider[];
  disconnectingProviderId: string | null;
  providerConnectError: string | null;
  providerDisconnectStatus: string | null;
  providerDisconnectError: string | null;
  cudosConnected?: boolean;
  cudosBusy?: boolean;
  cudosStatus?: string | null;
  cudosError?: string | null;
  providerCredentialsManaged?: boolean;
  onConnectCudos?: () => void | Promise<void>;
  pendingDeskTask?: { deskId: string; title: string } | null;
  onResumePendingDeskTask?: () => void | Promise<void>;
  onOpenModelPicker: () => void | Promise<void>;
  onUseWorkspaceDefault?: () => void | Promise<void>;
  onOpenProviderAuth: () => void | Promise<void>;
  onDisconnectProvider: (providerId: string) => void | Promise<void>;
  canDisconnectProvider: (source?: ConnectedProvider["source"]) => boolean;
  /** Set of local provider IDs that were imported from cloud. */
  cloudProviderIds?: Set<string>;
  showOpenWorkModelsSubscribe?: boolean;
  onSubscribeOpenWorkModels?: () => void | Promise<void>;
  cloudProvidersView?: ReactNode;
};

function providerSourceLabel(source?: ConnectedProvider["source"]) {
  if (source === "env") return t("settings.provider_source_env");
  if (source === "api") return t("providers.api_key_label");
  if (source === "config") return t("settings.provider_source_config");
  if (source === "custom") return t("settings.provider_source_custom");
  return null;
}

function isMatterhornManagedProvider(
  provider: Pick<ConnectedProvider, "id" | "name">,
) {
  return (
    provider.id.trim().toLowerCase() === "opencode" ||
    provider.name.trim().toLowerCase().includes("opencode")
  );
}

function catalogProviderSource(source?: string): ConnectedProvider["source"] {
  if (
    source === "env" ||
    source === "api" ||
    source === "config" ||
    source === "custom"
  ) {
    return source;
  }
  return undefined;
}

function ModelRoutingRow({ item }: { item: ModelReadinessDetail }) {
  return (
    <div className="grid gap-1 py-2.5 text-sm @md/settings:grid-cols-[9.5rem_1fr] @md/settings:gap-4">
      <div className="text-xs font-medium text-muted-foreground">
        {item.label}
      </div>
      <div className="min-w-0">
        <div className="truncate text-dls-text">{item.value}</div>
        {item.detail ? (
          <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {item.detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function compactTokenCount(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function usageResetLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "soon";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function AiSettingsView(props: AiSettingsViewProps) {
  const runtimeWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const [modelDetailsOpen, setModelDetailsOpen] = useState(false);
  const [providerDetailsOpen, setProviderDetailsOpen] = useState(false);
  const [localModelStatus, setLocalModelStatus] = useState<string | null>(null);
  const [workspaceVariantDraft, setWorkspaceVariantDraft] = useState<
    string | null
  >(null);
  const queryClient = useQueryClient();
  const workspaceBackendModelsQuery = useQuery({
    queryKey: ["settings-workspace-backend-models", runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && runtimeWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !runtimeWorkspaceId)
        throw new Error("Matterhorn Desks engine is offline.");
      return client.workspaceBackendModels(runtimeWorkspaceId);
    },
  });
  const backendModelsQuery = useQuery({
    queryKey: ["settings-backend-models"],
    enabled: Boolean(props.matterhornServerClient && !runtimeWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Desks engine is offline.");
      return client.backendModels();
    },
  });
  const workspaceModelSelectionQuery = useQuery({
    queryKey: ["settings-workspace-model-selection", runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && runtimeWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !runtimeWorkspaceId)
        throw new Error("Matterhorn Desks engine is offline.");
      return client.workspaceModelSelection(runtimeWorkspaceId);
    },
  });
  const workspaceModelUsageQuery = useQuery({
    queryKey: ["settings-workspace-model-usage", runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && runtimeWorkspaceId),
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !runtimeWorkspaceId)
        throw new Error("Matterhorn Desks engine is offline.");
      return client.workspaceModelUsageStatus(runtimeWorkspaceId);
    },
  });
  const saveWorkspaceDefaultMutation = useMutation({
    mutationFn: async () => {
      const client = props.matterhornServerClient;
      const providerId = props.defaultModelProviderId?.trim();
      const modelId = props.defaultModelId?.trim();
      if (!client || !runtimeWorkspaceId)
        throw new Error("Matterhorn Desks engine is offline.");
      if (!providerId || !modelId)
        throw new Error("Choose a model before saving a workspace default.");
      return client.saveWorkspaceModelSelection(runtimeWorkspaceId, {
        providerId,
        modelId,
        variant: workspaceVariantDraft,
      });
    },
    onSuccess: (data) => {
      recordModelReasoningLevelSelection({
        workspaceId: runtimeWorkspaceId,
        providerId: data.selection?.providerId,
        modelId: data.selection?.modelId,
        reasoningLevel: data.selection?.variant,
        source: "workspace",
      });
      queryClient.setQueryData(
        ["settings-workspace-model-selection", runtimeWorkspaceId],
        data,
      );
      void queryClient.invalidateQueries({
        queryKey: ["settings-workspace-backend-models", runtimeWorkspaceId],
      });
      notifyWorkspaceModelSelectionChanged(runtimeWorkspaceId);
    },
  });
  const clearWorkspaceDefaultMutation = useMutation({
    mutationFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !runtimeWorkspaceId)
        throw new Error("Matterhorn Desks engine is offline.");
      return client.clearWorkspaceModelSelection(runtimeWorkspaceId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["settings-workspace-model-selection", runtimeWorkspaceId],
        data,
      );
      void queryClient.invalidateQueries({
        queryKey: ["settings-workspace-backend-models", runtimeWorkspaceId],
      });
      notifyWorkspaceModelSelectionChanged(runtimeWorkspaceId);
    },
  });
  const backendModels =
    workspaceBackendModelsQuery.data ?? backendModelsQuery.data;
  const catalog = backendModels?.catalog;
  const opencodeSetupMissing = catalog?.errorCode === "opencode_unconfigured";
  const workspaceSelection =
    workspaceModelSelectionQuery.data?.selection ??
    backendModels?.workspaceSelection ??
    null;
  const effectiveWorkspaceModel =
    workspaceModelSelectionQuery.data?.effectiveModel ??
    backendModels?.defaultModel ??
    null;
  const catalogQueryFailed =
    workspaceBackendModelsQuery.isError || backendModelsQuery.isError;
  const connectedProviderCount = catalog?.serverFetched
    ? catalog.connectedProviderCount
    : props.connectedProviders.length;
  const connectedModelCount = catalog?.serverFetched
    ? countConnectedCatalogModels(catalog)
    : props.connectedModelCount;
  const providerCatalogLoading =
    workspaceBackendModelsQuery.isLoading || backendModelsQuery.isLoading;
  const providerStateLoading = providerCatalogLoading && !backendModels;
  const catalogProviderById = new Map(
    (catalog?.providers ?? []).map((provider) => [provider.id, provider]),
  );
  const connectedProviders =
    props.connectedProviders.length > 0
      ? props.connectedProviders.map((provider) => {
          const catalogProvider = catalogProviderById.get(provider.id);
          return {
            ...provider,
            name: catalogProvider?.name || provider.name,
            source:
              provider.source ?? catalogProviderSource(catalogProvider?.source),
            modelCount: catalogProvider?.modelCount ?? provider.modelCount,
          };
        })
      : (catalog?.providers ?? [])
          .filter((provider) => provider.connected)
          .map((provider) => ({
            id: provider.id,
            name: resolveProviderDisplayName(provider.id, provider.name),
            source: catalogProviderSource(provider.source),
            modelCount: provider.modelCount,
          }));
  const cudosProvider = connectedProviders.find(
    (provider) => provider.id.trim().toLowerCase() === "cudos",
  );
  const otherConnectedProviders = connectedProviders.filter(
    (provider) =>
      !isMatterhornManagedProvider(provider) &&
      provider.id.trim().toLowerCase() !== "cudos",
  );
  const connectedPromptProviders = connectedProviders.filter(
    (provider) => !isMatterhornManagedProvider(provider),
  );
  const modelProviderReady =
    connectedPromptProviders.length > 0 &&
    !opencodeSetupMissing &&
    !catalogQueryFailed;
  const cudosConnected = Boolean(props.cudosConnected || cudosProvider);
  const modelReadiness = buildModelReadinessSummary({
    currentModelLabel: props.defaultModelLabel,
    currentModelRef: props.defaultModelRef,
    hasLocalModelOverride: props.hasLocalModelOverride,
    backendModels,
    workspaceSelection,
    effectiveWorkspaceModel,
    catalogQueryFailed,
    connectedProviderCount,
    connectedModelCount,
  });
  const behaviorOptions = props.modelBehaviorOptions ?? [];
  const behaviorLabel = (value: string | null | undefined, fallback: string) =>
    behaviorOptions.find((option) => option.value === value)?.label ?? fallback;
  const providerDefaultVariant = props.providerDefaultModelVariant ?? null;
  const providerDefaultVariantLabel =
    props.providerDefaultModelVariantLabel ??
    behaviorLabel(providerDefaultVariant, "Provider default");
  const savedWorkspaceVariant = workspaceSelection?.variant ?? null;
  const workspaceVariantLabel = workspaceVariantDraft
    ? behaviorLabel(workspaceVariantDraft, workspaceVariantDraft)
    : providerDefaultVariantLabel;
  const currentAppVariantLabel = props.currentAppModelVariant
    ? behaviorLabel(props.currentAppModelVariant, props.currentAppModelVariant)
    : workspaceSelection
      ? behaviorLabel(savedWorkspaceVariant, providerDefaultVariantLabel)
      : providerDefaultVariantLabel;

  useEffect(() => {
    const sameModel = Boolean(
      workspaceSelection &&
      workspaceSelection.providerId === props.defaultModelProviderId?.trim() &&
      workspaceSelection.modelId === props.defaultModelId?.trim(),
    );
    setWorkspaceVariantDraft(
      sameModel ? (workspaceSelection?.variant ?? null) : null,
    );
  }, [
    props.defaultModelId,
    props.defaultModelProviderId,
    workspaceSelection?.modelId,
    workspaceSelection?.providerId,
    workspaceSelection?.variant,
  ]);

  const selectedModelMatchesWorkspaceDefault = Boolean(
    workspaceSelection &&
    workspaceSelection.providerId === props.defaultModelProviderId?.trim() &&
    workspaceSelection.modelId === props.defaultModelId?.trim() &&
    savedWorkspaceVariant === workspaceVariantDraft,
  );
  const canSaveWorkspaceDefault = Boolean(
    props.defaultModelProviderId &&
    props.defaultModelId &&
    props.matterhornServerClient &&
    runtimeWorkspaceId &&
    !selectedModelMatchesWorkspaceDefault,
  );
  const canUseWorkspaceDefault = Boolean(
    props.hasLocalModelOverride &&
    workspaceSelection &&
    props.onUseWorkspaceDefault,
  );
  const modelSelectionStatus =
    localModelStatus ??
    (saveWorkspaceDefaultMutation.error instanceof Error
      ? saveWorkspaceDefaultMutation.error.message
      : clearWorkspaceDefaultMutation.error instanceof Error
        ? clearWorkspaceDefaultMutation.error.message
        : saveWorkspaceDefaultMutation.isSuccess
          ? "Workspace default saved."
          : clearWorkspaceDefaultMutation.isSuccess
            ? "Workspace default reset."
            : null);

  return (
    <LayoutStack className="gap-y-8">
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>Model provider</LayoutSectionTitle>
          <LayoutSectionDescription>
            Connect a provider, then choose what answers chats and desk tasks.
          </LayoutSectionDescription>
        </LayoutSectionHeader>
        {props.pendingDeskTask ? (
          <div
            className="mt-4 flex flex-col gap-4 rounded-lg border border-dls-accent/30 bg-dls-surface-raised/70 p-4 sm:flex-row sm:items-center sm:justify-between"
            data-testid="pending-desk-task-handoff"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-dls-text">
                Finish setting up {props.pendingDeskTask.title}
              </div>
              <p className="mt-1 text-sm leading-5 text-dls-secondary">
                Choose a provider and model, then return to this desk task. Nothing has been sent.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                onClick={() => void props.onOpenProviderAuth()}
                disabled={props.busy || props.providerAuthBusy}
              >
                <Plus data-icon="inline-start" />
                Choose provider
              </Button>
              <Button
                variant="outline"
                onClick={() => void props.onResumePendingDeskTask?.()}
              >
                <ArrowLeft data-icon="inline-start" />
                Return to desk
              </Button>
            </div>
          </div>
        ) : null}

        {opencodeSetupMissing ? (
          <SettingsNotice>
            Matterhorn Desks is not ready to answer yet. Restart it, then
            reload this workspace.
          </SettingsNotice>
        ) : null}

        {catalogQueryFailed && !opencodeSetupMissing ? (
          <SettingsNotice tone="error">
            Models could not load. Check the Matterhorn Desks engine, then
            refresh this workspace.
          </SettingsNotice>
        ) : null}

        <LayoutSectionItem className="rounded-lg bg-dls-surface-raised/65 p-4">
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>
              {providerStateLoading
                ? "Checking model provider"
                : modelReadiness.currentChoice.label}
              {!providerStateLoading && modelReadiness.statusTone !== "ready" ? (
                <SettingsStatusBadge
                  tone={modelReadiness.statusTone}
                  label={modelReadiness.statusLabel}
                />
              ) : null}
            </LayoutSectionItemTitle>
            <LayoutSectionItemDescription>
              {providerStateLoading
                ? "Loading the models managed for this workspace."
                : modelProviderReady
                ? `${modelReadiness.currentChoice.value}. ${modelReadiness.currentChoice.detail}`
                : "Connect a provider below, then choose a model for chats and desk tasks."}
            </LayoutSectionItemDescription>
            {modelProviderReady && !providerStateLoading ? (
              <LayoutSectionItemHeaderActions>
                <Button
                  onClick={() => void props.onOpenModelPicker()}
                  disabled={props.busy}
                >
                  Choose model
                </Button>
                {canUseWorkspaceDefault ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setLocalModelStatus(
                      "Using the workspace default in this app.",
                    );
                    void props.onUseWorkspaceDefault?.();
                  }}
                  disabled={props.busy}
                >
                  Use workspace default
                </Button>
              ) : null}
                {canSaveWorkspaceDefault ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setLocalModelStatus(null);
                    saveWorkspaceDefaultMutation.mutate();
                  }}
                  disabled={
                    props.busy || saveWorkspaceDefaultMutation.isPending
                  }
                >
                  Save for workspace
                </Button>
              ) : null}
                {workspaceSelection ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLocalModelStatus(null);
                    clearWorkspaceDefaultMutation.mutate();
                  }}
                  disabled={
                    props.busy || clearWorkspaceDefaultMutation.isPending
                  }
                >
                  Reset
                </Button>
              ) : null}
              </LayoutSectionItemHeaderActions>
            ) : null}
          </LayoutSectionItemHeader>

          {modelProviderReady && behaviorOptions.length > 1 ? (
            <div className="mt-1 border-t border-border/60 pt-3">
              <div className="grid items-center gap-2 py-1.5 @md/settings:grid-cols-[minmax(9rem,1fr)_auto]">
                <div>
                  <div className="text-xs font-medium text-dls-text">
                    Workspace reasoning
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    Default for new chats and desk tasks.
                  </div>
                </div>
                <ModelBehaviorSelect
                  title={props.modelBehaviorTitle ?? "Reasoning effort"}
                  value={workspaceVariantDraft}
                  label={workspaceVariantLabel}
                  options={behaviorOptions}
                  onChange={setWorkspaceVariantDraft}
                  disabled={
                    props.busy || saveWorkspaceDefaultMutation.isPending
                  }
                  isProviderDefault={workspaceVariantDraft == null}
                />
              </div>
              <div className="grid items-center gap-2 py-1.5 @md/settings:grid-cols-[minmax(9rem,1fr)_auto]">
                <div>
                  <div className="text-xs font-medium text-dls-text">
                    This app
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    {props.currentAppModelVariant
                      ? "Overrides the workspace setting."
                      : "Uses the workspace setting."}
                  </div>
                </div>
                <ModelBehaviorSelect
                  title={props.modelBehaviorTitle ?? "Reasoning effort"}
                  value={props.currentAppModelVariant ?? null}
                  label={currentAppVariantLabel}
                  options={behaviorOptions}
                  onChange={(value) => {
                    recordModelReasoningLevelSelection({
                      workspaceId: runtimeWorkspaceId,
                      providerId: props.defaultModelProviderId,
                      modelId: props.defaultModelId,
                      reasoningLevel: value,
                      source: "current_app",
                    });
                    props.onCurrentAppModelVariantChange?.(value);
                  }}
                  disabled={props.busy || !props.onCurrentAppModelVariantChange}
                  isProviderDefault={props.currentAppModelVariant == null}
                  defaultLabel="Workspace default"
                />
              </div>
            </div>
          ) : null}

          <Collapsible
            open={modelDetailsOpen}
            onOpenChange={setModelDetailsOpen}
          >
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="mt-3 bg-dls-surface-muted/[0.22] text-dls-secondary hover:bg-dls-surface-muted/[0.38] hover:text-dls-text"
                >
                  How models work
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      modelDetailsOpen && "rotate-180",
                    )}
                  />
                </Button>
              }
            />
            <CollapsibleContent>
              <div className="mt-2 grid gap-1">
                {[
                  modelReadiness.workspaceDefault,
                  modelReadiness.effectiveModel,
                  modelReadiness.providerCatalog,
                ].map((item) => (
                  <ModelRoutingRow key={item.label} item={item} />
                ))}
              </div>
              <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-5 text-dls-secondary">
                {modelProviderReady
                  ? "Choose a model for this chat, then save it here when you want new chats and desk tasks to use the same default."
                  : "A model catalog is only a list. Connect a provider before chats and desk tasks can start."}
              </p>
              {modelReadiness.catalogRows.length ? (
                <div className="mt-3 border-t border-border/60 pt-3">
                  <div className="mb-1 text-xs font-medium text-dls-text">
                    Available providers
                  </div>
                  {modelReadiness.catalogRows.map((row) => (
                    <div
                      key={row.providerId}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-dls-text">
                          {row.providerName}
                        </div>
                      </div>
                      <div className="shrink-0 text-dls-secondary">
                        {row.modelCountLabel}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-5 text-dls-secondary">
                {modelReadiness.trainingPolicy}
              </p>
            </CollapsibleContent>
          </Collapsible>

          {modelSelectionStatus ? (
            <p className="text-xs leading-5 text-dls-secondary">
              {modelSelectionStatus}
            </p>
          ) : null}
        </LayoutSectionItem>
      </LayoutSection>

      {modelProviderReady ? (
        <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>Available models</LayoutSectionTitle>
          <LayoutSectionDescription>
            Models from the providers connected to this workspace.
          </LayoutSectionDescription>
        </LayoutSectionHeader>

        <div className="overflow-hidden rounded-lg bg-dls-surface-raised/55">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderIcon
                providerId="matterhorn"
                size={20}
                className="text-dls-text"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-dls-text">
                  Connected model catalog
                </div>
                <div className="text-xs text-muted-foreground">
                  {providerCatalogLoading
                    ? "Checking models..."
                    : `${connectedModelCount} model${connectedModelCount === 1 ? "" : "s"} from ${connectedPromptProviders.length} provider${connectedPromptProviders.length === 1 ? "" : "s"}`}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => void props.onOpenModelPicker()}
              disabled={
                props.busy || providerCatalogLoading || opencodeSetupMissing
              }
            >
              Browse models
            </Button>
          </div>

          {props.showOpenWorkModelsSubscribe ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <ProviderIcon
                  providerId="matterhorn"
                  size={20}
                  className="text-dls-text"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-dls-text">
                    Shared model catalog
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Models managed for your Matterhorn organization.
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => void props.onSubscribeOpenWorkModels?.()}
                disabled={props.busy || props.providerAuthBusy}
              >
                Subscribe
              </Button>
            </div>
          ) : null}

        </div>
      </LayoutSection>
      ) : null}

      {workspaceModelUsageQuery.data?.status ? (
        <LayoutSection>
          <LayoutSectionHeader>
            <LayoutSectionTitle>Free beta allowance</LayoutSectionTitle>
            <LayoutSectionDescription>
              Model usage included with this beta account. There are no automatic charges.
            </LayoutSectionDescription>
          </LayoutSectionHeader>
          <div className="divide-y divide-border/60 rounded-lg bg-dls-surface-raised/55 px-4">
            {[
              {
                label: "Today",
                period: workspaceModelUsageQuery.data.status.daily,
              },
              {
                label: "This month",
                period: workspaceModelUsageQuery.data.status.monthly,
              },
            ].map(({ label, period }) => (
              <div
                key={label}
                className="grid gap-1 py-3.5 text-sm @md/settings:grid-cols-[8rem_1fr_auto] @md/settings:items-center @md/settings:gap-4"
              >
                <span className="font-medium text-dls-text">{label}</span>
                <span className="text-dls-secondary">
                  {compactTokenCount(period.chargedTokens)} used
                  {period.limit === null
                    ? ""
                    : ` of ${compactTokenCount(period.limit)} weighted tokens`}
                </span>
                <span className="text-xs text-muted-foreground">
                  Resets {usageResetLabel(period.resetsAt)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Requests pause when an allowance is reached. Different models may use allowance at different rates.
            {workspaceModelUsageQuery.data.status.pendingRequests > 0
              ? ` ${workspaceModelUsageQuery.data.status.pendingRequests} active request${workspaceModelUsageQuery.data.status.pendingRequests === 1 ? " is" : "s are"} still being counted.`
              : ""}
          </p>
          {!workspaceModelUsageQuery.data.status.enabled ? (
            <SettingsNotice tone="error">
              Usage protection is not active in this deployment. Do not open public signups yet.
            </SettingsNotice>
          ) : null}
        </LayoutSection>
      ) : workspaceModelUsageQuery.isError ? (
        <SettingsNotice tone="error">
          Usage allowance could not load. Refresh this page before starting another model request.
        </SettingsNotice>
      ) : null}

      <LayoutSection>
        <LayoutSectionHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <LayoutSectionTitle>Model providers</LayoutSectionTitle>
              <LayoutSectionDescription>
                {props.providerCredentialsManaged
                  ? "Matterhorn manages the provider used by this web workspace."
                  : "Connect a provider account or API key you control."}
              </LayoutSectionDescription>
            </div>
            {!props.providerCredentialsManaged ? (
              <Button
                variant="outline"
                onClick={() => void props.onOpenProviderAuth()}
                disabled={props.busy || props.providerAuthBusy}
              >
                <Plus data-icon="inline-start" />
                {props.providerAuthBusy ? "Loading..." : "Choose provider"}
              </Button>
            ) : null}
          </div>
        </LayoutSectionHeader>

        <div className="overflow-hidden rounded-lg bg-dls-surface-raised/55">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <KeyRound className="size-5 shrink-0 text-dls-secondary" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-dls-text">
                    ASI:Cloud
                  </span>
                  {cudosConnected ? (
                    <span className="text-xs text-dls-secondary">
                      Connected
                    </span>
                  ) : null}
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  {props.providerCredentialsManaged
                    ? providerStateLoading
                      ? "Checking availability..."
                      : cudosConnected
                      ? "7 models available through Matterhorn"
                      : "Unavailable in this deployment"
                    : cudosConnected
                      ? "7 models available"
                      : "Connect your CUDOS API key to use seven models"}
                </div>
              </div>
            </div>
            {!props.providerCredentialsManaged ? (
              <Button
                variant={cudosConnected ? "outline" : "default"}
                onClick={() => void props.onConnectCudos?.()}
                disabled={
                  props.busy ||
                  props.providerAuthBusy ||
                  props.cudosBusy ||
                  !props.onConnectCudos
                }
              >
                {props.cudosBusy
                  ? "Opening..."
                  : cudosConnected
                    ? "Update CUDOS key"
                    : "Add CUDOS API key"}
              </Button>
            ) : null}
          </div>

          {otherConnectedProviders.map((provider) => {
            const providerName = resolveProviderDisplayName(
              provider.id,
              provider.name,
            );
            return (
              <div
                key={provider.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderIcon
                    providerId={provider.id}
                    providerName={providerName}
                    size={20}
                    className="text-dls-text"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-dls-text">
                      {providerName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {props.cloudProviderIds?.has(provider.id)
                        ? "Managed by your organization"
                        : (providerSourceLabel(provider.source) ?? provider.id)}
                      {provider.modelCount != null
                        ? ` · ${provider.modelCount} model${provider.modelCount === 1 ? "" : "s"}`
                        : ""}
                    </div>
                  </div>
                </div>
                {!props.cloudProviderIds?.has(provider.id) ? (
                  <Button
                    variant="destructive"
                    onClick={() => void props.onDisconnectProvider(provider.id)}
                    disabled={
                      props.busy ||
                      props.providerAuthBusy ||
                      props.disconnectingProviderId !== null ||
                      !props.canDisconnectProvider(provider.source)
                    }
                  >
                    {props.disconnectingProviderId === provider.id
                      ? t("settings.disconnecting")
                      : props.canDisconnectProvider(provider.source)
                        ? t("settings.disconnect")
                        : t("settings.managed_by_env")}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>

        {props.cudosStatus ? (
          <SettingsNotice>{props.cudosStatus}</SettingsNotice>
        ) : null}
        {props.cudosError ? (
          <SettingsNotice tone="error">{props.cudosError}</SettingsNotice>
        ) : null}
        {props.providerConnectError ? (
          <SettingsNotice tone="error">
            {props.providerConnectError}
          </SettingsNotice>
        ) : null}
        {props.providerDisconnectStatus ? (
          <SettingsNotice>{props.providerDisconnectStatus}</SettingsNotice>
        ) : null}
        {props.providerDisconnectError ? (
          <SettingsNotice tone="error">
            {props.providerDisconnectError}
          </SettingsNotice>
        ) : null}

        <Collapsible
          open={providerDetailsOpen}
          onOpenChange={setProviderDetailsOpen}
        >
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="bg-dls-surface-muted/[0.22] text-dls-secondary hover:bg-dls-surface-muted/[0.38] hover:text-dls-text"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    providerDetailsOpen && "rotate-180",
                  )}
                />
                Provider and data details
              </Button>
            }
          />
          <CollapsibleContent>
            <div className="mt-2 max-w-[70ch] space-y-2 text-xs leading-5 text-dls-secondary">
              <LayoutSectionItemFootnote>
                {t("settings.api_keys_info")}
              </LayoutSectionItemFootnote>
              <p>
                Provider credentials stay in this workspace runtime. A model
                becomes available only after its provider is connected.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </LayoutSection>

      {props.cloudProvidersView}
    </LayoutStack>
  );
}
