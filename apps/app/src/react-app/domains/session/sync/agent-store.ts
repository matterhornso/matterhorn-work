/** @jsxImportSource react */
import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "matterhorn.session-agents.v1";
const MAX_AGENT_COUNT = 100;

let agentCache: Map<string, string> | null = null;
const listeners = new Set<() => void>();

export const sessionAgentScopeKey = (
  workspaceId: string,
  sessionId: string | null | undefined,
) => {
  const workspace = workspaceId.trim();
  const session = (sessionId ?? "").trim();
  if (!workspace || !session) return "";
  return `${workspace}:${session}`;
};

const emitAgentStoreChange = () => {
  for (const listener of listeners) listener();
};

const subscribeAgentStore = (callback: () => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const loadAgentCache = () => {
  if (agentCache) return agentCache;
  agentCache = new Map<string, string>();
  if (typeof window === "undefined") return agentCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return agentCache;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return agentCache;
    for (const [key, value] of Object.entries(parsed)) {
      const agent = typeof value === "string" ? value.trim() : "";
      if (key && agent) agentCache.set(key, agent);
    }
  } catch {
    return agentCache;
  }
  return agentCache;
};

const persistAgentCache = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(loadAgentCache())),
    );
  } catch {
    // A blocked storage write should not prevent a chat from opening.
  }
};

export const getSessionAgent = (
  workspaceId: string,
  sessionId: string | null | undefined,
) => {
  const key = sessionAgentScopeKey(workspaceId, sessionId);
  if (!key) return null;
  return loadAgentCache().get(key) ?? null;
};

export const saveSessionAgent = (
  workspaceId: string,
  sessionId: string | null | undefined,
  agent: string | null,
) => {
  const key = sessionAgentScopeKey(workspaceId, sessionId);
  if (!key) return;

  const normalized = agent?.trim() ?? "";
  const cache = loadAgentCache();
  cache.delete(key);
  if (normalized) {
    cache.set(key, normalized);
    while (cache.size > MAX_AGENT_COUNT) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }
  persistAgentCache();
  emitAgentStoreChange();
};

export function useSessionAgentState(
  workspaceId: string,
  sessionId: string | null | undefined,
) {
  const scopeKey = useMemo(
    () => sessionAgentScopeKey(workspaceId, sessionId),
    [workspaceId, sessionId],
  );
  const agent = useSyncExternalStore(
    subscribeAgentStore,
    () => (scopeKey ? loadAgentCache().get(scopeKey) ?? null : null),
    () => null,
  );
  const setAgent = useCallback(
    (nextAgent: string | null) => saveSessionAgent(workspaceId, sessionId, nextAgent),
    [workspaceId, sessionId],
  );
  return [agent, setAgent] as const;
}
