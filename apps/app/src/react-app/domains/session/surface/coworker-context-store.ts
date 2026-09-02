import { create } from "zustand";

export type MatterhornSessionCoworkerContext = {
  id: string;
  name: string;
  role: string;
  revision: number;
  updatedAt: string;
};

export type MatterhornSessionCoworkerContextStore = {
  contexts: Record<string, MatterhornSessionCoworkerContext | undefined>;
  setContext: (sessionId: string, context: MatterhornSessionCoworkerContext) => void;
  clearContext: (sessionId: string) => void;
};

type CoworkerContextStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "matterhorn.session-coworker.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/;
const MAX_CONTEXTS = 50;

function browserStorage(): CoworkerContextStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeMatterhornCoworkerContext(
  sessionId: string,
  value: unknown,
): MatterhornSessionCoworkerContext | null {
  if (!sessionId.trim() || !isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const role = typeof value.role === "string" ? value.role.trim() : "";
  const revision = typeof value.revision === "number" ? value.revision : 0;
  if (!SAFE_ID.test(id)
    || !name
    || name.length > 80
    || !role
    || role.length > 80
    || !Number.isSafeInteger(revision)
    || revision < 1) return null;
  const updatedAt = typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt))
    ? new Date(value.updatedAt).toISOString()
    : new Date().toISOString();
  return { id, name, role, revision, updatedAt };
}

function sanitizedEntries(
  contexts: Record<string, unknown>,
): Array<[string, MatterhornSessionCoworkerContext]> {
  const entries: Array<[string, MatterhornSessionCoworkerContext]> = [];
  for (const [sessionId, value] of Object.entries(contexts)) {
    const context = sanitizeMatterhornCoworkerContext(sessionId, value);
    if (context) entries.push([sessionId, context]);
  }
  return entries.slice(-MAX_CONTEXTS);
}

export function readStoredMatterhornCoworkerContexts(
  storage: CoworkerContextStorage | null = browserStorage(),
): Record<string, MatterhornSessionCoworkerContext | undefined> {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(sanitizedEntries(parsed));
  } catch {
    return {};
  }
}

export function writeStoredMatterhornCoworkerContexts(
  contexts: Record<string, MatterhornSessionCoworkerContext | undefined>,
  storage: CoworkerContextStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const entries = sanitizedEntries(contexts);
    if (!entries.length) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Chat remains usable when tab storage is unavailable or full.
  }
}

export function getMatterhornSessionCoworkerContext(
  state: MatterhornSessionCoworkerContextStore,
  sessionId: string,
): MatterhornSessionCoworkerContext | null {
  return state.contexts[sessionId] ?? null;
}

export const useMatterhornSessionCoworkerContextStore = create<MatterhornSessionCoworkerContextStore>((set) => ({
  contexts: readStoredMatterhornCoworkerContexts(),
  setContext: (sessionId, context) => set((state) => {
    const next = { ...state.contexts };
    const safe = sanitizeMatterhornCoworkerContext(sessionId, context);
    if (safe) next[sessionId] = safe;
    else delete next[sessionId];
    writeStoredMatterhornCoworkerContexts(next);
    return { contexts: next };
  }),
  clearContext: (sessionId) => set((state) => {
    const next = { ...state.contexts };
    delete next[sessionId];
    writeStoredMatterhornCoworkerContexts(next);
    return { contexts: next };
  }),
}));
