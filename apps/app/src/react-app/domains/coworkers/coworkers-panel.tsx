/** @jsxImportSource react */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MatterhornCoworkerTemplateId,
  MatterhornCryptoAppCatalogSummary,
  MatterhornCryptoAppConnectionView,
} from "@matterhorn-work/types/crypto-coworkers";
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
import { Input } from "@/components/ui/input";
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
import { buildCoworkerAppConnectionDraft } from "./coworker-app-connection";
import {
  parseCoworkerWatchParameters,
  resolveCoworkerWatchFields,
  resolveCoworkerWatchSources,
} from "./coworker-watch-form";

const QUERY_PREFIX = "coworker-control";
const WATCH_INTERVALS = [
  { label: "Every 15 minutes", value: 15 * 60_000 },
  { label: "Every hour", value: 60 * 60_000 },
  { label: "Every 6 hours", value: 6 * 60 * 60_000 },
  { label: "Every day", value: 24 * 60 * 60_000 },
] as const;

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
  initialTemplateId?: MatterhornCoworkerTemplateId | null;
  initialOutcome?: string | null;
  onInitialTemplateHandled?: () => void;
  workspaceId: string | null;
  selectedSessionId: string | null;
  selectedWorkspaceId: string;
  onClose: () => void;
  onBrowseApps: () => void;
  onBrowseFiles: () => void;
  onBrowseMemory: () => void;
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
  summary: string;
}> = [
  { id: "market_analyst", label: "Research markets", summary: "Finds and compares current market information." },
  { id: "risk_monitor", label: "Monitor risk", summary: "Checks approved data and alerts you when it changes." },
  { id: "transaction_coordinator", label: "Prepare wallet actions", summary: "Prepares exact wallet actions for you to review." },
  { id: "treasury_coworker", label: "Track treasury", summary: "Tracks the balances and activity you approve." },
];

function coworkerSummary(role: string): string {
  return COWORKER_CHOICES.find((choice) => choice.id === role)?.summary
    ?? "Helps with the crypto work and access you approve.";
}

type CoworkerNextStepAction = "start" | "wait" | "reload" | "connect" | "review" | "resume" | "none";

export function resolveCoworkerNextStep(input: {
  coworkerState: MatterhornCoworkerAccountProfile["state"];
  ready: boolean;
  loading: boolean;
  loadFailed: boolean;
  connectionsAvailable?: boolean;
  connectedAppCount: number;
}): { action: CoworkerNextStepAction; label: string | null; message: string } {
  if (input.coworkerState === "paused") {
    return { action: "resume", label: "Resume coworker", message: "This coworker is paused." };
  }
  if (input.coworkerState === "revoked") {
    return { action: "none", label: null, message: "This coworker is permanently disabled." };
  }
  if (input.ready) {
    return { action: "start", label: "Start chat", message: "Ready. Start a chat and describe what you need." };
  }
  if (input.loadFailed) {
    return { action: "reload", label: "Try again", message: "We couldn't check this coworker's access." };
  }
  if (input.loading || input.connectionsAvailable === undefined) {
    return { action: "wait", label: "Checking…", message: "Checking what this coworker can use…" };
  }
  if (!input.connectionsAvailable) {
    return { action: "none", label: null, message: "Apps are unavailable right now. Try again later." };
  }
  if (input.connectedAppCount === 0) {
    return { action: "connect", label: "Choose an app", message: "Choose an app for this coworker." };
  }
  return { action: "review", label: "Choose access", message: "Choose its apps, files, and saved memory, then save." };
}

export function coworkerActivitySummary(input: {
  walletReviewCount: number;
  checkCount: number;
  updateCount: number;
}): string {
  const parts = [
    input.walletReviewCount > 0
      ? `${input.walletReviewCount} wallet ${input.walletReviewCount === 1 ? "review" : "reviews"}`
      : null,
    input.checkCount > 0
      ? `${input.checkCount} recurring ${input.checkCount === 1 ? "check" : "checks"}`
      : null,
    input.updateCount > 0
      ? `${input.updateCount} ${input.updateCount === 1 ? "update" : "updates"}`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(" · ") : "No activity yet";
}

function coworkerErrorMessage(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "coworker_runtime_disabled" || error.code === "coworker_execution_not_ready") {
      return "Coworkers aren't available here yet.";
    }
    if (error.code === "coworker_not_found") return "This coworker no longer exists.";
    if (error.code === "coworker_revision_conflict") return "This coworker changed. Refresh and try again.";
    if (error.code === "coworker_resource_scope_invalid") return "One of these files, memories, or apps is no longer available. Refresh and choose again.";
    if (error.code === "coworker_resource_recommendation_stale") return "The suggested access changed. Review the latest suggestion before saving.";
    if (error.code === "coworker_resources_stale") return "This access list changed. Review it again before starting work.";
    if (error.code === "coworker_transition_invalid") return "That change is no longer available for this coworker.";
    if (error.code === "coworker_watch_invalid") return "This check no longer matches the app you chose. Check access and try again.";
    if (error.code === "coworker_watch_limit") return "This coworker has reached its active check limit. Pause or remove a check first.";
    if (error.code === "coworker_watch_not_found") return "This check is no longer available. Refresh and try again.";
    if (error.code === "coworker_watch_transition_invalid") return "This check cannot be resumed with its current app access.";
    if (error.code === "coworker_inbox_state_conflict") return "This alert changed. Refresh and try again.";
    if (error.code === "crypto_app_gateway_disabled") return "App connections are currently unavailable.";
    if (error.code === "app_certification_unavailable") return "This app did not pass its latest safety check. Refresh before connecting it.";
    if (error.code === "crypto_app_connection_conflict" || error.code === "connection_transition_invalid") {
      return "This app connection changed. Refresh and try again.";
    }
    if (error.code === "connection_action_not_allowed"
      || error.code === "connection_scope_not_allowed"
      || error.code === "connection_network_not_allowed") {
      return "This app's available access changed. Refresh and review it again.";
    }
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
    <details className="border-y border-dls-border/70 py-4" aria-label="Coworker boundaries">
      <summary className="min-h-8 cursor-pointer list-none outline-none focus-visible:ring-2 focus-visible:ring-ring/35 [&::-webkit-details-marker]:hidden">
        <span className="block text-sm font-semibold text-dls-text">Safety and wallet control</span>
        <span className="mt-1 block text-xs leading-5 text-dls-secondary">It cannot see private keys or send funds. Open for details.</span>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-dls-border/60 pt-3">
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
      </div>
    </details>
  );
}

function WatchRow(props: {
  watch: MatterhornCoworkerAccountWatch;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-dls-text">{props.watch.name}</p>
        <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
          {humanizeId(props.watch.appId)} · {props.watch.state === "active" ? `Next check ${shortDate(props.watch.schedule.nextCheckAt)}` : "Paused"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="xs" variant="ghost" disabled={props.busy} onClick={props.onToggle}>
          {props.watch.state === "active" ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {props.watch.state === "active" ? "Pause" : "Resume"}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          title={`Remove ${props.watch.name}`}
          aria-label={`Remove ${props.watch.name}`}
          disabled={props.busy}
          onClick={props.onDelete}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
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
  const [pendingOutcome, setPendingOutcome] = useState("");
  const [creating, setCreating] = useState<MatterhornCoworkerTemplateId | null>(null);
  const [showCreateChoices, setShowCreateChoices] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resourceDraft, setResourceDraft] = useState<CoworkerResourceDraft>(EMPTY_RESOURCE_DRAFT);
  const [resourceRecommendationHash, setResourceRecommendationHash] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [cancelIntent, setCancelIntent] = useState<MatterhornCoworkerWalletIntentView | null>(null);
  const [watchToDelete, setWatchToDelete] = useState<MatterhornCoworkerAccountWatch | null>(null);
  const [watchFormOpen, setWatchFormOpen] = useState(false);
  const [watchSourceId, setWatchSourceId] = useState("");
  const [watchName, setWatchName] = useState("");
  const [watchIntervalMs, setWatchIntervalMs] = useState<number>(WATCH_INTERVALS[1].value);
  const [watchValues, setWatchValues] = useState<Record<string, string | boolean>>({});
  const [watchFormError, setWatchFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledInitialTemplateRef = useRef<MatterhornCoworkerTemplateId | null>(null);
  const newlyConnectedAppRef = useRef<string | null>(null);
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
      const cryptoAppsRequest = Promise.all([
        props.client.listCryptoApps(),
        props.client.listCryptoAppConnections(workspaceId),
      ])
        .then(([catalog, connections]) => {
          if (catalog.mode !== connections.mode) throw new Error("crypto_app_mode_mismatch");
          return { available: true, apps: catalog.apps, connections: connections.connections };
        })
        .catch((cause: unknown) => {
          if (cause instanceof MatterhornServerError && cause.code === "crypto_app_gateway_disabled") {
            const unavailable: {
              available: false;
              apps: MatterhornCryptoAppCatalogSummary[];
              connections: MatterhornCryptoAppConnectionView[];
            } = {
              available: false,
              apps: [],
              connections: [],
            };
            return unavailable;
          }
          throw cause;
        });
      const [scope, recommendation, files, memories, cryptoApps] = await Promise.all([
        props.client.getCoworkerResources(workspaceId, selectedCoworker.id),
        props.client.getCoworkerResourceRecommendation(workspaceId, selectedCoworker.id),
        props.client.listAgentFiles(workspaceId),
        props.client.listWorkspaceMemory(workspaceId, { limit: 80 }),
        cryptoAppsRequest,
      ]);
      return {
        scope,
        recommendation: recommendation.recommendation,
        filesAvailable: files.available,
        files: files.items.filter((item) => item.file.access.coworkerIds.includes(selectedCoworker.id)),
        memories: memories.records.filter((record) => record.canUseInChat && record.sensitivity !== "forbidden_secret"),
        connectionsAvailable: cryptoApps.available,
        allConnections: cryptoApps.connections,
        connections: cryptoApps.connections.filter((connection) => (
          connection.state === "active"
          && connection.availability === "available"
          && selectedCoworker.allowedAppIds.includes(connection.appId)
          && connection.grantedActionIds.some((actionId) => selectedCoworker.allowedActionIds.includes(actionId))
          && connection.grantedNetworks.some((network) => selectedCoworker.allowedNetworks.includes(network))
        )),
        apps: cryptoApps.apps.filter((app) => buildCoworkerAppConnectionDraft(selectedCoworker, app) !== null),
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

  useEffect(() => {
    const connectionId = newlyConnectedAppRef.current;
    if (!connectionId || !resourceQuery.data?.connections.some((connection) => connection.id === connectionId)) return;
    setResourceDraft((current) => ({
      ...current,
      connectionIds: current.connectionIds.includes(connectionId)
        ? current.connectionIds
        : [...current.connectionIds, connectionId],
    }));
    setResourceRecommendationHash(null);
    setResourcesOpen(true);
    newlyConnectedAppRef.current = null;
  }, [resourceQuery.data?.connections]);

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
  const appsNeedingConnection = useMemo(
    () => (resourceQuery.data?.apps ?? []).filter((app) => (
      !resourceQuery.data?.connections.some((connection) => connection.appId === app.appId)
    )),
    [resourceQuery.data?.apps, resourceQuery.data?.connections],
  );
  const watchSources = useMemo(() => selectedCoworker ? resolveCoworkerWatchSources({
    coworker: selectedCoworker,
    scope: resourceQuery.data?.scope.active ? resourceQuery.data.scope.resources : null,
    apps: resourceQuery.data?.apps ?? [],
    connections: resourceQuery.data?.allConnections ?? [],
  }) : [], [
    resourceQuery.data?.allConnections,
    resourceQuery.data?.apps,
    resourceQuery.data?.scope.active,
    resourceQuery.data?.scope.resources,
    selectedCoworker,
  ]);
  const watchSource = watchSources.find((source) => source.id === watchSourceId) ?? null;
  const watchDetailQuery = useQuery({
    queryKey: [
      QUERY_PREFIX,
      "watch-app",
      watchSource?.appId ?? "none",
      watchSource?.connectionId ?? "none",
      watchSource?.manifestRevision ?? "none",
    ],
    enabled: Boolean(props.client && watchFormOpen && watchSource),
    retry: false,
    queryFn: async () => {
      if (!props.client || !watchSource) throw new Error("coworker_watch_source_unavailable");
      const response = await props.client.getCryptoApp(watchSource.appId);
      if (response.app.manifestRevision !== watchSource.manifestRevision) {
        throw new Error("coworker_watch_source_stale");
      }
      return response.app;
    },
  });
  const watchFieldResult = useMemo(
    () => resolveCoworkerWatchFields(watchDetailQuery.data ?? null, watchSource?.actionId ?? ""),
    [watchDetailQuery.data, watchSource?.actionId],
  );
  const activeWatchCount = detailQuery.data?.watches.filter((watch) => watch.state === "active").length ?? 0;
  const activitySummary = coworkerActivitySummary({
    walletReviewCount: walletIntents.length,
    checkCount: detailQuery.data?.watches.length ?? 0,
    updateCount: detailQuery.data?.inbox.length ?? 0,
  });
  const hasCoworkerActivity = activitySummary !== "No activity yet";
  const canAddWatch = Boolean(
    selectedCoworker?.state === "active"
    && selectedCoworker.automaticAuthorities.includes("watch")
    && selectedCoworker.limits.maxActiveWatches > activeWatchCount
    && watchSources.length > 0,
  );

  useEffect(() => {
    setActivityOpen(hasCoworkerActivity);
  }, [hasCoworkerActivity, selectedCoworker?.id]);

  useEffect(() => {
    if (!watchFormOpen) return;
    if (!watchSources.some((source) => source.id === watchSourceId)) {
      const first = watchSources[0] ?? null;
      setWatchSourceId(first?.id ?? "");
      setWatchName(first?.actionName ?? "");
      setWatchValues({});
      setWatchFormError(null);
    }
  }, [watchFormOpen, watchSourceId, watchSources]);

  useEffect(() => {
    setWatchFormOpen(false);
    setWatchSourceId("");
    setWatchName("");
    setWatchValues({});
    setWatchFormError(null);
  }, [selectedCoworker?.id]);
  const nextStep = resolveCoworkerNextStep({
    coworkerState: selectedCoworker?.state ?? "revoked",
    ready: canStartCoworker,
    loading: resourceQuery.isLoading,
    loadFailed: resourceQuery.isError,
    connectionsAvailable: resourceQuery.data?.connectionsAvailable,
    connectedAppCount: resourceQuery.data?.scope.resources?.connections.length ?? 0,
  });

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

  const connectApp = useCallback(async (app: MatterhornCryptoAppCatalogSummary) => {
    if (!props.client || !workspaceId || !selectedCoworker) return;
    const draft = buildCoworkerAppConnectionDraft(selectedCoworker, app);
    if (!draft) {
      setError("This app needs a different connection flow. Open the full app catalog to continue.");
      return;
    }
    setBusyAction(`connect-app:${app.appId}`);
    setError(null);
    try {
      const response = await props.client.createCryptoAppConnection(workspaceId, draft);
      newlyConnectedAppRef.current = response.connection.id;
      await queryClient.invalidateQueries({ queryKey: resourceKey });
      showToast({
        title: `${app.displayName} connected`,
        description: "Review the selected access, then save it for this coworker.",
        tone: "success",
      });
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, queryClient, resourceKey, selectedCoworker, showToast, workspaceId]);

  const resumeApp = useCallback(async (
    app: MatterhornCryptoAppCatalogSummary,
    connection: MatterhornCryptoAppConnectionView,
  ) => {
    if (!props.client || !workspaceId) return;
    setBusyAction(`connect-app:${app.appId}`);
    setError(null);
    try {
      const response = await props.client.transitionCryptoAppConnection(workspaceId, connection.id, "active");
      newlyConnectedAppRef.current = response.connection.id;
      await queryClient.invalidateQueries({ queryKey: resourceKey });
      showToast({
        title: `${app.displayName} resumed`,
        description: "Review the selected access, then save it for this coworker.",
        tone: "success",
      });
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [props.client, queryClient, resourceKey, showToast, workspaceId]);

  const createCoworker = useCallback(async (templateId: MatterhornCoworkerTemplateId) => {
    if (!props.client || !workspaceId) return;
    setCreating(templateId);
    setError(null);
    try {
      const response = await props.client.createCoworkerFromTemplate(workspaceId, { templateId });
      setCoworkerChoice(response.coworker.id);
      setShowCreateChoices(false);
      setResourcesOpen(true);
      await refresh();
      showToast({ title: `${response.coworker.name} added`, description: "Next, choose what it can use.", tone: "success" });
    } catch (cause) {
      setError(coworkerErrorMessage(cause));
    } finally {
      setCreating(null);
    }
  }, [props.client, refresh, showToast, workspaceId]);

  useEffect(() => {
    const templateId = props.initialTemplateId ?? null;
    if (!templateId) {
      handledInitialTemplateRef.current = null;
      return;
    }
    if (!listQuery.data || handledInitialTemplateRef.current === templateId) return;

    handledInitialTemplateRef.current = templateId;
    setPendingOutcome(props.initialOutcome?.trim() ?? "");
    props.onInitialTemplateHandled?.();
    const existingCoworker = coworkers.find((coworker) => coworker.role === templateId);
    if (existingCoworker) {
      setCoworkerChoice(existingCoworker.id);
      return;
    }
    void createCoworker(templateId);
  }, [coworkers, createCoworker, listQuery.data, props.initialOutcome, props.initialTemplateId, props.onInitialTemplateHandled]);

  useEffect(() => {
    if (!pendingOutcome || !selectedCoworker || !resourceQuery.data) return;
    const scope = resourceQuery.data.scope;
    if (scope.active && (scope.resources?.connections.length ?? 0) > 0) return;
    setResourcesOpen(true);
  }, [pendingOutcome, resourceQuery.data, selectedCoworker]);

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
        pendingOutcome || "Ask what outcome I want, then help me take the safest next step.",
        {
          title: `${coworker.name} chat`,
          sendImmediately: false,
          onSessionCreated: (createdSessionId) => {
            useMatterhornSessionCoworkerContextStore.getState().setContext(createdSessionId, context);
          },
        },
      );
      if (started === false) {
        setError("The chat did not start. Try again.");
        return;
      }
      setPendingOutcome("");
    })();
  }, [onClose, onStartTask, pendingOutcome, selectedSessionId, selectedWorkspaceId, showToast]);

  const transitionCoworker = useCallback(async (coworker: MatterhornCoworkerAccountProfile, state: "active" | "paused" | "revoked") => {
    if (!props.client || !workspaceId) return;
    setBusyAction(`coworker:${coworker.id}`);
    setError(null);
    try {
      await props.client.transitionCoworker(workspaceId, coworker.id, { state, expectedRevision: coworker.revision });
      setConfirmAction(null);
      await refresh();
      showToast({
        title: state === "active" ? `${coworker.name} resumed` : state === "paused" ? `${coworker.name} paused` : `${coworker.name} disabled`,
        description: state === "active" ? "It can receive new work again." : "It cannot start new work or use connected apps.",
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
      showToast({ title: "Coworker deleted", description: "Its recurring checks and unfinished wallet reviews were removed.", tone: "success" });
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

  const createWatch = useCallback(async () => {
    if (!props.client || !workspaceId || !selectedCoworker || !watchSource) return;
    const name = watchName.trim();
    if (!name) {
      setWatchFormError("Give this check a name.");
      return;
    }
    if (!watchFieldResult.supported) {
      setWatchFormError(watchFieldResult.reason);
      return;
    }
    const parsed = parseCoworkerWatchParameters(watchFieldResult.fields, watchValues);
    if (!parsed.ok) {
      setWatchFormError(parsed.error);
      return;
    }
    setBusyAction("watch:create");
    setWatchFormError(null);
    setError(null);
    try {
      await props.client.createCoworkerWatch(workspaceId, selectedCoworker.id, {
        profileRevision: selectedCoworker.revision,
        connectionId: watchSource.connectionId,
        name,
        appId: watchSource.appId,
        actionId: watchSource.actionId,
        network: watchSource.network,
        parameters: parsed.parameters,
        schedule: {
          intervalMs: watchIntervalMs,
          maxChecksPerDay: Math.max(1, Math.floor(86_400_000 / watchIntervalMs)),
        },
        budgets: {
          maxReadCallsPerCheck: 1,
          maxModelTokensPerCheck: 0,
          maxCostMicrosPerCheck: 10_000,
        },
        conditions: [{
          id: "result_changed",
          metric: "matterhorn_result_hash",
          operator: "changed",
          value: null,
        }],
      });
      setWatchFormOpen(false);
      setWatchSourceId("");
      setWatchName("");
      setWatchValues({});
      await queryClient.invalidateQueries({ queryKey: detailKey });
      showToast({
        title: "Check started",
        description: `${selectedCoworker.name} will alert you when the result changes.`,
        tone: "success",
      });
    } catch (cause) {
      setWatchFormError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [
    detailKey,
    props.client,
    queryClient,
    selectedCoworker,
    showToast,
    watchFieldResult,
    watchIntervalMs,
    watchName,
    watchSource,
    watchValues,
    workspaceId,
  ]);

  const deleteWatch = useCallback(async (watch: MatterhornCoworkerAccountWatch) => {
    if (!props.client || !workspaceId || !selectedCoworker) return;
    setBusyAction(`watch:${watch.id}`);
    setError(null);
    try {
      await props.client.deleteCoworkerWatch(workspaceId, selectedCoworker.id, watch.id, watch.revision);
      setWatchToDelete(null);
      await queryClient.invalidateQueries({ queryKey: detailKey });
      showToast({ title: "Check removed", description: "It will not run again.", tone: "success" });
    } catch (cause) {
      setWatchToDelete(null);
      setError(coworkerErrorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }, [detailKey, props.client, queryClient, selectedCoworker, showToast, workspaceId]);

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
        description: "The cancelled review cannot be approved or sent.",
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
            <h2 className="text-base font-semibold text-dls-text">Coworkers</h2>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">Pick who helps. You choose what it can access.</p>
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
            <h3 className="text-sm font-semibold text-dls-text">Couldn't load coworkers</h3>
            <p className="mt-2 text-sm leading-6 text-dls-secondary">{coworkerErrorMessage(listQuery.error)}</p>
            <Button className="mt-4" size="sm" onClick={() => void listQuery.refetch()}>Try again</Button>
          </div>
        ) : coworkers.length === 0 ? (
          <div className="py-8">
            <UserRound aria-hidden="true" className="size-5 text-dls-secondary" />
            <h3 className="mt-3 text-sm font-semibold text-dls-text">What do you want help with?</h3>
            <p className="mt-2 text-sm leading-6 text-dls-secondary">
              Choose one to continue. You will review its access before it starts. Anything involving funds stops for your wallet approval.
            </p>
            <div className="mt-4 grid gap-2">
              {COWORKER_CHOICES.map((choice) => (
                <Button
                  key={choice.id}
                  variant="outline"
                  className="h-auto min-h-14 justify-start whitespace-normal px-3 py-2 text-left"
                  disabled={creating !== null}
                  onClick={() => void createCoworker(choice.id)}
                >
                  <span className="block min-w-0">
                    <span className="block text-sm font-medium text-dls-text">
                      {creating === choice.id ? "Adding…" : choice.label}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal leading-5 text-dls-secondary">{choice.summary}</span>
                  </span>
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
                    )}>{selectedCoworker.state === "active" ? "Active" : selectedCoworker.state === "paused" ? "Paused" : "Disabled"}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-dls-secondary">{coworkerSummary(selectedCoworker.role)}</p>
                  <details className="mt-2">
                    <summary className="min-h-8 cursor-pointer text-xs text-dls-secondary outline-none focus-visible:text-dls-text focus-visible:ring-2 focus-visible:ring-ring/35">What it does</summary>
                    <p className="mt-1 border-l border-dls-border/70 pl-3 text-xs leading-5 text-dls-secondary">{selectedCoworker.mission}</p>
                  </details>
                  {pendingOutcome ? (
                    <div className="mt-4 border-y border-dls-border/70 py-3">
                      <p className="text-xs font-medium text-dls-text">Your goal</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-dls-secondary">{pendingOutcome}</p>
                    </div>
                  ) : null}
                </div>
                <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-dls-secondary" />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-y border-dls-border/70 py-3" role="region" aria-label="Next step">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-dls-text">Next step</p>
                  <p className="mt-1 text-xs leading-5 text-dls-secondary" role="status">{nextStep.message}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                {nextStep.action === "start" ? (
                  <Button size="sm" onClick={() => startChat(selectedCoworker)}>{nextStep.label}</Button>
                ) : nextStep.action === "wait" ? (
                  <Button size="sm" disabled>{nextStep.label}</Button>
                ) : nextStep.action === "reload" ? (
                  <Button size="sm" onClick={() => void resourceQuery.refetch()}>{nextStep.label}</Button>
                ) : nextStep.action === "connect" || nextStep.action === "review" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (nextStep.action === "connect" && appsNeedingConnection.length === 0) {
                        props.onBrowseApps();
                        return;
                      }
                      setResourcesOpen(true);
                    }}
                  >
                    {nextStep.label}
                  </Button>
                ) : nextStep.action === "resume" ? (
                  <Button size="sm" disabled={busyAction !== null} onClick={() => void transitionCoworker(selectedCoworker, "active")}>
                    <Play aria-hidden="true" /> {nextStep.label}
                  </Button>
                ) : null}
                </div>
              </div>
            </section>

            <CoworkerBoundary coworker={selectedCoworker} />

            <section className="border-b border-dls-border/70 py-4" aria-labelledby="coworker-resources-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="coworker-resources-title" className="text-sm font-semibold text-dls-text">Apps and information</h3>
                  <p className="mt-1 text-xs leading-5 text-dls-secondary">
                    {resourceQuery.isLoading
                      ? "Loading access…"
                      : resourceQuery.isError
                        ? "Setup could not be loaded."
                        : !resourceQuery.data?.scope.resources
                          ? "Nothing is shared until you choose."
                          : !resourceQuery.data.scope.active
                            ? "Review access again because this coworker changed."
                            : resourceQuery.data.scope.resources.connections.length === 0
                              ? "Connect at least one app before starting chat."
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
                  {resourcesOpen ? "Close" : resourceQuery.data?.scope.resources ? "Change" : "Choose"}
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
                  <Button size="sm" variant="ghost" onClick={reviewResourceRecommendation}>Review</Button>
                </div>
              ) : null}

              {resourcesOpen && resourceQuery.data ? (
                <div className="mt-4 grid gap-4 border-t border-dls-border/70 pt-4">
                  {resourceRecommendationHash ? (
                    <p className="text-xs leading-5 text-dls-secondary">
                      The suggestions are selected below. Uncheck anything you do not want to share, then save.
                    </p>
                  ) : null}
                  <fieldset>
                    <legend className="text-xs font-medium text-dls-text">Apps</legend>
                    {!resourceQuery.data.connectionsAvailable ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-dls-secondary">App connections are not enabled in this environment.</p>
                        <Button size="xs" variant="outline" onClick={props.onBrowseApps}>Browse apps</Button>
                      </div>
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
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-dls-secondary">No apps are connected yet.</p>
                        <Button size="xs" variant="outline" onClick={props.onBrowseApps}>Browse apps</Button>
                      </div>
                    )}

                    {resourceQuery.data.connectionsAvailable && appsNeedingConnection.length ? (
                      <div className="mt-3 border-t border-dls-border/70 pt-3">
                        <p className="text-xs font-medium text-dls-text">Connect an app</p>
                        <p className="mt-1 text-xs leading-5 text-dls-secondary">
                          Choose only what this coworker needs. Nothing is shared until you save access.
                        </p>
                        <ul className="mt-2 divide-y divide-dls-border/60">
                          {appsNeedingConnection.map((app) => {
                            const priorConnection = resourceQuery.data.allConnections.find((connection) => (
                              connection.appId === app.appId && connection.state !== "revoked"
                            ));
                            const draft = buildCoworkerAppConnectionDraft(selectedCoworker, app);
                            if (!draft) return null;
                            const actionIds = new Set(draft.grantedActionIds);
                            const includesPrepare = app.actions.some((action) => (
                              actionIds.has(action.id) && action.access === "prepare"
                            ));
                            const includesWatch = app.actions.some((action) => (
                              actionIds.has(action.id) && action.access === "watch"
                            ));
                            const unavailable = priorConnection?.availability === "certification_unavailable";
                            const needsAccessReview = priorConnection?.state === "active";
                            const busy = busyAction === `connect-app:${app.appId}`;
                            return (
                              <li key={app.appId} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-dls-text">{app.displayName}</p>
                                  <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
                                    {includesPrepare
                                      ? "Research and wallet previews"
                                      : includesWatch
                                        ? "Research and monitoring"
                                        : "Research only"}
                                  </p>
                                </div>
                                {unavailable ? (
                                  <span className="shrink-0 text-xs text-dls-secondary">Unavailable</span>
                                ) : needsAccessReview ? (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={busyAction !== null}
                                    onClick={props.onBrowseApps}
                                  >
                                    Review
                                  </Button>
                                ) : priorConnection?.state === "paused" ? (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={busyAction !== null}
                                    onClick={() => void resumeApp(app, priorConnection)}
                                  >
                                    {busy ? "Resuming…" : "Resume"}
                                  </Button>
                                ) : (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={busyAction !== null}
                                    onClick={() => void connectApp(app)}
                                  >
                                    {busy ? "Connecting…" : "Connect"}
                                  </Button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-medium text-dls-text">Files</legend>
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
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-dls-secondary">No private files are available for this coworker.</p>
                        <Button size="xs" variant="outline" onClick={props.onBrowseFiles}>Add file</Button>
                      </div>
                    )}
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-medium text-dls-text">Saved memory</legend>
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
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-dls-secondary">No saved memory is available yet.</p>
                        <Button size="xs" variant="outline" onClick={props.onBrowseMemory}>Add memory</Button>
                      </div>
                    )}
                  </fieldset>

                  <p className="text-xs leading-5 text-dls-secondary">
                    Files and saved memory only go to a model approved for private data. This coworker cannot change that.
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

            <details className="border-b border-dls-border/70 py-4">
              <summary className="min-h-8 cursor-pointer text-sm font-semibold text-dls-text outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
                Limits
              </summary>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">See how many app reads, recurring checks, and wallet reviews this coworker can make.</p>
              <dl className="mt-3 grid gap-2 text-xs leading-5">
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Apps allowed</dt><dd className="text-right text-dls-text">{selectedCoworker.allowedAppIds.map(humanizeId).join(", ") || "None"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">App reads per request</dt><dd className="text-dls-text">{selectedCoworker.limits.maxReadCallsPerRun}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Wallet reviews per request</dt><dd className="text-dls-text">{selectedCoworker.limits.maxPrepareCallsPerFamily > 0 ? selectedCoworker.limits.maxPrepareCallsPerFamily : "Not available"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Active checks</dt><dd className="text-dls-text">{selectedCoworker.limits.maxActiveWatches > 0 ? `${detailQuery.data?.watches.filter((watch) => watch.state === "active").length ?? 0} of ${selectedCoworker.limits.maxActiveWatches}` : "Not available"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Maximum per wallet action</dt><dd className="text-dls-text">{selectedCoworker.limits.perActionUsd > 0 ? `Up to $${selectedCoworker.limits.perActionUsd.toLocaleString()}` : "Not allowed"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-dls-secondary">Maximum per day</dt><dd className="text-dls-text">{selectedCoworker.limits.dailyUsd > 0 ? `Up to $${selectedCoworker.limits.dailyUsd.toLocaleString()}` : "Not allowed"}</dd></div>
              </dl>
            </details>

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
              <details
                key={`${selectedCoworker.id}:${hasCoworkerActivity ? "has-activity" : "empty"}`}
                className="border-b border-dls-border/70 py-4"
                open={activityOpen}
                onToggle={(event) => setActivityOpen(event.currentTarget.open)}
              >
                <summary className="min-h-8 cursor-pointer list-none outline-none focus-visible:ring-2 focus-visible:ring-ring/35 [&::-webkit-details-marker]:hidden">
                  <span className="block text-sm font-semibold text-dls-text">Activity</span>
                  <span className="mt-1 block text-xs leading-5 text-dls-secondary">{activitySummary}</span>
                </summary>
                <div className="mt-3 border-t border-dls-border/60">
                  <section className="py-4" aria-labelledby="coworker-wallet-title">
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
                              <summary className="min-h-8 cursor-pointer text-dls-secondary outline-none focus-visible:text-dls-text focus-visible:ring-2 focus-visible:ring-ring/35">Wallet review details</summary>
                              <dl className="mt-2 grid gap-1.5 border-y border-dls-border/70 py-2 text-dls-secondary">
                                <div><dt className="inline font-medium text-dls-text">Wallet: </dt><dd className="inline break-all">{item.reviewedAction.signer ?? "Chosen in wallet"}</dd></div>
                                <div><dt className="inline font-medium text-dls-text">Recipient: </dt><dd className="inline break-all">{item.reviewedAction.recipient ?? "Set by the connected app"}</dd></div>
                                <div><dt className="inline font-medium text-dls-text">Checked: </dt><dd className="inline">{shortDate(item.reviewedAction.simulation.simulatedAt)}</dd></div>
                                <div><dt className="inline font-medium text-dls-text">Safety checks: </dt><dd className="inline">{item.policy.limits.length ? `${item.policy.limits.filter((limit) => limit.passed).length} of ${item.policy.limits.length} passed` : "No amount limits apply"}</dd></div>
                              </dl>
                              <details className="mt-2 text-dls-secondary">
                                <summary className="min-h-7 cursor-pointer outline-none focus-visible:text-dls-text focus-visible:ring-2 focus-visible:ring-ring/35">Technical proof</summary>
                                <dl className="mt-1 grid gap-1.5 border-l border-dls-border/70 pl-3">
                                  <div><dt className="inline font-medium text-dls-text">Network check ID: </dt><dd className="inline break-all">{item.reviewedAction.simulation.reference}</dd></div>
                                  {item.receipt ? <div><dt className="inline font-medium text-dls-text">Public receipt ID: </dt><dd className="inline break-all">{item.receipt.publicId}</dd></div> : null}
                                </dl>
                              </details>
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
                  {activeIntents.length > 4 ? <p className="mt-2 text-xs text-dls-secondary">{activeIntents.length - 4} more wallet reviews in history.</p> : null}
                  </section>

                  <section className="border-t border-dls-border/70 py-4" aria-labelledby="coworker-watches-title">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 id="coworker-watches-title" className="text-sm font-semibold text-dls-text">Checks</h3>
                      <p className="mt-1 text-xs leading-5 text-dls-secondary">Get an update when approved app data changes.</p>
                    </div>
                    {selectedCoworker.automaticAuthorities.includes("watch") && selectedCoworker.limits.maxActiveWatches > 0 ? (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busyAction !== null || !canAddWatch}
                        onClick={() => {
                          const first = watchSources[0] ?? null;
                          setWatchFormOpen(true);
                          setWatchSourceId(first?.id ?? "");
                          setWatchName(first?.actionName ?? "");
                          setWatchValues({});
                          setWatchFormError(null);
                        }}
                      >
                        Add check
                      </Button>
                    ) : null}
                  </div>
                  {watchFormOpen ? (
                    <div className="mt-3 rounded-lg border border-dls-border bg-dls-surface/45 p-3">
                      <h4 className="text-sm font-medium text-dls-text">Add a recurring check</h4>
                      <p className="mt-1 text-xs leading-5 text-dls-secondary">This reads your approved app and alerts you when the result changes. It cannot move funds.</p>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-1.5 text-xs font-medium text-dls-text">
                          What to check
                          <select
                            className="h-9 w-full rounded-md border border-dls-border bg-dls-background px-3 text-sm text-dls-text outline-none focus:border-ring focus:ring-2 focus:ring-ring/35"
                            value={watchSource?.id ?? ""}
                            onChange={(event) => {
                              const source = watchSources.find((candidate) => candidate.id === event.currentTarget.value) ?? null;
                              setWatchSourceId(source?.id ?? "");
                              setWatchName(source?.actionName ?? "");
                              setWatchValues({});
                              setWatchFormError(null);
                            }}
                          >
                            {watchSources.map((source) => (
                              <option key={source.id} value={source.id}>{source.appName} — {source.actionName}</option>
                            ))}
                          </select>
                        </label>
                        {watchSource ? <p className="-mt-1 text-xs leading-5 text-dls-secondary">{watchSource.actionDescription}</p> : null}
                        <label className="grid gap-1.5 text-xs font-medium text-dls-text">
                          Name
                          <Input
                            value={watchName}
                            maxLength={120}
                            onChange={(event) => setWatchName(event.currentTarget.value)}
                          />
                        </label>
                        {watchDetailQuery.isLoading ? (
                          <div className="grid gap-2" role="status" aria-label="Loading check fields">
                            <Skeleton className="h-9 w-full rounded-md" />
                          </div>
                        ) : watchDetailQuery.isError ? (
                          <p className="text-xs leading-5 text-destructive" role="alert">This app changed. Refresh access before adding the check.</p>
                        ) : watchFieldResult.supported ? watchFieldResult.fields.filter((field) => field.kind !== "constant").map((field) => (
                          field.kind === "boolean" ? (
                            <label key={field.name} className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-medium text-dls-text">
                              <input
                                type="checkbox"
                                className="size-4 accent-current"
                                checked={watchValues[field.name] === true}
                                onChange={(event) => setWatchValues((current) => ({ ...current, [field.name]: event.currentTarget.checked }))}
                              />
                              <span>{field.label}</span>
                            </label>
                          ) : field.options ? (
                            <label key={field.name} className="grid gap-1.5 text-xs font-medium text-dls-text">
                              {field.label}{field.required ? "" : " (optional)"}
                              <select
                                className="h-9 w-full rounded-md border border-dls-border bg-dls-background px-3 text-sm text-dls-text outline-none focus:border-ring focus:ring-2 focus:ring-ring/35"
                                value={typeof watchValues[field.name] === "string" ? watchValues[field.name] as string : ""}
                                onChange={(event) => setWatchValues((current) => ({ ...current, [field.name]: event.currentTarget.value }))}
                              >
                                <option value="">Choose one</option>
                                {field.options.map((option) => <option key={String(option)} value={String(option)}>{humanizeId(String(option))}</option>)}
                              </select>
                            </label>
                          ) : (
                            <label key={field.name} className="grid gap-1.5 text-xs font-medium text-dls-text">
                              {field.label}{field.required ? "" : " (optional)"}
                              <Input
                                type={field.kind === "string" ? "text" : "number"}
                                min={field.minimum}
                                max={field.maximum}
                                step={field.kind === "integer" ? 1 : "any"}
                                minLength={field.minLength}
                                maxLength={field.maxLength}
                                value={typeof watchValues[field.name] === "string" ? watchValues[field.name] as string : ""}
                                onChange={(event) => setWatchValues((current) => ({ ...current, [field.name]: event.currentTarget.value }))}
                              />
                            </label>
                          )
                        )) : (
                          <p className="text-xs leading-5 text-dls-secondary">{watchFieldResult.reason}</p>
                        )}
                        <label className="grid gap-1.5 text-xs font-medium text-dls-text">
                          How often
                          <select
                            className="h-9 w-full rounded-md border border-dls-border bg-dls-background px-3 text-sm text-dls-text outline-none focus:border-ring focus:ring-2 focus:ring-ring/35"
                            value={watchIntervalMs}
                            onChange={(event) => setWatchIntervalMs(Number(event.currentTarget.value))}
                          >
                            {WATCH_INTERVALS.map((interval) => <option key={interval.value} value={interval.value}>{interval.label}</option>)}
                          </select>
                        </label>
                        <p className="text-xs font-medium text-dls-text">Notify me when the result changes.</p>
                        {watchFormError ? <p className="text-xs leading-5 text-destructive" role="alert">{watchFormError}</p> : null}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busyAction !== null || watchDetailQuery.isLoading || watchDetailQuery.isError || !watchFieldResult.supported}
                            onClick={() => void createWatch()}
                          >
                            {busyAction === "watch:create" ? "Starting…" : "Start check"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyAction !== null}
                            onClick={() => {
                              setWatchFormOpen(false);
                              setWatchFormError(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : !canAddWatch && watchSources.length === 0 && selectedCoworker.automaticAuthorities.includes("watch") ? (
                    <p className="mt-3 text-xs leading-5 text-dls-secondary">Choose an app that can read data before adding a check.</p>
                  ) : activeWatchCount >= selectedCoworker.limits.maxActiveWatches && selectedCoworker.limits.maxActiveWatches > 0 ? (
                    <p className="mt-3 text-xs leading-5 text-dls-secondary">Pause or remove a check before adding another.</p>
                  ) : null}
                  {detailQuery.data?.watches.length ? (
                    <ul className="mt-2 divide-y divide-dls-border/70">
                      {detailQuery.data.watches.map((watch) => (
                        <WatchRow
                          key={watch.id}
                          watch={watch}
                          busy={busyAction === `watch:${watch.id}`}
                          onToggle={() => void toggleWatch(watch)}
                          onDelete={() => setWatchToDelete(watch)}
                        />
                      ))}
                    </ul>
                  ) : !watchFormOpen ? <p className="mt-3 text-xs leading-5 text-dls-secondary">No recurring checks yet.</p> : null}
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
                </div>
              </details>
            )}

            {error ? <p className="border-t border-dls-border/70 py-3 text-sm leading-6 text-destructive" role="alert">{error}</p> : null}

            <details className="border-t border-dls-border/70 py-4">
              <summary className="min-h-8 cursor-pointer text-sm font-semibold text-dls-text outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
                Pause or disable
              </summary>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">Pause is reversible. Disabling is permanent and immediately stops new chats, checks, and app access.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedCoworker.state === "active" ? (
                  <Button size="sm" variant="outline" disabled={busyAction !== null} onClick={() => void transitionCoworker(selectedCoworker, "paused")}>
                    <Pause aria-hidden="true" /> Pause
                  </Button>
                ) : null}
                {selectedCoworker.state !== "revoked" ? (
                  <Button size="sm" variant="outline" disabled={busyAction !== null} onClick={() => setConfirmAction({ kind: "revoke", coworker: selectedCoworker })}>Disable permanently</Button>
                ) : (
                  <Button size="sm" variant="destructive" disabled={busyAction !== null} onClick={() => setConfirmAction({ kind: "delete", coworker: selectedCoworker })}>
                    <Trash2 aria-hidden="true" /> Delete
                  </Button>
                )}
              </div>
            </details>
          </>
        ) : null}
      </div>

      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmAction?.kind === "delete" ? "Delete this coworker?" : "Disable this coworker permanently?"}
        message={confirmAction?.kind === "delete"
          ? "This removes the saved coworker profile. It cannot be undone."
          : "This cannot be undone. New chats and checks stop, connected apps are blocked, and unfinished wallet reviews are cancelled."}
        confirmLabel={busyAction ? "Working…" : confirmAction?.kind === "delete" ? "Delete coworker" : "Disable coworker"}
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
        message="Your wallet will no longer be able to approve or send this review."
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
      <ConfirmModal
        open={Boolean(watchToDelete)}
        title="Remove this check?"
        message="This stops the schedule and removes it from the coworker. It will not run again."
        confirmLabel={busyAction ? "Removing…" : "Remove check"}
        cancelLabel="Keep check"
        variant="warning"
        confirmButtonVariant="outline"
        onConfirm={() => {
          if (watchToDelete) void deleteWatch(watchToDelete);
        }}
        onCancel={() => {
          if (!busyAction) setWatchToDelete(null);
        }}
      />
    </div>
  );
}

export default SessionCoworkersPanel;
