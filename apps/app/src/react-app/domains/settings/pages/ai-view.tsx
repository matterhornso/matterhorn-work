/** @jsxImportSource react */
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { t } from "@/i18n";
import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
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
import { buildModelReadinessSummary, type ModelReadinessDetail } from "../state/model-readiness-summary";

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
  if (label.toLowerCase().includes("connected")) return "ready";
  if (label.toLowerCase().includes("error") || label.toLowerCase().includes("fail")) return "warning";
  return "neutral";
}

function ModelRoutingRow({ item }: { item: ModelReadinessDetail }) {
  return (
    <div className="grid gap-1 py-2.5 text-sm @md/settings:grid-cols-[9.5rem_1fr] @md/settings:gap-4">
      <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
      <div className="min-w-0">
        <div className="truncate text-dls-text">{item.value}</div>
        {item.detail ? <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</div> : null}
      </div>
    </div>
  );
}

export function AiSettingsView(props: AiSettingsViewProps) {
  const runtimeWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const [modelDetailsOpen, setModelDetailsOpen] = useState(false);
  const [localModelStatus, setLocalModelStatus] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const workspaceBackendModelsQuery = useQuery({
    queryKey: ["settings-workspace-backend-models", runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && runtimeWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !runtimeWorkspaceId) throw new Error("Matterhorn Work engine is offline.");
      return client.workspaceBackendModels(runtimeWorkspaceId);
    },
  });
  const backendModelsQuery = useQuery({
    queryKey: ["settings-backend-models"],
    enabled: Boolean(props.matterhornServerClient && !runtimeWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Work engine is offline.");
      return client.backendModels();
    },
  });
  const workspaceModelSelectionQuery = useQuery({
    queryKey: ["settings-workspace-model-selection", runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && runtimeWorkspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !runtimeWorkspaceId) throw new Error("Matterhorn Work engine is offline.");
      return client.workspaceModelSelection(runtimeWorkspaceId);
    },
  });
  const saveWorkspaceDefaultMutation = useMutation({
    mutationFn: async () => {
      const client = props.matterhornServerClient;
      const providerId = props.defaultModelProviderId?.trim();
      const modelId = props.defaultModelId?.trim();
      if (!client || !runtimeWorkspaceId) throw new Error("Matterhorn Work engine is offline.");
      if (!providerId || !modelId) throw new Error("Choose a model before saving a workspace default.");
      return client.saveWorkspaceModelSelection(runtimeWorkspaceId, { providerId, modelId });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["settings-workspace-model-selection", runtimeWorkspaceId], data);
      void queryClient.invalidateQueries({ queryKey: ["settings-workspace-backend-models", runtimeWorkspaceId] });
      notifyWorkspaceModelSelectionChanged(runtimeWorkspaceId);
    },
  });
  const clearWorkspaceDefaultMutation = useMutation({
    mutationFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !runtimeWorkspaceId) throw new Error("Matterhorn Work engine is offline.");
      return client.clearWorkspaceModelSelection(runtimeWorkspaceId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["settings-workspace-model-selection", runtimeWorkspaceId], data);
      void queryClient.invalidateQueries({ queryKey: ["settings-workspace-backend-models", runtimeWorkspaceId] });
      notifyWorkspaceModelSelectionChanged(runtimeWorkspaceId);
    },
  });
  const backendModels = workspaceBackendModelsQuery.data ?? backendModelsQuery.data;
  const catalog = backendModels?.catalog;
  const opencodeSetupMissing = catalog?.errorCode === "opencode_unconfigured";
  const workspaceSelection = workspaceModelSelectionQuery.data?.selection ?? backendModels?.workspaceSelection ?? null;
  const effectiveWorkspaceModel = workspaceModelSelectionQuery.data?.effectiveModel ?? backendModels?.defaultModel ?? null;
  const catalogQueryFailed = workspaceBackendModelsQuery.isError || backendModelsQuery.isError;
  const connectedProviderCount = catalog?.serverFetched ? catalog.connectedProviderCount : props.connectedProviders.length;
  const connectedModelCount = catalog?.serverFetched ? catalog.modelCount : props.connectedModelCount;
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
  const canSaveWorkspaceDefault = Boolean(props.defaultModelProviderId && props.defaultModelId && props.matterhornServerClient && runtimeWorkspaceId);
  const canUseWorkspaceDefault = Boolean(props.hasLocalModelOverride && workspaceSelection && props.onUseWorkspaceDefault);
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
            See what answers prompts, where the model list comes from, and what is saved for this workspace.
          </LayoutSectionDescription>
        </LayoutSectionHeader>

        {opencodeSetupMissing ? (
          <SettingsNotice>
            Local agent engine needs setup. Start the local stack with managed engine, or attach an existing engine URL before starting chats and desk tasks.
          </SettingsNotice>
        ) : null}

        {catalogQueryFailed && !opencodeSetupMissing ? (
          <SettingsNotice tone="error">
            Model catalog could not load. Check the local Matterhorn Work engine, then refresh this workspace.
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
            <LayoutSectionItemDescription>{modelReadiness.currentChoice.detail}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Button variant="outline" onClick={() => void props.onOpenModelPicker()} disabled={props.busy}>
                Change model
              </Button>
              {canUseWorkspaceDefault ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLocalModelStatus("Using the workspace default in this app.");
                    void props.onUseWorkspaceDefault?.();
                  }}
                  disabled={props.busy}
                >
                  Use workspace default
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  setLocalModelStatus(null);
                  saveWorkspaceDefaultMutation.mutate();
                }}
                disabled={props.busy || !canSaveWorkspaceDefault || saveWorkspaceDefaultMutation.isPending}
              >
                Save as workspace default
              </Button>
              {workspaceSelection ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLocalModelStatus(null);
                    clearWorkspaceDefaultMutation.mutate();
                  }}
                  disabled={props.busy || clearWorkspaceDefaultMutation.isPending}
                >
                  Reset
                </Button>
              ) : null}
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>

          <div className="divide-y divide-dls-border/35">
            {[modelReadiness.workspaceDefault, modelReadiness.effectiveModel, modelReadiness.answerPath, modelReadiness.providerList].map((item) => (
              <ModelRoutingRow key={item.label} item={item} />
            ))}
          </div>

          <Collapsible open={modelDetailsOpen} onOpenChange={setModelDetailsOpen}>
            <CollapsibleTrigger
              render={(
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-medium text-dls-secondary transition-colors hover:text-dls-text"
                >
                  <ChevronDown className={cn("size-3.5 transition-transform", modelDetailsOpen && "rotate-180")} />
                  Model details
                </button>
              )}
            />
            <CollapsibleContent>
              <div className="mt-2 grid gap-2 text-xs text-dls-secondary @md/settings:grid-cols-2">
                {[modelReadiness.providerCatalog, modelReadiness.selectionPolicy, ...modelReadiness.details].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <span className="text-dls-text">{item.label}</span>
                    <span className="ml-2">{item.value}</span>
                    {item.detail ? <div className="mt-1 leading-5">{item.detail}</div> : null}
                  </div>
                ))}
                {catalog?.connectedProviderIds.length ? (
                  <div className="min-w-0">
                    <span className="text-dls-text">Connected providers</span>
                    <span className="ml-2">{catalog.connectedProviderIds.slice(0, 4).join(", ")}</span>
                  </div>
                ) : null}
              </div>
              {modelReadiness.catalogRows.length ? (
                <div className="mt-3 border-t border-dls-border/45 pt-3">
                  <div className="mb-1.5 text-xs font-medium text-dls-text">Model catalog</div>
                  <div className="divide-y divide-dls-border/35">
                    {modelReadiness.catalogRows.map((row) => (
                      <div
                        key={row.providerId}
                        className="grid gap-1 py-2 text-xs @md/settings:grid-cols-[minmax(10rem,14rem)_1fr] @md/settings:gap-4"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-dls-text">{row.providerName}</div>
                          <div className="truncate text-muted-foreground">
                            {row.providerId} · {row.sourceLabel} · {row.connectedLabel}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-dls-secondary">
                            {row.modelCountLabel} · Default {row.defaultModel}
                          </div>
                          <div className="mt-0.5 truncate text-muted-foreground">{row.sampleModels}</div>
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
            <p className="mt-2 text-xs leading-5 text-dls-secondary">{modelSelectionStatus}</p>
          ) : null}
        </LayoutSectionItem>
      </LayoutSection>

      {/* ---- Providers ---- */}
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.providers_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.providers_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>
              {props.providerSummary}
              <SettingsStatusBadge
                tone={providerStatusTone(props.providerStatusLabel)}
                label={props.providerStatusLabel}
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
              <ProviderIcon providerId="matterhorn" size={20} className="text-blue-11" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-dls-text">Matterhorn Models</div>
                <div className="text-xs text-muted-foreground">
                  Frontier intelligence, hand picked for your team&apos;s most ambitious work.
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

        {props.connectedProviders.length > 0 ? (
          <div className="space-y-2">
            {props.connectedProviders.map((provider) => (
              <LayoutSectionItem
                key={provider.id}
                className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg border border-dls-border px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderIcon providerId={provider.id} size={20} className="text-dls-text" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-dls-text">{provider.name}</span>
                      {props.cloudProviderIds?.has(provider.id) ? (
                        <span className="shrink-0 rounded-full border border-blue-6 bg-blue-2 px-2 py-0.5 text-[10px] font-medium text-blue-11">
                          Cloud
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{provider.id}</div>
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
              </LayoutSectionItem>
            ))}
          </div>
        ) : null}

        {props.providerConnectError ? (
          <SettingsNotice tone="error">{props.providerConnectError}</SettingsNotice>
        ) : null}
        {props.providerDisconnectStatus ? (
          <SettingsNotice>{props.providerDisconnectStatus}</SettingsNotice>
        ) : null}
        {props.providerDisconnectError ? (
          <SettingsNotice tone="error">{props.providerDisconnectError}</SettingsNotice>
        ) : null}

        <LayoutSectionItemFootnote>{t("settings.api_keys_info")}</LayoutSectionItemFootnote>
      </LayoutSection>

      {props.cloudProvidersView}

    </LayoutStack>
  );
}
