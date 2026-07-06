/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  Download,
  Eye,
  RefreshCw,
  Search,
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
  MatterhornMemorySuggestionAction,
  MatterhornMemorySuggestionStatus,
} from "@matterhorn-work/types";
import {
  DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
  containsForbiddenMemorySecretMaterial,
  isForbiddenMemorySecretBody,
  MATTERHORN_MEMORY_KINDS,
  MATTERHORN_MEMORY_SCOPES,
  MATTERHORN_MEMORY_SENSITIVITIES,
  sanitizeMemorySuggestionForDisplay,
} from "@matterhorn-work/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ErrorState } from "../shell/error-state";
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

type SuggestionEditDraft = {
  title: string;
  summary: string;
  note: string;
};

type SuggestionInboxFilter = "needs_review" | "saved" | "not_saved" | "all";

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

const SUGGESTION_INBOX_FILTERS: Array<{
  id: SuggestionInboxFilter;
  label: string;
  description: string;
}> = [
  { id: "needs_review", label: "Needs review", description: "Confirm, edit, or dismiss" },
  { id: "saved", label: "Saved", description: "Confirmed or saved after editing" },
  { id: "not_saved", label: "Not saved", description: "Dismissed, expired, or blocked" },
  { id: "all", label: "All", description: "Every visible suggestion" },
];

const SAVED_SUGGESTION_STATUSES = new Set<MatterhornMemorySuggestionStatus>(["confirmed", "edited"]);
const NOT_SAVED_SUGGESTION_STATUSES = new Set<MatterhornMemorySuggestionStatus>(["dismissed", "expired", "blocked"]);
const MEMORY_FIELD_CLASS =
  "border-transparent bg-dls-surface-muted/25 shadow-none placeholder:text-dls-secondary/80 focus-visible:border-[rgba(var(--dls-accent-rgb),0.45)] focus-visible:ring-1 focus-visible:ring-[rgba(var(--dls-accent-rgb),0.22)]";
const MEMORY_SELECT_CLASS =
  "h-10 rounded-md border border-transparent bg-dls-background/45 px-3 text-sm outline-none transition-colors focus:border-[rgba(var(--dls-accent-rgb),0.45)] focus:ring-1 focus:ring-[rgba(var(--dls-accent-rgb),0.22)]";
const MEMORY_MUTED_BADGE_CLASS = "border-transparent bg-transparent px-0 text-dls-secondary";

function formatKind(kind: string) {
  return kind.replaceAll("_", " ");
}

function sensitivityClassName(sensitivity: MatterhornMemorySensitivity) {
  if (sensitivity === "public") return "border-transparent bg-transparent px-0 text-emerald-200";
  if (sensitivity === "private") return "border-transparent bg-transparent px-0 text-primary";
  if (sensitivity === "restricted") return "border-transparent bg-transparent px-0 text-amber-200";
  return "border-transparent bg-transparent px-0 text-red-200";
}

function suggestionStatusMeta(status: MatterhornMemorySuggestionStatus) {
  if (status === "confirmed") {
    return {
      label: "Saved",
      title: "Remembered",
      description: "Saved as visible memory after user confirmation.",
      className: "border-transparent bg-transparent px-0 text-emerald-100",
      cardClassName: "bg-emerald-500/5",
    };
  }
  if (status === "edited") {
    return {
      label: "Saved edited",
      title: "Edited + saved",
      description: "Saved only after the user reviewed and changed it.",
      className: "border-transparent bg-transparent px-0 text-primary",
      cardClassName: "bg-[rgba(var(--matterhorn-blue-rgb),0.06)]",
    };
  }
  if (status === "dismissed") {
    return {
      label: "Dismissed",
      title: "Dismissed",
      description: "Kept out of memory and suppressed for this trigger window.",
      className: MEMORY_MUTED_BADGE_CLASS,
      cardClassName: "opacity-75",
    };
  }
  if (status === "expired") {
    return {
      label: "Expired",
      title: "Expired",
      description: "Needs a fresh suggestion before it can be saved.",
      className: "border-transparent bg-transparent px-0 text-amber-100",
      cardClassName: "bg-amber-500/5 opacity-80",
    };
  }
  if (status === "blocked") {
    return {
      label: "Blocked by policy",
      title: "Blocked",
      description: "Policy stopped this suggestion from becoming memory.",
      className: "border-transparent bg-transparent px-0 text-red-100",
      cardClassName: "bg-red-500/10",
    };
  }
  return {
    label: "Needs review",
    title: "New suggestion",
    description: "Review, edit, or dismiss before saving.",
    className: "border-transparent bg-transparent px-0 text-primary",
    cardClassName: "",
  };
}

function suggestionDeskReason(suggestion: MatterhornMemorySuggestion) {
  if (suggestion.desk === "bittensor") {
    return "Bittensor memory is limited to public SS58, subnet, validator, watch, and external-signer context. It never stores seed phrases, private keys, mnemonics, or wallet exports.";
  }
  if (suggestion.desk === "hyperliquid" || suggestion.desk === "polymarket") {
    return "Market memory is read/preview/watch context only. It cannot enable live submission, custody, exchange API secrets, raw signatures, or signed payloads.";
  }
  if (suggestion.desk === "wellness") {
    return "Longevity memory stays opt-in and restricted by default. It should describe preferences or workflow context, not hidden medical or clinical records.";
  }
  return "This suggestion came from visible workflow context. Confirming it stores only the shown record.";
}

function shouldHideSuggestionContent(entry: MatterhornMemorySuggestionInboxEntry) {
  return entry.status === "blocked" || entry.suggestion.policyDecision === "reject";
}

function canActOnSuggestion(entry: MatterhornMemorySuggestionInboxEntry) {
  return entry.status === "pending" && !shouldHideSuggestionContent(entry);
}

function canDismissSuggestionFromView(entry: MatterhornMemorySuggestionInboxEntry) {
  return entry.status === "expired" || entry.status === "blocked";
}

function hiddenSuggestionSummary(entry: MatterhornMemorySuggestionInboxEntry) {
  if (entry.status === "expired") {
    return "This suggestion is stale and cannot be saved. Dismiss it and ask Matterhorn again if the context still matters.";
  }
  return "Matterhorn blocked this suggestion before it could become memory. The proposed content stays hidden.";
}

function readableSuggestionNote(record: MatterhornMemoryRecord) {
  const note = record.body.note;
  if (typeof note === "string") return note;
  if (note == null) return "";
  try {
    return JSON.stringify(note, null, 2);
  } catch {
    return String(note);
  }
}

function buildSuggestionEditDraft(entry: MatterhornMemorySuggestionInboxEntry): SuggestionEditDraft {
  return {
    title: entry.proposedRecord.title,
    summary: entry.proposedRecord.summary,
    note: readableSuggestionNote(entry.proposedRecord),
  };
}

function buildEditedSuggestionPatch(entry: MatterhornMemorySuggestionInboxEntry, draft: SuggestionEditDraft) {
  const title = draft.title.trim();
  const summary = draft.summary.trim();
  const note = draft.note.trim();
  return {
    title: title || entry.proposedRecord.title,
    summary: summary || entry.proposedRecord.summary,
    body: {
      ...entry.proposedRecord.body,
      note: note || readableSuggestionNote(entry.proposedRecord),
    },
    updatedAt: new Date().toISOString(),
  } satisfies Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>;
}

function parseTags(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function localSuggestionDedupeKey(suggestion: MatterhornMemorySuggestion) {
  return [
    suggestion.desk,
    suggestion.useCase,
    suggestion.proposedRecord.kind,
    suggestion.proposedRecord.scope,
    suggestion.proposedRecord.title,
  ]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 160);
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
    },
    tags,
    links: [
      ...(workspaceId ? [{ rel: "workspace", href: `/workspace/${workspaceId}`, title: "Workspace" }] : []),
      ...(workspaceId && sessionId ? [{ rel: "session", href: `/workspace/${workspaceId}/session/${sessionId}`, title: "Session" }] : []),
    ],
    provenance: {
      source: "user_confirmed",
      capturedAt: now,
      capturedBy: "user",
      confidence: 1,
      reasonRemembered: "User explicitly clicked Save memory in the Matterhorn Memory panel.",
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

function useMemoryRecords(client: MatterhornServerClient | null, workspaceId: string | null) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<MatterhornMemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedWorkspaceId = workspaceId?.trim() || null;

  const refresh = useCallback(async () => {
    if (!client) {
      setRecords([]);
      setError("Matterhorn Work engine is offline. Check that Matterhorn Work is running and the workspace is connected.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = query.trim()
        ? resolvedWorkspaceId
          ? await client.searchWorkspaceMemory(resolvedWorkspaceId, { query, limit: 80 })
          : await client.searchMemory({ query, limit: 80 })
        : resolvedWorkspaceId
          ? await client.listWorkspaceMemory(resolvedWorkspaceId, { limit: 80 })
          : await client.listMemory({ limit: 80 });
      setRecords(response.records ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load memory.");
    } finally {
      setLoading(false);
    }
  }, [client, query, resolvedWorkspaceId]);

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
    suggestionId: suggestion.id,
    dedupeKey: localSuggestionDedupeKey(suggestion),
    source: suggestion.source,
    kind: suggestion.proposedRecord.kind,
    scope: suggestion.proposedRecord.scope,
    sensitivity: suggestion.proposedRecord.sensitivity,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    proposedRecord: suggestion.proposedRecord,
    dismissalWindowDays: DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
    actorConfirmationRequired: true,
    status: suggestion.policyDecision === "reject" ? "blocked" : "pending",
    createdAt: now,
    updatedAt: now,
    policyWarnings: suggestion.policyWarnings ?? [],
  };
}

function useMemorySuggestionInbox(client: MatterhornServerClient | null, workspaceId: string | null) {
  const [entries, setEntries] = useState<MatterhornMemorySuggestionInboxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedWorkspaceId = workspaceId?.trim() || null;

  const refresh = useCallback(async () => {
    if (!client) {
      setEntries([]);
      setError("Suggestion inbox unavailable. Connect to the local Matterhorn server.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = resolvedWorkspaceId
        ? await client.listWorkspaceMemorySuggestions(resolvedWorkspaceId, { includeResolved: true, limit: 40 })
        : await client.listMemorySuggestions({ includeResolved: true, limit: 40 });
      setEntries(response.entries ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load memory review.");
    } finally {
      setLoading(false);
    }
  }, [client, resolvedWorkspaceId]);

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
  const workspaceId = props.workspaceId?.trim() || null;
  const { query, setQuery, records, setRecords, loading, error, refresh } = useMemoryRecords(props.client, workspaceId);
  const {
    entries: suggestionEntries,
    loading: suggestionsLoading,
    error: suggestionsError,
    refresh: refreshSuggestions,
    upsertEntries: upsertSuggestionEntries,
    removeEntry: removeSuggestionEntry,
  } = useMemorySuggestionInbox(props.client, workspaceId);
  const [selectedRecords, setSelectedRecords] = useState<MatterhornMemoryRecord[]>([]);
  const [draft, setDraft] = useState<CaptureDraft>(INITIAL_DRAFT);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [suggestionEditDraft, setSuggestionEditDraft] = useState<SuggestionEditDraft | null>(null);
  const [suggestionStatusFilter, setSuggestionStatusFilter] = useState<SuggestionInboxFilter>("needs_review");
  const [manualCaptureOpen, setManualCaptureOpen] = useState(false);

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
        const input = workspaceId ? { ...detail.input, workspaceId } : detail.input;
        const request = workspaceId
          ? props.client.createWorkspaceMemorySuggestions(workspaceId, input)
          : props.client.createMemorySuggestions(input);
        void request
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
  }, [props.client, upsertSuggestionEntries, workspaceId]);

  const visibleSelectedRecords = useMemo(
    () => selectedRecords.filter((record) => records.some((candidate) => candidate.id === record.id)),
    [records, selectedRecords],
  );

  const suggestionStatusCounts = useMemo(() => {
    const counts: Record<SuggestionInboxFilter, number> = {
      needs_review: 0,
      saved: 0,
      not_saved: 0,
      all: suggestionEntries.length,
    };
    for (const entry of suggestionEntries) {
      if (entry.status === "pending") counts.needs_review += 1;
      if (SAVED_SUGGESTION_STATUSES.has(entry.status)) counts.saved += 1;
      if (NOT_SAVED_SUGGESTION_STATUSES.has(entry.status)) counts.not_saved += 1;
    }
    return counts;
  }, [suggestionEntries]);

  const filteredSuggestionEntries = useMemo(
    () => {
      if (suggestionStatusFilter === "all") return suggestionEntries;
      if (suggestionStatusFilter === "needs_review") return suggestionEntries.filter((entry) => entry.status === "pending");
      if (suggestionStatusFilter === "saved") return suggestionEntries.filter((entry) => SAVED_SUGGESTION_STATUSES.has(entry.status));
      return suggestionEntries.filter((entry) => NOT_SAVED_SUGGESTION_STATUSES.has(entry.status));
    },
    [suggestionEntries, suggestionStatusFilter],
  );

  const selectedSuggestionFilter = SUGGESTION_INBOX_FILTERS.find((filter) => filter.id === suggestionStatusFilter)
    ?? SUGGESTION_INBOX_FILTERS[0]!;

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
      if (workspaceId) {
        await props.client.forgetWorkspaceMemory(workspaceId, record.id);
      } else {
        await props.client.forgetMemory(record.id, "User forgot this memory from the Matterhorn Memory panel.");
      }
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
      const response = workspaceId
        ? await props.client.exportWorkspaceMemory(workspaceId)
        : await props.client.exportMemory();
      setExportStatus(`Exported ${response.export.recordCount} records. sha256 ${response.export.sha256.slice(0, 12)}...`);
    } catch (nextError) {
      setExportStatus(nextError instanceof Error ? nextError.message : "Could not export memory bundle.");
    }
  };

  const handleResolveSuggestion = async (entry: MatterhornMemorySuggestionInboxEntry, action: MatterhornMemorySuggestionAction) => {
    if (!props.client) return;
    setCaptureError(null);
    try {
      const reason = action === "dismiss"
        ? "User dismissed this visible Memory suggestion from the Matterhorn Memory panel."
        : action === "restore"
          ? "User restored this visible Memory suggestion from the Matterhorn Memory panel."
          : action === "regenerate"
            ? "User regenerated this visible Memory suggestion from the Matterhorn Memory panel."
            : "User confirmed this visible Memory suggestion from the Matterhorn Memory panel.";
      if (entry.status === "pending") {
        const response = workspaceId
          ? await props.client.resolveStoredWorkspaceMemorySuggestion(workspaceId, entry.id, {
            action,
            reason,
          })
          : await props.client.resolveStoredMemorySuggestion(entry.id, {
            action,
            reason,
          });
        if (response.record) {
          setRecords((current) => [response.record!, ...current.filter((item) => item.id !== response.record!.id)]);
        }
        upsertSuggestionEntries([response.entry]);
        window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-changed", {
          detail: { id: entry.id, action, status: response.entry.status },
        }));
        return;
      }

      if (action === "restore" || action === "regenerate") {
        const response = workspaceId
          ? await props.client.resolveStoredWorkspaceMemorySuggestion(workspaceId, entry.id, { action, reason })
          : await props.client.resolveStoredMemorySuggestion(entry.id, { action, reason });
        upsertSuggestionEntries([response.entry]);
        window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-changed", {
          detail: { id: entry.id, action, status: response.entry.status },
        }));
        return;
      }

      const response = workspaceId
        ? await props.client.resolveWorkspaceMemorySuggestion(workspaceId, {
          suggestion: entry.suggestion,
          action,
          reason,
        })
        : await props.client.resolveMemorySuggestion({
          suggestion: entry.suggestion,
          action,
          reason,
        });
      if (response.record) {
        setRecords((current) => [response.record!, ...current.filter((item) => item.id !== response.record!.id)]);
      }
      removeSuggestionEntry(entry.id);
      window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-changed", {
        detail: { id: entry.id, action, status: action === "dismiss" ? "dismissed" : "confirmed" },
      }));
    } catch (nextError) {
      setCaptureError(nextError instanceof Error ? nextError.message : "Could not resolve this memory suggestion.");
    }
  };

  const handleDismissSuggestionFromView = (entry: MatterhornMemorySuggestionInboxEntry) => {
    removeSuggestionEntry(entry.id);
    window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-changed", {
      detail: { id: entry.id, action: "dismiss", status: entry.status, viewOnly: true },
    }));
  };

  const beginSuggestionEdit = (entry: MatterhornMemorySuggestionInboxEntry) => {
    setEditingSuggestionId(entry.id);
    setSuggestionEditDraft(buildSuggestionEditDraft(entry));
  };

  const cancelSuggestionEdit = () => {
    setEditingSuggestionId(null);
    setSuggestionEditDraft(null);
  };

  const handleSaveEditedSuggestion = async (entry: MatterhornMemorySuggestionInboxEntry) => {
    if (!props.client || !suggestionEditDraft) return;
    setCaptureError(null);
    const patch = buildEditedSuggestionPatch(entry, suggestionEditDraft);
    try {
      if (entry.status === "pending") {
        const response = workspaceId
          ? await props.client.resolveStoredWorkspaceMemorySuggestion(workspaceId, entry.id, {
            action: "edit",
            patch,
            reason: "User edited this visible Memory suggestion, reviewed why it was suggested, and saved it from the Matterhorn Memory panel.",
          })
          : await props.client.resolveStoredMemorySuggestion(entry.id, {
            action: "edit",
            patch,
            reason: "User edited this visible Memory suggestion, reviewed why it was suggested, and saved it from the Matterhorn Memory panel.",
          });
        if (response.record) {
          setRecords((current) => [response.record!, ...current.filter((item) => item.id !== response.record!.id)]);
        }
        upsertSuggestionEntries([response.entry]);
        window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-changed", {
          detail: { id: entry.id, action: "edit", status: response.entry.status },
        }));
      } else {
        const response = workspaceId
          ? await props.client.resolveWorkspaceMemorySuggestion(workspaceId, {
            suggestion: entry.suggestion,
            action: "edit",
            patch,
            reason: "User edited this visible Memory suggestion, reviewed why it was suggested, and saved it from the Matterhorn Memory panel.",
          })
          : await props.client.resolveMemorySuggestion({
            suggestion: entry.suggestion,
            action: "edit",
            patch,
            reason: "User edited this visible Memory suggestion, reviewed why it was suggested, and saved it from the Matterhorn Memory panel.",
          });
        if (response.record) {
          setRecords((current) => [response.record!, ...current.filter((item) => item.id !== response.record!.id)]);
        }
        removeSuggestionEntry(entry.id);
        window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-changed", {
          detail: { id: entry.id, action: "edit", status: "edited" },
        }));
      }
      cancelSuggestionEdit();
    } catch (nextError) {
      setCaptureError(nextError instanceof Error ? nextError.message : "Could not save the edited memory suggestion.");
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
      const response = workspaceId
        ? await props.client.captureWorkspaceMemory(workspaceId, nextRecord)
        : await props.client.captureMemory(nextRecord);
      setRecords((current) => [response.record, ...current.filter((item) => item.id !== response.record.id)]);
      setDraft(INITIAL_DRAFT);
    } catch (nextError) {
      setCaptureError(nextError instanceof Error ? nextError.message : "Could not remember this.");
    } finally {
      setCaptureBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-dls-background text-dls-text">
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <div className="text-lg font-semibold">Memory</div>
          <p className="mt-1 max-w-[34rem] text-sm leading-6 text-dls-secondary">
            Review suggestions before saving.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label="Close Memory panel">
          <X size={16} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-2 sm:px-5">
        <section className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dls-secondary" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={cn("h-10 pl-9", MEMORY_FIELD_CLASS)}
                placeholder="Search saved memories..."
              />
            </label>
            <Button className="justify-center border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text sm:w-auto" variant="ghost" size="icon-sm" onClick={() => void refresh()} disabled={loading} aria-label="Refresh saved memories">
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
          </div>
          {error ? (
            <ErrorState
              error={error}
              title="Could not load memory"
              onRetry={() => void refresh()}
              tone="memory"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
            />
          ) : null}
        </section>

        {visibleSelectedRecords.length ? (
          <section className="rounded-lg bg-[rgba(var(--matterhorn-blue-rgb),0.08)] p-3.5 ring-1 ring-[rgba(var(--matterhorn-blue-rgb),0.20)]">
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-semibold">Using memories in chat</div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  Selected records appear as visible composer chips.
                </p>
              </div>
              <Button className="w-full justify-center" size="sm" onClick={() => dispatchMemoryContext(visibleSelectedRecords)}>
                Use in chat
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {visibleSelectedRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="rounded-md bg-dls-hover/45 px-3 py-1 text-xs text-dls-text transition-colors hover:bg-red-500/10 hover:text-red-200"
                  onClick={() => toggleSelectedRecord(record)}
                  title="Remove memory from chat context"
                >
                  {record.title} <span className="text-dls-secondary">x</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-dls-secondary">
                <BrainCircuit className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">Memory review</div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  Nothing is saved until you choose Remember or Save edited.
                </p>
              </div>
            </div>
            <Button className="shrink-0 border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text" variant="ghost" size="icon-sm" onClick={() => void refreshSuggestions()} disabled={suggestionsLoading || !props.client} aria-label="Refresh memory review">
              <RefreshCw className={cn("size-3.5", suggestionsLoading && "animate-spin")} />
            </Button>
          </div>
          {suggestionsError ? (
            <ErrorState
              error={suggestionsError}
              title="Could not load memory review"
              onRetry={() => void refreshSuggestions()}
              tone="memory"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
            />
          ) : null}

          <div aria-label="Memory inbox filters">
            <div className="grid grid-cols-2 gap-0.5 rounded-md bg-dls-surface-muted/10 p-0.5 sm:grid-cols-4">
              {SUGGESTION_INBOX_FILTERS.map((filter) => {
                const selected = suggestionStatusFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSuggestionStatusFilter(filter.id)}
                    className={cn(
                      "min-w-0 rounded-md px-2 py-1.5 text-center text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.28)]",
                      selected
                        ? "bg-dls-hover/45 text-dls-text"
                        : "text-dls-secondary hover:bg-dls-hover/35 hover:text-dls-text",
                    )}
                  >
                    <span className="font-semibold">{filter.label}</span>
                    <span className="ml-1 text-[11px] opacity-80">{suggestionStatusCounts[filter.id]}</span>
                    <span className="sr-only">: {filter.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {suggestionsLoading && !suggestionEntries.length ? (
            <div className="rounded-lg bg-dls-surface-muted/15 px-3 py-5 text-center text-xs leading-5 text-dls-secondary">
              Loading suggestion inbox...
            </div>
          ) : null}

          {suggestionEntries.length > 0 && !filteredSuggestionEntries.length ? (
            <div className="rounded-lg bg-dls-surface-muted/15 px-3 py-5 text-center text-xs leading-5 text-dls-secondary">
              No suggestions match this filter. <span className="font-semibold text-dls-text">{selectedSuggestionFilter.label}</span> currently has no visible entries.
            </div>
          ) : null}

          {filteredSuggestionEntries.length ? (
            <div className="space-y-2">
              {filteredSuggestionEntries.map((entry) => {
                const suggestion = entry.suggestion;
                const statusMeta = suggestionStatusMeta(entry.status);
                const resolved = entry.status === "confirmed" || entry.status === "edited" || entry.status === "dismissed";
                const hidesSensitiveContent = shouldHideSuggestionContent(entry);
                const showActiveSuggestionActions = canActOnSuggestion(entry);
                const showDismissFromViewAction = canDismissSuggestionFromView(entry);
                const editing = editingSuggestionId === entry.id && suggestionEditDraft;
                const confidence = Math.round(suggestion.confidence * 100);
                return (
                  <article key={entry.id} className={cn(
                    "overflow-hidden rounded-md bg-dls-surface-muted/10 p-3.5 ring-1 ring-white/[0.04]",
                    statusMeta.cardClassName,
                    resolved && "shadow-none",
                  )}>
                    {hidesSensitiveContent ? (
                      <div>
                          <Badge variant="outline" className={cn("border-transparent bg-transparent px-0 text-red-100", statusMeta.className)}>
                          Blocked by policy
                        </Badge>
                        <h3 className="mt-2 break-words text-sm font-semibold">Blocked by policy</h3>
                        <p className="mt-1 break-words text-xs leading-5 text-red-100">
                          {hiddenSuggestionSummary(entry)}
                        </p>
                        {entry.policyWarnings?.length ? (
                          <p className="mt-2 text-xs leading-5 text-red-100">
                            {entry.policyWarnings.slice(0, 2).join(" ")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium leading-4">
                          <Badge variant="outline" className={cn("h-auto text-[10px] leading-4", statusMeta.className)}>
                            {statusMeta.label}
                          </Badge>
                          <Badge variant="outline" className={cn("h-auto text-[10px] leading-4", MEMORY_MUTED_BADGE_CLASS)}>
                            {suggestion.desk}
                          </Badge>
                          <Badge variant="outline" className={cn("h-auto text-[10px] leading-4", sensitivityClassName(suggestion.proposedRecord.sensitivity))}>
                            {suggestion.proposedRecord.sensitivity}
                          </Badge>
                          <Badge variant="outline" className={cn("h-auto text-[10px] leading-4", MEMORY_MUTED_BADGE_CLASS)}>
                            {confidence}% confidence
                          </Badge>
                        </div>
                        <h3 className="mt-2 break-words text-sm font-semibold">{suggestion.proposedRecord.title}</h3>
                        <p className="mt-1 break-words text-xs leading-5 text-dls-secondary">
                          {suggestion.proposedRecord.summary}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-4 text-dls-secondary">
                          <span><span className="font-medium text-dls-text">Source:</span> {entry.source}</span>
                          <span><span className="font-medium text-dls-text">Scope:</span> {entry.scope}</span>
                          <span><span className="font-medium text-dls-text">Dismissal window:</span> {entry.dismissalWindowDays} days</span>
                        </div>
                        <details className="mt-3 group">
                          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-dls-secondary transition-colors hover:text-dls-text">
                            <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                            Why suggested
                          </summary>
                          <div className="mt-2 space-y-1.5 rounded-md bg-dls-background/25 px-3 py-2 text-xs leading-5 text-dls-secondary">
                            <p className="break-words">
                              <span className="font-medium text-dls-text">Trigger:</span> {entry.reason || suggestion.reason}
                            </p>
                            <p className="break-words">
                              <span className="font-medium text-dls-text">Boundary:</span> {suggestionDeskReason(suggestion)}
                            </p>
                            <p className="break-words">
                              <span className="font-medium text-dls-text">Kind:</span> {formatKind(suggestion.proposedRecord.kind)}
                            </p>
                            {entry.policyWarnings?.length ? (
                              <p className="break-words text-amber-100">{entry.policyWarnings.slice(0, 3).join(" ")}</p>
                            ) : null}
                          </div>
                        </details>
                      </>
                    )}

                    {editing ? (
                      <div className="mt-3 grid gap-2 rounded-md bg-dls-background/30 p-3 ring-1 ring-dls-border/20">
                        <div className="text-xs font-semibold text-dls-text">Edit before saving</div>
                        <Input
                          value={suggestionEditDraft.title}
                          onChange={(event) => setSuggestionEditDraft((current) => current ? { ...current, title: event.target.value } : current)}
                          className={cn("h-10", MEMORY_FIELD_CLASS)}
                          placeholder="Memory title"
                        />
                        <Input
                          value={suggestionEditDraft.summary}
                          onChange={(event) => setSuggestionEditDraft((current) => current ? { ...current, summary: event.target.value } : current)}
                          className={cn("h-10", MEMORY_FIELD_CLASS)}
                          placeholder="Short summary"
                        />
                        <Textarea
                          value={suggestionEditDraft.note}
                          onChange={(event) => setSuggestionEditDraft((current) => current ? { ...current, note: event.target.value } : current)}
                          className={cn("min-h-24 resize-y", MEMORY_FIELD_CLASS)}
                          placeholder="Memory note"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <Button size="sm" onClick={() => void handleSaveEditedSuggestion(entry)} disabled={!props.client}>
                            Save edited
                          </Button>
                          <Button variant="ghost" size="sm" className="bg-transparent hover:bg-dls-hover/35" onClick={cancelSuggestionEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {entry.resolutionReason && resolved ? (
                      <p className="mt-2 text-xs leading-5 text-dls-secondary">
                        <span className="font-semibold text-dls-text">Resolution:</span> {entry.resolutionReason}
                      </p>
                    ) : null}
                    {showActiveSuggestionActions ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Button
                          size="sm"
                          className="justify-center"
                          onClick={() => void handleResolveSuggestion(entry, "confirm")}
                          disabled={!props.client}
                          aria-label={`Remember visible Memory suggestion: ${suggestion.proposedRecord.title}`}
                        >
                          Remember
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-center bg-transparent hover:bg-dls-hover/35"
                          onClick={() => beginSuggestionEdit(entry)}
                          disabled={!props.client || Boolean(editing)}
                          aria-label={`Edit visible Memory suggestion before saving: ${suggestion.proposedRecord.title}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-center bg-transparent hover:bg-dls-hover/35"
                          onClick={() => void handleResolveSuggestion(entry, "dismiss")}
                          disabled={!props.client}
                          aria-label={`Dismiss visible Memory suggestion: ${suggestion.proposedRecord.title}`}
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : showDismissFromViewAction ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="bg-transparent hover:bg-dls-hover/35"
                          onClick={() => handleDismissSuggestionFromView(entry)}
                          aria-label={`Dismiss ${entry.status} Memory suggestion from view`}
                        >
                          Dismiss from view
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            !suggestionsLoading && !suggestionEntries.length ? (
              <div className="rounded-lg bg-dls-surface-muted/15 px-3 py-5 text-center text-xs leading-5 text-dls-secondary">
                No suggestions yet. Matterhorn will show visible candidates here before anything is remembered.
              </div>
            ) : null
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Saved memories</div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Confirmed records you can use in chat, forget, or export.
              </p>
            </div>
          </div>
          {records.length === 0 && !loading ? (
            <div className="rounded-lg bg-dls-surface-muted/15 px-4 py-8 text-center">
              <div className="text-sm font-medium">No saved memories yet</div>
              {manualCaptureOpen ? (
                <p className="mt-2 text-xs leading-5 text-dls-secondary">
                  Complete the manual capture form below to save a visible memory.
                </p>
              ) : null}
            </div>
          ) : null}
          {records.map((record) => {
            const policyDecision = getMatterhornMemoryPolicyDecision(record);
            const selected = visibleSelectedRecords.some((item) => item.id === record.id);
            return (
              <article key={record.id} className="rounded-md bg-dls-surface-muted/10 p-3.5 ring-1 ring-white/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{record.title}</h3>
                      <Badge variant="outline" className={cn("text-[10px]", sensitivityClassName(record.sensitivity))}>
                        {record.sensitivity}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px]", MEMORY_MUTED_BADGE_CLASS)}>
                        {policyDecision.deskLabel}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-dls-secondary">{record.summary}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-dls-secondary">
                  <Badge variant="outline" className={cn("text-[10px]", MEMORY_MUTED_BADGE_CLASS)}>{formatKind(record.kind)}</Badge>
                  <Badge variant="outline" className={cn("text-[10px]", MEMORY_MUTED_BADGE_CLASS)}>{record.scope}</Badge>
                  <Badge variant="outline" className={cn("text-[10px]", MEMORY_MUTED_BADGE_CLASS)}>{record.provenance.source}</Badge>
                  <Badge variant="outline" className={cn("text-[10px]", MEMORY_MUTED_BADGE_CLASS)}>{Math.round(record.provenance.confidence * 100)}% confidence</Badge>
                  <Badge variant="outline" className={cn("text-[10px]", MEMORY_MUTED_BADGE_CLASS)}>MCP/API {policyDecision.canSendToMcpApi ? "allowed" : "blocked"}</Badge>
                  <Badge variant="outline" className={cn("text-[10px]", MEMORY_MUTED_BADGE_CLASS)}>Export {policyDecision.canExport ? "allowed" : "blocked"}</Badge>
                </div>
                {policyDecision.blockedReasons.length || policyDecision.warnings.length ? (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                    <div className="font-semibold">Desk policy</div>
                    {[...policyDecision.blockedReasons, ...policyDecision.warnings].slice(0, 4).join(" ")}
                  </div>
                ) : null}
                {record.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {record.tags.slice(0, 8).map((tag) => (
                      <Badge key={tag} variant="outline" className={cn("px-2 py-0.5 text-[11px]", MEMORY_MUTED_BADGE_CLASS)}>#{tag}</Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={selected ? "default" : "ghost"}
                    size="sm"
                    className={cn(!selected && "bg-transparent hover:bg-dls-hover/35")}
                    disabled={!policyDecision.canUseInChat}
                    onClick={() => toggleSelectedRecord(record)}
                    title={policyDecision.canUseInChat ? "Use this visible memory in chat" : `Chat use blocked: ${policyDecision.blockedReasons.join("; ") || policyDecision.warnings.join("; ")}`}
                  >
                    <Eye className="mr-2 size-3.5" />
                    {selected ? "Selected" : "Use in chat"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bg-transparent hover:bg-dls-hover/35"
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

        <details
          className="group border-t border-dls-border/25 pt-2"
          open={manualCaptureOpen}
          onToggle={(event) => setManualCaptureOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3">
            <div>
              <div className="text-sm font-semibold">Add memory manually</div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Manual capture only. Do not paste secrets or hidden clinical records.
              </p>
            </div>
            <ChevronDown className="size-4 shrink-0 text-dls-secondary transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-2 pb-4 pt-1">
            <div className="rounded-md bg-dls-background/25 px-3 py-2 text-xs leading-5 text-dls-secondary">
              Tags set desk defaults. Use <span className="font-medium text-dls-text">bittensor</span>, <span className="font-medium text-dls-text">hyperliquid</span>, <span className="font-medium text-dls-text">polymarket</span>, or <span className="font-medium text-dls-text">longevity</span>.
            </div>
            <Input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              className={cn("h-10", MEMORY_FIELD_CLASS)}
              placeholder="Memory title"
            />
            <Input
              value={draft.summary}
              onChange={(event) => updateDraft("summary", event.target.value)}
              className={cn("h-10", MEMORY_FIELD_CLASS)}
              placeholder="Short summary"
            />
            <Textarea
              value={draft.body}
              onChange={(event) => updateDraft("body", event.target.value)}
              className={cn("min-h-24 resize-y", MEMORY_FIELD_CLASS)}
              placeholder="What should Matterhorn remember?"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={draft.kind}
                onChange={(event) => updateDraft("kind", event.target.value as MatterhornMemoryKind)}
                className={MEMORY_SELECT_CLASS}
              >
                {MATTERHORN_MEMORY_KINDS.map((kind) => <option key={kind} value={kind}>{formatKind(kind)}</option>)}
              </select>
              <select
                value={draft.scope}
                onChange={(event) => updateDraft("scope", event.target.value as MatterhornMemoryScope)}
                className={MEMORY_SELECT_CLASS}
              >
                {MATTERHORN_MEMORY_SCOPES.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
              </select>
              <select
                value={draft.sensitivity}
                onChange={(event) => updateDraft("sensitivity", event.target.value as CaptureDraft["sensitivity"])}
                className={MEMORY_SELECT_CLASS}
              >
                {SELECTABLE_SENSITIVITIES.map((sensitivity) => <option key={sensitivity} value={sensitivity}>{sensitivity}</option>)}
              </select>
              <Input
                value={draft.tags}
                onChange={(event) => updateDraft("tags", event.target.value)}
                className={cn("h-10", MEMORY_FIELD_CLASS)}
                placeholder="tags, comma separated"
              />
            </div>
            <label className="flex items-start gap-2 rounded-md bg-dls-background/25 px-3 py-2 text-xs leading-5 text-dls-secondary">
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
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{captureError}</div>
            ) : null}
            <Button className="rounded-md" onClick={() => void handleCapture()} disabled={captureBusy || !props.client}>
              {captureBusy ? "Saving..." : "Save memory"}
            </Button>
          </div>
        </details>

        <section className="border-t border-dls-border/25 pt-4">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm font-semibold">Export memory</div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Exports include only policy-approved public-safe memory metadata.
              </p>
            </div>
            <Button className="w-full justify-center bg-transparent hover:bg-dls-hover/35" variant="ghost" size="sm" onClick={() => void handleExport()} disabled={!props.client}>
              <Download className="mr-2 size-3.5" />
              Export memory
            </Button>
          </div>
          {exportStatus ? <div className="mt-3 text-xs text-dls-secondary">{exportStatus}</div> : null}
        </section>
      </div>
    </div>
  );
}
