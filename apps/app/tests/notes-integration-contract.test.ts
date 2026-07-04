import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Notes integration contracts", () => {
  test("settings opens the active workspace notes route", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("workspaceNotesRoute(notesWorkspaceId)");
    expect(source).not.toContain('navigate("/notes")');
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
    expect(source).toContain("const workspaceId = routeWorkspaceId || activeWorkspaceId");
    expect(source).toContain("ACTIVE_WORKSPACE_CHANGED_EVENT");
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
