/** @jsxImportSource react */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MatterhornCoworkerTemplateId } from "@matterhorn-work/types/crypto-coworkers";
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
import {
  canCancelCoworkerWalletIntent,
  canOpenCoworkerWalletIntent,
  coworkerWalletIntentStatus,
  coworkerWalletReviewUnavailableReason,
  coworkerWalletReceiptStatus,
  isActiveCoworkerWalletIntent,
  sortCoworkerWalletIntents,
} from "./coworker-wallet-intent-view";

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
  onOpenWallet: (item: MatterhornCoworkerWalletIntentView) => boolean;
  onStartTask?: StartCoworkerTask;
};

type ConfirmAction =
  | { kind: "revoke"; coworker: MatterhornCoworkerAccountProfile }
  | { kind: "delete"; coworker: MatterhornCoworkerAccountProfile }
  | null;

type CoworkerResourceDraft = {
  agentFileIds: string[];
  memoryIds: string[];
  connectionIds: string[];
};

const EMPTY_RESOURCE_DRAFT: CoworkerResourceDraft = {
  agentFileIds: [],
  memoryIds: [],
  connectionIds: [],
};

const COWORKER_CHOICES: ReadonlyArray<{
  id: MatterhornCoworkerTemplateId;
  label: string;
}> = [
  { id: "market_analyst", label: "Research markets" },
  { id: "risk_monitor", label: "Monitor risk" },
  { id: "transaction_coordinator", label: "Prepare wallet actions" },
  { id: "treasury_coworker", label: "Track treasury" },
];

function coworkerErrorMessage(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "coworker_runtime_disabled" || error.code === "coworker_execution_not_ready") {
      return "Coworkers are not enabled in this environment yet.";
    }
    if (error.code === "coworker_not_found") return "This coworker no longer exists.";
    if (error.code === "coworker_revision_conflict") return "This coworker changed. Refresh and try again.";
    if (error.code === "coworker_resource_scope_invalid") return "One of these files, memories, or apps is no longer available. Refresh and choose again.";
    if (error.code === "coworker_resource_recommendation_stale") return "The suggested access changed. Review the latest suggestion before saving.";
    if (error.code === "coworker_resources_stale") return "This access list changed. Review it again before starting work.";
    if (error.code === "coworker_transition_invalid") return "That change is no longer available for this coworker.";
    if (error.code === "coworker_inbox_state_conflict") return "This alert changed. Refresh and try again.";
    if (error.code === "pending_crypto_intent_revision_conflict") return "This wallet review changed. Refresh and try again.";
    if (error.code === "pending_crypto_intent_expired" || error.code === "pending_crypto_intent_transition_invalid") {
      return "This wallet review can no longer be cancelled.";
    }
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
  const [creating, setCreating] = useState<MatterhornCoworkerTemplateId | null>(null);
  const [showCreateChoices, setShowCreateChoices] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resourceDraft, setResourceDraft] = useState<CoworkerResourceDraft>(EMPTY_RESOURCE_DRAFT);
  const [resourceRecommendationHash, setResourceRecommendationHash] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [cancelIntent, setCancelIntent] = useState<MatterhornCoworkerWalletIntentView | null>(null);
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
  const resourceKey = useMemo(
    () => [QUERY_PREFIX, workspaceId, selectedCoworker?.id ?? "none", selectedCoworker?.revision ?? 0, "resources"],
    [selectedCoworker?.id, selectedCoworker?.revision, workspaceId],
  );
  const resourceQuery = useQuery({
    queryKey: resourceKey,
    enabled: Boolean(props.client && workspaceId && selectedCoworker),
    retry: false,
    queryFn: async () => {
      if (!props.client || !selectedCoworker) throw new Error("coworker_unavailable");
      const connectionsRequest = props.client.listCryptoAppConnections(workspaceId)
        .then((response) => ({ available: true, connections: response.connections }))
        .catch((cause: unknown) => {
          if (cause instanceof MatterhornServerError && cause.code === "crypto_app_gateway_disabled") {
            return { available: false, connections: [] };
          }
          throw cause;
        });
      const [scope, recommendation, files, memories, connections] = await Promise.all([
        props.client.getCoworkerResources(workspaceId, selectedCoworker.id),
        props.client.getCoworkerResourceRecommendation(workspaceId, selectedCoworker.id),
        props.client.listAgentFiles(workspaceId),
        props.client.listWorkspaceMemory(workspaceId, { limit: 80 }),
        connectionsRequest,
      ]);
      return {
        scope,
        recommendation: recommendation.recommendation,
        filesAvailable: files.available,
        files: files.items.filter((item) => item.file.access.coworkerIds.includes(selectedCoworker.id)),
        memories: memories.records.filter((record) => record.canUseInChat && record.sensitivity !== "forbidden_secret"),
        connectionsAvailable: connections.available,
        connections: connections.connections.filter((connection) => (
          connection.state === "active"
          && connection.availability === "available"
          && selectedCoworker.allowedAppIds.includes(connection.appId)
          && connection.grantedActionIds.some((actionId) => selectedCoworker.allowedActionIds.includes(actionId))
          && connection.grantedNetworks.some((network) => selectedCoworker.allowedNetworks.includes(network))
        )),
      };
    },
  });

  useEffect(() => {
    const scope = resourceQuery.data?.scope.resources;
    setResourceDraft(scope ? {
      agentFileIds: scope.agentFiles.map((item) => item.id),
      memoryIds: scope.memories.map((item) => item.id),
      connectionIds: scope.connections.map((item) => item.id),
    } : EMPTY_RESOURCE_DRAFT);
    setResourceRecommendationHash(null);
  }, [resourceQuery.data?.scope.resources?.scopeHash, selectedCoworker?.id]);

  const walletIntents = useMemo(
    () => sortCoworkerWalletIntents(detailQuery.data?.walletIntents ?? []),
    [detailQuery.data?.walletIntents],
  );
  const activeIntents = useMemo(() => walletIntents.filter(isActiveCoworkerWalletIntent), [walletIntents]);
  const visibleWalletIntents = useMemo(() => [
    ...activeIntents,
    ...walletIntents.filter((item) => !isActiveCoworkerWalletIntent(item)),
  ].slice(0, 4), [activeIntents, walletIntents]);
  const canStartCoworker = selectedCoworker?.state === "active"
    && resourceQuery.data?.scope.active === true
    && (resourceQuery.data.scope.resources?.connections.length ?? 0) > 0;
  const resourceSuggestionAvailable = Boolean(
    resourceQuery.data
    && !resourceQuery.data.scope.active
    && (
      resourceQuery.data.recommendation.agentFiles.length
      + resourceQuery.data.recommendation.memories.length
      + resourceQuery.data.recommendation.connections.length
    ) > 0,
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: detailKey }),
      queryClient.invalidateQueries({ queryKey: resourceKey }),
    ]);
  }, [detailKey, listKey, queryClient, resourceKey]);

  const toggleResource = useCallback((key: keyof CoworkerResourceDraft, id: string) => {
    setResourceRecommendationHash(null);
    setResourceDraft((current) => {
      const selected = current[key];
      const next = selected.includes(id)
        ? selected.filter((candidate) => candidate !== id)
        : selected.length < 8 ? [...selected, id] : selected;
      return { ...current, [key]: next };
    });
  }, []);

  const reviewResourceRecommendation = useCallback(() => {
    const recommendation = resourceQuery.data?.recommendation;
    if (!recommendation) return;
    setResourceDraft({
      agentFileIds: recommendation.agentFiles.map((item) => item.id),
      memoryIds: recommendation.memories.map((item) => item.id),
      connectionIds: recommendation.connections.map((item) => item.id),
    });
    setResourceRecommendationHash(recommendation.recommendationHash);
    setResourcesOpen(true);
  }, [resourceQuery.data?.recommendation]);

  const saveResources = useCallback(async () => {
    if (!props.client || !workspaceId || !selectedCoworker) return;
    setBusyAction(`resources:${selectedCoworker.id}`);
    setError(null);
    try {
      await props.client.setCoworkerResources(workspaceId, selectedCoworker.id, {
        expectedRevision: resourceQuery.data?.scope.resources?.revision ?? 0,
        profileRevision: selectedCoworker.revision,
        agentFileIds: [...resourceDraft.agentFileIds].sort(),
        memoryIds: [...resourceDraft.memoryIds].sort(),
        connectionIds: [...resourceDraft.connectionIds].sort(),
        ...(resourceRecommendationHash ? { recommendationHash: resourceRecommendationHash } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: resourceKey });
      setResourcesOpen(false);
      setResourceRecommendationHash(null);
      showToast({
        title: "Access saved",
        description: `${selectedCoworker.name} can use only the items you selected.`,
        tone: "success",
      });
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, queryClient, resourceDraft, resourceKey, resourceQuery.data?.scope.resources?.revision, resourceRecommendationHash, selectedCoworker, showToast, workspaceId]);

  const createCoworker = useCallback(async (templateId: MatterhornCoworkerTemplateId) => {
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

  const cancelWalletReview = useCallback(async (item: MatterhornCoworkerWalletIntentView) => {
    if (!props.client || !workspaceId) return;
    setBusyAction(`intent:${item.id}`);
    setError(null);
    try {
      await props.client.cancelCoworkerWalletIntent(workspaceId, item.coworkerId, item.id, item.revision);
      setCancelIntent(null);
      await refresh();
      showToast({
        title: "Wallet review cancelled",
        description: "The old intent cannot be approved or sent.",
        tone: "success",
      });
    } catch (cause) {
      setCancelIntent(null);
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, refresh, showToast, workspaceId]);

  const openWalletReview = useCallback((item: MatterhornCoworkerWalletIntentView) => {
    setError(null);
    if (props.onOpenWallet(item)) return;
    setError("This wallet review expired or no longer matches its protected terms. Ask the coworker to prepare it again.");
  }, [props.onOpenWallet]);

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
            <p className="mt-2 text-sm leading-6 text-dls-secondary">Choose one job. Anything involving funds stops for your wallet approval.</p>
            <div className="mt-4 grid gap-2">
              {COWORKER_CHOICES.map((choice, index) => (
                <Button
                  key={choice.id}
                  variant={index === 0 ? "default" : "outline"}
                  disabled={creating !== null}
                  onClick={() => void createCoworker(choice.id)}
                >
                  {creating === choice.id ? "Adding…" : choice.label}
                </Button>
              ))}
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
                  {COWORKER_CHOICES.map((choice, index) => (
                    <Button
                      key={choice.id}
                      size="sm"
                      variant={index === 0 ? "default" : "outline"}
                      disabled={creating !== null}
                      onClick={() => void createCoworker(choice.id)}
                    >
                      {creating === choice.id ? "Adding…" : choice.label}
                    </Button>
                  ))}
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
                <Button size="sm" disabled={!canStartCoworker} onClick={() => startChat(selectedCoworker)}>Start chat</Button>
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

            <section className="border-b border-dls-border/70 py-4" aria-labelledby="coworker-resources-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="coworker-resources-title" className="text-sm font-semibold text-dls-text">Files, Memory, and apps</h3>
                  <p className="mt-1 text-xs leading-5 text-dls-secondary">
                    {resourceQuery.isLoading
                      ? "Loading access…"
                      : resourceQuery.isError
                        ? "Access could not be loaded."
                        : !resourceQuery.data?.scope.resources
                          ? "Nothing is shared until you choose."
                          : !resourceQuery.data.scope.active
                            ? "Review access again because this coworker changed."
                            : resourceQuery.data.scope.resources.connections.length === 0
                              ? "Choose at least one connected app before starting chat."
                            : `${resourceQuery.data.scope.resources.agentFiles.length} files · ${resourceQuery.data.scope.resources.memories.length} memories · ${resourceQuery.data.scope.resources.connections.length} apps`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resourceQuery.isLoading || resourceQuery.isError}
                  aria-expanded={resourcesOpen}
                  onClick={() => setResourcesOpen((open) => !open)}
                >
                  {resourcesOpen ? "Close" : "Choose access"}
                </Button>
              </div>

              {resourceSuggestionAvailable && resourceQuery.data ? (
                <div className="mt-4 flex items-start justify-between gap-3 border-t border-dls-border/70 pt-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-dls-text">Suggested access</p>
                    <p className="mt-1 text-xs leading-5 text-dls-secondary">
                      Matterhorn found {
                        resourceQuery.data.recommendation.agentFiles.length
                        + resourceQuery.data.recommendation.memories.length
                        + resourceQuery.data.recommendation.connections.length
                      } items that match this coworker. Nothing changes until you review and save.
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={reviewResourceRecommendation}>Review suggestion</Button>
                </div>
              ) : null}

              {resourcesOpen && resourceQuery.data ? (
                <div className="mt-4 grid gap-4 border-t border-dls-border/70 pt-4">
                  {resourceRecommendationHash ? (
                    <p className="text-xs leading-5 text-dls-secondary">
                      Suggested items are selected below. Uncheck anything you do not want to share, then save.
                    </p>
                  ) : null}
                  <fieldset>
                    <legend className="text-xs font-medium text-dls-text">Connected apps</legend>
                    {!resourceQuery.data.connectionsAvailable ? (
                      <p className="mt-2 text-xs leading-5 text-dls-secondary">App connections are not enabled in this environment.</p>
                    ) : resourceQuery.data.connections.length ? (
                      <div className="mt-2 grid gap-2">
                        {resourceQuery.data.connections.map((connection) => (
                          <label key={connection.id} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-dls-text">
                            <input
                              type="checkbox"
                              className="size-4 accent-current"
                              checked={resourceDraft.connectionIds.includes(connection.id)}
                              onChange={() => toggleResource("connectionIds", connection.id)}
                            />
                            <span>{humanizeId(connection.appId)}</span>
                          </label>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-xs leading-5 text-dls-secondary">No approved apps are connected for this coworker.</p>}
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-medium text-dls-text">Private files</legend>
                    {!resourceQuery.data.filesAvailable ? (
                      <p className="mt-2 text-xs leading-5 text-dls-secondary">Private files are not enabled in this environment.</p>
                    ) : resourceQuery.data.files.length ? (
                      <div className="mt-2 grid gap-2">
                        {resourceQuery.data.files.map((item) => (
                          <label key={item.id} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-dls-text">
                            <input
                              type="checkbox"
                              className="size-4 accent-current"
                              checked={resourceDraft.agentFileIds.includes(item.id)}
                              onChange={() => toggleResource("agentFileIds", item.id)}
                            />
                            <span className="truncate">{item.file.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-xs leading-5 text-dls-secondary">No private files are available for this coworker.</p>}
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-medium text-dls-text">Memory</legend>
                    {resourceQuery.data.memories.length ? (
                      <div className="mt-2 grid gap-2">
                        {resourceQuery.data.memories.map((record) => (
                          <label key={record.id} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-dls-text">
                            <input
                              type="checkbox"
                              className="size-4 accent-current"
                              checked={resourceDraft.memoryIds.includes(record.id)}
                              onChange={() => toggleResource("memoryIds", record.id)}
                            />
                            <span className="truncate">{record.title}</span>
                          </label>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-xs leading-5 text-dls-secondary">No approved Memory is available yet.</p>}
                  </fieldset>

                  <p className="text-xs leading-5 text-dls-secondary">
                    Private files and Memory use only an approved private model. This coworker cannot bypass that rule.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => void saveResources()}
                    >
                      {busyAction === `resources:${selectedCoworker.id}` ? "Saving…" : "Save access"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyAction !== null} onClick={() => setResourcesOpen(false)}>Cancel</Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="py-4" aria-labelledby="coworker-access-title">
              <h3 id="coworker-access-title" className="text-sm font-semibold text-dls-text">Access and limits</h3>
              <dl className="mt-3 grid gap-2 text-xs leading-5">
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Apps this role can use</dt><dd className="text-right text-dls-text">{selectedCoworker.allowedAppIds.map(humanizeId).join(", ") || "None"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Reads per request</dt><dd className="text-dls-text">{selectedCoworker.limits.maxReadCallsPerRun}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Wallet reviews per request</dt><dd className="text-dls-text">{selectedCoworker.limits.maxPrepareCallsPerFamily > 0 ? selectedCoworker.limits.maxPrepareCallsPerFamily : "Not available"}</dd></div>
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
                  <div>
                    <h3 id="coworker-wallet-title" className="text-sm font-semibold text-dls-text">Wallet activity</h3>
                    <p className="mt-1 text-xs text-dls-secondary">Only your connected wallet can approve and send.</p>
                  </div>
                  {walletIntents.length ? (
                    <ul className="mt-2 divide-y divide-dls-border/70">
                      {visibleWalletIntents.map((item) => {
                        const receiptStatus = coworkerWalletReceiptStatus(item);
                        const reviewUnavailableReason = coworkerWalletReviewUnavailableReason(item);
                        const canCancel = canCancelCoworkerWalletIntent(item);
                        const amount = item.intent.amount
                          ? `${item.intent.amount}${item.intent.asset ? ` ${item.intent.asset}` : ""}`
                          : "Amount shown in wallet review";
                        return (
                          <li key={item.id} className="py-3 text-xs leading-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-dls-text">{humanizeId(item.intent.operation)}</p>
                                <p className="text-dls-secondary">{amount} · {humanizeId(item.intent.network)}</p>
                              </div>
                              <span className={cn(
                                "max-w-28 shrink-0 text-right",
                                item.state === "confirmed" ? "text-status-success" : item.state === "failed" ? "text-destructive" : "text-dls-secondary",
                              )}>{coworkerWalletIntentStatus(item)}</span>
                            </div>
                            <p className="mt-1 text-dls-secondary">
                              {canCancel ? `Expires ${shortDate(item.expiresAt)}` : `Updated ${shortDate(item.updatedAt)}`}
                            </p>
                            {receiptStatus ? <p className="mt-1 text-dls-secondary">{receiptStatus}</p> : null}
                            {reviewUnavailableReason ? (
                              <p className="mt-1 text-amber-12 dark:text-amber-11" role="status">{reviewUnavailableReason}</p>
                            ) : null}
                            <details className="mt-2">
                              <summary className="min-h-8 cursor-pointer text-dls-secondary outline-none focus-visible:text-dls-text focus-visible:ring-2 focus-visible:ring-ring/35">Exact review details</summary>
                              <dl className="mt-2 grid gap-1.5 border-y border-dls-border/70 py-2 text-dls-secondary">
                                <div><dt className="inline font-medium text-dls-text">Signer: </dt><dd className="inline break-all">{item.reviewedAction.signer ?? "Chosen in wallet"}</dd></div>
                                <div><dt className="inline font-medium text-dls-text">Recipient: </dt><dd className="inline break-all">{item.reviewedAction.recipient ?? "Protocol-managed destination"}</dd></div>
                                <div><dt className="inline font-medium text-dls-text">Simulation: </dt><dd className="inline break-all">{item.reviewedAction.simulation.reference}</dd></div>
                                <div><dt className="inline font-medium text-dls-text">Simulated: </dt><dd className="inline">{shortDate(item.reviewedAction.simulation.simulatedAt)}</dd></div>
                                <div><dt className="inline font-medium text-dls-text">Policy checks: </dt><dd className="inline">{item.policy.limits.length ? `${item.policy.limits.filter((limit) => limit.passed).length} of ${item.policy.limits.length} passed` : "No numeric limits applied"}</dd></div>
                                {item.receipt ? <div><dt className="inline font-medium text-dls-text">Public receipt: </dt><dd className="inline break-all">{item.receipt.publicId}</dd></div> : null}
                              </dl>
                            </details>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {canOpenCoworkerWalletIntent(item) ? (
                                <Button size="xs" disabled={busyAction !== null} onClick={() => openWalletReview(item)}>
                                  <WalletCards aria-hidden="true" /> Review in wallet
                                </Button>
                              ) : null}
                              {canCancel ? (
                                <Button size="xs" variant="ghost" disabled={busyAction !== null} onClick={() => setCancelIntent(item)}>
                                  Cancel review
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="mt-3 text-xs leading-5 text-dls-secondary">No wallet actions yet. Ask this coworker to prepare one when you are ready.</p>}
                  {activeIntents.length > 4 ? <p className="mt-2 text-xs text-dls-secondary">{activeIntents.length - 4} more pending in wallet history.</p> : null}
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
      <ConfirmModal
        open={Boolean(cancelIntent)}
        title="Cancel this wallet review?"
        message="This invalidates the current intent. Your wallet will not be able to approve or send it afterward."
        confirmLabel={busyAction ? "Cancelling…" : "Cancel review"}
        cancelLabel="Keep review"
        variant="warning"
        confirmButtonVariant="outline"
        onConfirm={() => {
          if (cancelIntent) void cancelWalletReview(cancelIntent);
        }}
        onCancel={() => {
          if (!busyAction) setCancelIntent(null);
        }}
      />
    </div>
  );
}

export default SessionCoworkersPanel;
