import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function readAppFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
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

  test("mobile shells resize for virtual keyboards and preserve device safe areas", () => {
    const index = readAppFile("index.html");
    const sidebar = readAppFile("src/components/ui/sidebar.tsx");
    const sessionPage = readAppSource("domains/session/chat/session-page.tsx");
    const composer = readAppSource("domains/session/surface/composer/composer.tsx");
    const settingsShell = readAppSource("domains/settings/shell/settings-shell.tsx");

    expect(index).toContain("viewport-fit=cover");
    expect(index).toContain("interactive-widget=resizes-content");
    expect(sidebar).toContain("min-h-dvh");
    expect(sidebar).not.toContain("min-h-svh");
    expect(sessionPage).toContain("env(safe-area-inset-top)");
    expect(composer).toContain("env(safe-area-inset-bottom)");
    expect(composer).toContain("[@media(max-height:640px)]:flex-nowrap");
    expect(composer).toContain("[@media(max-height:640px)]:overflow-x-auto");
    expect(composer).toContain("[@media(max-height:640px)]:[&>*]:shrink-0");
    expect(composer).toContain('aria-label="Composer controls"');
    expect(settingsShell).toContain("h-dvh min-h-dvh");
    expect(settingsShell).toContain("env(safe-area-inset-top)");
  });

  test("the app has a reduced-motion fallback for animations, transitions, and scrolling", () => {
    const styles = readAppFile("src/app/index.css");
    const publicTrust = readAppSource("domains/public/public-trust-route.tsx");

    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation-duration: 0.01ms !important");
    expect(styles).toContain("transition-duration: 0.01ms !important");
    expect(styles).toContain("scroll-behavior: auto !important");
    expect(publicTrust).toContain("motion-reduce:animate-none");
    expect(publicTrust).toContain("safe-area-inset-left");
    expect(publicTrust).toContain("safe-area-inset-right");
  });

  test("public entry keeps Security and Privacy adjacent to the access form", () => {
    const signin = readAppSource("domains/cloud/public-web-signin-page.tsx");
    const signinStyles = readAppSource("domains/cloud/public-web-signin.css");

    expect(signin).toContain('aria-label="Security and privacy"');
    expect(signin).toContain('<a href="/security">Security</a>');
    expect(signin).toContain('<a href="/privacy">Privacy</a>');
    expect(signin).toContain("window.visualViewport");
    expect(signin).toContain('active.closest(".public-auth-form")');
    expect(signin).toContain('active.scrollIntoView({ block: "center"');
    expect(signinStyles).toContain("overflow-wrap: anywhere");
    expect(signinStyles).toContain("safe-area-inset-bottom");
    expect(signinStyles).toContain(".public-auth-trust a:focus-visible");
  });

  test("MCP Settings preserves sequential section and item heading levels", () => {
    const mcp = readAppSource("domains/settings/pages/mcp-view.tsx");
    const extensionCard = readAppSource("design-system/extension-card.tsx");
    const settingsSection = readAppSource("domains/settings/settings-section.tsx");
    const settingsLayout = readAppSource("domains/settings/settings-layout.tsx");

    expect(mcp).toContain("headingLevel={props.compact ? 3 : 2}");
    expect(mcp).toContain("headingLevel={props.headingLevel === 2 ? 3 : 4}");
    expect(extensionCard).toContain("headingLevel?: 3 | 4");
    expect(extensionCard).toContain("headingLevel = 4");
    expect(settingsSection).toMatch(/SettingsSectionHeaderTitle[\s\S]*?<h2[\s\S]*?flex items-center gap-2/);
    expect(settingsLayout).toMatch(/LayoutSectionTitle[\s\S]*?<h2[\s\S]*?flex items-center gap-2/);
  });
});
