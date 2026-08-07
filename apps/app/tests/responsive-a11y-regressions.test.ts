import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("responsive accessibility regressions", () => {
  test("blank sessions start at the top while populated transcripts keep sticky-bottom behavior", () => {
    const surface = readAppSource("domains/session/surface/session-surface.tsx");
    const controller = readAppSource("domains/session/surface/scroll-controller.ts");

    expect(surface).toContain("startAtTop: renderedMessages.length === 0");
    expect(controller).toContain("if (options.startAtTop)");
    expect(controller).toContain("!options.startAtTop");
    expect(controller).toContain('scrollToBottom("auto")');
  });

  test("mobile workflow starters show two description lines and reserve their height", () => {
    const surface = readAppSource("domains/session/surface/session-surface.tsx");

    expect(surface).toContain("min-h-[84px]");
    expect(surface).toContain("line-clamp-2");
    expect(surface).toContain("sm:line-clamp-1");
  });

  test("active settings sidebar entries expose current-page semantics", () => {
    const settings = readAppSource("domains/settings/shell/settings-page.tsx");

    expect(settings.match(/aria-current=\{props\.activeTab === (?:tab|\"general\") \? \"page\" : undefined\}/g)?.length).toBe(4);
  });

  test("mobile shell actions provide 44px hit areas without enlarging their icons", () => {
    const sessionPage = readAppSource("domains/session/chat/session-page.tsx");
    const statusBar = readAppSource("domains/session/chat/status-bar.tsx");
    const settingsShell = readAppSource("domains/settings/shell/settings-shell.tsx");

    expect(sessionPage).toContain('SidebarTrigger className="size-11 md:size-8');
    expect(sessionPage).toContain("size-11 shrink-0 text-dls-secondary");
    expect(statusBar.match(/min-h-11 min-w-11/g)?.length).toBeGreaterThanOrEqual(4);
    expect(settingsShell).toContain('SidebarTrigger className="size-11');
    expect(settingsShell).toContain('className="flex size-11 items-center');
  });

  test("desk information and compact composer controls meet minimum target sizing", () => {
    const surface = readAppSource("domains/session/surface/session-surface.tsx");
    const workflowPanel = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    const sessionPage = readAppSource("domains/session/chat/session-page.tsx");
    const composer = readAppSource("domains/session/surface/composer/composer.tsx");
    const editor = readAppSource("domains/session/surface/composer/editor.tsx");

    expect(surface).toContain("inline-flex size-6 shrink-0");
    expect(workflowPanel).toContain("inline-flex size-6 shrink-0");
    expect(sessionPage.match(/inline-flex size-6 shrink-0/g)?.length).toBe(3);
    expect(composer).toContain("after:-inset-0.5");
    expect(editor).toContain("after:-inset-1");
  });
});
