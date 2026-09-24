/** @jsxImportSource react */
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MatterhornBackendModelCatalogSnapshot,
  MatterhornBackendModelSelectionRecord,
  MatterhornProviderPrivacyPolicy,
} from "@matterhorn-work/types/backend-models";
import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
import { isChatModelId } from "@/app/lib/minimal-ui";
import { resolveModelDisplayName } from "@/app/utils";
import { isCatalogOnlyProviderId } from "../../connections/provider-list-query";
import { Button } from "@/components/ui/button";
import { notifyWorkspaceModelSelectionChanged } from "../model-selection-events";

export function MinimalModels(props: {
  client?: MatterhornServerClient | null;
  workspaceId: string;
  catalog?: MatterhornBackendModelCatalogSnapshot;
  selection: MatterhornBackendModelSelectionRecord | null;
  loading: boolean;
  failed: boolean;
  managed?: boolean;
  policies: MatterhornProviderPrivacyPolicy[];
  onRefresh: () => void;
  onConnect: () => void | Promise<void>;
  onSelected?: (
    firstSelection: boolean,
    model: { providerId: string; modelId: string },
  ) => void | Promise<void>;
  children?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const queryClient = useQueryClient();
  const providers =
    props.catalog?.providers.filter(
      (item) => item.connected && !isCatalogOnlyProviderId(item.id),
    ) ?? [];
  const models = providers.flatMap((item) =>
    item.modelIds
      .filter(isChatModelId)
      .map((id) => ({ id, providerId: item.id, providerName: item.name })),
  );
  const visible = models.filter(
    (model) =>
      (!provider || model.providerId === provider) &&
      `${model.id} ${model.providerName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const save = useMutation({
    mutationFn: async (model: { providerId: string; id: string }) => {
      if (!props.client || !props.workspaceId)
        throw new Error(
          "Workspace connection unavailable. Reconnect and try again.",
        );
      const firstSelection = !props.selection;
      const response = await props.client.saveWorkspaceModelSelection(
        props.workspaceId,
        { providerId: model.providerId, modelId: model.id, variant: null },
      );
      if (
        response.selection?.modelId !== model.id ||
        response.selection.providerId !== model.providerId
      )
        throw new Error("The model was not saved. Try again.");
      return { response, firstSelection };
    },
    onSuccess: async ({ response, firstSelection }) => {
      queryClient.setQueryData(
        ["settings-workspace-model-selection", props.workspaceId],
        response,
      );
      await queryClient.invalidateQueries({
        queryKey: ["settings-workspace-backend-models", props.workspaceId],
      });
      notifyWorkspaceModelSelectionChanged(props.workspaceId);
      if (response.selection)
        await props.onSelected?.(firstSelection, response.selection);
    },
  });
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {props.children}
      <h2 className="text-lg font-semibold">Choose a model</h2>
      {props.loading ? (
        <p role="status">Loading models…</p>
      ) : props.failed || !models.length ? (
        <section className="space-y-3" aria-label="Model connection">
          <p>
            {props.failed
              ? "Models could not be loaded."
              : "No chat models are connected."}
          </p>
          {props.managed ? (
            <p className="text-sm text-dls-secondary">
              Your workspace owner manages this connection. Owners: configure
              the provider on the workspace server, then refresh.
            </p>
          ) : (
            <Button onClick={() => void props.onConnect()}>
              Connect provider
            </Button>
          )}
          <Button variant="outline" onClick={props.onRefresh}>
            Refresh models
          </Button>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="min-w-0 flex-1 text-sm">
              Search models
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-md border border-dls-border bg-dls-background px-3 focus-visible:outline focus-visible:outline-2"
              />
            </label>
            <label className="text-sm">
              Provider
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="mt-1 block min-h-11 max-w-full rounded-md border border-dls-border bg-dls-background px-3 focus-visible:outline focus-visible:outline-2"
              >
                <option value="">All providers</option>
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul
            className="divide-y divide-dls-border"
            aria-label="Chat models"
            aria-busy={save.isPending}
          >
            {visible.map((model) => {
              const selected =
                props.selection?.providerId === model.providerId &&
                props.selection.modelId === model.id;
              return (
                <li key={`${model.providerId}/${model.id}`}>
                  <button
                    type="button"
                    disabled={save.isPending}
                    aria-pressed={selected}
                    onClick={() => save.mutate(model)}
                    className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left hover:bg-dls-hover focus-visible:outline focus-visible:outline-2 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">
                        {resolveModelDisplayName(model.id)}
                      </span>
                      <span className="block text-xs text-dls-secondary">
                        {model.providerName}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs">
                      {save.isPending &&
                      save.variables?.id === model.id &&
                      save.variables.providerId === model.providerId
                        ? "Saving…"
                        : selected
                          ? "Selected"
                          : "Select"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!visible.length ? (
            <p role="status" className="text-sm">
              No matching models. Change the search or provider.
            </p>
          ) : null}
        </>
      )}
      <div aria-live="polite" role={save.isError ? "alert" : "status"}>
        {save.isError
          ? save.error instanceof Error
            ? save.error.message
            : "Could not save model. Try again."
          : save.isSuccess
            ? "Workspace model saved."
            : null}
      </div>
      <details className="border-t border-dls-border py-3">
        <summary className="cursor-pointer text-sm">Provider privacy</summary>
        <div className="mt-3 space-y-3 text-sm text-dls-secondary">
          {props.policies.length ? (
            props.policies.map((policy) => (
              <p key={policy.providerId}>
                <strong className="font-medium text-dls-text">
                  {policy.providerName}:{" "}
                </strong>
                {policy.description}
                {!policy.allowed ? " Sending is blocked." : ""}
              </p>
            ))
          ) : (
            <p>Provider policy has not been verified.</p>
          )}
        </div>
      </details>
    </div>
  );
}
