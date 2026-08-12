/** @jsxImportSource react */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MatterhornBackendModelsResponse,
  MatterhornProviderPrivacyPolicy,
} from "@matterhorn-work/types/backend-models";
import type { MatterhornWorkspaceFeedbackUse } from "@matterhorn-work/types/backend-data-policy";
import { ArrowUpRight, Database, Download, FileText, NotebookPen } from "lucide-react";

import { SettingsNotice, SettingsStatusBadge } from "../settings-section";
import {
  LayoutSection,
  LayoutSectionContent,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
  LayoutStack,
} from "../settings-layout";

export type PrivacySettingsViewProps = {
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
  onOpenModels: () => void;
  onOpenMemory: () => void;
  onOpenNotes: () => void;
  onOpenOutputs: () => void;
};

function safeArchiveFilePart(value: string) {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "workspace"
  );
}

function downloadWorkspaceArchiveFile(input: {
  filename: string;
  data: ArrayBuffer;
  contentType: string | null;
}) {
  const blob = new Blob([input.data], {
    type: input.contentType ?? "application/gzip",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = input.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export function providerPrivacyTone(policy: MatterhornProviderPrivacyPolicy) {
  if (
    policy.status === "verified_no_training" ||
    policy.status === "local_processing"
  ) {
    return "ready" as const;
  }
  if (!policy.allowed || policy.status === "unverified") return "error" as const;
  return "warning" as const;
}

export function providerRetentionLabel(policy: MatterhornProviderPrivacyPolicy) {
  if (policy.retentionDays === 0) return "No provider retention";
  if (policy.retentionDays == null) return "Retention not verified";
  return `${policy.retentionDays}-day provider retention`;
}

export function activeProviderPrivacyPolicies(
  models: MatterhornBackendModelsResponse,
) {
  const catalogProviders = Array.isArray(models.catalog?.providers)
    ? models.catalog.providers
    : [];
  const privacyProviders = Array.isArray(models.privacy?.providers)
    ? models.privacy.providers
    : [];
  const activeProviderIds = new Set(
    catalogProviders
      .filter(
        (provider) =>
          provider.connected &&
          provider.modelCount > 0 &&
          provider.id.trim().toLowerCase() !== "opencode",
      )
      .map((provider) => provider.id.trim().toLowerCase()),
  );
  return privacyProviders.filter((policy) =>
    activeProviderIds.has(policy.providerId.trim().toLowerCase()),
  );
}

export function providerVerificationLabel(policy: MatterhornProviderPrivacyPolicy) {
  if (!policy.verifiedAt) return "Not verified";
  const verifiedAt = new Date(policy.verifiedAt);
  if (!Number.isFinite(verifiedAt.getTime())) return "Verified";
  return `Verified ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(verifiedAt)}`;
}

export function PrivacySettingsView(props: PrivacySettingsViewProps) {
  const workspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const queryClient = useQueryClient();
  const [archiveDownloaded, setArchiveDownloaded] = useState(false);
  const privacyQuery = useQuery({
    queryKey: ["settings-privacy-center", workspaceId],
    enabled: Boolean(props.matterhornServerClient && workspaceId),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId)
        throw new Error("Open a workspace to review its privacy controls.");
      const [models, dataMap, controls, dataPolicy] = await Promise.all([
        client.workspaceBackendModels(workspaceId),
        client.workspaceDataMap(workspaceId),
        client.workspaceDataControls(workspaceId),
        client.workspaceDataPolicy(workspaceId),
      ]);
      return { models, dataMap, controls, dataPolicy };
    },
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: async (feedbackUse: MatterhornWorkspaceFeedbackUse) => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId)
        throw new Error("Open a workspace to update its feedback policy.");
      return client.updateWorkspaceDataPolicy(workspaceId, { feedbackUse });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["settings-privacy-center", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["settings-workspace-data-policy", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["settings-workspace-backend-control-plane", workspaceId],
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId) {
        throw new Error("Open a connected workspace to download its archive.");
      }
      return client.exportWorkspaceDataArchive(workspaceId);
    },
    onMutate: () => setArchiveDownloaded(false),
    onSuccess: (archive) => {
      downloadWorkspaceArchiveFile({
        filename:
          archive.filename ??
          `matterhorn-workspace-${safeArchiveFilePart(workspaceId)}-${new Date().toISOString().slice(0, 10)}.json.gz`,
        data: archive.data,
        contentType: archive.contentType,
      });
      setArchiveDownloaded(true);
    },
  });

  const data = privacyQuery.data;
  const providers = data ? activeProviderPrivacyPolicies(data.models) : [];
  const feedbackEnabled =
    data?.dataPolicy.policy.feedbackUse !== "disabled";
  const retention = data?.controls.policy.retention;
  const summary = data?.controls.summary;

  return (
    <LayoutStack aria-busy={privacyQuery.isLoading || undefined}>
      {!workspaceId ? (
        <SettingsNotice>Open a workspace to review its privacy controls.</SettingsNotice>
      ) : privacyQuery.isError ? (
        <SettingsNotice tone="error">
          {privacyQuery.error instanceof Error
            ? privacyQuery.error.message
            : "Privacy controls could not be loaded."}
        </SettingsNotice>
      ) : privacyQuery.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading privacy controls…
        </p>
      ) : null}

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>Model processing</LayoutSectionTitle>
          <LayoutSectionDescription>
            See who receives prompts and the policy Matterhorn enforces before a request is sent.
          </LayoutSectionDescription>
        </LayoutSectionHeader>
        <LayoutSectionContent className="divide-y divide-border/60">
          <LayoutSectionItem className="py-3 first:pt-0">
            <LayoutSectionItemHeader>
              <LayoutSectionItemTitle>Matterhorn</LayoutSectionItemTitle>
              <LayoutSectionItemDescription>
                Workspace content is not used to train Matterhorn models.
              </LayoutSectionItemDescription>
              <LayoutSectionItemHeaderActions>
                <SettingsStatusBadge tone="ready" label="Training off" />
              </LayoutSectionItemHeaderActions>
            </LayoutSectionItemHeader>
          </LayoutSectionItem>

          {providers.map((provider) => (
            <LayoutSectionItem key={provider.providerId} className="py-3">
              <LayoutSectionItemHeader>
                <LayoutSectionItemTitle>{provider.providerName}</LayoutSectionItemTitle>
                <LayoutSectionItemDescription>
                  {provider.description} {providerRetentionLabel(provider)}. {providerVerificationLabel(provider)}.
                  {provider.policyUrl ? (
                    <>
                      {" "}
                      <a
                        href={provider.policyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-6 items-center gap-1 font-medium text-dls-text underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Provider policy
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </a>
                    </>
                  ) : null}
                </LayoutSectionItemDescription>
                <LayoutSectionItemHeaderActions>
                  <SettingsStatusBadge
                    tone={providerPrivacyTone(provider)}
                    label={provider.allowed ? provider.label : "Blocked"}
                  />
                </LayoutSectionItemHeaderActions>
              </LayoutSectionItemHeader>
            </LayoutSectionItem>
          ))}

          {data && providers.length === 0 ? (
            <LayoutSectionItem className="py-3">
              <LayoutSectionItemHeader>
                <LayoutSectionItemTitle>No external provider is active</LayoutSectionItemTitle>
                <LayoutSectionItemDescription>
                  Choose a verified model provider before chats or desk tasks can send prompts.
                </LayoutSectionItemDescription>
                <LayoutSectionItemHeaderActions>
                  <Button variant="outline" onClick={props.onOpenModels}>Manage models</Button>
                </LayoutSectionItemHeaderActions>
              </LayoutSectionItemHeader>
            </LayoutSectionItem>
          ) : null}
        </LayoutSectionContent>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>Workspace data</LayoutSectionTitle>
          <LayoutSectionDescription>
            Review where durable work lives and which stores can be exported or deleted.
          </LayoutSectionDescription>
        </LayoutSectionHeader>
        <LayoutSectionContent className="divide-y divide-border/60">
          <LayoutSectionItem className="py-3 first:pt-0">
            <LayoutSectionItemHeader>
              <LayoutSectionItemTitle>Storage and controls</LayoutSectionItemTitle>
              <LayoutSectionItemDescription>
                {summary
                  ? `${summary.totalStores} stores · ${summary.exportableStores} exportable · ${summary.deletableStores} deletable · ${summary.userControlledStores} user-controlled.`
                  : "Storage controls load with this workspace."}
              </LayoutSectionItemDescription>
            </LayoutSectionItemHeader>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={props.onOpenMemory}>
                <Database data-icon="inline-start" /> Memory
              </Button>
              <Button variant="outline" onClick={props.onOpenNotes}>
                <NotebookPen data-icon="inline-start" /> Notes
              </Button>
              <Button variant="outline" onClick={props.onOpenOutputs}>
                <FileText data-icon="inline-start" /> Outputs
              </Button>
            </div>
          </LayoutSectionItem>
          <LayoutSectionItem className="py-3">
            <LayoutSectionItemHeader>
              <LayoutSectionItemTitle>Complete workspace archive</LayoutSectionItemTitle>
              <LayoutSectionItemDescription>
                Download chats, todos, notes, confirmed memory, the memory review inbox, outputs, and sanitized workspace settings. Secrets and authentication material are excluded.
              </LayoutSectionItemDescription>
              <LayoutSectionItemHeaderActions>
                <Button
                  variant="outline"
                  disabled={
                    !props.matterhornServerClient ||
                    !workspaceId ||
                    archiveMutation.isPending
                  }
                  onClick={() => archiveMutation.mutate()}
                >
                  <Download data-icon="inline-start" />
                  {archiveMutation.isPending ? "Preparing…" : "Download archive"}
                </Button>
              </LayoutSectionItemHeaderActions>
            </LayoutSectionItemHeader>
            {archiveDownloaded ? (
              <p role="status" className="text-xs text-muted-foreground">
                Workspace archive downloaded.
              </p>
            ) : archiveMutation.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : "Workspace archive could not be downloaded."}
              </p>
            ) : null}
          </LayoutSectionItem>
          <LayoutSectionItem className="py-3">
            <LayoutSectionItemHeader>
              <LayoutSectionItemTitle>Accountability history</LayoutSectionItemTitle>
              <LayoutSectionItemDescription>
                {retention?.summary ?? "Task events, workflow runs, and audit history are append-only."}
                {retention ? ` ${retention.windowLabel}.` : ""}
              </LayoutSectionItemDescription>
              <LayoutSectionItemHeaderActions>
                <SettingsStatusBadge tone="neutral" label={retention?.label ?? "Append-only"} />
              </LayoutSectionItemHeaderActions>
            </LayoutSectionItemHeader>
          </LayoutSectionItem>
        </LayoutSectionContent>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>Product feedback</LayoutSectionTitle>
          <LayoutSectionDescription>
            Feedback is separate from prompts and is never used for model training.
          </LayoutSectionDescription>
        </LayoutSectionHeader>
        <LayoutSectionItem className="border-t border-border/60 pt-3">
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>Collect explicit feedback</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>
              {feedbackEnabled
                ? "Thumbs up, thumbs down, and written feedback can be stored for evaluation, routing, and product quality."
                : "New feedback is disabled. Existing feedback remains available for export or deletion."}
            </LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Switch
                checked={feedbackEnabled}
                disabled={!data || updateFeedbackMutation.isPending}
                onCheckedChange={(checked) =>
                  updateFeedbackMutation.mutate(
                    checked ? "eval_routing_product_quality_only" : "disabled",
                  )
                }
                aria-label="Collect explicit workspace feedback"
              />
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
          {updateFeedbackMutation.isPending ? (
            <p role="status" className="text-xs text-muted-foreground">Saving…</p>
          ) : updateFeedbackMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {updateFeedbackMutation.error instanceof Error
                ? updateFeedbackMutation.error.message
                : "Feedback policy could not be saved."}
            </p>
          ) : null}
        </LayoutSectionItem>
      </LayoutSection>
    </LayoutStack>
  );
}
