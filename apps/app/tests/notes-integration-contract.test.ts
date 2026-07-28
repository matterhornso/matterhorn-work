import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Notes integration contracts", () => {
  test("workspace notes routes open inside the session shell", () => {
    const routeSource = readAppSource("shell/workspace-routes.ts");
    const appRootSource = readAppSource("shell/app-root.tsx");
    const sessionSource = readAppSource("domains/session/chat/session-page.tsx");
    const sessionPanelRouteSource = readAppSource("shell/session-panel-route.ts");
    const sessionRouteSource = readAppSource("shell/session-route.tsx");
    const commandPaletteSource = readAppSource("shell/command-palette.tsx");
    const quickJotGlobalSource = readAppSource("domains/notes/quick-jot-global.tsx");

    expect(routeSource).toContain('return `${workspaceSessionRoute(workspaceId)}?panel=notes`;');
    expect(routeSource).toContain('return `${workspaceSessionRoute(workspaceId)}?panel=memory`;');
    expect(appRootSource).toContain('to={workspaceId ? `${workspaceSessionRoute(workspaceId)}?panel=notes` : "/session"}');
    expect(appRootSource).toContain('element={<Navigate to="/session" replace />}');
    expect(appRootSource).not.toContain("NotesPageRoute");
    expect(sessionSource).toContain("readSessionPanelFromSearch");
    expect(sessionPanelRouteSource).toContain("SIDE_PANEL_ITEMS.includes(requestedPanel as SidePanelItem)");
    expect(sessionSource).toContain('visibleSidePanel === "notes"');
    expect(sessionPanelRouteSource).toContain('requestedPanel === "notes" && options?.notesAvailable === false');
    expect(sessionSource).toContain('const workspaceNotesId = (props.runtimeWorkspaceId ?? "").trim();');
    expect(sessionSource).toContain("Create a workspace before saving notes");
    expect(sessionSource).toContain("const openWorkspaceQuickJot = useCallback");
    expect(sessionSource).toContain("disabled={!workspaceNotesAvailable}");
    expect(sessionSource).toContain("{workspaceNotesAvailable ? (");
    expect(sessionRouteSource).toContain("if (loading || !routeWorkspaceId || selectedWorkspace) return;");
    expect(sessionRouteSource).toContain("if (readActiveWorkspaceId() === routeWorkspaceId)");
    expect(sessionRouteSource).toContain("writeActiveWorkspaceId(null);");
    expect(commandPaletteSource).toContain("notesEnabled?: boolean");
    expect(commandPaletteSource).toContain("workspaceReady?: boolean");
    expect(commandPaletteSource).toContain("...(props.notesEnabled ? [{");
    expect(commandPaletteSource).toContain("props.onCreateNewProject?.();");
    expect(sessionRouteSource).toContain("selectedWorkspaceEndpoint?.workspaceId?.trim()");
    expect(sessionRouteSource).toContain("notesEnabled={Boolean(selectedWorkspaceEndpoint?.workspaceId?.trim())}");
    expect(sessionRouteSource).toContain("workspaceReady={Boolean(selectedWorkspaceEndpoint?.workspaceId?.trim())}");
    expect(quickJotGlobalSource).toContain('location.pathname.match(/^\\/workspace\\/([^/]+)(?:\\/|$)/)');
    expect(quickJotGlobalSource).toContain("catch");
    expect(quickJotGlobalSource).toContain("routeWorkspaceId && routeWorkspaceId === storedWorkspaceId");
    expect(quickJotGlobalSource).toContain("if (!workspaceId.trim()) return null;");
  });

  test("settings opens the active workspace notes route", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("const notesReady = Boolean(props.matterhornServerClient && notesWorkspaceId);");
    expect(source).toContain("workspaceNotesRoute(notesWorkspaceId)");
    expect(source).toContain("workspaceMemoryRoute(notesWorkspaceId)");
    expect(source).toContain("disabled={!notesReady}");
    expect(source).toContain("Create a workspace before opening notes");
    expect(source).toContain("Create a workspace before saving notes");
    expect(source).not.toContain('navigate("/notes")');
    expect(source).not.toContain('workspaceNotesRoute(notesWorkspaceId) : "/notes"');
  });

  test("settings task history exposes API load failures", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("isError");
    expect(source).toContain("Task history could not load.");
    expect(source).toContain("onClick={() => void refetch()}");
  });

  test("notes page honors workspace ids from the route", () => {
    const source = readAppSource("domains/notes/notes-page.tsx");

    expect(source).toContain("useParams<{ workspaceId?: string }>");
    expect(source).toContain("const workspaceId = explicitWorkspaceId?.trim() || routeWorkspaceId || activeWorkspaceId");
    expect(source).toContain("ACTIVE_WORKSPACE_CHANGED_EVENT");
    expect(source).toContain('aria-label="Filter notes"');
    expect(source).toContain("grid-cols-[minmax(0,1fr)_9rem]");
    expect(source).toContain('placeholder={t("notes.search_placeholder")}');
    expect(source).toContain('<option key={filter.id} value={filter.id}>{t(filter.label)}</option>');
    expect(source).not.toContain('size="icon-sm" aria-label={t("notes.search_placeholder")}');
    expect(source).not.toContain('variant={filterId === filter.id ? "secondary" : "ghost"}');
    expect(source).toContain("Back to notes");
    expect(source).toContain("setTimeout(() =>");
    expect(source).toContain("650");
    expect(source).toContain("Delete note?");
    expect(source).not.toContain("md:w-72");
    expect(source).not.toContain("hidden min-w-0 flex-1 flex-col md:flex");
  });

  test("Quick Jot stays contained instead of covering the workspace", () => {
    const source = readAppSource("domains/notes/quick-jot-sheet.tsx");

    expect(source).toContain('side="right"');
    expect(source).toContain("!w-[min(100vw,420px)]");
    expect(source).toContain("sm:!max-w-[420px]");
    expect(source).toContain("showCloseButton={false}");
    expect(source).toContain("bg-dls-surface-muted/[0.14] p-1.5");
    expect(source).toContain("min-h-[min(42vh,20rem)]");
    expect(source).toContain("focus-within:bg-dls-surface-muted/[0.28]");
    expect(source).not.toContain("<Input");
    expect(source).not.toContain("<Textarea");
    expect(source).not.toContain('side="bottom"');
  });

  test("Notes controls and rows remain visible before hover", () => {
    const source = readAppSource("domains/notes/notes-page.tsx");
    expect(source).toContain("bg-dls-surface-muted/[0.22]");
    expect(source).toContain("hover:bg-dls-surface-muted/[0.26]");
    expect(source).toContain("bg-dls-surface-muted/[0.12] px-3 py-2.5");
    expect(source).toContain("hover:bg-dls-surface-muted/[0.20]");
  });

  test("artifact outputs can create linked notes from the session panel", () => {
    const sessionSource = readAppSource("domains/session/chat/session-page.tsx");
    const artifactSource = readAppSource("domains/session/artifacts/artifact-panel.tsx");

    expect(artifactSource).toContain("onAddNote?:");
    expect(artifactSource).toContain("onAddNote(noteContext.path, noteContext.desk, noteContext.sessionSlug)");
    expect(sessionSource).toContain("await client.createNote(workspaceId");
    expect(sessionSource).toContain("navigate(workspaceNotesRoute(workspaceId))");
    expect(sessionSource).toContain("onAddNote={(artifactPath, desk, sessionSlug) => void addArtifactNote(artifactPath, desk, sessionSlug)}");
  });
});
