/** @jsxImportSource react */
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { t } from "@/i18n";
import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
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

function yesNo(value: boolean | undefined) {
  return value ? "Yes" : "No";
}

function catalogStatusTone(status: string | undefined): "ready" | "warning" | "neutral" {
  if (status === "working") return "ready";
  if (status === "needs_setup") return "warning";
  return "neutral";
}

function catalogStatusLabel(status: string | undefined) {
  if (status === "working") return "Working";
  if (status === "needs_setup") return "Needs setup";
  if (status === "preview") return "Preview";
  if (status === "unsupported") return "Not supported here";
  return "Unknown";
}

export function AiSettingsView(props: AiSettingsViewProps) {
  const runtimeWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";
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
    },
  });
  const backendModels = workspaceBackendModelsQuery.data ?? backendModelsQuery.data;
  const modelRouting = backendModels?.routing;
  const catalog = backendModels?.catalog;
  const workspaceSelection = workspaceModelSelectionQuery.data?.selection ?? backendModels?.workspaceSelection ?? null;
  const effectiveWorkspaceModel = workspaceModelSelectionQuery.data?.effectiveModel ?? backendModels?.defaultModel ?? null;
  const catalogQueryFailed = workspaceBackendModelsQuery.isError || backendModelsQuery.isError;
  const catalogTone = catalogQueryFailed ? "warning" : catalogStatusTone(catalog?.status);
  const catalogLabel = catalogQueryFailed ? "Needs engine" : catalogStatusLabel(catalog?.status);
  const connectedProviderCount = catalog?.serverFetched ? catalog.connectedProviderCount : props.connectedProviders.length;
  const connectedModelCount = catalog?.serverFetched ? catalog.modelCount : props.connectedModelCount;
  const catalogSourceLabel = catalog?.serverFetched ? "Server snapshot" : "Delegated";
  const canSaveWorkspaceDefault = Boolean(props.defaultModelProviderId && props.defaultModelId && props.matterhornServerClient && runtimeWorkspaceId);
  const modelSelectionStatus =
    saveWorkspaceDefaultMutation.error instanceof Error
      ? saveWorkspaceDefaultMutation.error.message
      : clearWorkspaceDefaultMutation.error instanceof Error
        ? clearWorkspaceDefaultMutation.error.message
        : saveWorkspaceDefaultMutation.isSuccess
          ? "Workspace default saved."
          : clearWorkspaceDefaultMutation.isSuccess
            ? "Workspace default reset."
            : null;

  return (
    <LayoutStack>
      {/* ---- Model routing ---- */}
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>Model routing</LayoutSectionTitle>
          <LayoutSectionDescription>
            Current model, provider list source, and selection policy.
          </LayoutSectionDescription>
        </LayoutSectionHeader>

        <LayoutSectionItem className="rounded-lg border border-dls-border/70 px-4 py-3">
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>
              {props.defaultModelLabel}
              <SettingsStatusBadge
                tone={catalogTone}
                label={catalogLabel}
              />
            </LayoutSectionItemTitle>
            <LayoutSectionItemHeaderActions>
              <Button variant="outline" onClick={() => void props.onOpenModelPicker()} disabled={props.busy}>
                Change model
              </Button>
              <Button
                variant="outline"
                onClick={() => saveWorkspaceDefaultMutation.mutate()}
                disabled={props.busy || !canSaveWorkspaceDefault || saveWorkspaceDefaultMutation.isPending}
              >
                Save workspace default
              </Button>
              {workspaceSelection ? (
                <Button
                  variant="ghost"
                  onClick={() => clearWorkspaceDefaultMutation.mutate()}
                  disabled={props.busy || clearWorkspaceDefaultMutation.isPending}
                >
                  Reset
                </Button>
              ) : null}
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
          <div className="mt-3 grid gap-2 text-sm text-dls-secondary sm:grid-cols-2">
            <div>
              <span className="text-dls-text">Model</span>
              <span className="ml-2 font-mono text-xs">{props.defaultModelRef}</span>
            </div>
            <div>
              <span className="text-dls-text">Workspace default</span>
              <span className="ml-2 font-mono text-xs">
                {workspaceSelection
                  ? `${workspaceSelection.providerId}/${workspaceSelection.modelId}`
                  : effectiveWorkspaceModel
                    ? `${effectiveWorkspaceModel.providerId}/${effectiveWorkspaceModel.modelId}`
                    : "Not saved"}
              </span>
            </div>
            <div>
              <span className="text-dls-text">Connected</span>
              <span className="ml-2">{connectedProviderCount} providers · {connectedModelCount} models</span>
            </div>
            <div>
              <span className="text-dls-text">Answers</span>
              <span className="ml-2">{modelRouting?.answerPath.label ?? "OpenCode session prompts"}</span>
            </div>
            <div>
              <span className="text-dls-text">Model list</span>
              <span className="ml-2">{modelRouting?.registry.label ?? "OpenCode provider list"}</span>
            </div>
            <div>
              <span className="text-dls-text">User selectable</span>
              <span className="ml-2">{yesNo(modelRouting?.selection.userSelectable ?? true)}</span>
            </div>
            <div>
              <span className="text-dls-text">Server registry</span>
              <span className="ml-2">{modelRouting?.registry.serverOwned ? "Server-owned" : "Delegated"}</span>
            </div>
            <div>
              <span className="text-dls-text">Catalog</span>
              <span className="ml-2">{catalogSourceLabel}</span>
            </div>
            <div>
              <span className="text-dls-text">Preference store</span>
              <span className="ml-2">{modelRouting?.selection.preferenceStore === "server" ? "Workspace" : "Local app"}</span>
            </div>
            {catalog?.connectedProviderIds.length ? (
              <div>
                <span className="text-dls-text">Providers</span>
                <span className="ml-2">{catalog.connectedProviderIds.slice(0, 4).join(", ")}</span>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-dls-secondary">
            {backendModels?.privacy.trainingUse === "none_by_default"
              ? "No model training by default. Feedback is stored for eval, routing, and product quality only."
              : "Training policy is unavailable."}
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
