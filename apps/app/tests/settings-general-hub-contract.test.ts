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
    expect(source).toContain("Create or connect a workspace first.");
    expect(source).toContain("Workspace needed");
    expect(source).toContain('requiresWorkspace={card.section !== "feedback"}');
    expect(source).toContain("workspaceReady={Boolean(props.runtimeWorkspaceId)}");
    expect(source).toContain("workspaceResolutionPending={props.workspaceResolutionPending}");
    expect(source).toContain("!props.workspaceResolutionPending");
    expect(source).toContain("disabled={waitingForWorkspace}");
    expect(source).toContain("aria-busy={waitingForWorkspace || undefined}");
    expect(source).toContain("props.onOpenMemoryReview");
    expect(source).toContain("props.onOpenNotes");
    expect(source).toContain("props.onOpenOutputs");
    expect(source).toContain("props.onSendFeedback");
  });

  test("uses container-safe card grids in the settings drawer", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source).toContain("SETTINGS_HUB_GRID_CLASS");
    expect(source).toContain("@container/settings-general");
    expect(source).toContain("grid grid-cols-1 gap-1 @lg/settings-general:grid-cols-2");
    expect(source).not.toContain("md:grid-cols-2");
    expect(source).not.toContain("min-[760px]:grid-cols-2");
    expect(source).not.toContain("min-[900px]:grid-cols-2");
    expect(source).not.toContain('className="min-w-0 truncate text-[13px] font-medium text-dls-text">{props.title}');
    expect(source).not.toContain("rounded-md border px-1.5 py-0.5");
  });

  test("clickable settings rows have a slight borderless surface contrast", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source.match(/bg-dls-surface-muted\/\[0\.065\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(source.match(/hover:bg-dls-surface-muted\/\[0\.12\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("border border-dls-border");
  });

  test("overview readiness rows are container-safe in narrow settings panels", () => {
    const source = readReactSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("@container/settings-overview-card");
    expect(source).toContain("@lg/settings-overview-card:flex-row");
    expect(source).toContain("pl-0 @lg/settings-overview-card:pl-12");
    expect(source).not.toContain("rounded-md px-2.5 py-2.5 sm:flex-row");
  });

  test("renders feedback support actions as lightweight inline controls", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source).toContain("matterhorn-feedback-action");
    expect(source).toContain("bg-dls-surface-muted/[0.08]");
    expect(source).toContain("@lg/settings-general:flex-row");
    expect(source).toContain("@lg/settings-general:w-auto");
    expect(source).not.toContain("sm:flex-row sm:items-end sm:justify-between");
    expect(source).not.toContain('variant="outline"\n              size="sm"\n              onClick={props.onSendFeedback}');
  });

  test("renders task log counts as plain metadata instead of boxed badges", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");

    expect(source).toContain('logs.length ? `${logs.length} recent` : "No runs yet"');
    expect(source).toContain("bg-dls-surface-muted/[0.08] p-4");
    expect(source).not.toContain("rounded-md border border-dls-border/55 px-2 py-0.5 text-[11px] font-medium text-dls-secondary");
  });

  test("does not render normal Working status as a visible badge", () => {
    const source = readReactSource("domains/settings/pages/general-view.tsx");
    const shellSource = readReactSource("domains/settings/shell/settings-page.tsx");

    expect(source).toContain("function shouldShowSettingsStatus");
    expect(source).toContain('return String(status).toLowerCase() !== "working";');
    expect(source).toContain("const showStatus = shouldShowSettingsStatus(props.status);");
    expect(source).toContain("missingWorkspace || shouldShowSettingsStatus(props.status)");
    expect(source).not.toContain('props.status === "Working"\\n      ? "text-emerald-300"');
    expect(shellSource).toContain("function shouldDisplaySettingsReadinessStatus");
    expect(shellSource).toContain('"Working",');
    expect(shellSource).toContain('"Preview",');
    expect(shellSource).toContain('"Desktop only",');
    expect(shellSource).toContain('"Cloud only",');
    expect(shellSource).toContain("!shouldDisplaySettingsReadinessStatus(props.status)");
    expect(shellSource).not.toContain('props.status === "Working"\\n      ? "border-emerald-500/30');
  });

  test("routes project surface actions to real workspace surfaces", () => {
    const source = readReactSource("shell/settings-route.tsx");

    expect(source).toContain("requireWorkspaceForEvidenceSurface");
    expect(source).toContain("Create a workspace first");
    expect(source).toContain("handleOpenCreateWorkspace();");
    expect(source).toContain("workspaceRunHistoryRoute");
    expect(source).toContain('openWorkspaceSurfacePanel = (panel: "memory" | "notes")');
    expect(source).toContain('`${workspaceSessionRoute(workspaceId)}?panel=${panel}`');
    expect(source).toContain("navigate(workspaceRunHistoryRoute(workspaceId))");
    expect(source).not.toContain('`/session?panel=${panel}`');
    expect(source).toContain('onOpenMemoryReview={() => openWorkspaceSurfacePanel("memory")}');
    expect(source).toContain('onOpenNotes={() => openWorkspaceSurfacePanel("notes")}');
    expect(source).toContain("onOpenOutputs={openWorkspaceOutputs}");
    expect(source).toContain("onSendFeedback={() => setFeedbackDialogOpen(true)}");
    expect(source).toContain("workspaceResolutionPending={loading}");
  });

  test("authorized folders shows runtime truth instead of a disabled web action", () => {
    const source = readReactSource("domains/settings/panels/authorized-folders-panel.tsx");

    expect(source).toContain('if (!desktopRuntime) return "Desktop app only";');
    expect(source).toContain('if (props.activeWorkspaceType !== "local") return "Local workspace only";');
    expect(source).toContain('if (!canWriteConfig) return "Read only";');
    expect(source).toContain('const canPickAuthorizedFolder = addFolderUnavailableStatus === null;');
    expect(source).toContain('{renderAddFolderAction("header")}');
    expect(source).toContain('{renderAddFolderAction("empty")}');
    expect(source).not.toContain("disabled={authorizedFoldersLoading || authorizedFoldersSaving || !canPickAuthorizedFolder}");
    expect(source).toContain('rounded-md bg-dls-surface-muted/[0.14]');
  });
});
