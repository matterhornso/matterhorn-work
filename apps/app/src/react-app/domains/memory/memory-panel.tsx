/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import type {
  MatterhornMemorySuggestionInboxEntry,
  MatterhornServerClient,
} from "../../../app/lib/matterhorn-server";
import type {
  MatterhornMemoryKind,
  MatterhornMemoryRecord,
  MatterhornMemoryScope,
  MatterhornMemorySensitivity,
  MatterhornMemorySuggestion,
} from "@matterhorn-work/types";
import {
  containsForbiddenMemorySecretMaterial,
  isForbiddenMemorySecretBody,
  MATTERHORN_MEMORY_KINDS,
  MATTERHORN_MEMORY_SCOPES,
  MATTERHORN_MEMORY_SENSITIVITIES,
  sanitizeMemorySuggestionForDisplay,
} from "@matterhorn-work/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyMatterhornMemoryDeskPolicyDefaults,
  getMatterhornMemoryPolicyDecision,
} from "./memory-policy";

const SELECTABLE_SENSITIVITIES = MATTERHORN_MEMORY_SENSITIVITIES.filter(
  (sensitivity) => sensitivity !== "forbidden_secret",
);

type MemoryPanelProps = {
  client: MatterhornServerClient | null;
  sessionId: string | null;
  workspaceId: string | null;
  onClose: () => void;
};

type CaptureDraft = {
  title: string;
  summary: string;
  body: string;
  kind: MatterhornMemoryKind;
  scope: MatterhornMemoryScope;
  sensitivity: Exclude<MatterhornMemorySensitivity, "forbidden_secret">;
  tags: string;
  confirmed: boolean;
};

type MemorySuggestionEventDetail = {
  suggestion?: MatterhornMemorySuggestion;
  suggestions?: MatterhornMemorySuggestion[];
  input?: Parameters<NonNullable<MatterhornServerClient>["createMemorySuggestions"]>[0];
};

const INITIAL_DRAFT: CaptureDraft = {
  title: "",
  summary: "",
  body: "",
  kind: "user_preference",
  scope: "workspace",
  sensitivity: "private",
  tags: "",
  confirmed: false,
};

function formatKind(kind: string) {
  return kind.replaceAll("_", " ");
}

function sensitivityClassName(sensitivity: MatterhornMemorySensitivity) {
  if (sensitivity === "public") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (sensitivity === "private") return "border-[rgba(var(--matterhorn-blue-rgb),0.35)] bg-[rgba(var(--matterhorn-blue-rgb),0.12)] text-primary";
  if (sensitivity === "restricted") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-red-500/35 bg-red-500/10 text-red-200";
}

function parseTags(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function buildMemoryRecord(draft: CaptureDraft, workspaceId: string | null, sessionId: string | null): MatterhornMemoryRecord {
  const now = new Date().toISOString();
  const tags = parseTags(draft.tags);
  const title = draft.title.trim();
  const summary = draft.summary.trim();
  const bodyText = draft.body.trim();
  const idSeed = `${title}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const record: MatterhornMemoryRecord = {
    id: `mem_ui_${idSeed || Date.now().toString(36)}`,
    kind: draft.kind,
    scope: draft.scope,
    title,
    summary,
    body: {
      note: bodyText,
      workspaceId: workspaceId ?? undefined,
      sessionId: sessionId ?? undefined,
    },
    tags,
    links: [],
    provenance: {
      source: "user_confirmed",
      capturedAt: now,
      capturedBy: "user",
      confidence: 1,
      reasonRemembered: "User explicitly clicked Remember this in the Matterhorn Memory panel.",
    },
    sensitivity: draft.sensitivity,
    createdAt: now,
    updatedAt: now,
    canUseInChat: true,
    canExport: draft.sensitivity !== "restricted",
    canDelete: true,
  };
  return applyMatterhornMemoryDeskPolicyDefaults(record);
}

function useMemoryRecords(client: MatterhornServerClient | null) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<MatterhornMemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) {
      setRecords([]);
      setError("Memory API unavailable. Connect to the local Matterhorn server.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = query.trim()
        ? await client.searchMemory({ query, limit: 80 })
        : await client.listMemory({ limit: 80 });
      setRecords(response.records ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load Matterhorn Memory.");
    } finally {
      setLoading(false);
    }
  }, [client, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { query, setQuery, records, setRecords, loading, error, refresh };
}

function localSuggestionEntry(suggestion: MatterhornMemorySuggestion): MatterhornMemorySuggestionInboxEntry {
  const now = new Date().toISOString();
  return {
    version: "matterhorn.memory.suggestion-inbox.v1",
    id: suggestion.id,
    suggestion,
    status: suggestion.policyDecision === "reject" ? "blocked" : "pending",
    createdAt: now,
    updatedAt: now,
    policyWarnings: suggestion.policyWarnings ?? [],
  };
}

function useMemorySuggestionInbox(client: MatterhornServerClient | null) {
  const [entries, setEntries] = useState<MatterhornMemorySuggestionInboxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) {
      setEntries([]);
      setError("Suggestion inbox unavailable. Connect to the local Matterhorn server.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await client.listMemorySuggestions({ includeResolved: true, limit: 40 });
      setEntries(response.entries ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load Memory suggestions.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsertEntries = useCallback((incoming: MatterhornMemorySuggestionInboxEntry[]) => {
    if (!incoming.length) return;
    setEntries((current) => {
      const byId = new Map(current.map((entry) => [entry.id, entry]));
      for (const entry of incoming) byId.set(entry.id, entry);
      return Array.from(byId.values())
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 40);
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  return { entries, setEntries, loading, error, refresh, upsertEntries, removeEntry };
}

export function MemoryPanel(props: MemoryPanelProps) {
  const { query, setQuery, records, setRecords, loading, error, refresh } = useMemoryRecords(props.client);
  const {
    entries: suggestionEntries,
    loading: suggestionsLoading,
    error: suggestionsError,
    refresh: refreshSuggestions,
    upsertEntries: upsertSuggestionEntries,
    removeEntry: removeSuggestionEntry,
  } = useMemorySuggestionInbox(props.client);
  const [selectedRecords, setSelectedRecords] = useState<MatterhornMemoryRecord[]>([]);
  const [draft, setDraft] = useState<CaptureDraft>(INITIAL_DRAFT);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    const handleSuggestions = (event: Event) => {
      const detail = (event as CustomEvent<MemorySuggestionEventDetail>).detail ?? {};
      const incoming = [
        ...(detail.suggestions ?? []),
        ...(detail.suggestion ? [detail.suggestion] : []),
      ].map(sanitizeMemorySuggestionForDisplay);
      if (!incoming.length) return;
      const localEntries = incoming.map(localSuggestionEntry);
      upsertSuggestionEntries(localEntries);
      if (detail.input && props.client) {
        void props.client.createMemorySuggestions(detail.input)
          .then((response) => upsertSuggestionEntries(response.inbox.entries ?? []))
          .catch(() => {
            // Keep local visible suggestions if the durable inbox is unavailable.
          });
      }
    };
    window.addEventListener("matterhorn:memory-suggestions-updated", handleSuggestions);
    window.addEventListener("matterhorn:memory-suggestion", handleSuggestions);
    return () => {
      window.removeEventListener("matterhorn:memory-suggestions-updated", handleSuggestions);
      window.removeEventListener("matterhorn:memory-suggestion", handleSuggestions);
    };
  }, [props.client, upsertSuggestionEntries]);

  const visibleSelectedRecords = useMemo(
    () => selectedRecords.filter((record) => records.some((candidate) => candidate.id === record.id)),
    [records, selectedRecords],
  );

  const updateDraft = <Key extends keyof CaptureDraft>(key: Key, value: CaptureDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleSelectedRecord = (record: MatterhornMemoryRecord) => {
    if (!getMatterhornMemoryPolicyDecision(record).canUseInChat) return;
    setSelectedRecords((current) => {
      if (current.some((item) => item.id === record.id)) {
        return current.filter((item) => item.id !== record.id);
      }
      return [...current, record].slice(-8);
    });
  };

  const dispatchMemoryContext = (recordsToUse: MatterhornMemoryRecord[]) => {
    if (!recordsToUse.length) return;
    window.dispatchEvent(new CustomEvent("matterhorn:memory-context-updated", {
      detail: {
        id: `memory-panel-${Date.now().toString(36)}`,
        records: recordsToUse,
        updatedAt: new Date().toISOString(),
      },
    }));
    window.dispatchEvent(new CustomEvent("matterhorn:memory-chat-handoff", {
      detail: {
        prompt: "Use the visible Matterhorn Memory context in this chat. Explain which memories matter, ask if anything should be forgotten, and do not use hidden memory.",
      },
    }));
  };

  const handleForget = async (record: MatterhornMemoryRecord) => {
    if (!props.client || !record.canDelete) return;
    try {
      await props.client.forgetMemory(record.id, "User forgot this memory from the Matterhorn Memory panel.");
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setSelectedRecords((current) => current.filter((item) => item.id !== record.id));
    } catch (nextError) {
      setCaptureError(nextError instanceof Error ? nextError.message : "Could not forget memory.");
    }
  };

  const handleExport = async () => {
    if (!props.client) return;
    setExportStatus("Exporting public-safe memory bundle...");
    try {
      const response = await props.client.exportMemory();
      setExportStatus(`Exported ${response.export.recordCount} records. sha256 ${response.export.sha256.slice(0, 12)}...`);
    } catch (nextError) {
      setExportStatus(nextError instanceof Error ? nextError.message : "Could not export memory bundle.");
    }
  };

  const handleResolveSuggestion = async (entry: MatterhornMemorySuggestionInboxEntry, action: MatterhornMemorySuggestion["userAction"]) => {
    if (!props.client) return;
    setCaptureError(null);
    try {
      if (entry.status === "pending") {
        const response = await props.client.resolveStoredMemorySuggestion(entry.id, {
          action,
          reason: action === "dismiss"
            ? "User dismissed this visible Memory suggestion from the Matterhorn Memory panel."
            : "User confirmed this visible Memory suggestion from the Matterhorn Memory panel.",
        });
        if (response.record) {
          setRecords((current) => [response.record!, ...current.filter((item) => item.id !== response.record!.id)]);
        }
        upsertSuggestionEntries([response.entry]);
        return;
      }

      const response = await props.client.resolveMemorySuggestion({
        suggestion: entry.suggestion,
        action,
        reason: action === "dismiss"
          ? "User dismissed this visible Memory suggestion from the Matterhorn Memory panel."
          : "User confirmed this visible Memory suggestion from the Matterhorn Memory panel.",
      });
      if (response.record) {
        setRecords((current) => [response.record!, ...current.filter((item) => item.id !== response.record!.id)]);
      }
      removeSuggestionEntry(entry.id);
    } catch (nextError) {
      setCaptureError(nextError instanceof Error ? nextError.message : "Could not resolve this memory suggestion.");
    }
  };

  const handleCapture = async () => {
    if (!props.client) return;
    const title = draft.title.trim();
    const summary = draft.summary.trim();
    const body = draft.body.trim();
    if (!title || !summary || !body) {
      setCaptureError("Title, summary, and body are required before Matterhorn can remember this.");
      return;
    }
    if (!draft.confirmed) {
      setCaptureError("Confirm that this contains no secrets, wallet exports, raw signatures, signed payloads, or hidden clinical records.");
      return;
    }
    const candidate = {
      title,
      summary,
      note: body,
      tags: parseTags(draft.tags),
    };
    if (isForbiddenMemorySecretBody(candidate) || containsForbiddenMemorySecretMaterial(candidate)) {
      setCaptureError("This looks like secret material. Matterhorn Memory refused to capture it.");
      return;
    }
    setCaptureBusy(true);
    setCaptureError(null);
    try {
      const nextRecord = buildMemoryRecord(draft, props.workspaceId, props.sessionId);
      const policyDecision = getMatterhornMemoryPolicyDecision(nextRecord);
      if (policyDecision.blockedReasons.length > 0) {
        setCaptureError(`Desk policy blocked this memory: ${policyDecision.blockedReasons.join("; ")}`);
        return;
      }
      const response = await props.client.captureMemory(nextRecord);
      setRecords((current) => [response.record, ...current.filter((item) => item.id !== response.record.id)]);
      setDraft(INITIAL_DRAFT);
    } catch (nextError) {
      setCaptureError(nextError instanceof Error ? nextError.message : "Could not remember this.");
    } finally {
      setCaptureBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-dls-text">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-dls-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-base font-semibold">Matterhorn Memory</div>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Explicit, user-controlled memory. No hidden memory, no auto-capture, no seeds or private keys.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label="Close Memory panel">
          <X size={16} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <section className="rounded-2xl border border-dls-border bg-dls-card p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dls-secondary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-xl border border-dls-border bg-dls-surface pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-dls-secondary focus:border-primary"
                placeholder="Search memories, receipts, addresses, workflow notes..."
              />
            </label>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("mr-2 size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          {error ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {error}
            </div>
          ) : null}
        </section>

        {visibleSelectedRecords.length ? (
          <section className="mt-4 rounded-2xl border border-[rgba(var(--matterhorn-blue-rgb),0.28)] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Using memories in chat</div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  These records will appear as visible composer chips. Remove any record before sending if it is not relevant.
                </p>
              </div>
              <Button size="sm" onClick={() => dispatchMemoryContext(visibleSelectedRecords)}>
                Use in chat
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {visibleSelectedRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="rounded-full border border-dls-border bg-dls-surface px-3 py-1 text-xs text-dls-text transition-colors hover:border-red-500/40 hover:text-red-200"
                  onClick={() => toggleSelectedRecord(record)}
                  title="Remove memory from chat context"
                >
                  {record.title} <span className="text-dls-secondary">x</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-4 rounded-2xl border border-[rgba(var(--matterhorn-blue-rgb),0.28)] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-semibold">Suggestion inbox</div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  Visible memory candidates only: nothing is saved unless you confirm or edit to save; dismiss keeps it out of memory.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshSuggestions()} disabled={suggestionsLoading || !props.client}>
              <RefreshCw className={cn("mr-2 size-3.5", suggestionsLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          {suggestionsError ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {suggestionsError}
            </div>
          ) : null}
          {suggestionEntries.length ? (
            <div className="mt-3 space-y-2">
              {suggestionEntries.map((entry) => {
                const suggestion = entry.suggestion;
                const resolved = entry.status === "confirmed" || entry.status === "edited" || entry.status === "dismissed";
                return (
                  <article key={entry.id} className={cn(
                    "rounded-xl border border-dls-border bg-dls-card px-3 py-2",
                    entry.status === "blocked" && "border-red-500/30 bg-red-500/10",
                    resolved && "opacity-75",
                  )}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{suggestion.proposedRecord.title}</h3>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", sensitivityClassName(suggestion.proposedRecord.sensitivity))}>
                        {suggestion.proposedRecord.sensitivity}
                      </span>
                      <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                        {suggestion.desk}
                      </span>
                      <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                        {entry.status}
                      </span>
                      <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-dls-secondary">{suggestion.proposedRecord.summary}</p>
                    <p className="mt-2 text-xs leading-5 text-dls-secondary">
                      <span className="font-semibold text-dls-text">Why suggested:</span> {suggestion.reason}
                    </p>
                    {entry.reason && resolved ? (
                      <p className="mt-2 text-xs leading-5 text-dls-secondary">
                        <span className="font-semibold text-dls-text">Resolution:</span> {entry.reason}
                      </p>
                    ) : null}
                    {entry.policyWarnings?.length ? (
                      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100">
                        {entry.policyWarnings.slice(0, 3).join(" ")}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleResolveSuggestion(entry, "confirm")}
                        disabled={!props.client || entry.status !== "pending" || suggestion.policyDecision === "reject"}
                      >
                        Remember
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleResolveSuggestion(entry, "dismiss")}
                        disabled={!props.client || entry.status !== "pending"}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-dls-border bg-dls-card px-3 py-5 text-center text-xs leading-5 text-dls-secondary">
              No pending suggestions. Matterhorn will show candidates here before anything is remembered.
            </div>
          )}
        </section>

        <section className="mt-4 space-y-2">
          {records.length === 0 && !loading ? (
            <div className="rounded-2xl border border-dashed border-dls-border bg-dls-card px-4 py-8 text-center">
              <div className="text-sm font-medium">No memories yet</div>
              <p className="mt-2 text-xs leading-5 text-dls-secondary">
                Save one manually below. Matterhorn will not remember anything unless you explicitly confirm it.
              </p>
            </div>
          ) : null}
          {records.map((record) => {
            const policyDecision = getMatterhornMemoryPolicyDecision(record);
            const selected = visibleSelectedRecords.some((item) => item.id === record.id);
            return (
              <article key={record.id} className="rounded-2xl border border-dls-border bg-dls-card p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{record.title}</h3>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", sensitivityClassName(record.sensitivity))}>
                        {record.sensitivity}
                      </span>
                      <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                        {policyDecision.deskLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-dls-secondary">{record.summary}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.08em] text-dls-secondary">
                  <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-1">{formatKind(record.kind)}</span>
                  <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-1">{record.scope}</span>
                  <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-1">{record.provenance.source}</span>
                  <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-1">{Math.round(record.provenance.confidence * 100)}% confidence</span>
                  <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-1">MCP/API {policyDecision.canSendToMcpApi ? "allowed" : "blocked"}</span>
                  <span className="rounded-full border border-dls-border bg-dls-surface px-2 py-1">Export {policyDecision.canExport ? "allowed" : "blocked"}</span>
                </div>
                {policyDecision.blockedReasons.length || policyDecision.warnings.length ? (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                    <div className="font-semibold">Desk policy</div>
                    {[...policyDecision.blockedReasons, ...policyDecision.warnings].slice(0, 4).join(" ")}
                  </div>
                ) : null}
                {record.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {record.tags.slice(0, 8).map((tag) => (
                      <span key={tag} className="rounded-full bg-dls-hover px-2 py-0.5 text-[11px] text-dls-secondary">#{tag}</span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    disabled={!policyDecision.canUseInChat}
                    onClick={() => toggleSelectedRecord(record)}
                    title={policyDecision.canUseInChat ? "Use this visible memory in chat" : `Chat use blocked: ${policyDecision.blockedReasons.join("; ") || policyDecision.warnings.join("; ")}`}
                  >
                    <Eye className="mr-2 size-3.5" />
                    {selected ? "Selected" : "Use in chat"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!record.canDelete}
                    onClick={() => void handleForget(record)}
                  >
                    <Trash2 className="mr-2 size-3.5" />
                    Forget
                  </Button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-4 rounded-2xl border border-dls-border bg-dls-card p-3.5">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">Remember this</div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Manual capture only. Never paste seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, wallet exports, or hidden clinical records.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="rounded-xl border border-dls-border bg-dls-surface px-3 py-2 text-xs leading-5 text-dls-secondary">
              Desk defaults are applied from tags. Use <span className="font-semibold text-dls-text">bittensor</span>, <span className="font-semibold text-dls-text">hyperliquid</span>, <span className="font-semibold text-dls-text">polymarket</span>, or <span className="font-semibold text-dls-text">wellness</span>. Wellness becomes restricted by default; market memories cannot be exported or shared with MCP/API.
            </div>
            <input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              className="h-10 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
              placeholder="Memory title"
            />
            <input
              value={draft.summary}
              onChange={(event) => updateDraft("summary", event.target.value)}
              className="h-10 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
              placeholder="Short summary"
            />
            <textarea
              value={draft.body}
              onChange={(event) => updateDraft("body", event.target.value)}
              className="min-h-24 resize-y rounded-xl border border-dls-border bg-dls-surface px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
              placeholder="What should Matterhorn remember?"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={draft.kind}
                onChange={(event) => updateDraft("kind", event.target.value as MatterhornMemoryKind)}
                className="h-10 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
              >
                {MATTERHORN_MEMORY_KINDS.map((kind) => <option key={kind} value={kind}>{formatKind(kind)}</option>)}
              </select>
              <select
                value={draft.scope}
                onChange={(event) => updateDraft("scope", event.target.value as MatterhornMemoryScope)}
                className="h-10 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
              >
                {MATTERHORN_MEMORY_SCOPES.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
              </select>
              <select
                value={draft.sensitivity}
                onChange={(event) => updateDraft("sensitivity", event.target.value as CaptureDraft["sensitivity"])}
                className="h-10 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
              >
                {SELECTABLE_SENSITIVITIES.map((sensitivity) => <option key={sensitivity} value={sensitivity}>{sensitivity}</option>)}
              </select>
              <input
                value={draft.tags}
                onChange={(event) => updateDraft("tags", event.target.value)}
                className="h-10 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
                placeholder="tags, comma separated"
              />
            </div>
            <label className="flex items-start gap-2 rounded-xl border border-dls-border bg-dls-surface px-3 py-2 text-xs leading-5 text-dls-secondary">
              <input
                type="checkbox"
                checked={draft.confirmed}
                onChange={(event) => updateDraft("confirmed", event.target.checked)}
                className="mt-1"
              />
              <span>
                I confirm this is safe to remember and contains no secrets, wallet exports, raw signatures, signed payloads, or hidden medical/clinical records.
              </span>
            </label>
            {captureError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{captureError}</div>
            ) : null}
            <Button onClick={() => void handleCapture()} disabled={captureBusy || !props.client}>
              {captureBusy ? "Remembering..." : "Remember this"}
            </Button>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-dls-border bg-dls-card p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Export evidence</div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Export only policy-approved public-safe memory bundle metadata. Restricted, market, wellness, and forbidden-secret records stay out.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={!props.client}>
              <Download className="mr-2 size-3.5" />
              Export
            </Button>
          </div>
          {exportStatus ? <div className="mt-3 text-xs text-dls-secondary">{exportStatus}</div> : null}
        </section>
      </div>
    </div>
  );
}
