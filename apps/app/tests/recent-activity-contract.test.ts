import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Recent Activity contract tests", () => {
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
      expect(source).toContain("Loading recent activity");
    });

    test("RecentActivitySection shows empty state", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("Notes, tasks, and outputs will appear here as you work");
    });

    test("RecentActivitySection exposes API error state", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("isError");
      expect(source).toContain("Recent activity could not load");
    });

    test("RecentActivitySection Retry button calls refetch", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("onClick={() => void refetch()}");
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
    });

    test("session-page guards RecentActivitySection with client + workspaceId", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");
      expect(source).toContain(
        "props.matterhornServerClient && props.runtimeWorkspaceId ? (",
      );
    });
  });

  describe("Settings wiring", () => {
    test("overview-view imports RecentActivitySection", () => {
      const source = readAppSource("domains/settings/pages/overview-view.tsx");
      expect(source).toContain("RecentActivitySection");
    });

    test("overview-view renders RecentActivitySection in Recent Activity card", () => {
      const source = readAppSource("domains/settings/pages/overview-view.tsx");
      expect(source).toContain("Recent Activity");
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
  });
});
