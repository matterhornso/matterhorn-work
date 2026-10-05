import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  isChatModelId,
  PRIMARY_DESKS,
  resolveMinimalUi,
} from "../src/app/lib/minimal-ui";

describe("minimal workspace release", () => {
  test("defaults to desk-first through retro and preserves explicit legacy rollback", () => {
    expect(resolveMinimalUi(undefined)).toBe(true);
    for (const value of [undefined, "", "0", "false", false, true])
      expect(resolveMinimalUi({ VITE_MATTERHORN_RETRO_UI: "0", VITE_MATTERHORN_MINIMAL_UI: value })).toBe(
        false,
      );
    for (const value of ["1", "true"])
      expect(resolveMinimalUi({ VITE_MATTERHORN_RETRO_UI: "0", VITE_MATTERHORN_MINIMAL_UI: value })).toBe(
        true,
      );
  });
  test("keeps the five primary desks in the approved order", () => {
    expect(PRIMARY_DESKS.map((desk) => desk.id)).toEqual([
      "private_ai",
      "bittensor",
      "hyperliquid",
      "polymarket",
      "sui",
    ]);
  });
  test("excludes known embedding and reranking models", () => {
    for (const id of [
      "text-embedding-3",
      "BAAI/bge-m3",
      "WhereIsAI/UAE-Large-V1",
      "rerank-v3",
    ])
      expect(isChatModelId(id)).toBe(false);
    for (const id of ["asi1-mini", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"])
      expect(isChatModelId(id)).toBe(true);
  });
  test("desk entry opens an unsent session without a Home route transition", () => {
    const source = readFileSync(
      new URL(
        "../src/react-app/domains/session/chat/session-page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const minimalBranch =
      source
        .split("if (MINIMAL_UI && props.sidebar.onCreateTaskWithPrompt)")[1]
        ?.split("return;")[0] ?? "";
    expect(minimalBranch).toContain("sendImmediately: false");
    expect(minimalBranch).not.toContain("navigate(");
    expect(source).toContain("!MINIMAL_UI ? <aside");
  });
  test("starter buttons preserve an existing draft and never submit", () => {
    const source = readFileSync(
      new URL(
        "../src/react-app/domains/session/surface/session-surface.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const minimalBranch =
      source
        .split('aria-label="Conversation starters"')[1]
        ?.split(") : activeDeskMode ?")[0] ?? "";
    expect(minimalBranch).toContain("disabled={Boolean(draft.trim())}");
    expect(minimalBranch).toContain(
      "setComposerDraft(props.sessionId, starter.prompt)",
    );
    expect(minimalBranch).not.toContain("onSendDraft");
    expect(minimalBranch).not.toContain("startDeskTask(");
  });
  test("workspace tools restore existing entry points without widening their capability gates", () => {
    const source = readFileSync(new URL("../src/react-app/domains/session/chat/session-page.tsx", import.meta.url), "utf8");
    const menu = source.split('<nav aria-label="Workspace menu"')[1]?.split("</nav>")[0] ?? "";
    expect(menu).toContain("{isElectronRuntime() ? (");
    expect(menu).toContain("runMobileWorkspaceAction(openBrowserRailPane)");
    expect(menu).toContain("{voiceExtensionEnabled ? (");
    expect(menu).toContain("runMobileWorkspaceAction(openVoiceRailPane)");
    expect(menu).toContain("{MATTERHORN_LAUNCH_FEATURES.coworkers ? (");
    expect(menu).toContain("runMobileWorkspaceAction(openCoworkersRailPane)");
    expect(menu).toContain("runMobileWorkspaceAction(openAgentFilesRailPane)");
    expect(menu).toContain("{workspaceNotesAvailable ? (");
    expect(menu).toContain("openWorkspaceQuickJot(");
    expect(menu).toContain('label="Run history"');
    expect(menu).toContain("runMobileWorkspaceAction(openRunHistory)");
    expect(menu).not.toContain("attention.length");
  });
  test("minimal docked contextual panels retain their own close action", () => {
    const source = readFileSync(new URL("../src/react-app/domains/session/chat/session-page.tsx", import.meta.url), "utf8");
    const docked = source.split("{dockedSidePanelOpen ? (")[1]?.split("</ResizablePanel>")[0] ?? "";
    expect(docked).toContain("{MINIMAL_UI ? (");
    expect(docked).toContain('onClick={closeRightPane} aria-label="Close side panel"');
    expect(docked).toContain("{guardedSidePanelContent}");
  });
  test("shared workspace menus keep desktop-only reveal off the web", () => {
    const source = readFileSync(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('workspace.workspaceType === "local" && isDesktopRuntime() ? (');
    expect(source).toContain("ctx.onRevealWorkspace(workspace.id)");
  });
  test("minimal respects saved status-bar and model-picker preferences without removing settings access", () => {
    const source = readFileSync(new URL("../src/react-app/domains/session/chat/session-page.tsx", import.meta.url), "utf8");
    expect(source).toContain('{MINIMAL_UI && shellConfig.modelPicker ? <div');
    expect(source).toContain("{shellConfig.statusBar ? (");
    expect(source).not.toContain("shellConfig.statusBar && !MINIMAL_UI");
    expect(source).toContain("onOpenSettings={props.onOpenSettings}");
    const sidebar = readFileSync(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url), "utf8");
    const minimalSidebar = sidebar.split("function MinimalWorkspaceSidebar")[1]?.split("type WorkspaceReorderItemProps")[0] ?? "";
    expect(minimalSidebar).toContain("props.onOpenSettings?.()");
    expect(minimalSidebar).not.toContain("shellConfig.modelPicker");
  });
});
