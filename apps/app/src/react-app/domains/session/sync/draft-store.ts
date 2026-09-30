/** @jsxImportSource react */
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { accountClientState, captureAccountGeneration } from "../../../../app/lib/account-client-state";

import type { ComposerDraft, PromptMode } from "../../../../app/types";

export type SessionDraftSnapshot = {
  text: string;
  mode: PromptMode;
};

export function sessionDraftForStorage(draft: ComposerDraft): SessionDraftSnapshot {
  // Persist only what the user typed/pasted. Resolved model context and consent
  // metadata must never be substituted into the local draft.
  const pastes = new Map<string, string>();
  for (const part of draft.parts) {
    if (part.type === "paste") pastes.set(part.label, part.text);
  }
  const text = draft.text.replace(/\[pasted text ([^\]]+)\]/g, (placeholder, label: string) => pastes.get(label) ?? placeholder);
  return { text, mode: draft.mode };
}

const STORAGE_KEY = "openwork.session-drafts.v1";
const MAX_DRAFT_COUNT = 100;

let draftCache: Map<string, SessionDraftSnapshot> | null = null;

const listeners = new Set<() => void>();

export const sessionDraftScopeKey = (
  workspaceId: string,
  sessionId: string | null | undefined,
) => {
  const workspace = workspaceId.trim();
  const session = (sessionId ?? "").trim();
  if (!workspace || !session) return "";
  return `${workspace}:${session}`;
};

const isPromptMode = (value: unknown): value is PromptMode =>
  value === "prompt" || value === "shell";

const emitDraftStoreChange = () => {
  for (const listener of listeners) {
    listener();
  }
};

accountClientState.register("session-drafts", () => {
  draftCache = new Map();
  emitDraftStoreChange();
});

const subscribeDraftStore = (callback: () => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

const loadDraftCache = () => {
  if (draftCache) return draftCache;
  draftCache = new Map<string, SessionDraftSnapshot>();
  if (typeof window === "undefined") return draftCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return draftCache;
    const parsed = JSON.parse(raw) as Record<string, { text?: unknown; mode?: unknown }>;
    if (!parsed || typeof parsed !== "object") return draftCache;
    for (const [key, value] of Object.entries(parsed)) {
      if (!key || !value || typeof value !== "object") continue;
      const text = typeof value.text === "string" ? value.text : "";
      const mode = isPromptMode(value.mode) ? value.mode : "prompt";
      if (!text && mode === "prompt") continue;
      draftCache.set(key, { text, mode });
    }
  } catch {
    return draftCache;
  }
  return draftCache;
};

const persistDraftCache = () => {
  if (typeof window === "undefined") return;
  const cache = loadDraftCache();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // ignore storage write failures
  }
};

export const getSessionDraft = (
  workspaceId: string,
  sessionId: string | null | undefined,
) => {
  const key = sessionDraftScopeKey(workspaceId, sessionId);
  if (!key) return null;
  return loadDraftCache().get(key) ?? null;
};

export const saveSessionDraft = (
  workspaceId: string,
  sessionId: string | null | undefined,
  snapshot: SessionDraftSnapshot,
) => {
  if (accountClientState.isResetting()) return;
  const key = sessionDraftScopeKey(workspaceId, sessionId);
  if (!key) return;

  const normalized: SessionDraftSnapshot = {
    text: snapshot.text,
    mode: snapshot.mode,
  };

  if (!normalized.text && normalized.mode === "prompt") {
    clearSessionDraft(workspaceId, sessionId);
    return;
  }

  const cache = loadDraftCache();
  cache.delete(key);
  cache.set(key, normalized);
  while (cache.size > MAX_DRAFT_COUNT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  persistDraftCache();
  emitDraftStoreChange();
};

export const clearSessionDraft = (
  workspaceId: string,
  sessionId: string | null | undefined,
) => {
  if (accountClientState.isResetting()) return;
  const key = sessionDraftScopeKey(workspaceId, sessionId);
  if (!key) return;
  const cache = loadDraftCache();
  if (!cache.delete(key)) return;
  persistDraftCache();
  emitDraftStoreChange();
};

export function useSessionDraftSnapshot(
  workspaceId: string,
  sessionId: string | null | undefined,
) {
  const scopeKey = useMemo(
    () => sessionDraftScopeKey(workspaceId, sessionId),
    [workspaceId, sessionId],
  );

  return useSyncExternalStore(
    subscribeDraftStore,
    () => (scopeKey ? loadDraftCache().get(scopeKey) ?? null : null),
    () => null,
  );
}

export function useSessionDraftState(
  workspaceId: string,
  sessionId: string | null | undefined,
) {
  const isCurrentAccount = useRef(captureAccountGeneration()).current;
  const snapshot = useSessionDraftSnapshot(workspaceId, sessionId);
  const scopeKey = useMemo(
    () => sessionDraftScopeKey(workspaceId, sessionId),
    [workspaceId, sessionId],
  );

  const save = useCallback(
    (nextSnapshot: SessionDraftSnapshot) => {
      if (!isCurrentAccount()) return;
      saveSessionDraft(workspaceId, sessionId, nextSnapshot);
    },
    [workspaceId, sessionId, isCurrentAccount],
  );

  const clear = useCallback(() => {
    if (!isCurrentAccount()) return;
    clearSessionDraft(workspaceId, sessionId);
  }, [workspaceId, sessionId, isCurrentAccount]);

  return useMemo(
    () => ({ scopeKey, snapshot, save, clear }),
    [clear, save, scopeKey, snapshot],
  );
}
