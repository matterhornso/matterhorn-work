import { create } from "zustand";

export type MatterhornSessionAgentFile = {
  id: string;
  name: string;
  revision: number;
};

export type MatterhornSessionAgentFileContext = {
  coworker: {
    id: string;
    name: string;
    role: string;
    revision: number;
  };
  files: MatterhornSessionAgentFile[];
  updatedAt: string;
};

export type MatterhornSessionAgentFileContextStore = {
  contexts: Record<string, MatterhornSessionAgentFileContext | undefined>;
  setContext: (sessionId: string, context: MatterhornSessionAgentFileContext) => void;
  clearContext: (sessionId: string) => void;
  removeFile: (sessionId: string, fileId: string) => void;
};

type AgentFileContextStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "matterhorn.session-agent-files.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/;
const MAX_CONTEXTS = 50;
const MAX_FILES = 8;

function sanitizeContexts(
  contexts: Record<string, unknown>,
): Array<[string, MatterhornSessionAgentFileContext]> {
  const entries: Array<[string, MatterhornSessionAgentFileContext]> = [];
  for (const [sessionId, value] of Object.entries(contexts)) {
    const context = sanitizeMatterhornAgentFileContext(sessionId, value);
    if (context) entries.push([sessionId, context]);
  }
  return entries.slice(-MAX_CONTEXTS);
}

function browserStorage(): AgentFileContextStorage | null {
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

function sanitizeFile(value: unknown): MatterhornSessionAgentFile | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const revision = typeof value.revision === "number" ? value.revision : 0;
  if (!SAFE_ID.test(id) || !name || name.length > 160 || !Number.isSafeInteger(revision) || revision < 1) {
    return null;
  }
  return { id, name, revision };
}

export function sanitizeMatterhornAgentFileContext(
  sessionId: string,
  value: unknown,
): MatterhornSessionAgentFileContext | null {
  if (!sessionId.trim() || !isRecord(value) || !isRecord(value.coworker) || !Array.isArray(value.files)) {
    return null;
  }
  const coworkerId = typeof value.coworker.id === "string" ? value.coworker.id.trim() : "";
  const coworkerName = typeof value.coworker.name === "string" ? value.coworker.name.trim() : "";
  const coworkerRole = typeof value.coworker.role === "string" ? value.coworker.role.trim() : "";
  const coworkerRevision = typeof value.coworker.revision === "number" ? value.coworker.revision : 0;
  if (!SAFE_ID.test(coworkerId)
    || !coworkerName
    || coworkerName.length > 80
    || !coworkerRole
    || coworkerRole.length > 80
    || !Number.isSafeInteger(coworkerRevision)
    || coworkerRevision < 1) return null;
  const seen = new Set<string>();
  const files = value.files.flatMap((candidate) => {
    const file = sanitizeFile(candidate);
    if (!file || seen.has(file.id)) return [];
    seen.add(file.id);
    return [file];
  }).slice(0, MAX_FILES);
  if (!files.length) return null;
  const updatedAt = typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt))
    ? new Date(value.updatedAt).toISOString()
    : new Date().toISOString();
  return {
    coworker: {
      id: coworkerId,
      name: coworkerName,
      role: coworkerRole,
      revision: coworkerRevision,
    },
    files,
    updatedAt,
  };
}

export function readStoredMatterhornAgentFileContexts(
  storage: AgentFileContextStorage | null = browserStorage(),
): Record<string, MatterhornSessionAgentFileContext | undefined> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(sanitizeContexts(parsed));
  } catch {
    return {};
  }
}

export function writeStoredMatterhornAgentFileContexts(
  contexts: Record<string, MatterhornSessionAgentFileContext | undefined>,
  storage: AgentFileContextStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const entries = sanitizeContexts(contexts);
    if (!entries.length) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Chat remains usable when session storage is unavailable or full.
  }
}

export function getMatterhornSessionAgentFileContext(
  state: MatterhornSessionAgentFileContextStore,
  sessionId: string,
): MatterhornSessionAgentFileContext | null {
  return state.contexts[sessionId] ?? null;
}

export function describeMatterhornAgentFileContext(context: MatterhornSessionAgentFileContext): string {
  const names = context.files.slice(0, 3).map((file) => file.name).join(", ");
  const extra = context.files.length > 3 ? ` +${context.files.length - 3} more` : "";
  return `${context.coworker.name} can read ${names}${extra}`;
}

export const useMatterhornSessionAgentFileContextStore = create<MatterhornSessionAgentFileContextStore>((set) => ({
  contexts: readStoredMatterhornAgentFileContexts(),
  setContext: (sessionId, context) => set((state) => {
    const next = { ...state.contexts };
    const safeContext = sanitizeMatterhornAgentFileContext(sessionId, context);
    if (safeContext) next[sessionId] = safeContext;
    else delete next[sessionId];
    writeStoredMatterhornAgentFileContexts(next);
    return { contexts: next };
  }),
  clearContext: (sessionId) => set((state) => {
    const next = { ...state.contexts };
    delete next[sessionId];
    writeStoredMatterhornAgentFileContexts(next);
    return { contexts: next };
  }),
  removeFile: (sessionId, fileId) => set((state) => {
    const current = state.contexts[sessionId];
    if (!current) return state;
    const files = current.files.filter((file) => file.id !== fileId);
    const next = { ...state.contexts };
    if (files.length) next[sessionId] = { ...current, files, updatedAt: new Date().toISOString() };
    else delete next[sessionId];
    writeStoredMatterhornAgentFileContexts(next);
    return { contexts: next };
  }),
}));
