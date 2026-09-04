import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function readSource(path: string) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
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

    test("MatterhornServerClient task event type includes output deletion events", () => {
      const source = readSource("app/lib/matterhorn-server.ts");
      expect(source).toContain('| "artifact_deleted"');
      expect(source).toContain("artifactPath?: string");
      expect(source).toContain("metadata?: Record<string, string | number | boolean | null>");
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
      expect(source).toContain("Project activity could not load");
    });

    test("RecentActivitySection Retry button calls refetch", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("onRetry={() => void refetch()}");
    });

    test("RecentActivitySection performs one bounded recovery retry after a transient timeout", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("if (!isError) return;");
      expect(source).toContain("window.setTimeout(() => {");
      expect(source).toContain("}, 2_500);");
      expect(source).toContain("window.clearTimeout(retry)");
    });

    test("RecentActivitySection refreshes when its workspace endpoint changes", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain(
        '["project-evidence", matterhornServerClient.baseUrl, runtimeWorkspaceId, limit]',
      );
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
      expect(source).toContain("NFT receipt");
      expect(source).toContain("NFT preview");
      expect(source).toContain("Mint handoff ready");
      expect(source).toContain("Listing handoff ready");
      expect(source).toContain("Saved to Outputs for wallet review.");
      expect(source).toContain("compactNftReceiptValue");
      expect(source).toContain("Not stored");
    });

    test("RecentActivitySection supports a collapsed run-history summary", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("defaultExpanded = false");
      expect(source).toContain("historyOpen");
      expect(source).toContain("Run history");
      expect(source).toContain("LatestActivitySummary");
      expect(source).toContain("setHistoryOpen(true)");
      expect(source).toContain("onOpenHistory");
      expect(source).toContain("!onOpenHistory ? (");
    });

    test("RecentActivitySection keeps Home summary compact without a visible bounded event count", () => {
      const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");
      expect(source).toContain("LatestActivityPreview");
      expect(source).toContain("LatestActivitySummary");
      expect(source).toContain("Run history");
      expect(source).not.toContain("items.length} recent");
      expect(source).not.toContain("countLabel");
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
    test("workspace home names the current location and leads with coworkers", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");
      const coworkerStart = readAppSource("domains/session/chat/workspace-coworker-start.tsx");

      expect(source).toContain("const homeSurfaceTitle = activeWorkflowDeskId");
      expect(source).toContain(': "Home";');
      expect(source).toContain('aria-label="Recommended next action"');
      expect(source).toContain('aria-label="Secondary creation actions"');
      expect(source).toContain("Describe an outcome, continue your work, or open a protocol desk.");
      expect(coworkerStart).toContain("What should Matterhorn help you do?");
      expect(source).toContain("Browse protocol desks");
      expect(source).toContain("Project folder");
      expect(source).toContain("Saved outputs");
      expect(source).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
      expect(source).toContain("New note");
      expect(source).not.toContain("Start a desk task, continue a chat, or collect notes and outputs for this workspace.");
      expect(source).not.toContain("Jot note");
    });

    test("web workspace home keeps absolute local paths inside the desktop runtime", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");

      expect(source).toContain("const canExposeLocalPaths = isDesktopRuntime();");
      expect(source).toContain("Project files are stored by this workspace&apos;s Matterhorn engine.");
      expect(source).toContain('title={homeProjectPath || "No local project folder selected"}');
      expect(source).not.toContain('title={canExposeLocalPaths ? homeOutputsPath');
      expect(source).toContain("{canExposeLocalPaths ? (");
    });

    test("Home chooses one adaptive setup, resume, or coworker action", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");

      expect(source).toContain("const homePrimaryAction = props.modelUnavailable");
      expect(source).toContain('eyebrow: "Setup required"');
      expect(source).toContain('eyebrow: activeHomeSession ? "Active task" : "Continue where you left off"');
      expect(source).toContain("homePrimaryAction ? <WorkspaceHomePrimaryAction");
      expect(source).toContain("<WorkspaceCoworkerStart");
      expect(source).toContain('import("./workspace-coworker-start")');
      expect(source).not.toContain('eyebrow: "Recommended safe start"');
    });

    test("Home keeps protocol desks available without auto-sending", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");

      expect(source).toContain("<HomeCapabilityOverview");
      expect(source).toContain("openVenueRailPane(id);");
      expect(source).not.toContain('source: "home-primary-action"');
    });

    test("Home recency accepts engine timestamps in seconds or milliseconds", () => {
      const source = readAppSource("domains/session/chat/session-page.tsx");

      expect(source).toContain("updatedAt < 1_000_000_000_000");
      expect(source).toContain("updatedAt * 1_000");
      expect(source).toContain("Date.now() - timestampMilliseconds");
    });

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
      expect(source).toContain('label: "Images", kind: "image"');
      expect(source).toContain('label: "NFTs", kind: "nft"');
      expect(source).toContain('label: "Access", kind: "team_access"');
      expect(source).toContain('label: "Wallet", kind: "wallet"');
      expect(source).toContain('label: "Chats", kind: "chat"');
      expect(source).toContain("listProjectDataLedger");
      expect(source).toContain("exportProjectDataLedger");
      expect(source).toContain('queryKey: ["project-history-ledger"');
      expect(source).toContain("useSearchParams");
      expect(source).toContain("projectHistoryFilterFromParam(historySearchParams.get(\"kind\"))");
      expect(source).toContain("projectHistoryDeskFromParam(historySearchParams.get(\"desk\"))");
      expect(source).toContain("setHistoryFilter(filter.id)");
      expect(source).toContain("setHistoryDesk(event.currentTarget.value)");
      expect(source).toContain("activeDesk");
      expect(source).toContain("desk: activeDesk");
      expect(source).toContain("Project history");
      expect(source).toContain("Actual local events from this workspace");
      expect(source).toContain("entryDisplaySummary");
      expect(source).toContain("Actual local event recorded when the desk task started.");
      expect(source).toContain("actual event");
      expect(source).toContain("Mint handoff ready");
      expect(source).toContain("Listing handoff ready");
      expect(source).toContain("data.summary.images");
      expect(source).toContain("data.summary.nfts");
      expect(source).toContain("sourceLabel");
      expect(source).toContain("manifest.itemCount");
      expect(source).toContain("exportPayload.filename");
      expect(source).toContain('if (entry.kind === "memory_suggestion") return entry.title || "Memory review";');
      expect(source).toContain('team_access: { icon: Users');
      expect(source).toContain('wallet: { icon: WalletCards');
      expect(source).toContain('chat: { icon: MessageSquareText');
      expect(source).toContain("No training by default");
      expect(source).toContain("Exported");
      expect(source).toContain("ProjectHistoryDetailSheet");
      expect(source).toContain("SheetContent");
      expect(source).toContain("selectedEntryId");
      expect(source).toContain("onSelect={() => setSelectedEntryId(entry.id)}");
      expect(source).toContain("formatAbsoluteTimestamp");
      expect(source).toContain("Data policy");
      expect(source).toContain("Ledger id");
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
      expect(source).toContain("defaultExpanded={false}");
      expect(source).toContain("onOpenHistory={openRunHistory}");
      expect(source).toContain("workspaceRunHistoryRoute");
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
