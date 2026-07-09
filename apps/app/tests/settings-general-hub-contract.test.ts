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

  test("uses container-safe card grids in the settings drawer", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source).toContain("SETTINGS_HUB_GRID_CLASS");
    expect(source).toContain("repeat(auto-fit,minmax(min(100%,21rem),1fr))");
    expect(source).not.toContain("md:grid-cols-2");
    expect(source).not.toContain('className="min-w-0 truncate text-[13px] font-medium text-dls-text">{props.title}');
  });

  test("renders feedback support actions as lightweight inline controls", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source).toContain("matterhorn-feedback-action");
    expect(source).toContain("bg-dls-surface-muted/[0.08]");
    expect(source).not.toContain('variant="outline"\n              size="sm"\n              onClick={props.onSendFeedback}');
  });

  test("renders task log counts as plain metadata instead of boxed badges", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source).toContain('logs.length ? `${logs.length} recent` : "No runs yet"');
    expect(source).toContain("bg-dls-surface-muted/[0.08] p-4");
    expect(source).not.toContain("rounded-md border border-dls-border/55 px-2 py-0.5 text-[11px] font-medium text-dls-secondary");
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
