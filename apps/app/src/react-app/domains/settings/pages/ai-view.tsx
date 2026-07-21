/** @jsxImportSource react */
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ModelBehaviorSelect } from "@/components/model-behavior-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, KeyRound } from "lucide-react";
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
  onConnectCudos?: () => void | Promise<void>;
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

function providerStatusTone(label: string): "ready" | "warning" | "neutral" {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("connected") ||
    normalized.includes("available") ||
    normalized.includes("ready")
  )
    return "ready";
  if (
    label.toLowerCase().includes("error") ||
    label.toLowerCase().includes("fail")
  )
    return "warning";
  return "neutral";
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

export function AiSettingsView(props: AiSettingsViewProps) {
  const runtimeWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const [modelDetailsOpen, setModelDetailsOpen] = useState(false);
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
  const managedProviderCount = connectedProviders.filter(
    isMatterhornManagedProvider,
  ).length;
  const customerConnectedProviderCount =
    connectedProviders.length - managedProviderCount;
  const providerSummary = catalog?.serverFetched
    ? customerConnectedProviderCount > 0
      ? `${customerConnectedProviderCount} provider${customerConnectedProviderCount === 1 ? "" : "s"} connected`
      : managedProviderCount > 0
        ? "Included models ready"
        : "No providers connected"
    : !props.matterhornServerClient
      ? "Agent engine unavailable"
      : providerCatalogLoading
        ? "Checking provider connections"
        : props.providerSummary;
  const providerStatusLabel = catalog?.serverFetched
    ? customerConnectedProviderCount > 0
      ? "Connected"
      : managedProviderCount > 0
        ? "Available"
        : "Disconnected"
    : !props.matterhornServerClient
      ? "Offline"
      : providerCatalogLoading
        ? "Checking"
        : props.providerStatusLabel;
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
    <LayoutStack>
      {/* ---- Model routing ---- */}
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>Agent model</LayoutSectionTitle>
          <LayoutSectionDescription>
            See what answers prompts, where the model list comes from, and what
            is saved for this workspace.
          </LayoutSectionDescription>
        </LayoutSectionHeader>

        {opencodeSetupMissing ? (
          <SettingsNotice>
            The local agent engine is not running. Start Matterhorn with its
            managed engine, or attach an existing engine URL before starting
            chats and desk tasks.
          </SettingsNotice>
        ) : null}

        {catalogQueryFailed && !opencodeSetupMissing ? (
          <SettingsNotice tone="error">
            Model catalog could not load. Check the local Matterhorn Desks
            engine, then refresh this workspace.
          </SettingsNotice>
        ) : null}

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>
              {modelReadiness.currentChoice.value}
              <SettingsStatusBadge
                tone={modelReadiness.statusTone}
                label={modelReadiness.statusLabel}
              />
            </LayoutSectionItemTitle>
            <LayoutSectionItemDescription>
              {modelReadiness.currentChoice.detail}
            </LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Button
                variant="outline"
                onClick={() => void props.onOpenModelPicker()}
                disabled={props.busy}
              >
                Change model
              </Button>
              {canUseWorkspaceDefault ? (
                <Button
                  variant="ghost"
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
                  Save as workspace default
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
          </LayoutSectionItemHeader>

          <div className="grid gap-1">
            {[
              modelReadiness.workspaceDefault,
              modelReadiness.effectiveModel,
              modelReadiness.answerPath,
              modelReadiness.providerList,
            ].map((item) => (
              <ModelRoutingRow key={item.label} item={item} />
            ))}
          </div>

          {behaviorOptions.length > 1 ? (
            <div className="mt-3 rounded-md bg-dls-surface-muted/[0.08] px-3 py-2">
              <div className="grid items-center gap-2 py-1.5 @md/settings:grid-cols-[minmax(9rem,1fr)_auto]">
                <div>
                  <div className="text-xs font-medium text-dls-text">
                    Workspace reasoning default
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    Used by new chats and desk tasks unless this app overrides
                    it.
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
                    Current app override
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    {props.currentAppModelVariant
                      ? "Overrides the workspace for this app."
                      : "Inherits the workspace default."}
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
              <div className="grid items-center gap-2 py-1.5 text-xs @md/settings:grid-cols-[minmax(9rem,1fr)_auto]">
                <span className="text-muted-foreground">Provider fallback</span>
                <span className="text-dls-secondary">
                  {providerDefaultVariantLabel}
                </span>
              </div>
            </div>
          ) : null}

          <Collapsible
            open={modelDetailsOpen}
            onOpenChange={setModelDetailsOpen}
          >
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-medium text-dls-secondary transition-colors hover:text-dls-text"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      modelDetailsOpen && "rotate-180",
                    )}
                  />
                  Model details
                </button>
              }
            />
            <CollapsibleContent>
              <div className="mt-2 grid gap-2 text-xs text-dls-secondary @md/settings:grid-cols-2">
                {[
                  modelReadiness.providerCatalog,
                  modelReadiness.selectionPolicy,
                  ...modelReadiness.details,
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <span className="text-dls-text">{item.label}</span>
                    <span className="ml-2">{item.value}</span>
                    {item.detail ? (
                      <div className="mt-1 leading-5">{item.detail}</div>
                    ) : null}
                  </div>
                ))}
                {catalog?.connectedProviderIds.length ? (
                  <div className="min-w-0">
                    <span className="text-dls-text">Connected providers</span>
                    <span className="ml-2">
                      {catalog.connectedProviderIds
                        .slice(0, 4)
                        .map((providerId) => {
                          const provider = catalog.providers.find(
                            (candidate) => candidate.id === providerId,
                          );
                          return resolveProviderDisplayName(
                            providerId,
                            provider?.name,
                          );
                        })
                        .join(", ")}
                    </span>
                  </div>
                ) : null}
              </div>
              {modelReadiness.catalogRows.length ? (
                <div className="mt-3 rounded-md bg-dls-surface-muted/[0.08] px-3 py-3">
                  <div className="mb-1.5 text-xs font-medium text-dls-text">
                    Model catalog
                  </div>
                  <div className="grid gap-1">
                    {modelReadiness.catalogRows.map((row) => (
                      <div
                        key={row.providerId}
                        className="grid gap-1 rounded-md py-2 text-xs @md/settings:grid-cols-[minmax(10rem,14rem)_1fr] @md/settings:gap-4"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-dls-text">
                            {row.providerName}
                          </div>
                          <div className="truncate text-muted-foreground">
                            {row.providerId === "opencode"
                              ? "Included"
                              : row.providerId}{" "}
                            · {row.sourceLabel} · {row.connectedLabel}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-dls-secondary">
                            {row.modelCountLabel} · Default {row.defaultModel}
                          </div>
                          <div className="mt-0.5 truncate text-muted-foreground">
                            {row.sampleModels}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>

          <p className="mt-3 text-xs leading-5 text-dls-secondary">
            {modelReadiness.trainingPolicy}
          </p>
          {modelSelectionStatus ? (
            <p className="mt-2 text-xs leading-5 text-dls-secondary">
              {modelSelectionStatus}
            </p>
          ) : null}
        </LayoutSectionItem>
      </LayoutSection>

      {/* ---- Providers ---- */}
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>
            {t("settings.providers_title")}
          </LayoutSectionTitle>
          <LayoutSectionDescription>
            {t("settings.providers_desc")}
          </LayoutSectionDescription>
        </LayoutSectionHeader>

        <LayoutSectionItem className="flex-row flex-wrap items-center justify-between gap-3 rounded-md bg-dls-surface-muted/[0.09] px-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-dls-hover/70 text-dls-text">
              <KeyRound className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-dls-text">
                  CUDOS / ASI:Cloud
                </span>
                {props.cudosConnected ? (
                  <span className="text-xs text-green-11">
                    Credential saved
                  </span>
                ) : null}
              </div>
              <div className="text-xs leading-5 text-muted-foreground">
                OpenAI-compatible hosted inference with seven selectable models.
                The API key stays in the local engine auth store.
              </div>
            </div>
          </div>
          <Button
            variant={props.cudosConnected ? "outline" : "default"}
            onClick={() => void props.onConnectCudos?.()}
            disabled={
              props.busy ||
              props.providerAuthBusy ||
              props.cudosBusy ||
              !props.onConnectCudos
            }
          >
            {props.cudosBusy
              ? "Preparing CUDOS"
              : props.cudosConnected
                ? "Replace API key"
                : "Connect CUDOS"}
          </Button>
        </LayoutSectionItem>
        {props.cudosStatus ? (
          <SettingsNotice>{props.cudosStatus}</SettingsNotice>
        ) : null}
        {props.cudosError ? (
          <SettingsNotice tone="error">{props.cudosError}</SettingsNotice>
        ) : null}

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>
              {providerSummary}
              <SettingsStatusBadge
                tone={providerStatusTone(providerStatusLabel)}
                label={providerStatusLabel}
              />
            </LayoutSectionItemTitle>
            <LayoutSectionItemHeaderActions>
              <Button
                onClick={() => void props.onOpenProviderAuth()}
                disabled={props.busy || props.providerAuthBusy}
              >
                {props.providerAuthBusy
                  ? t("settings.loading_providers")
                  : t("settings.connect_provider")}
              </Button>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>

        {props.showOpenWorkModelsSubscribe ? (
          <LayoutSectionItem className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-6 bg-blue-2/30 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderIcon
                providerId="matterhorn"
                size={20}
                className="text-blue-11"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-dls-text">
                  Matterhorn Models
                </div>
                <div className="text-xs text-muted-foreground">
                  Frontier intelligence, hand picked for your team&apos;s most
                  ambitious work.
                </div>
              </div>
            </div>
            <Button
              onClick={() => void props.onSubscribeOpenWorkModels?.()}
              disabled={props.busy || props.providerAuthBusy}
            >
              Subscribe
            </Button>
          </LayoutSectionItem>
        ) : null}

        {connectedProviders.length > 0 ? (
          <div className="space-y-2">
            {connectedProviders.map((provider) =>
              (() => {
                const managedByMatterhorn =
                  isMatterhornManagedProvider(provider);
                const providerName = resolveProviderDisplayName(
                  provider.id,
                  provider.name,
                );
                return (
                  <LayoutSectionItem
                    key={provider.id}
                    className="flex-row flex-wrap items-center justify-between gap-3 rounded-md bg-dls-surface-muted/[0.075] px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ProviderIcon
                        providerId={
                          managedByMatterhorn ? "matterhorn" : provider.id
                        }
                        size={20}
                        className="text-dls-text"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-dls-text">
                            {providerName}
                          </span>
                          {props.cloudProviderIds?.has(provider.id) ? (
                            <span className="shrink-0 rounded-md border border-blue-6 bg-blue-2 px-1.5 py-0.5 text-[10px] font-medium text-blue-11">
                              Cloud
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {managedByMatterhorn
                            ? "Included model service"
                            : (providerSourceLabel(provider.source) ??
                              provider.id)}
                          {provider.modelCount != null
                            ? ` · ${provider.modelCount} model${provider.modelCount === 1 ? "" : "s"}`
                            : ""}
                        </div>
                      </div>
                    </div>
                    {managedByMatterhorn ? (
                      <SettingsStatusBadge tone="ready" label="Included" />
                    ) : !props.cloudProviderIds?.has(provider.id) ? (
                      <Button
                        variant="destructive"
                        onClick={() =>
                          void props.onDisconnectProvider(provider.id)
                        }
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
                  </LayoutSectionItem>
                );
              })(),
            )}
          </div>
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

        <LayoutSectionItemFootnote>
          {t("settings.api_keys_info")}
        </LayoutSectionItemFootnote>
      </LayoutSection>

      {props.cloudProvidersView}
    </LayoutStack>
  );
}
