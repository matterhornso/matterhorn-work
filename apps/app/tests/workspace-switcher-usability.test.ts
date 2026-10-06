import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { MatterhornWorkspaceInfo } from "../src/app/lib/matterhorn-server";
import { openLocalWorkspaceFolder } from "../src/react-app/domains/workspace/open-local-workspace";

import {
  createInitialWorkspaceLocalState,
  createWorkspaceLocalReducer,
} from "../src/react-app/domains/workspace/create-workspace-modal-state";

const readSource = (path: string) =>
  readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");

describe("workspace switcher usability", () => {
  test("desktop switchers expose direct local open and create actions", () => {
    const sidebar = readSource("domains/session/sidebar/app-sidebar.tsx");

    expect(sidebar).toContain("Open local workspace…");
    expect(sidebar).toContain("New local workspace…");
    expect(sidebar).toContain("props.sidebar.onOpenLocalWorkspace");
    expect(sidebar).toContain("props.sidebar.onOpenNewLocalWorkspace");
    expect(sidebar).toContain("Other workspace options…");
  });

  test("open uses the native directory picker and existing local creation path", () => {
    const route = readSource("shell/session-route.tsx");

    expect(route).toContain('pickDirectory({ title: "Open a local workspace" })');
    expect(route).toContain('pickDirectory({ title: "Choose or create a folder for the workspace" })');
    expect(route).toContain('createWorkspace: (path) => handleCreateWorkspace("starter", path)');
    expect(route).toContain("selectWorkspace: handleSelectWorkspace");
    expect(route).toContain('if (typeof folder !== "string" || !folder.trim()) return;');
    expect(route).toContain("if (!canAddWorkspace()) return;");
    expect(route).toContain("onOpenLocalWorkspace: () => void handleOpenLocalWorkspace()");
    expect(route).toContain("onOpenNewLocalWorkspace: handleOpenNewLocalWorkspace");
  });

  test("a direct new-local entry resets the existing modal to its local panel", () => {
    const current = createInitialWorkspaceLocalState();
    const next = createWorkspaceLocalReducer(current, {
      type: "reset",
      settings: current.cloudSettings,
      screen: "local",
    });

    expect(next.screen).toBe("local");
    expect(next.selectedFolder).toBeNull();
  });

  test("browser UI explains the server boundary without a cloud upsell or fake local handler", () => {
    const sidebar = readSource("domains/session/sidebar/app-sidebar.tsx");
    const modal = readSource("domains/workspace/create-workspace-modal.tsx");

    expect(sidebar).toContain("Local workspaces…");
    expect(modal).toContain("Your account workspace is managed by the Matterhorn server.");
    expect(modal).toContain("Local folders need the desktop app");
    expect(modal).toContain("use Matterhorn Desks for desktop");
    expect(modal).toContain("workspace switcher at the top left");
    expect(modal).toContain("Open local workspace… to open an existing folder");
    expect(modal).toContain("New local workspace… then Choose folder");
    expect(modal).toContain("New Folder in the native folder picker");
    expect(modal).toContain('screen: allowDirectWorkspaceConnections ? props.initialScreen ?? "chooser" : "chooser"');
    expect(modal).not.toContain("Additional cloud workers");
    expect(modal).not.toContain("Open workspace setup");
    expect(modal).not.toContain('window.location.assign("/onboarding")');
  });

  test("new-local help matches the native picker action and does not offer a browser workaround", () => {
    const panel = readSource("domains/workspace/create-workspace-local-panel.tsx");
    expect(panel).toContain('"Choose folder"');
    expect(panel).toContain("New Folder in the native folder picker");
    expect(panel).not.toContain("does not open in browser mode");
  });
});

describe("opening a local workspace folder", () => {
  const workspace: MatterhornWorkspaceInfo = {
    id: "existing-local",
    name: "My research",
    displayName: "Saved workspace name",
    path: "/Users/research/project",
    preset: "automation",
    workspaceType: "local",
  };

  test("reuses a registered folder and leaves its preset and settings intact", async () => {
    const before = structuredClone(workspace);
    const selected: string[] = [];
    const created: string[] = [];
    const opened = await openLocalWorkspaceFolder("/Users/research/project/", {
      workspaces: [workspace],
      selectWorkspace: (id) => { selected.push(id); return true; },
      createWorkspace: async (folder) => { created.push(folder); return true; },
    });

    expect(opened).toBe(true);
    expect(selected).toEqual([workspace.id]);
    expect(created).toEqual([]);
    expect(workspace).toEqual(before);
  });

  test("registers a new local folder even when a remote workspace has the same path", async () => {
    const selected: string[] = [];
    const created: string[] = [];
    const opened = await openLocalWorkspaceFolder(workspace.path, {
      workspaces: [{ ...workspace, workspaceType: "remote" }],
      selectWorkspace: (id) => { selected.push(id); return true; },
      createWorkspace: async (folder) => { created.push(folder); return true; },
    });

    expect(opened).toBe(true);
    expect(selected).toEqual([]);
    expect(created).toEqual([workspace.path]);
  });

  test("preserves failure without retrying creation for an existing folder", async () => {
    let creates = 0;
    const opened = await openLocalWorkspaceFolder(workspace.path, {
      workspaces: [workspace],
      selectWorkspace: () => false,
      createWorkspace: async () => { creates += 1; return true; },
    });
    expect(opened).toBe(false);
    expect(creates).toBe(0);
  });

  test("does nothing for an empty folder", async () => {
    let actions = 0;
    const opened = await openLocalWorkspaceFolder("  ", {
      workspaces: [workspace],
      selectWorkspace: () => { actions += 1; return true; },
      createWorkspace: async () => { actions += 1; return true; },
    });
    expect(opened).toBe(false);
    expect(actions).toBe(0);
  });
});
