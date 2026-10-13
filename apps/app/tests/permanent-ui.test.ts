import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isChatModelId } from "../src/app/lib/chat-models";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readSource = (path: string) => readFileSync(join(appRoot, "src", path), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:[cm]?[jt]sx?|css|html)$/.test(entry.name) ? [path] : [];
  });
}

describe("permanent restored interface", () => {
  test("shipped source and build configuration contain no alternate UI opt-in or root marker", () => {
    const files = [
      ...sourceFiles(join(appRoot, "src")),
      join(appRoot, "index.html"),
      join(appRoot, "vite.config.ts"),
      join(repoRoot, ".env.example"),
      ...readdirSync(join(repoRoot, "packaging/docker"))
        .filter((name) => name.startsWith("Dockerfile"))
        .map((name) => join(repoRoot, "packaging/docker", name)),
    ];
    const obsolete = /VITE_MATTERHORN_(?:RETRO|MINIMAL)_UI|\b(?:MINIMAL_UI|RETRO_UI|applyRetroUi|PrimaryDeskLauncher|MinimalWorkspaceSidebar|MinimalModels)\b|data-matterhorn-ui|(?:retro|minimal-ui)\.css/;
    const matches = files.filter((file) => obsolete.test(readFileSync(file, "utf8")))
      .map((file) => relative(repoRoot, file));
    expect(matches).toEqual([]);
    for (const removed of [
      "app/lib/retro-ui.ts",
      "app/lib/minimal-ui.ts",
      "styles/retro.css",
      "react-app/domains/session/workflows/primary-desk-launcher.tsx",
      "react-app/domains/settings/pages/minimal-models.tsx",
    ]) expect(existsSync(join(appRoot, "src", removed))).toBe(false);
  });

  test("excludes known embedding and reranking models", () => {
    for (const id of ["text-embedding-3", "BAAI/bge-m3", "WhereIsAI/UAE-Large-V1", "rerank-v3"])
      expect(isChatModelId(id)).toBe(false);
    for (const id of ["asi1-mini", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"])
      expect(isChatModelId(id)).toBe(true);
  });

  test("workspace tools retain entry points without widening their capability gates", () => {
    const source = readSource("react-app/domains/session/chat/session-page.tsx");
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

  test("shared workspace menus keep desktop-only reveal off the web", () => {
    const source = readSource("react-app/domains/session/sidebar/app-sidebar.tsx");
    expect(source).toContain('workspace.workspaceType === "local" && isDesktopRuntime() ? (');
    expect(source).toContain("ctx.onRevealWorkspace(workspace.id)");
  });

  test("restored controls retain model, settings, profile and wallet access", () => {
    const page = readSource("react-app/domains/session/chat/session-page.tsx");
    const surface = readSource("react-app/domains/session/surface/session-surface.tsx");
    expect(page).toContain("{shellConfig.statusBar ? (");
    expect(page).toContain("onOpenSettings={props.onOpenSettings}");
    expect(page).toContain('aria-label="Profile and account"');
    expect(page).toContain('aria-label="Wallet details"');
    expect(page).toContain("<HomeCapabilityOverview");
    expect(surface).toContain("showModelPicker={shellConfig.modelPicker && !props.modelUnavailable}");
    expect(surface).toContain("onOpenAiProviders={props.onOpenAiProviders}");
  });
});
