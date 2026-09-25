import { create } from "zustand";

import type { ComposerAttachment } from "../../../../app/types";

export type ComposerPastePart = {
  id: string;
  label: string;
  text: string;
  lines: number;
};

export type ComposerSessionState = {
  draft: string;
  attachments: ComposerAttachment[];
  mentions: Record<string, "agent" | "file">;
  pasteParts: ComposerPastePart[];
};

export type ComposerStateStore = {
  sessions: Record<string, ComposerSessionState>;
  setDraft: (sessionId: string, draft: string) => void;
  hydrateDraft: (sessionId: string, draft: string) => boolean;
  setAttachments: (sessionId: string, attachments: ComposerAttachment[]) => void;
  setMentions: (sessionId: string, mentions: Record<string, "agent" | "file">) => void;
  setPasteParts: (sessionId: string, pasteParts: ComposerPastePart[]) => void;
  clearSession: (sessionId: string) => void;
  clearSubmittedSession: (sessionId: string, submitted: ComposerSessionState | undefined) => boolean;
};

const EMPTY_ATTACHMENTS: ComposerAttachment[] = [];
const EMPTY_MENTIONS: Record<string, "agent" | "file"> = {};
const EMPTY_PASTE_PARTS: ComposerPastePart[] = [];

function createEmptyComposerSession(): ComposerSessionState {
  return {
    draft: "",
    attachments: [],
    mentions: {},
    pasteParts: [],
  };
}

function getWritableSession(state: ComposerStateStore, sessionId: string): ComposerSessionState {
  return state.sessions[sessionId] ?? createEmptyComposerSession();
}

export const useComposerStateStore = create<ComposerStateStore>((set) => ({
  sessions: {},
  hydrateDraft: (sessionId, draft) => {
    let restored = false;
    set((state) => {
      // Existing state, including an intentionally cleared draft, wins over
      // a persistence snapshot from an earlier render.
      if (state.sessions[sessionId] || !draft) return state;
      restored = true;
      return { sessions: { ...state.sessions, [sessionId]: { ...createEmptyComposerSession(), draft } } };
    });
    return restored;
  },
  setDraft: (sessionId, draft) => set((state) => {
    const current = getWritableSession(state, sessionId);
    if (current.draft === draft) return state;
    return { sessions: { ...state.sessions, [sessionId]: { ...current, draft } } };
  }),
  setAttachments: (sessionId, attachments) => set((state) => {
    const current = getWritableSession(state, sessionId);
    if (current.attachments === attachments) return state;
    return { sessions: { ...state.sessions, [sessionId]: { ...current, attachments } } };
  }),
  setMentions: (sessionId, mentions) => set((state) => {
    const current = getWritableSession(state, sessionId);
    if (current.mentions === mentions) return state;
    return { sessions: { ...state.sessions, [sessionId]: { ...current, mentions } } };
  }),
  setPasteParts: (sessionId, pasteParts) => set((state) => {
    const current = getWritableSession(state, sessionId);
    if (current.pasteParts === pasteParts) return state;
    return { sessions: { ...state.sessions, [sessionId]: { ...current, pasteParts } } };
  }),
  clearSession: (sessionId) => set((state) => {
    if (!state.sessions[sessionId]) return state;
    const sessions = { ...state.sessions };
    delete sessions[sessionId];
    return { sessions };
  }),
  clearSubmittedSession: (sessionId, submitted) => {
    let cleared = false;
    set((state) => {
      // The user may type, attach, or navigate while dispatch is pending.
      // Only consume the exact immutable composer snapshot that was sent.
      if (!submitted || state.sessions[sessionId] !== submitted) return state;
      const sessions = { ...state.sessions };
      delete sessions[sessionId];
      cleared = true;
      return { sessions };
    });
    return cleared;
  },
}));

export function getComposerDraft(state: ComposerStateStore, sessionId: string): string {
  return state.sessions[sessionId]?.draft ?? "";
}

export function getComposerAttachments(state: ComposerStateStore, sessionId: string): ComposerAttachment[] {
  return state.sessions[sessionId]?.attachments ?? EMPTY_ATTACHMENTS;
}

export function getComposerMentions(state: ComposerStateStore, sessionId: string): Record<string, "agent" | "file"> {
  return state.sessions[sessionId]?.mentions ?? EMPTY_MENTIONS;
}

export function getComposerPasteParts(state: ComposerStateStore, sessionId: string): ComposerPastePart[] {
  return state.sessions[sessionId]?.pasteParts ?? EMPTY_PASTE_PARTS;
}
