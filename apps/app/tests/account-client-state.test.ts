import { describe, expect, test } from "bun:test";
import {
  ACCOUNT_CACHE_BOUNDARY_KEY, ACCOUNT_CACHE_OWNER_KEY, AccountCacheCleanupError,
  accountClientState, captureAccountGeneration, createAccountClientState,
} from "../src/app/lib/account-client-state";
import { getSessionDraft, saveSessionDraft } from "../src/react-app/domains/session/sync/draft-store";
import { getSessionAgent, saveSessionAgent } from "../src/react-app/domains/session/sync/agent-store";
import { useComposerStateStore } from "../src/react-app/domains/session/surface/composer-state-store";
import { useMatterhornSessionMemoryContextStore } from "../src/react-app/domains/session/surface/memory-context-store";
import { useMatterhornSessionAgentFileContextStore } from "../src/react-app/domains/session/surface/agent-file-context-store";
import { useMatterhornSessionCoworkerContextStore } from "../src/react-app/domains/session/surface/coworker-context-store";
import { useSessionActivityStore } from "../src/react-app/domains/session/status/session-activity-store";
import { getReactQueryClient } from "../src/react-app/infra/query-client";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { throw new Error("Do not clear unrelated browser storage"); },
  };
}

function fixture() {
  const local = storage();
  const session = storage();
  const state = createAccountClientState(() => local, () => session);
  return { local, session, state };
}

describe("account cache lifecycle", () => {
  test("clears legacy content on first verified sign-in, retaining appearance and endpoint configuration", () => {
    const { local, session, state } = fixture();
    local.setItem("openwork.session-drafts.v1", "private draft");
    local.setItem("openwork.den.desktopConfig:org-a", "private config");
    local.setItem("matterhorn.jev.v1:account-a", "consent");
    local.setItem("theme", "dark");
    local.setItem("unrelated-data", "keep");
    local.setItem("matterhorn.den.baseUrl", "https://example.test");
    local.setItem("openwork:ui-state:v1", JSON.stringify({ sidebarOpen: true, sidePanelState: { chat: "memory" } }));
    session.setItem("matterhorn.session-memory-context.v1", "private memory");
    session.setItem("matterhorn.pending-desk-task.v1:a", "private task");
    expect(state.bind("https://example.test/", "a")).toBe(true);
    expect(local.getItem("openwork.session-drafts.v1")).toBeNull();
    expect(local.getItem("openwork.den.desktopConfig:org-a")).toBeNull();
    expect(local.getItem("matterhorn.jev.v1:account-a")).toBeNull();
    expect(session.getItem("matterhorn.session-memory-context.v1")).toBeNull();
    expect(session.getItem("matterhorn.pending-desk-task.v1:a")).toBeNull();
    expect(local.getItem("theme")).toBe("dark");
    expect(local.getItem("unrelated-data")).toBe("keep");
    expect(local.getItem("matterhorn.den.baseUrl")).toBe("https://example.test");
    expect(JSON.parse(local.getItem("openwork:ui-state:v1")!)).toEqual({ sidebarOpen: true, sidePanelState: {} });
  });

  test("same account refresh and reload preserve drafts; a different API or account clears them", () => {
    const { local, session, state } = fixture();
    state.bind("https://api.test", "a");
    local.setItem("openwork.session-drafts.v1", "draft");
    expect(state.bind("https://api.test/", "a")).toBe(false);
    const reloaded = createAccountClientState(() => local, () => session);
    expect(reloaded.bind("https://api.test", "a")).toBe(false);
    expect(local.getItem("openwork.session-drafts.v1")).toBe("draft");
    expect(reloaded.bind("https://api.test", "b")).toBe(true);
    expect(local.getItem("openwork.session-drafts.v1")).toBeNull();
    local.setItem("openwork.session-drafts.v1", "b draft");
    expect(reloaded.bind("https://other.test", "b")).toBe(true);
    expect(local.getItem("openwork.session-drafts.v1")).toBeNull();
  });

  test("invalidates stale work and stops producers before resetting stores", () => {
    const { state } = fixture();
    const order: string[] = [];
    const previous = state.generation();
    state.register("store", () => { expect(state.isResetting()).toBe(true); order.push("clear"); });
    state.register("stream", () => { expect(state.generation()).not.toBe(previous); order.push("stop"); }, "stop");
    state.clear();
    expect(order).toEqual(["stop", "clear"]);
    expect(state.isResetting()).toBe(false);
  });

  test("cross-tab cleanup does not erase new shared drafts or echo invalidation", () => {
    const { local, state } = fixture();
    state.bind("https://api.test", "a");
    const secondSession = storage();
    const second = createAccountClientState(() => local, () => secondSession);
    secondSession.setItem("matterhorn.session-memory-context.v1", "a memory");
    state.clear();
    state.bind("https://api.test", "b");
    local.setItem("openwork.session-drafts.v1", "b fresh draft");
    const boundary = local.getItem(ACCOUNT_CACHE_BOUNDARY_KEY);
    expect(second.receiveBoundary(ACCOUNT_CACHE_BOUNDARY_KEY, boundary)).toBe(true);
    expect(secondSession.getItem("matterhorn.session-memory-context.v1")).toBeNull();
    expect(local.getItem("openwork.session-drafts.v1")).toBe("b fresh draft");
    expect(local.getItem(ACCOUNT_CACHE_BOUNDARY_KEY)).toBe(boundary);
    expect(second.bind("https://api.test", "b")).toBe(false);
    expect(second.receiveBoundary(ACCOUNT_CACHE_BOUNDARY_KEY, boundary)).toBe(false);
    expect(second.receiveBoundary(ACCOUNT_CACHE_BOUNDARY_KEY, "out-of-order")).toBe(false);
  });

  test("repeated logout does not generate a cross-tab refresh loop", () => {
    const { local, state } = fixture();
    state.clear();
    const boundary = local.getItem(ACCOUNT_CACHE_BOUNDARY_KEY);
    state.clear();
    expect(local.getItem(ACCOUNT_CACHE_BOUNDARY_KEY)).toBe(boundary);
    expect(local.getItem(ACCOUNT_CACHE_OWNER_KEY)).toBeNull();
  });

  test("cleanup failure still runs other resets and refuses the new account binding", () => {
    const { local, state } = fixture();
    let cleared = false;
    state.register("broken", () => { throw new Error("failure"); }, "stop");
    state.register("remaining", () => { cleared = true; });
    expect(() => state.bind("https://api.test", "b")).toThrow(AccountCacheCleanupError);
    expect(cleared).toBe(true);
    expect(local.getItem(ACCOUNT_CACHE_OWNER_KEY)).toBeNull();
    expect(state.isResetting()).toBe(false);
  });

  test("storage-disabled sessions do not lose drafts on same-account refresh", () => {
    const state = createAccountClientState(() => null, () => null);
    expect(state.bind("api", "a")).toBe(true);
    expect(state.bind("api", "a")).toBe(false);
    expect(state.bind("api", "b")).toBe(true);
  });

  test("a failed ownership-marker write cannot turn the next refresh into a successful binding", () => {
    const local = storage();
    const state = createAccountClientState(() => ({ ...local, setItem: () => { throw new Error("storage full"); } }), () => null);
    expect(() => state.bind("api", "a")).toThrow(AccountCacheCleanupError);
    expect(() => state.bind("api", "a")).toThrow(AccountCacheCleanupError);
  });

  test("clears loaded draft, composer, agent, selected context, activity and query stores", () => {
    saveSessionDraft("ws", "ses", { text: "private", mode: "prompt" });
    saveSessionAgent("ws", "ses", "bittensor");
    useComposerStateStore.getState().setDraft("ses", "private composer");
    useMatterhornSessionMemoryContextStore.setState({ contexts: { ses: { id: "selected", records: [], updatedAt: "2026-09-30" } } });
    useMatterhornSessionAgentFileContextStore.setState({ contexts: { ses: {
      coworker: { id: "a", name: "private coworker", role: "analyst", revision: 1 },
      files: [{ id: "f", name: "private-note.txt", revision: 1 }], updatedAt: "2026-09-30",
    } } });
    useMatterhornSessionCoworkerContextStore.setState({ contexts: { ses: {
      id: "a", name: "private coworker", role: "analyst", revision: 1, updatedAt: "2026-09-30",
    } } });
    useSessionActivityStore.getState().startOptimisticRun("ws", "ses", { title: "private title" });
    getReactQueryClient().setQueryData(["account-data"], { private: "answer" });
    const isCurrent = captureAccountGeneration();
    accountClientState.clear();
    expect(isCurrent()).toBe(false);
    expect(getSessionDraft("ws", "ses")).toBeNull();
    expect(getSessionAgent("ws", "ses")).toBeNull();
    expect(useComposerStateStore.getState().sessions).toEqual({});
    expect(useSessionActivityStore.getState().recordsByWorkspaceId).toEqual({});
    expect(useMatterhornSessionMemoryContextStore.getState().contexts).toEqual({});
    expect(useMatterhornSessionAgentFileContextStore.getState().contexts).toEqual({});
    expect(useMatterhornSessionCoworkerContextStore.getState().contexts).toEqual({});
    expect(getReactQueryClient().getQueryData(["account-data"])).toBeUndefined();
  });
});
