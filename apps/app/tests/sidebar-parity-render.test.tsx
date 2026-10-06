import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppSidebar, type AppSidebarProps } from "../src/react-app/domains/session/sidebar/app-sidebar";
import { ShellConfigProvider } from "../src/react-app/shell/shell-config";
import { SidebarProvider } from "../src/components/ui/sidebar";
import { getSessionActivityStatusLabel } from "../src/react-app/domains/session/status/session-activity-store";

const noop = () => {};
const props: AppSidebarProps = {
  workspaceSessionGroups: [{
    workspace: { id: "workspace", name: "Parity project", path: "/isolated/parity", preset: "starter", workspaceType: "local" },
    status: "ready",
    sessions: [
      { id: "parent", title: "Parent conversation" },
      { id: "child", title: "Child conversation", parentID: "parent" },
      { id: "grandchild", title: "Grandchild conversation", parentID: "child" },
      { id: "orphan", title: "Imported conversation", parentID: "missing" },
      { id: "third", title: "Third conversation" },
      { id: "fourth", title: "Fourth conversation" },
    ],
  }],
  selectedWorkspaceId: "workspace", selectedSessionId: "grandchild", developerMode: false,
  showSessionActions: true, sessionStatusById: { child: "waiting", grandchild: "error" },
  connectingWorkspaceId: null, workspaceConnectionStateById: {}, newTaskDisabled: false,
  onSelectWorkspace: noop, onOpenSession: noop, onCreateTaskInWorkspace: noop,
  onOpenRenameSession: noop, onOpenDeleteSession: noop, onOpenRenameWorkspace: noop,
  onShareWorkspace: noop, onRevealWorkspace: noop, onForgetWorkspace: noop,
  onOpenLocalWorkspace: noop, onOpenNewLocalWorkspace: noop,
  onOpenCreateWorkspace: noop, onStartResize: noop,
};

function renderSidebar(overrides: Partial<AppSidebarProps> = {}) {
  return renderToStaticMarkup(
    <ShellConfigProvider><SidebarProvider><AppSidebar {...props} {...overrides} /></SidebarProvider></ShellConfigProvider>,
  );
}

describe("default retro sidebar preserves legacy navigation", () => {
  test("renders selected descendants, imported roots, activity and shared session actions", () => {
    const html = renderSidebar();
    for (const title of ["Parent conversation", "Child conversation", "Grandchild conversation", "Imported conversation"])
      expect(html).toContain(title);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(`aria-label="${getSessionActivityStatusLabel("waiting")}"`);
    expect(html).toContain(`aria-label="${getSessionActivityStatusLabel("error")}"`);
    expect(html).toContain("Show 1 more");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("Resize workspace column");
    expect(html).not.toContain("opacity-0");
    expect(html).not.toMatch(/<ul\b[^>]*>\s*<div/);
  });

  test("only shows descendant rows when expanded or selected", () => {
    const html = renderSidebar({ selectedSessionId: null });
    expect(html).toContain("Parent conversation");
    expect(html).not.toContain("Child conversation");
    expect(html).not.toContain("Grandchild conversation");
    expect(html).toContain("Imported conversation");
  });

  test("keeps a selected conversation beyond the initial preview visible", () => {
    const html = renderSidebar({ selectedSessionId: "fourth" });
    expect(html).toContain("Fourth conversation");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("Show 1 more");
  });

  test("retains loading and disabled new-chat states instead of a false empty history", () => {
    const html = renderSidebar({
      newTaskDisabled: true,
      workspaceSessionGroups: [{ ...props.workspaceSessionGroups[0], status: "loading", sessions: [] }],
    });
    expect(html).toContain("Loading tasks");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("Your conversations will appear here");
  });
});
