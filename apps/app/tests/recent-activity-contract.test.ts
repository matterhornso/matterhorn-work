import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Project Activity contract tests", () => {
  describe("normalization layer", () => {
    test("normalizeEvidenceEvents is exported from recent-activity-types", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-types.ts");
      expect(source).toContain("export function normalizeEvidenceEvents");
    });

    test("RecentActivityKind and RecentActivityItem are exported", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-types.ts");
      expect(source).toContain("export type RecentActivityKind");
      expect(source).toContain("export interface RecentActivityItem");
    });

    test("EVENT_TYPE_MAP covers all five required activity kinds", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-types.ts");
      // note.created, note.memory_suggested, task.started, task.output_saved, task.completed
      expect(source).toContain('"note.created": "note_created"');
      expect(source).toContain('"note.memory_suggested": "memory_suggested"');
      expect(source).toContain('"task.started": "task_started"');
      expect(source).toContain('"task.output_saved": "task_output_saved"');
      expect(source).toContain('"task.completed": "task_completed"');
    });

    test("EVENT_TYPE_MAP covers task.failed and task.cancelled", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-types.ts");
      expect(source).toContain('"task.failed": "task_failed"');
      expect(source).toContain('"task.cancelled": "task_cancelled"');
    });
  });

  describe("component rendering", () => {
    test("RecentActivitySection is exported from recent-activity-section", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("export function RecentActivitySection");
    });

    test("RecentActivitySection calls listProjectEvidence", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("listProjectEvidence");
    });

    test("RecentActivitySection shows loading state", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("Loading project activity");
    });

    test("RecentActivitySection shows empty state", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("Notes, tasks, and outputs will appear here as you work");
    });

    test("RecentActivitySection exposes API error state", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("isError");
      expect(source).toContain("No activity recorded yet");
    });

    test("RecentActivitySection Retry button calls refetch", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("onRetry={() => void refetch()}");
    });

    test("RecentActivitySection formats ISO timestamps as milliseconds, not seconds", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("const timestampMs = Date.parse(timestamp)");
      expect(source).toContain("formatRelativeTime(timestampMs)");
      expect(source).not.toContain("Date.parse(item.timestamp) / 1000");
    });

    test("RecentActivitySection opens a run detail sheet from activity rows", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("ActivityDetailSheet");
      expect(source).toContain("SheetContent");
      expect(source).toContain('"Run started"');
      expect(source).toContain("No output recorded yet.");
      expect(source).toContain("This may still be running or may have ended without a saved receipt.");
      expect(source).toContain("Failure detail");
      expect(source).toContain("onOpenOutputPath");
    });

    test("RecentActivitySection supports a collapsed run-history summary", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("defaultExpanded = true");
      expect(source).toContain("historyOpen");
      expect(source).toContain("Run history");
      expect(source).toContain("LatestActivitySummary");
      expect(source).toContain("setHistoryOpen(true)");
      expect(source).toContain("onOpenHistory");
    });

    test("ActivityDetailSheet does not expose raw prompt fields", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).not.toContain("item.prompt");
      expect(source).not.toContain("event.prompt");
      expect(source).not.toContain("rawPrompt");
    });

    test("ActivityDetailSheet labels failed runs with failure detail section", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain('item.kind === "task_failed"');
      expect(source).toContain("Failure detail");
    });
  });

  describe("Home wiring", () => {
    test("session-page imports RecentActivitySection", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");
      expect(source).toContain("RecentActivitySection");
    });

    test("session-page renders RecentActivitySection in workspace home", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");
      // After the path bar, inside the workspace home div, RecentActivitySection is rendered
      expect(source).toContain("<RecentActivitySection");
      expect(source).toContain("matterhornServerClient={props.matterhornServerClient}");
      expect(source).toContain("runtimeWorkspaceId={props.runtimeWorkspaceId}");
      expect(source).toContain("limit={8}");
      expect(source).toContain('title="Project Activity"');
      expect(source).toContain("defaultExpanded={false}");
      expect(source).toContain("onOpenOutputPath={openOutputPathFromActivity}");
      expect(source).toContain("onOpenHistory={openRunHistory}");
    });

    test("session-page guards RecentActivitySection with client + workspaceId", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");
      expect(source).toContain(
        "props.matterhornServerClient && props.runtimeWorkspaceId ? (",
      );
    });

    test("Home links compact activity into the full run history route", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");
      const routeSource = readAppSource("shell/workspace-routes.ts");
      const appRootSource = readAppSource("shell/app-root.tsx");
      const sessionRouteSource = readAppSource("shell/session-route.tsx");

      expect(routeSource).toContain("workspaceRunHistoryRoute");
      expect(routeSource).toContain('`/workspace/${encodeURIComponent(workspaceId.trim())}/history`');
      expect(appRootSource).toContain('path="/workspace/:workspaceId/history"');
      expect(sessionRouteSource).toContain("isWorkspaceHistoryRoute");
      expect(sessionRouteSource).toContain('workspaceHomeView={isWorkspaceHistoryRoute ? "history" : "home"}');
      expect(sessionRouteSource).toContain("onOpenWorkspaceHistory");
      expect(source).toContain("ProjectHistoryPage");
      expect(source).toContain("openRunHistory");
    });
  });

  describe("Run history page", () => {
    test("ProjectHistoryPage reads the project data ledger with filtered tabs", () => {
      const source = readAppSource("domains/recent-activity/project-history-page.tsx");
      expect(source).toContain("export const PROJECT_HISTORY_FILTERS");
      expect(source).toContain('label: "Runs", kind: "task"');
      expect(source).toContain("listProjectDataLedger");
      expect(source).toContain('queryKey: ["project-history-ledger"');
      expect(source).toContain("activeDesk");
      expect(source).toContain("desk: activeDesk");
      expect(source).toContain('if (entry.kind === "memory_suggestion") return entry.title || "Memory review";');
      expect(source).toContain("No training by default");
      expect(source).toContain("Exported");
    });

    test("ProjectHistoryPage does not expose raw prompts or secret material", () => {
      const source = readAppSource("domains/recent-activity/project-history-page.tsx");
      expect(source).not.toContain("rawPrompt");
      expect(source).not.toContain("entry.prompt");
      expect(source).not.toContain("seed phrase");
      expect(source).not.toContain("private key");
      expect(source).toContain("secret-safe");
      expect(source).toContain("redactionApplied");
    });
  });

  describe("Settings wiring", () => {
    test("overview-view imports RecentActivitySection", () => {
      const source = readAppSource("domains/settings/pages/overview-view.tsx");
      expect(source).toContain("RecentActivitySection");
    });

    test("overview-view renders RecentActivitySection in Project Activity card", () => {
      const source = readAppSource("domains/settings/pages/overview-view.tsx");
      expect(source).toContain("Project Activity");
      expect(source).toContain("Notes, tasks, outputs, and memory across this workspace");
      expect(source).toContain("<RecentActivitySection");
      expect(source).toContain("limit={10}");
    });

    test("overview-view guards RecentActivitySection with client + workspaceId", () => {
      const source = readAppSource("domains/settings/pages/overview-view.tsx");
      // The pattern is: {props.matterhornServerClient && props.runtimeWorkspaceId ? (
      //   <SettingsCard ...>
      //     <RecentActivitySection ...
      expect(source).toContain("props.matterhornServerClient && props.runtimeWorkspaceId ? (");
      expect(source).toContain("RecentActivitySection");
    });

    test("overview-view formats task run timestamps as milliseconds", () => {
      const source = readAppSource("domains/settings/pages/overview-view.tsx");
      expect(source).toContain("formatRelativeTime(run.updatedAt)");
      expect(source).not.toContain("formatRelativeTime(run.updatedAt / 1000)");
    });
  });
});
