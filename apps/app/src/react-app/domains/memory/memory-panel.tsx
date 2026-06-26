/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  Eye,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
  XCircle,
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

type SuggestionEditDraft = {
  title: string;
  summary: string;
  note: string;
};

type SuggestionInboxFilter = "all" | MatterhornMemorySuggestionStatus;

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
  { id: "all", label: "All", description: "Every visible suggestion" },
  { id: "pending", label: "New", description: "Needs review" },
  { id: "edited", label: "Edited", description: "Changed and saved" },
  { id: "confirmed", label: "Confirmed", description: "Remembered" },
  { id: "dismissed", label: "Dismissed", description: "Not saved" },
  { id: "expired", label: "Expired", description: "Stale" },
  { id: "blocked", label: "Blocked", description: "Policy stopped" },
];

function formatKind(kind: string) {
  return kind.replaceAll("_", " ");
}

function sensitivityClassName(sensitivity: MatterhornMemorySensitivity) {
  if (sensitivity === "public") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (sensitivity === "private") return "border-[rgba(var(--matterhorn-blue-rgb),0.35)] bg-[rgba(var(--matterhorn-blue-rgb),0.12)] text-primary";
  if (sensitivity === "restricted") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-red-500/35 bg-red-500/10 text-red-200";
}

function suggestionStatusMeta(status: MatterhornMemorySuggestionStatus) {
  if (status === "confirmed") {
    return {
      label: "Confirmed",
      title: "Remembered",
      description: "Saved as visible memory after user confirmation.",
      icon: CheckCircle2,
      className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
      cardClassName: "border-emerald-500/25 bg-emerald-500/5",
    };
  }
  if (status === "edited") {
    return {
      label: "Edited",
      title: "Edited + saved",
      description: "Saved only after the user reviewed and changed it.",
      icon: Edit3,
      className: "border-[rgba(var(--matterhorn-blue-rgb),0.42)] bg-[rgba(var(--matterhorn-blue-rgb),0.14)] text-primary",
      cardClassName: "border-[rgba(var(--matterhorn-blue-rgb),0.32)] bg-[rgba(var(--matterhorn-blue-rgb),0.07)]",
    };
  }
  if (status === "dismissed") {
    return {
      label: "Dismissed",
      title: "Dismissed",
      description: "Kept out of memory and suppressed for this trigger window.",
      icon: XCircle,
      className: "border-dls-border bg-dls-surface text-dls-secondary",
      cardClassName: "opacity-75",
    };
  }
  if (status === "expired") {
    return {
      label: "Expired",
      title: "Expired",
      description: "Needs a fresh suggestion before it can be saved.",
      icon: Clock3,
      className: "border-amber-500/35 bg-amber-500/10 text-amber-100",
      cardClassName: "border-amber-500/25 bg-amber-500/5 opacity-80",
    };
  }
  if (status === "blocked") {
    return {
      label: "Blocked",
      title: "Blocked",
      description: "Policy stopped this suggestion from becoming memory.",
      icon: Ban,
      className: "border-red-500/35 bg-red-500/10 text-red-100",
      cardClassName: "border-red-500/30 bg-red-500/10",
    };
  }
  return {
    label: "New",
    title: "New suggestion",
    description: "Review, edit, or dismiss. No hidden save happens here.",
    icon: Sparkles,
    className: "border-[rgba(var(--matterhorn-blue-rgb),0.42)] bg-[rgba(var(--matterhorn-blue-rgb),0.14)] text-primary",
    cardClassName: "",
  };
}

function confidenceSegments(confidence: number) {
  const bounded = Math.max(0, Math.min(1, confidence));
  if (bounded >= 0.72) return 3;
  if (bounded >= 0.42) return 2;
  if (bounded > 0) return 1;
  return 0;
}

function suggestionDeskReason(suggestion: MatterhornMemorySuggestion) {
  if (suggestion.desk === "bittensor") {
    return "Bittensor memory is limited to public SS58, subnet, validator, watch, and external-signer context. It never stores seed phrases, private keys, mnemonics, or wallet exports.";
  }
  if (suggestion.desk === "hyperliquid" || suggestion.desk === "polymarket") {
    return "Market memory is read/preview/watch context only. It cannot enable live submission, custody, exchange API secrets, raw signatures, or signed payloads.";
  }
  if (suggestion.desk === "wellness") {
    return "Wellness memory stays opt-in and restricted by default. It should describe preferences or workflow context, not hidden medical or clinical records.";
  }
  return "This suggestion came from visible workflow context. Confirming it stores only the shown record.";
}

function suggestionActionMessage(entry: MatterhornMemorySuggestionInboxEntry) {
  if (entry.status === "confirmed") return "Remembered as visible memory.";
  if (entry.status === "edited") return "Edited, then saved as visible memory.";
  if (entry.status === "dismissed") {
    return `Dismissed. Similar suggestions stay suppressed for ${entry.dismissalWindowDays} days unless created again by new context.`;
  }
  if (entry.status === "expired") return "Expired. Ask Matterhorn again to create a fresh suggestion.";
  if (entry.status === "blocked") return "Blocked by memory policy. It was not saved.";
  return "Review first. Confirm, edit, or dismiss. Nothing is saved automatically.";
}

function suggestionAvailableActions(entry: MatterhornMemorySuggestionInboxEntry) {
  if (entry.status === "pending" && !shouldHideSuggestionContent(entry)) {
    return "Available actions: Confirm, edit, or dismiss.";
  }
  if (entry.status === "expired") {
    return "Available action: Dismiss from view only. Ask Matterhorn again for fresh context.";
  }
  if (entry.status === "blocked") {
    return "Available action: Dismiss from view only. Content remains redacted.";
  }
  return "Available actions: none. This card is read-only lifecycle history.";
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
  return "Blocked suggestion content hidden. Matterhorn hides the proposed title, body, source, and Why suggested details because the candidate may contain unsafe memory material.";
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
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [suggestionEditDraft, setSuggestionEditDraft] = useState<SuggestionEditDraft | null>(null);
  const [suggestionStatusFilter, setSuggestionStatusFilter] = useState<SuggestionInboxFilter>("all");

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

  const suggestionStatusCounts = useMemo(() => {
    const counts: Record<SuggestionInboxFilter, number> = {
      all: suggestionEntries.length,
      pending: 0,
      confirmed: 0,
      edited: 0,
      dismissed: 0,
      expired: 0,
      blocked: 0,
    };
    for (const entry of suggestionEntries) {
      counts[entry.status] += 1;
    }
    return counts;
  }, [suggestionEntries]);

  const filteredSuggestionEntries = useMemo(
    () => suggestionStatusFilter === "all"
      ? suggestionEntries
      : suggestionEntries.filter((entry) => entry.status === suggestionStatusFilter),
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

  const handleResolveSuggestion = async (entry: MatterhornMemorySuggestionInboxEntry, action: MatterhornMemorySuggestionAction) => {
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
        window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-changed", {
          detail: { id: entry.id, action, status: response.entry.status },
        }));
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
        const response = await props.client.resolveStoredMemorySuggestion(entry.id, {
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
        const response = await props.client.resolveMemorySuggestion({
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
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,rgba(var(--matterhorn-blue-rgb),0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_42%),var(--dls-background)] text-dls-text">
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 py-5">
        <div className="min-w-0">
          <div className="text-base font-semibold">Matterhorn Memory</div>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Explicit, user-controlled memory. No hidden memory, no auto-capture, no seeds or private keys.
          </p>
          <div className="mt-3 inline-flex rounded-full bg-[rgba(var(--matterhorn-blue-rgb),0.12)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            Visible review only
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label="Close Memory panel">
          <X size={16} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <section className="rounded-[28px] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.20),inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex flex-col gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dls-secondary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-2xl border border-transparent bg-background/70 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-dls-secondary focus:border-primary focus:bg-background"
                placeholder="Search memories, receipts, addresses, workflow notes..."
              />
            </label>
            <Button className="w-full justify-center rounded-2xl border-transparent bg-background/55 hover:bg-background/80" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
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
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-semibold">Using memories in chat</div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  These records will appear as visible composer chips. Remove any record before sending if it is not relevant.
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

        <section className="mt-4 rounded-[28px] bg-[linear-gradient(135deg,rgba(var(--matterhorn-blue-rgb),0.16),rgba(255,255,255,0.035))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <ShieldAlert className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">Suggestion inbox</div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  Visible memory candidates only: nothing is saved unless you confirm or edit to save; dismiss keeps it out of memory.
                </p>
              </div>
            </div>
            <Button className="shrink-0 rounded-2xl border-transparent bg-background/55 hover:bg-background/80" variant="outline" size="sm" onClick={() => void refreshSuggestions()} disabled={suggestionsLoading || !props.client}>
              <RefreshCw className={cn("mr-2 size-3.5", suggestionsLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          {suggestionsError ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {suggestionsError}
            </div>
          ) : null}

          <div className="mt-4 divide-y divide-white/10 rounded-[22px] bg-background/45 px-3" aria-label="Memory inbox lifecycle summary">
            <div className="grid grid-cols-[1fr_auto] gap-3 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">Needs review</div>
                <p className="mt-1 text-[11px] leading-4 text-dls-secondary">New suggestions that can be confirmed, edited, or dismissed.</p>
              </div>
              <div className="text-lg font-semibold">{suggestionStatusCounts.pending}</div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-200">Saved history</div>
                <p className="mt-1 text-[11px] leading-4 text-dls-secondary">Confirmed or edited memories that were saved after review.</p>
              </div>
              <div className="text-lg font-semibold text-emerald-100">{suggestionStatusCounts.confirmed + suggestionStatusCounts.edited}</div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">Not saved</div>
                <p className="mt-1 text-[11px] leading-4 text-dls-secondary">Dismissed, expired, or blocked candidates kept out of Memory.</p>
              </div>
              <div className="text-lg font-semibold">{suggestionStatusCounts.dismissed + suggestionStatusCounts.expired + suggestionStatusCounts.blocked}</div>
            </div>
          </div>

          <div className="mt-3 pb-1" aria-label="Memory inbox filters">
            <div className="flex flex-wrap gap-2">
              {SUGGESTION_INBOX_FILTERS.map((filter) => {
                const selected = suggestionStatusFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSuggestionStatusFilter(filter.id)}
                    className={cn(
                      "min-w-0 rounded-full border px-3 py-1.5 text-left text-xs transition-colors",
                      selected
                        ? "border-primary bg-[rgba(var(--matterhorn-blue-rgb),0.20)] text-primary shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
                        : "border-transparent bg-background/45 text-dls-secondary hover:bg-background/70 hover:text-dls-text",
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
            <div className="mt-3 rounded-[22px] bg-background/45 px-3 py-5 text-center text-xs leading-5 text-dls-secondary">
              Loading suggestion inbox. Matterhorn is checking for visible, reviewable memory candidates.
            </div>
          ) : null}

          {suggestionEntries.length > 0 && !filteredSuggestionEntries.length ? (
            <div className="mt-3 rounded-[22px] bg-background/45 px-3 py-5 text-center text-xs leading-5 text-dls-secondary">
              No suggestions match this filter. <span className="font-semibold text-dls-text">{selectedSuggestionFilter.label}</span> currently has no visible entries.
            </div>
          ) : null}

          {filteredSuggestionEntries.length ? (
            <div className="mt-3 space-y-2">
              {filteredSuggestionEntries.map((entry) => {
                const suggestion = entry.suggestion;
                const statusMeta = suggestionStatusMeta(entry.status);
                const StatusIcon = statusMeta.icon;
                const resolved = entry.status === "confirmed" || entry.status === "edited" || entry.status === "dismissed";
                const hidesSensitiveContent = shouldHideSuggestionContent(entry);
                const actionable = canActOnSuggestion(entry);
                const showActiveSuggestionActions = actionable;
                const showDismissFromViewAction = canDismissSuggestionFromView(entry);
                const editing = editingSuggestionId === entry.id && suggestionEditDraft;
                const confidence = Math.round(suggestion.confidence * 100);
                const activeConfidenceSegments = confidenceSegments(suggestion.confidence);
                return (
                  <article key={entry.id} className={cn(
                    "overflow-hidden rounded-[24px] bg-background/62 px-3 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.18),inset_3px_0_0_rgba(var(--matterhorn-blue-rgb),0.58)]",
                    statusMeta.cardClassName,
                    resolved && "shadow-none",
                  )}>
                    <div className="grid gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusMeta.className)}>
                            <StatusIcon className="size-3" />
                            {statusMeta.label}
                          </span>
                          {hidesSensitiveContent ? (
                            <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-100">
                              Policy protected
                            </span>
                          ) : (
                            <>
                              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", sensitivityClassName(suggestion.proposedRecord.sensitivity))}>
                                {suggestion.proposedRecord.sensitivity}
                              </span>
                              <span className="rounded-full border border-transparent bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                                {suggestion.desk}
                              </span>
                              <span className="rounded-full border border-transparent bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                                {formatKind(suggestion.proposedRecord.kind)}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="mt-2 break-words text-sm font-semibold">
                          {hidesSensitiveContent ? "Blocked suggestion hidden" : suggestion.proposedRecord.title}
                        </h3>
                        <p className="mt-1 break-words text-xs leading-5 text-dls-secondary">
                          {hidesSensitiveContent ? hiddenSuggestionSummary(entry) : suggestion.proposedRecord.summary}
                        </p>
                      </div>
                      {hidesSensitiveContent ? (
                        <div className="min-w-0 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]">Content redacted</div>
                          <p className="mt-1">No title, body, source, confidence detail, or trigger text is rendered for blocked suggestions.</p>
                        </div>
                      ) : (
                        <div className="min-w-0 rounded-2xl bg-black/18 px-3 py-2">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                            <span>Confidence</span>
                            <span>{confidence}%</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1" aria-label={`${confidence}% confidence`}>
                            {[0, 1, 2].map((segment) => (
                              <span
                                key={segment}
                                className={cn(
                                  "h-1.5 rounded-full bg-dls-hover",
                                  segment < activeConfidenceSegments && "bg-primary",
                                )}
                              />
                            ))}
                          </div>
                          <p className="mt-2 text-[11px] leading-4 text-dls-secondary">{statusMeta.description}</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 rounded-2xl bg-black/18 px-3 py-2 text-xs leading-5 text-dls-secondary">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-dls-text">Lifecycle state:</span>
                        <span>{statusMeta.title}</span>
                      </div>
                      <p className="mt-1">{suggestionAvailableActions(entry)}</p>
                    </div>

                    {hidesSensitiveContent ? (
                      <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                        <div className="flex items-center gap-2 font-semibold">
                          <Ban className="size-3.5" />
                          Why hidden
                        </div>
                        <p className="mt-1">
                          Matterhorn withheld the trigger, proposed memory, and source metadata before this candidate could become Memory.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl bg-black/18 px-3 py-2 text-xs leading-5 text-dls-secondary">
                        <div className="flex items-center gap-2 font-semibold text-dls-text">
                          <Info className="size-3.5 text-primary" />
                          Why suggested
                        </div>
                        <p className="mt-1 break-words">
                          <span className="font-semibold text-dls-text">Trigger:</span> {entry.reason || suggestion.reason}
                        </p>
                        <p className="mt-1 break-words">
                          <span className="font-semibold text-dls-text">Boundary:</span> {suggestionDeskReason(suggestion)}
                        </p>
                        <p className="mt-1 break-words">
                          <span className="font-semibold text-dls-text">Source:</span> {entry.source}; <span className="font-semibold text-dls-text">scope:</span> {entry.scope}; <span className="font-semibold text-dls-text">dismissal window:</span> {entry.dismissalWindowDays} days.
                        </p>
                      </div>
                    )}

                    {editing ? (
                      <div className="mt-3 grid gap-2 rounded-[22px] bg-[rgba(var(--matterhorn-blue-rgb),0.12)] p-3">
                        <div className="text-xs font-semibold text-dls-text">Edit before saving</div>
                        <input
                          value={suggestionEditDraft.title}
                          onChange={(event) => setSuggestionEditDraft((current) => current ? { ...current, title: event.target.value } : current)}
                          className="h-10 min-w-0 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
                          placeholder="Memory title"
                        />
                        <input
                          value={suggestionEditDraft.summary}
                          onChange={(event) => setSuggestionEditDraft((current) => current ? { ...current, summary: event.target.value } : current)}
                          className="h-10 min-w-0 rounded-xl border border-dls-border bg-dls-surface px-3 text-sm outline-none focus:border-primary"
                          placeholder="Short summary"
                        />
                        <textarea
                          value={suggestionEditDraft.note}
                          onChange={(event) => setSuggestionEditDraft((current) => current ? { ...current, note: event.target.value } : current)}
                          className="min-h-24 min-w-0 resize-y rounded-xl border border-dls-border bg-dls-surface px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
                          placeholder="Memory note"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <Button size="sm" onClick={() => void handleSaveEditedSuggestion(entry)} disabled={!props.client}>
                            <CheckCircle2 className="mr-2 size-3.5" />
                            Save edited memory
                          </Button>
                          <Button variant="outline" size="sm" onClick={cancelSuggestionEdit}>
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
                    {entry.policyWarnings?.length && !hidesSensitiveContent ? (
                      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100">
                        {entry.policyWarnings.slice(0, 3).join(" ")}
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-2xl bg-black/18 px-3 py-2 text-xs leading-5 text-dls-secondary">
                      <span className="font-semibold text-dls-text">{statusMeta.title}:</span> {suggestionActionMessage(entry)}
                    </div>
                    {showActiveSuggestionActions ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Button
                          size="sm"
                          className="justify-center"
                          onClick={() => void handleResolveSuggestion(entry, "confirm")}
                          disabled={!props.client}
                          aria-label={`Remember visible Memory suggestion: ${suggestion.proposedRecord.title}`}
                        >
                          <CheckCircle2 className="mr-2 size-3.5" />
                          Remember this
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-center"
                          onClick={() => beginSuggestionEdit(entry)}
                          disabled={!props.client || Boolean(editing)}
                          aria-label={`Edit visible Memory suggestion before saving: ${suggestion.proposedRecord.title}`}
                        >
                          <Edit3 className="mr-2 size-3.5" />
                          Edit first
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-center"
                          onClick={() => void handleResolveSuggestion(entry, "dismiss")}
                          disabled={!props.client}
                          aria-label={`Dismiss visible Memory suggestion: ${suggestion.proposedRecord.title}`}
                        >
                          <XCircle className="mr-2 size-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    ) : showDismissFromViewAction ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDismissSuggestionFromView(entry)}
                          aria-label={`Dismiss ${entry.status} Memory suggestion from view`}
                        >
                          <XCircle className="mr-2 size-3.5" />
                          Dismiss from view
                        </Button>
                      </div>
                    ) : null}
                    <p className="mt-2 text-[11px] leading-4 text-dls-secondary">
                      No hidden save. Confirm and edit actions are explicit user choices; edited cards are already saved, and blocked, expired, dismissed, confirmed, and edited cards are read-only history.
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            !suggestionsLoading && !suggestionEntries.length ? (
              <div className="mt-3 rounded-[22px] bg-background/45 px-3 py-5 text-center text-xs leading-5 text-dls-secondary">
                No suggestions yet. Matterhorn will show visible candidates here before anything is remembered.
              </div>
            ) : null
          )}
        </section>

        <section className="mt-4 space-y-2">
          {records.length === 0 && !loading ? (
            <div className="rounded-[28px] bg-[rgba(var(--matterhorn-blue-rgb),0.06)] px-4 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
              <article key={record.id} className="rounded-[24px] bg-dls-card/70 p-3.5 shadow-[0_16px_50px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{record.title}</h3>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", sensitivityClassName(record.sensitivity))}>
                        {record.sensitivity}
                      </span>
                      <span className="rounded-full border border-transparent bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                        {policyDecision.deskLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-dls-secondary">{record.summary}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.08em] text-dls-secondary">
                  <span className="rounded-full bg-white/5 px-2 py-1">{formatKind(record.kind)}</span>
                  <span className="rounded-full bg-white/5 px-2 py-1">{record.scope}</span>
                  <span className="rounded-full bg-white/5 px-2 py-1">{record.provenance.source}</span>
                  <span className="rounded-full bg-white/5 px-2 py-1">{Math.round(record.provenance.confidence * 100)}% confidence</span>
                  <span className="rounded-full bg-white/5 px-2 py-1">MCP/API {policyDecision.canSendToMcpApi ? "allowed" : "blocked"}</span>
                  <span className="rounded-full bg-white/5 px-2 py-1">Export {policyDecision.canExport ? "allowed" : "blocked"}</span>
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

        <section className="mt-4 rounded-[28px] bg-dls-card/70 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex items-start gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <ShieldAlert className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold">Remember this</div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Manual capture only. Never paste seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, wallet exports, or hidden clinical records.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="rounded-2xl bg-background/45 px-3 py-2 text-xs leading-5 text-dls-secondary">
              Desk defaults are applied from tags. Use <span className="font-semibold text-dls-text">bittensor</span>, <span className="font-semibold text-dls-text">hyperliquid</span>, <span className="font-semibold text-dls-text">polymarket</span>, or <span className="font-semibold text-dls-text">wellness</span>. Wellness becomes restricted by default; market memories cannot be exported or shared with MCP/API.
            </div>
            <input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              className="h-11 rounded-2xl border border-transparent bg-background/55 px-3 text-sm outline-none focus:border-primary focus:bg-background"
              placeholder="Memory title"
            />
            <input
              value={draft.summary}
              onChange={(event) => updateDraft("summary", event.target.value)}
              className="h-11 rounded-2xl border border-transparent bg-background/55 px-3 text-sm outline-none focus:border-primary focus:bg-background"
              placeholder="Short summary"
            />
            <textarea
              value={draft.body}
              onChange={(event) => updateDraft("body", event.target.value)}
              className="min-h-24 resize-y rounded-2xl border border-transparent bg-background/55 px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:bg-background"
              placeholder="What should Matterhorn remember?"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={draft.kind}
                onChange={(event) => updateDraft("kind", event.target.value as MatterhornMemoryKind)}
                className="h-11 rounded-2xl border border-transparent bg-background/55 px-3 text-sm outline-none focus:border-primary focus:bg-background"
              >
                {MATTERHORN_MEMORY_KINDS.map((kind) => <option key={kind} value={kind}>{formatKind(kind)}</option>)}
              </select>
              <select
                value={draft.scope}
                onChange={(event) => updateDraft("scope", event.target.value as MatterhornMemoryScope)}
                className="h-11 rounded-2xl border border-transparent bg-background/55 px-3 text-sm outline-none focus:border-primary focus:bg-background"
              >
                {MATTERHORN_MEMORY_SCOPES.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
              </select>
              <select
                value={draft.sensitivity}
                onChange={(event) => updateDraft("sensitivity", event.target.value as CaptureDraft["sensitivity"])}
                className="h-11 rounded-2xl border border-transparent bg-background/55 px-3 text-sm outline-none focus:border-primary focus:bg-background"
              >
                {SELECTABLE_SENSITIVITIES.map((sensitivity) => <option key={sensitivity} value={sensitivity}>{sensitivity}</option>)}
              </select>
              <input
                value={draft.tags}
                onChange={(event) => updateDraft("tags", event.target.value)}
                className="h-11 rounded-2xl border border-transparent bg-background/55 px-3 text-sm outline-none focus:border-primary focus:bg-background"
                placeholder="tags, comma separated"
              />
            </div>
            <label className="flex items-start gap-2 rounded-2xl bg-background/45 px-3 py-2 text-xs leading-5 text-dls-secondary">
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
            <Button className="rounded-2xl" onClick={() => void handleCapture()} disabled={captureBusy || !props.client}>
              {captureBusy ? "Remembering..." : "Remember this"}
            </Button>
          </div>
        </section>

        <section className="mt-4 rounded-[28px] bg-[rgba(var(--matterhorn-blue-rgb),0.07)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm font-semibold">Export evidence</div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Export only policy-approved public-safe memory bundle metadata. Restricted, market, wellness, and forbidden-secret records stay out.
              </p>
            </div>
            <Button className="w-full justify-center rounded-2xl border-transparent bg-background/55 hover:bg-background/80" variant="outline" size="sm" onClick={() => void handleExport()} disabled={!props.client}>
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
