import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Settings general hub project surfaces", () => {
  test("shows backend-backed project evidence surfaces", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source).toContain("Project surfaces");
    expect(source).toContain("Open the workspace evidence surfaces with live backend status.");
    expect(source).toContain('section: "memory"');
    expect(source).toContain('section: "notes"');
    expect(source).toContain('section: "outputs"');
    expect(source).toContain('section: "feedback"');
    expect(source).toContain("getSectionStatus(card.section, props.backendSettingsSections)");
    expect(source).toContain("props.onOpenMemoryReview");
    expect(source).toContain("props.onOpenNotes");
    expect(source).toContain("props.onOpenOutputs");
    expect(source).toContain("props.onSendFeedback");
  });

  test("routes project surface actions to real workspace surfaces", () => {
    const source = readReactSource("shell/settings-route.tsx");

    expect(source).toContain("workspaceRunHistoryRoute");
    expect(source).toContain('openWorkspaceSurfacePanel = (panel: "memory" | "notes")');
    expect(source).toContain('`${workspaceSessionRoute(workspaceId)}?panel=${panel}`');
    expect(source).toContain("navigate(workspaceRunHistoryRoute(workspaceId))");
    expect(source).toContain('onOpenMemoryReview={() => openWorkspaceSurfacePanel("memory")}');
    expect(source).toContain('onOpenNotes={() => openWorkspaceSurfacePanel("notes")}');
    expect(source).toContain("onOpenOutputs={openWorkspaceOutputs}");
    expect(source).toContain("onSendFeedback={() => setFeedbackDialogOpen(true)}");
  });
});
