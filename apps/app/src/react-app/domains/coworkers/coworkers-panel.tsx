/** @jsxImportSource react */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";

import {
  MatterhornServerError,
  type MatterhornCoworkerAccountInboxItem,
  type MatterhornCoworkerAccountProfile,
  type MatterhornCoworkerAccountWatch,
  type MatterhornCoworkerWalletIntentView,
  type MatterhornServerClient,
} from "../../../app/lib/matterhorn-server";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "../../design-system/modals/confirm-modal";
import { useMatterhornSessionAgentFileContextStore } from "../session/surface/agent-file-context-store";
import { useMatterhornSessionCoworkerContextStore } from "../session/surface/coworker-context-store";
import { useStatusToasts } from "../shell-feedback/status-toasts";

const QUERY_PREFIX = "coworker-control";

type StartCoworkerTask = (
  workspaceId: string,
  prompt: string,
  options?: {
    title?: string;
    sendImmediately?: boolean;
    onSessionCreated?: (sessionId: string) => void | Promise<void>;
  },
) => boolean | void | Promise<boolean | void>;

export type SessionCoworkersPanelProps = {
  client: MatterhornServerClient | null;
  workspaceId: string | null;
  selectedSessionId: string | null;
  selectedWorkspaceId: string;
  onClose: () => void;
  onOpenWallet: () => void;
  onStartTask?: StartCoworkerTask;
};

type ConfirmAction =
  | { kind: "revoke"; coworker: MatterhornCoworkerAccountProfile }
  | { kind: "delete"; coworker: MatterhornCoworkerAccountProfile }
  | null;

function coworkerErrorMessage(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "coworker_runtime_disabled" || error.code === "coworker_execution_not_ready") {
      return "Coworkers are not enabled in this environment yet.";
    }
    if (error.code === "coworker_not_found") return "This coworker no longer exists.";
    if (error.code === "coworker_revision_conflict") return "This coworker changed. Refresh and try again.";
    if (error.code === "coworker_transition_invalid") return "That change is no longer available for this coworker.";
    if (error.code === "coworker_inbox_state_conflict") return "This alert changed. Refresh and try again.";
  }
  return "Matterhorn could not load your coworkers. Try again.";
}

function humanizeId(value: string): string {
  return value
    .replace(/^matterhorn[._-]?/i, "")
    .replace(/[._:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function authorityLabel(value: MatterhornCoworkerAccountProfile["automaticAuthorities"][number]): string {
  if (value === "read") return "Research connected apps";
  if (value === "watch") return "Run your approved checks";
  if (value === "write_note") return "Save notes";
  return "Prepare a wallet review";
}

function intentStatus(value: MatterhornCoworkerWalletIntentView["state"]): string {
  if (value === "wallet_review") return "Ready for wallet review";
  if (value === "refreshing") return "Refreshing prices and terms";
  if (value === "regeneration_required") return "Needs a fresh preview";
  if (value === "wallet_approved") return "Approved in wallet";
  if (value === "submitted") return "Sent by wallet";
  if (value === "confirmed") return "Confirmed";
  if (value === "failed") return "Failed";
  if (value === "expired") return "Expired";
  return "Cancelled";
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function CoworkerBoundary(props: { coworker: MatterhornCoworkerAccountProfile }) {
  const automatic = props.coworker.automaticAuthorities.map(authorityLabel);
  return (
    <section className="grid gap-3 border-y border-dls-border/70 py-4" aria-label="Coworker boundaries">
      <div>
        <p className="text-xs font-medium text-dls-text">Can do automatically</p>
        <p className="mt-1 text-xs leading-5 text-dls-secondary">
          {automatic.length ? automatic.join(" · ") : "Nothing until you choose access"}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-dls-text">Stops for your approval</p>
        <p className="mt-1 text-xs leading-5 text-dls-secondary">Anything involving funds opens an exact wallet review.</p>
      </div>
      <div>
        <p className="text-xs font-medium text-dls-text">Can never do</p>
        <p className="mt-1 text-xs leading-5 text-dls-secondary">See private keys, sign for you, or send a transaction on its own.</p>
      </div>
    </section>
  );
}

function WatchRow(props: {
  watch: MatterhornCoworkerAccountWatch;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-dls-text">{props.watch.name}</p>
        <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
          {humanizeId(props.watch.appId)} · {props.watch.state === "active" ? `Next check ${shortDate(props.watch.schedule.nextCheckAt)}` : "Paused"}
        </p>
      </div>
      <Button size="xs" variant="ghost" disabled={props.busy} onClick={props.onToggle}>
        {props.watch.state === "active" ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        {props.watch.state === "active" ? "Pause" : "Resume"}
      </Button>
    </li>
  );
}

function InboxRow(props: {
  item: MatterhornCoworkerAccountInboxItem;
  busy: boolean;
  onRead: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-2.5">
        <Bell aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", props.item.state === "unread" ? "text-primary" : "text-dls-muted")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-dls-text">{props.item.title}</p>
            {props.item.state === "unread" ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">{props.item.summary}</p>
          <p className="mt-1 text-[11px] text-dls-muted">{shortDate(props.item.createdAt)}</p>
          <div className="mt-2 flex gap-1">
            {props.item.state === "unread" ? (
              <Button size="xs" variant="ghost" disabled={props.busy} onClick={props.onRead}>Mark read</Button>
            ) : null}
            <Button size="xs" variant="ghost" disabled={props.busy} onClick={props.onDismiss}>Dismiss</Button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function SessionCoworkersPanel(props: SessionCoworkersPanelProps) {
  const { showToast } = useStatusToasts();
  const queryClient = useQueryClient();
  const { onClose, onStartTask, selectedSessionId, selectedWorkspaceId } = props;
  const workspaceId = props.workspaceId?.trim() ?? "";
  const listKey = useMemo(() => [QUERY_PREFIX, workspaceId, "list"], [workspaceId]);
  const [coworkerChoice, setCoworkerChoice] = useState("");
  const [creating, setCreating] = useState<"market_analyst" | "risk_monitor" | null>(null);
  const [showCreateChoices, setShowCreateChoices] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [error, setError] = useState<string | null>(null);
  const boundCoworkerId = useMatterhornSessionCoworkerContextStore((state) => (
    selectedSessionId ? state.contexts[selectedSessionId]?.id ?? "" : ""
  ));

  const listQuery = useQuery({
    queryKey: listKey,
    enabled: Boolean(props.client && workspaceId),
    retry: false,
    queryFn: () => props.client!.listCoworkers(workspaceId),
  });
  const coworkers = listQuery.data?.coworkers ?? [];
  const selectedCoworker = coworkers.find((item) => item.id === (coworkerChoice || boundCoworkerId)) ?? coworkers[0] ?? null;
  const detailKey = useMemo(
    () => [QUERY_PREFIX, workspaceId, selectedCoworker?.id ?? "none", "detail"],
    [selectedCoworker?.id, workspaceId],
  );
  const detailQuery = useQuery({
    queryKey: detailKey,
    enabled: Boolean(props.client && workspaceId && selectedCoworker),
    retry: false,
    queryFn: async () => {
      if (!props.client || !selectedCoworker) throw new Error("coworker_unavailable");
      const [state, watches, inbox, walletIntents] = await Promise.all([
        props.client.getCoworkerState(workspaceId, selectedCoworker.id),
        props.client.listCoworkerWatches(workspaceId, selectedCoworker.id),
        props.client.listCoworkerInbox(workspaceId, selectedCoworker.id),
        props.client.listCoworkerWalletIntents(workspaceId, selectedCoworker.id),
      ]);
      return { state: state.state, watches: watches.watches, inbox: inbox.items, walletIntents: walletIntents.items };
    },
  });

  const activeIntents = useMemo(
    () => (detailQuery.data?.walletIntents ?? []).filter((item) => (
      !["cancelled", "expired", "confirmed", "failed"].includes(item.state)
    )),
    [detailQuery.data?.walletIntents],
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: detailKey }),
    ]);
  }, [detailKey, listKey, queryClient]);

  const createCoworker = useCallback(async (templateId: "market_analyst" | "risk_monitor") => {
    if (!props.client || !workspaceId) return;
    setCreating(templateId);
    setError(null);
    try {
      const response = await props.client.createCoworkerFromTemplate(workspaceId, { templateId });
      setCoworkerChoice(response.coworker.id);
      setShowCreateChoices(false);
      await refresh();
      showToast({ title: `${response.coworker.name} is ready`, description: "Start a chat whenever you have an outcome in mind.", tone: "success" });
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setCreating(null);
    }
  }, [props.client, refresh, showToast, workspaceId]);

  const startChat = useCallback((coworker: MatterhornCoworkerAccountProfile) => {
    const context = {
      id: coworker.id,
      name: coworker.name,
      role: coworker.role,
      revision: coworker.revision,
      updatedAt: new Date().toISOString(),
    };
    const sessionId = selectedSessionId?.trim() ?? "";
    if (sessionId) {
      const fileContext = useMatterhornSessionAgentFileContextStore.getState().contexts[sessionId];
      if (fileContext && fileContext.coworker.id !== coworker.id) {
        useMatterhornSessionAgentFileContextStore.getState().clearContext(sessionId);
      }
      useMatterhornSessionCoworkerContextStore.getState().setContext(sessionId, context);
      onClose();
      showToast({ title: `${coworker.name} joined this chat`, description: "Your next request will use this coworker's limits.", tone: "success" });
      return;
    }
    if (!onStartTask) {
      setError("Open a chat, then choose this coworker again.");
      return;
    }
    void (async () => {
      const started = await onStartTask(
        selectedWorkspaceId,
        "Ask what outcome I want, then help me take the safest next step.",
        {
          title: `${coworker.name} chat`,
          sendImmediately: false,
          onSessionCreated: (createdSessionId) => {
            useMatterhornSessionCoworkerContextStore.getState().setContext(createdSessionId, context);
          },
        },
      );
      if (started === false) setError("The chat did not start. Try again.");
    })();
  }, [onClose, onStartTask, selectedSessionId, selectedWorkspaceId, showToast]);

  const transitionCoworker = useCallback(async (coworker: MatterhornCoworkerAccountProfile, state: "active" | "paused" | "revoked") => {
    if (!props.client || !workspaceId) return;
    setBusyAction(`coworker:${coworker.id}`);
    setError(null);
    try {
      await props.client.transitionCoworker(workspaceId, coworker.id, { state, expectedRevision: coworker.revision });
      setConfirmAction(null);
      await refresh();
      showToast({
        title: state === "active" ? `${coworker.name} resumed` : state === "paused" ? `${coworker.name} paused` : `${coworker.name} revoked`,
        description: state === "active" ? "It can receive new work again." : "No new work or tool access can start.",
        tone: state === "active" ? "success" : "info",
      });
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, refresh, showToast, workspaceId]);

  const deleteCoworker = useCallback(async (coworker: MatterhornCoworkerAccountProfile) => {
    if (!props.client || !workspaceId) return;
    setBusyAction(`coworker:${coworker.id}`);
    setError(null);
    try {
      await props.client.deleteCoworker(workspaceId, coworker.id, coworker.revision);
      setConfirmAction(null);
      setCoworkerChoice("");
      await refresh();
      showToast({ title: "Coworker deleted", description: "Its scheduled work and pending authority were removed.", tone: "success" });
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, refresh, showToast, workspaceId]);

  const toggleWatch = useCallback(async (watch: MatterhornCoworkerAccountWatch) => {
    if (!props.client || !workspaceId || !selectedCoworker) return;
    setBusyAction(`watch:${watch.id}`);
    setError(null);
    try {
      await props.client.transitionCoworkerWatch(workspaceId, selectedCoworker.id, watch.id, {
        state: watch.state === "active" ? "paused" : "active",
        expectedRevision: watch.revision,
      });
      await refresh();
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, refresh, selectedCoworker, workspaceId]);

  const updateInbox = useCallback(async (item: MatterhornCoworkerAccountInboxItem, state: "read" | "dismissed") => {
    if (!props.client || !workspaceId || !selectedCoworker) return;
    setBusyAction(`inbox:${item.id}`);
    setError(null);
    try {
      await props.client.transitionCoworkerInboxItem(workspaceId, selectedCoworker.id, item.id, {
        state,
        expectedState: item.state,
      });
      await refresh();
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, refresh, selectedCoworker, workspaceId]);

  if (!props.client || !workspaceId) {
    return (
      <div className="flex h-full flex-col justify-center px-5 py-8 text-center">
        <h2 className="text-base font-semibold text-dls-text">Coworkers are unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-dls-secondary">Open a connected workspace, then try again.</p>
      </div>
    );
  }

  return (
    <div className="matterhorn-rail-content flex h-full min-h-0 flex-col bg-dls-background" data-testid="coworkers-panel">
      <header className="shrink-0 border-b border-dls-border/70 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-dls-text">Your coworkers</h2>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">Choose one, describe the outcome, and keep every financial action in your wallet.</p>
          </div>
          <Button size="icon-sm" variant="ghost" title="Refresh coworkers" aria-label="Refresh coworkers" onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        {listQuery.isLoading ? (
          <div className="space-y-3 py-5" role="status" aria-label="Loading coworkers">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-28 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </div>
        ) : listQuery.isError || !listQuery.data ? (
          <div className="py-8" aria-live="polite">
            <h3 className="text-sm font-semibold text-dls-text">Coworkers are not ready</h3>
            <p className="mt-2 text-sm leading-6 text-dls-secondary">{coworkerErrorMessage(listQuery.error)}</p>
            <Button className="mt-4" size="sm" onClick={() => void listQuery.refetch()}>Try again</Button>
          </div>
        ) : coworkers.length === 0 ? (
          <div className="py-8">
            <UserRound aria-hidden="true" className="size-5 text-dls-secondary" />
            <h3 className="mt-3 text-sm font-semibold text-dls-text">Who should help first?</h3>
            <p className="mt-2 text-sm leading-6 text-dls-secondary">Start with research or monitoring. You can pause or remove a coworker at any time.</p>
            <div className="mt-4 grid gap-2">
              <Button disabled={creating !== null} onClick={() => void createCoworker("market_analyst")}>
                {creating === "market_analyst" ? "Adding…" : "Research markets"}
              </Button>
              <Button variant="outline" disabled={creating !== null} onClick={() => void createCoworker("risk_monitor")}>
                {creating === "risk_monitor" ? "Adding…" : "Monitor risk"}
              </Button>
            </div>
          </div>
        ) : selectedCoworker ? (
          <>
            <div className="sticky top-0 z-[var(--matterhorn-layer-sticky)] -mx-4 border-b border-dls-border/70 bg-dls-background px-4 py-3">
              <div className="flex items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-medium text-dls-text">
                  Coworker
                  <select
                    className="h-9 w-full rounded-md border border-dls-border bg-dls-surface px-3 text-sm text-dls-text outline-none focus:border-ring focus:ring-2 focus:ring-ring/35"
                    value={selectedCoworker.id}
                    onChange={(event) => {
                      setCoworkerChoice(event.currentTarget.value);
                      setError(null);
                    }}
                  >
                    {coworkers.map((coworker) => <option key={coworker.id} value={coworker.id}>{coworker.name}</option>)}
                  </select>
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  aria-expanded={showCreateChoices}
                  onClick={() => setShowCreateChoices((current) => !current)}
                >
                  Add coworker
                </Button>
              </div>
              {showCreateChoices ? (
                <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Choose a coworker to add">
                  <Button size="sm" disabled={creating !== null} onClick={() => void createCoworker("market_analyst")}>
                    {creating === "market_analyst" ? "Adding…" : "Market researcher"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={creating !== null} onClick={() => void createCoworker("risk_monitor")}>
                    {creating === "risk_monitor" ? "Adding…" : "Risk monitor"}
                  </Button>
                </div>
              ) : null}
            </div>

            <section className="py-4" aria-labelledby="coworker-summary-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 id="coworker-summary-title" className="truncate text-sm font-semibold text-dls-text">{selectedCoworker.name}</h3>
                    <span className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      selectedCoworker.state === "active" ? "bg-status-success/10 text-status-success" : "bg-dls-surface-muted text-dls-secondary",
                    )}>{selectedCoworker.state === "active" ? "Active" : selectedCoworker.state === "paused" ? "Paused" : "Revoked"}</span>
                  </div>
                  <p className="mt-1 text-xs text-dls-secondary">{humanizeId(selectedCoworker.role)}</p>
                  <p className="mt-2 text-sm leading-6 text-dls-text">{selectedCoworker.mission}</p>
                </div>
                <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-dls-secondary" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" disabled={selectedCoworker.state !== "active"} onClick={() => startChat(selectedCoworker)}>Start chat</Button>
                {selectedCoworker.state === "active" ? (
                  <Button size="sm" variant="outline" disabled={busyAction !== null} onClick={() => void transitionCoworker(selectedCoworker, "paused")}>
                    <Pause aria-hidden="true" /> Pause
                  </Button>
                ) : selectedCoworker.state === "paused" ? (
                  <Button size="sm" variant="outline" disabled={busyAction !== null} onClick={() => void transitionCoworker(selectedCoworker, "active")}>
                    <Play aria-hidden="true" /> Resume
                  </Button>
                ) : null}
              </div>
            </section>

            <CoworkerBoundary coworker={selectedCoworker} />

            <section className="py-4" aria-labelledby="coworker-access-title">
              <h3 id="coworker-access-title" className="text-sm font-semibold text-dls-text">Access and limits</h3>
              <dl className="mt-3 grid gap-2 text-xs leading-5">
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Connected apps</dt><dd className="text-right text-dls-text">{selectedCoworker.allowedAppIds.map(humanizeId).join(", ") || "None"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Reads per request</dt><dd className="text-dls-text">{selectedCoworker.limits.maxReadCallsPerRun}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Active checks</dt><dd className="text-dls-text">{selectedCoworker.limits.maxActiveWatches > 0 ? `${detailQuery.data?.watches.filter((watch) => watch.state === "active").length ?? 0} of ${selectedCoworker.limits.maxActiveWatches}` : "Not available"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Per wallet action</dt><dd className="text-dls-text">{selectedCoworker.limits.perActionUsd > 0 ? `Up to $${selectedCoworker.limits.perActionUsd.toLocaleString()}` : "Not allowed"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Daily wallet actions</dt><dd className="text-dls-text">{selectedCoworker.limits.dailyUsd > 0 ? `Up to $${selectedCoworker.limits.dailyUsd.toLocaleString()}` : "Not allowed"}</dd></div>
              </dl>
            </section>

            {detailQuery.isLoading ? (
              <div className="space-y-3 border-t border-dls-border/70 py-4" role="status" aria-label="Loading coworker activity">
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
              </div>
            ) : detailQuery.isError ? (
              <div className="border-t border-dls-border/70 py-4">
                <p className="text-sm text-destructive" role="alert">{coworkerErrorMessage(detailQuery.error)}</p>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => void detailQuery.refetch()}>Reload activity</Button>
              </div>
            ) : (
              <>
                <section className="border-t border-dls-border/70 py-4" aria-labelledby="coworker-wallet-title">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 id="coworker-wallet-title" className="text-sm font-semibold text-dls-text">Wallet reviews</h3>
                      <p className="mt-1 text-xs text-dls-secondary">Only you can approve and send.</p>
                    </div>
                    {activeIntents.length ? (
                      <Button size="xs" variant="ghost" onClick={props.onOpenWallet}><WalletCards aria-hidden="true" /> Open wallet</Button>
                    ) : null}
                  </div>
                  {activeIntents.length ? (
                    <ul className="mt-2 divide-y divide-dls-border/70">
                      {activeIntents.slice(0, 4).map((item) => (
                        <li key={item.id} className="py-2.5 text-xs leading-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-dls-text">{humanizeId(item.intent.operation)}</p>
                              <p className="text-dls-secondary">{item.intent.amount ?? "Exact amount in review"} {item.intent.asset ?? ""} · {humanizeId(item.intent.protocol)}</p>
                            </div>
                            <span className="text-right text-dls-secondary">{intentStatus(item.state)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-3 text-xs leading-5 text-dls-secondary">Nothing is waiting for wallet review.</p>}
                </section>

                <section className="border-t border-dls-border/70 py-4" aria-labelledby="coworker-watches-title">
                  <h3 id="coworker-watches-title" className="text-sm font-semibold text-dls-text">Checks</h3>
                  {detailQuery.data?.watches.length ? (
                    <ul className="mt-2 divide-y divide-dls-border/70">
                      {detailQuery.data.watches.map((watch) => (
                        <WatchRow key={watch.id} watch={watch} busy={busyAction === `watch:${watch.id}`} onToggle={() => void toggleWatch(watch)} />
                      ))}
                    </ul>
                  ) : <p className="mt-3 text-xs leading-5 text-dls-secondary">No recurring checks yet. Start a chat and ask this coworker what to monitor.</p>}
                </section>

                <section className="border-t border-dls-border/70 py-4" aria-labelledby="coworker-inbox-title">
                  <h3 id="coworker-inbox-title" className="text-sm font-semibold text-dls-text">Updates</h3>
                  {detailQuery.data?.inbox.length ? (
                    <ul className="mt-2 divide-y divide-dls-border/70">
                      {detailQuery.data.inbox.slice(0, 8).map((item) => (
                        <InboxRow
                          key={item.id}
                          item={item}
                          busy={busyAction === `inbox:${item.id}`}
                          onRead={() => void updateInbox(item, "read")}
                          onDismiss={() => void updateInbox(item, "dismissed")}
                        />
                      ))}
                    </ul>
                  ) : <p className="mt-3 text-xs leading-5 text-dls-secondary">No updates yet.</p>}
                </section>
              </>
            )}

            {error ? <p className="border-t border-dls-border/70 py-3 text-sm leading-6 text-destructive" role="alert">{error}</p> : null}

            <section className="border-t border-dls-border/70 py-4" aria-labelledby="coworker-stop-title">
              <h3 id="coworker-stop-title" className="text-sm font-semibold text-dls-text">Stop this coworker</h3>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">Revoking is permanent and immediately blocks new work. Delete removes the saved profile after revocation.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedCoworker.state !== "revoked" ? (
                  <Button size="sm" variant="outline" disabled={busyAction !== null} onClick={() => setConfirmAction({ kind: "revoke", coworker: selectedCoworker })}>Revoke</Button>
                ) : (
                  <Button size="sm" variant="destructive" disabled={busyAction !== null} onClick={() => setConfirmAction({ kind: "delete", coworker: selectedCoworker })}>
                    <Trash2 aria-hidden="true" /> Delete
                  </Button>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmAction?.kind === "delete" ? "Delete this coworker?" : "Revoke this coworker?"}
        message={confirmAction?.kind === "delete"
          ? "This removes the saved coworker profile. It cannot be undone."
          : "Revoking is permanent. New chats, checks, tool access, and pending financial authority stop immediately."}
        confirmLabel={busyAction ? "Working…" : confirmAction?.kind === "delete" ? "Delete coworker" : "Revoke coworker"}
        cancelLabel="Keep coworker"
        variant="danger"
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.kind === "delete") void deleteCoworker(confirmAction.coworker);
          else void transitionCoworker(confirmAction.coworker, "revoked");
        }}
        onCancel={() => {
          if (!busyAction) setConfirmAction(null);
        }}
      />
    </div>
  );
}

export default SessionCoworkersPanel;
