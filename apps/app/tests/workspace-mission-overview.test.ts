import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("workspace mission overview", () => {
  test("keeps the mission, attention inbox, and evidence history connected on Home", () => {
    const mission = readAppSource("domains/session/chat/workspace-mission-overview.tsx");
    const session = readAppSource("domains/session/chat/session-page.tsx");

    expect(session).toContain("<WorkspaceMissionOverview");
    expect(session).toContain("onOpenHistory={openRunHistory}");
    expect(mission).toContain("getWorkspaceMissionOverview");
    expect(mission).toContain("updateWorkspaceMission");
    expect(mission).toContain("deleteWorkspaceMission");
    expect(mission).toContain("Project goal");
    expect(mission).toContain('item{attention.length === 1 ? "" : "s"} need attention');
    expect(mission).toContain("Review");
    expect(mission).not.toContain("Nothing needs your attention");
    expect(mission).toContain("matterhorn:task-log-updated");
    expect(mission).toContain("matterhorn:project-evidence-updated");
  });

  test("uses a real multi-line mission editor with accessible mobile actions", () => {
    const mission = readAppSource("domains/session/chat/workspace-mission-overview.tsx");

    expect(mission).toContain('<textarea');
    expect(mission).toContain('rows={3}');
    expect(mission).toContain('maxLength={1_000}');
    expect(mission).toContain('className="min-h-24');
    expect(mission).toContain("h-11 px-4 sm:h-8");
    expect(mission).toContain('role="alert"');
    expect(mission).toContain("Remove mission");
    expect(mission).toContain("Confirm removal");
    expect(mission).toContain("Audit history remains for accountability.");
  });

  test("keeps operational errors safe and attention copy readable", () => {
    const mission = readAppSource("domains/session/chat/workspace-mission-overview.tsx");

    expect(mission).toContain("Mission could not be saved. Check your connection and try again.");
    expect(mission).toContain("Mission could not be removed. Check your connection and try again.");
    expect(mission).not.toContain("error instanceof Error ? error.message");
    expect(mission).not.toContain('font-semibold uppercase tracking-[0.08em]');
    expect(mission).toContain("items-center justify-between");
    expect(mission).not.toContain("item.summary");
  });
});
