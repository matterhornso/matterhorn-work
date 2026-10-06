import React from "react";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarProvider, SidebarTrigger } from "../src/components/ui/sidebar";
import { PRIMARY_DESKS } from "../src/app/lib/minimal-ui";

const readSource = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("workspace chrome discoverability", () => {
  test("renders a visible named desk trigger while preserving its button semantics", () => {
    const html = renderToStaticMarkup(<SidebarProvider><SidebarTrigger label="Desks" aria-label="Toggle desk navigation" /></SidebarProvider>);
    expect(html).toContain('data-slot="sidebar-trigger"');
    expect(html).toContain('aria-label="Toggle desk navigation"');
    expect(html).toContain("<span>Desks</span>");
    expect(html).not.toContain('class="sr-only">Desks');
  });

  test("preserves existing icon-only sidebar callers", () => {
    const html = renderToStaticMarkup(<SidebarProvider><SidebarTrigger /></SidebarProvider>);
    expect(html).toContain('<span class="sr-only">Toggle Sidebar</span>');
  });

  test("keeps all five desks available in shared desktop and mobile navigation", () => {
    expect(PRIMARY_DESKS.map((desk) => desk.name)).toEqual(["Private AI", "Bittensor", "Hyperliquid", "Polymarket", "Sui"]);
    const page = readSource("react-app/domains/session/chat/session-page.tsx");
    expect(page).toContain('deskNavigation={<nav aria-label="Desks"');
    expect(page).toContain("PRIMARY_DESKS.map((desk)");
    expect(page).toContain('label={MINIMAL_UI ? "Desks" : undefined}');
    expect(page).toContain("disabled={props.sidebar.newTaskDisabled}");
    expect(readSource("react-app/domains/session/sidebar/app-sidebar.tsx")).toContain("<div onClick={close}>{props.deskNavigation}</div>");
  });

  test("names workspace tools visibly and allows mobile header controls to occupy their own row", () => {
    const page = readSource("react-app/domains/session/chat/session-page.tsx");
    expect(page).toContain("{MINIMAL_UI ? <span>Workspace tools</span> : null}");
    expect(page).toContain('aria-label={MINIMAL_UI ? "Workspace tools" : "Open workspace menu"}');
    expect(page).toContain("h-auto flex-wrap gap-x-3 pb-1 md:h-10 md:flex-nowrap md:pb-0");
    expect(page).toContain("w-full justify-between md:w-auto md:max-w-[60%] md:shrink-0");
    expect(page).toContain('<ModelSelect showLabel');
    expect(page).not.toContain('className="max-w-[36vw] truncate"');
  });

  test("keeps the model action and chevron visible while only the selected name truncates", () => {
    const source = readSource("components/model-select.tsx");
    expect(source).toContain('showLabel = false');
    expect(source).toContain('{showLabel ? <span className="shrink-0">Model</span> : null}');
    expect(source).toContain('className="min-w-0 max-w-48 truncate"');
    expect(source).toContain('className="h-3 w-3 shrink-0" aria-hidden="true"');
    expect(source).toContain('const tooltipLabel = `Change model (${selectedModelLabel})`');
    expect(source).toContain("min-h-11 min-w-0 max-w-full");
    expect(source).toContain("max-w-[calc(100vw-1rem)]");
    expect(source).toContain("disabled={disabled}");
  });

  test("names Profile in the compact footer and opens the exact profile surface", () => {
    const source = readSource("react-app/domains/session/chat/status-bar.tsx");
    expect(source).toContain('<span className="md:hidden">{props.settingsOpen ? t("status.back") : "Profile"}</span>');
    expect(source).toContain('aria-label={props.settingsOpen ? t("status.back") : PROFILE_SETTINGS_LABEL}');
    expect(source).toContain('onClick={props.onOpenSettings}');
    expect(source).toContain('const PROFILE_SETTINGS_LABEL = "Profile & Settings"');
    expect(readSource("react-app/domains/session/chat/session-page.tsx"))
      .toContain('onOpenSettings={MINIMAL_UI && !props.statusBar?.settingsOpen ? () => setCurrentSidePanel("profile") : props.onOpenSettings}');
  });

  test("names Settings navigation and closes only its mobile drawer after section selection", () => {
    const shell = readSource("react-app/domains/settings/shell/settings-shell.tsx");
    const sidebar = readSource("react-app/domains/settings/shell/settings-page.tsx");
    expect(shell).toContain('label="Settings" aria-label="Toggle settings navigation"');
    const body = sidebar.slice(sidebar.indexOf("export function SettingsSidebar("));
    expect(body).toContain("const { setOpenMobile } = useSidebar();");
    expect(body).toContain("props.onSelectTab(tab);\n    setOpenMobile(false);");
    expect(body.match(/onClick=\{\(\) => selectTab\((?:tab|"general")\)\}/g)).toHaveLength(5);
    expect(body).not.toContain("setOpen(false)");
  });

  test("describes chat watch planning without advertising saved monitoring or wallet execution", () => {
    const page = readSource("react-app/domains/session/chat/session-page.tsx");
    expect(page.match(/Research, watch planning, and cited public data are available/g)).toHaveLength(2);
    expect(page).not.toContain("Research, watches, and cited public data are available");
    expect(page).not.toContain("Research, monitoring, and cited public data are available");
    expect(page).toContain("Transaction preparation and wallet actions stay hidden in Public Beta.");
  });
});
