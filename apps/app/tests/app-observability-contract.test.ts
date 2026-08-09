import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readReactAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Matterhorn app observability contracts", () => {
  test("inspector exposes the documented __openwork API and Matterhorn alias", () => {
    const source = readReactAppSource("shell/app-inspector.ts");

    expect(source).toContain('Object.defineProperty(window, "__openwork"');
    expect(source).toContain('Object.defineProperty(window, "__matterhorn"');
    expect(source).toContain("window.__openwork?.record(name, data)");
  });

  test("debug logger defers inspector writes off the React render stack", () => {
    const source = readReactAppSource("shell/debug-logger.ts");
    const enqueueBlock = source.slice(
      source.indexOf("function enqueue"),
      source.indexOf("export function recordDebugLog"),
    );

    expect(enqueueBlock).toContain("window.setTimeout(() => recordInspectorEvent");
    expect(enqueueBlock).not.toContain("recordInspectorEvent(`log.${entry.level}`, entry);\n  scheduleFlush();");
  });

  test("debug logger redacts common secrets before inspector or dev-log writes", () => {
    const source = readReactAppSource("shell/debug-logger.ts");

    expect(source).toContain("function redactSensitiveText");
    expect(source).toContain("BEARER_PATTERN");
    expect(source).toContain("SECRET_ASSIGNMENT_PATTERN");
    expect(source).toContain("PRIVATE_KEY_CONTEXT_PATTERN");
    expect(source).toContain("SENSITIVE_FIELD_PATTERN.test(key)");
    expect(source).toContain("const sanitizedEntry = sanitizeLogEntry(entry)");
    expect(source).toContain("recordInspectorEvent(`log.${sanitizedEntry.level}`, sanitizedEntry)");
    expect(source).not.toContain("recordInspectorEvent(`log.${entry.level}`, entry);");
  });

  test("debug logger captures runtime failures and fetch stalls without recursive logging", () => {
    const source = readReactAppSource("shell/debug-logger.ts");

    expect(source).toContain('window.addEventListener("error", handleWindowError)');
    expect(source).toContain('window.addEventListener("unhandledrejection", handleUnhandledRejection)');
    expect(source).toContain('level: "unhandledRejection"');
    expect(source).toContain("const isDevLogCall = url.includes(\"/dev/log\")");
    expect(source).toContain("pendingFetches.set(id");
    expect(source).toContain('level: "fetch"');
    expect(source).toContain("status: 0");
    expect(source).toContain("pendingFetchSamples");
    expect(source).toContain("visibility: typeof document !== \"undefined\" ? document.visibilityState : \"unknown\"");
    expect(source).not.toContain("await window.fetch(`${base.replace");
  });

  test("optional messaging agent file lookup uses stat before content read", () => {
    const source = readReactAppSource("domains/settings/state/messaging-view-state.ts");
    const loadAgentBlock = source.slice(
      source.indexOf("const loadAgentFile"),
      source.indexOf("const createDefaultAgentFile"),
    );

    expect(loadAgentBlock).toContain("client.statWorkspaceFile(id, OPENCODE_ROUTER_AGENT_FILE_PATH)");
    expect(loadAgentBlock.indexOf("client.statWorkspaceFile(id, OPENCODE_ROUTER_AGENT_FILE_PATH)")).toBeLessThan(
      loadAgentBlock.indexOf("client.readWorkspaceFile("),
    );
    expect(loadAgentBlock).toContain("!fileStat.exists || fileStat.kind !== \"file\"");
    expect(loadAgentBlock).toContain("setAgentExists(false)");
  });

  test("session surface defers parent agent selection off the render cycle", () => {
    const source = readReactAppSource("domains/session/surface/session-surface.tsx");
    const autoSelectBlock = source.slice(
      source.indexOf("const deskAgentId = linkedWorkflowRun?.agentId ?? matterhornDeskAgentIdForDesk(activeDeskMode)"),
      source.indexOf("const openTargets = useMemo"),
    );

    expect(autoSelectBlock).toContain("window.setTimeout(() =>");
    expect(autoSelectBlock).toContain("props.onSelectAgent(deskAgentId)");
    expect(autoSelectBlock).toContain("window.clearTimeout(id)");
  });

  test("session route defers query-cache external store notifications off child render", () => {
    const source = readReactAppSource("shell/session-route.tsx");
    const cacheStateBlock = source.slice(
      source.indexOf("function useQueryCacheState"),
      source.indexOf("function mergeRouteWorkspaces"),
    );

    expect(cacheStateBlock).toContain("useSyncExternalStore");
    expect(cacheStateBlock).toContain("const enqueueCallback = () =>");
    expect(cacheStateBlock).toContain("queueMicrotask(flush)");
    expect(cacheStateBlock).toContain("queryClient.getQueryCache().subscribe(enqueueCallback)");
    expect(cacheStateBlock).not.toContain("queryClient.getQueryCache().subscribe(callback)");
  });

  test("focused desk stays visible while async task start is pending", () => {
    const source = readReactAppSource("domains/session/chat/session-page.tsx");
    const focusedDeskBlock = source.slice(
      source.indexOf("<ProtocolDeskEmptyState"),
      source.indexOf("</ProtocolDeskEmptyState>"),
    );

    expect(focusedDeskBlock).toContain("const startResult = props.sidebar.onCreateTaskWithPrompt");
    expect(focusedDeskBlock).toContain("Promise.resolve(startResult).then");
    expect(focusedDeskBlock).toContain("onSessionCreated: () =>");
    expect(focusedDeskBlock).toContain("clearFocusedDesk()");
    expect(focusedDeskBlock.indexOf("const startResult = props.sidebar.onCreateTaskWithPrompt")).toBeLessThan(
      focusedDeskBlock.indexOf("clearFocusedDesk()"),
    );
  });

  test("new desk tasks expose optimistic progress under route and runtime workspace ids", () => {
    const source = readReactAppSource("shell/session-route.tsx");

    expect(source).toContain("[workspaceId, endpoint.workspaceId]");
    expect(source).toContain("for (const activityWorkspaceId of activityWorkspaceIds)");
    expect(source).toContain("startOptimisticRun(activityWorkspaceId, session.id");
    expect(source).toContain("setRunStatus(activityWorkspaceId, session.id, { type: \"idle\" })");
  });

  test("project Home clears focused desk state before route navigation", () => {
    const source = readReactAppSource("domains/session/chat/session-page.tsx");
    const goHomeBlock = source.slice(
      source.indexOf("const goHome = useCallback"),
      source.indexOf("const closeWorkflowDesk = useCallback"),
    );

    expect(goHomeBlock).toContain("returnToProjectHome()");
    expect(goHomeBlock).toContain("props.sidebar.onOpenWorkspaceHome?.(props.selectedWorkspaceId)");
    expect(goHomeBlock.indexOf("returnToProjectHome()")).toBeLessThan(
      goHomeBlock.indexOf("props.sidebar.onOpenWorkspaceHome?.(props.selectedWorkspaceId)"),
    );
  });

  test("plain project Home URLs do not restore a persisted side panel", () => {
    const source = readReactAppSource("domains/session/chat/session-page.tsx");
    const routedPanelStart = source.indexOf("// The URL is the shareable source of truth");
    const routedPanelBlock = source.slice(
      routedPanelStart,
      source.indexOf("}, [routeSidePanel, setSidePanelState, sidePanelScopeId]);", routedPanelStart),
    );

    expect(routedPanelBlock).toContain("setSidePanelState(");
    expect(routedPanelBlock).toContain("routeSidePanel");
    expect(routedPanelBlock).not.toContain("setCurrentSidePanel(");
    expect(routedPanelBlock).not.toContain("navigate(");
  });
});
