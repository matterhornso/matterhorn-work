import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readUiSource(path: string) {
  return readFileSync(
    new URL(`../src/components/ui/${path}`, import.meta.url),
    "utf8",
  );
}

function readAppSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  );
}

function readAppPackageSource(path: string) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("Shared primitives UI contract", () => {
  test("skeleton uses modest radius", () => {
    const source = readUiSource("skeleton.tsx");
    expect(source).toContain("rounded-md");
    expect(source).not.toContain("rounded-2xl");
    expect(source).not.toContain("rounded-3xl");
    expect(source).not.toContain("rounded-4xl");
  });

  test("command dialog popup avoids decorative glass and oversized radius", () => {
    const source = readUiSource("command.tsx");
    expect(source).toContain("rounded-lg");
    expect(source).not.toContain("backdrop-blur-xl");
    expect(source).not.toContain("rounded-2xl");
    expect(source).not.toContain("rounded-3xl");
    expect(source).not.toContain("rounded-4xl");
    expect(source).not.toContain("before:bg-muted/20");
    expect(source).not.toContain("before:shadow");
  });

  test("tabs avoid oversized radius and heavy rings", () => {
    const source = readUiSource("tabs.tsx");
    expect(source).not.toContain("rounded-2xl");
    expect(source).not.toContain("rounded-3xl");
    expect(source).not.toContain("focus-visible:ring-[3px]");
  });

  test("secondary primitives use soft surfaces instead of loud outline boxes", () => {
    const buttonSource = readUiSource("button.tsx");
    const badgeSource = readUiSource("badge.tsx");

    expect(buttonSource).toContain(
      "border-transparent bg-dls-surface-muted/55",
    );
    expect(buttonSource).toContain("hover:bg-dls-surface-muted/75");
    expect(buttonSource).not.toContain(
      "border-border bg-background hover:bg-accent",
    );
    expect(badgeSource).toContain(
      "border-transparent bg-dls-surface-muted/[0.10]",
    );
    expect(badgeSource).not.toContain(
      'variant === "outline" && "text-foreground"',
    );
  });

  test("cards, dialogs, and buttons share restrained elevation and motion", () => {
    const cardSource = readAppPackageSource("components/ui/card.tsx");
    const dialogSource = readAppPackageSource("components/ui/dialog.tsx");
    const buttonSource = readAppPackageSource("components/ui/button.tsx");

    expect(cardSource).toContain("shadow-[var(--dls-card-shadow)]");
    expect(cardSource).toContain("motion-reduce:transition-none");
    expect(dialogSource).toContain("shadow-[var(--dls-overlay-shadow)]");
    expect(dialogSource).toContain("backdrop-blur-[2px]");
    expect(dialogSource).toContain("motion-reduce:animate-none");
    expect(buttonSource).toContain("active:scale-[0.98]");
    expect(buttonSource).toContain("motion-reduce:active:scale-100");
  });

  test("workspace modal styles use modest radii and avoid glass shadows", () => {
    const source = readAppSource("domains/workspace/modal-styles.ts");
    expect(source).not.toContain("rounded-[28px]");
    expect(source).not.toContain("rounded-[24px]");
    expect(source).not.toContain("rounded-[20px]");
    expect(source).not.toContain("rounded-2xl");
    expect(source).not.toContain("rounded-full");
    expect(source).not.toContain("shadow-[0_18px");
    expect(source).not.toContain("inset_0_1px_0_rgba(255,255,255");
  });

  test("create workspace modal avoids radial gradient and heavy shadow", () => {
    const source = readAppSource(
      "domains/workspace/create-workspace-modal.tsx",
    );
    expect(source).not.toContain("bg-[radial-gradient");
    expect(source).not.toContain("shadow-[0_28px");
    expect(source).not.toContain("rounded-[20px]");
  });

  test("settings shell avoids oversized radius on error surfaces", () => {
    const source = readAppSource("domains/settings/shell/settings-shell.tsx");
    expect(source).not.toContain("rounded-2xl");
    expect(source).toContain(
      'className="flex h-9 shrink-0 items-center justify-between px-4 md:hidden mac:titlebar-drag"',
    );
    expect(source).not.toContain("<ChevronRight");
    expect(source).not.toContain(
      "h-10 items-center justify-between border-b border-dls-border",
    );
  });

  test("status toasts use an opaque isolated surface", () => {
    const source = readAppSource("domains/shell-feedback/status-toast.tsx");

    expect(source).toContain("relative isolate");
    expect(source).toContain("bg-dls-canvas");
    expect(source).toContain("ring-1 ring-dls-border/45");
    expect(source).not.toContain("backdrop-blur");
    expect(source).not.toContain("bg-dls-surface/");
  });

  test("reload toast uses the same opaque notification surface", () => {
    const source = readAppSource(
      "domains/shell-feedback/reload-workspace-toast.tsx",
    );

    expect(source).toContain("relative isolate");
    expect(source).toContain("bg-dls-canvas");
    expect(source).toContain("ring-1 ring-dls-border/45");
    expect(source).not.toContain("border border-dls-border bg-dls-surface");
    expect(source).not.toContain("shadow-lg");
  });

  test("shared error state treats unreadable engine responses as server failures", () => {
    const source = readAppSource("domains/shell/error-state.tsx");

    expect(source).toContain("unreadable response");
    expect(source).toContain("Workspace server did not respond");
    expect(source).not.toContain("JSON.parse");
  });

  test("settings tabs avoid oversized radius and uppercase labels", () => {
    const source = readAppSource("domains/settings/shell/tabs.tsx");
    expect(source).toContain('aria-label="Settings sections"');
    expect(source).toContain(
      'aria-current={props.active ? "page" : undefined}',
    );
    expect(source).not.toContain("rounded-[24px]");
    expect(source).not.toContain("rounded-2xl");
    expect(source).not.toContain("uppercase");
    expect(source).not.toContain("tracking-[0.18em]");
  });

  test("session composer avoids oversized pill controls", () => {
    const composerSource = readAppSource(
      "domains/session/surface/composer/composer.tsx",
    );
    const editorSource = readAppSource(
      "domains/session/surface/composer/editor.tsx",
    );

    expect(composerSource).toContain("bg-dls-surface-muted/[0.16]");
    expect(composerSource).toContain(
      "focus-within:bg-dls-surface-muted/[0.23]",
    );
    expect(composerSource).toContain(
      "inline-flex h-9 max-h-9 w-9 items-center justify-center rounded-lg",
    );
    expect(editorSource).toContain("min-h-[72px]");
    expect(editorSource).toContain("aria-label={props.placeholder}");
    expect(composerSource).toContain("border border-transparent");
    expect(composerSource).not.toContain("border-b border-dls-border/25");
    expect(composerSource).not.toContain(
      "border-[rgba(var(--matterhorn-blue-rgb),0.24)]",
    );
    expect(composerSource).not.toContain("rounded-full bg-gray-2/45");
    expect(composerSource).not.toContain("h-11 max-h-11");
    expect(composerSource).not.toContain("shadow-[0_8px_24px");
  });

  test("composer tool menu uses compact tabs and a calm loading state", () => {
    const source = readAppSource(
      "domains/session/surface/composer/composer.tsx",
    );
    const appStyles = readAppPackageSource("app/index.css");

    expect(source).toContain('role="dialog"');
    expect(source).toContain('role="tablist" aria-label="Tool categories"');
    expect(source).toContain("function ToolMenuLoading");
    expect(source).toContain("max-h-[min(16rem,calc(100vh-13rem))]");
    expect(source).toContain("matterhorn-tool-menu");
    expect(appStyles).toContain("@media (max-height: 420px)");
    expect(appStyles).toContain("inset: 3rem 0.75rem 0.75rem !important");
    expect(source).toContain('aria-label={t("composer.configure")}');
    expect(source).not.toContain("grid-cols-[152px_minmax(0,1fr)]");
    expect(source).not.toContain("border-r border-dls-border bg-gray-2/30");
  });

  test("launch-critical status and failure copy remains accessible in both themes", () => {
    const sessionSurface = readAppSource(
      "domains/session/surface/session-surface.tsx",
    );
    const sessionPage = readAppSource("domains/session/chat/session-page.tsx");
    const overview = readAppSource("domains/settings/pages/overview-view.tsx");
    const wallet = readAppSource("domains/settings/pages/wallet-view.tsx");
    const capabilityStatus = readAppSource(
      "domains/settings/backend-capabilities/backend-capability-status.tsx",
    );
    const profileStatus = readAppSource(
      "domains/profile/profile-capability-status.tsx",
    );

    expect(sessionSurface).toContain('role="alert"');
    expect(sessionSurface).toContain('aria-atomic="true"');
    for (const source of [
      sessionPage,
      overview,
      wallet,
      capabilityStatus,
      profileStatus,
    ]) {
      expect(source).toContain("text-emerald-11");
      expect(source).not.toContain("text-emerald-300");
    }
    for (const source of [
      sessionPage,
      overview,
      wallet,
      capabilityStatus,
      profileStatus,
    ]) {
      expect(source).toContain("text-amber-12 dark:text-amber-11");
    }
    expect(wallet).toContain('className="text-xs text-dls-secondary"');
    expect(wallet).not.toContain('className="text-xs text-gray-8"');
  });

  test("desk info buttons use a slim icon affordance", () => {
    const sourceByPath = new Map([
      [
        "domains/session/chat/session-page.tsx",
        readAppSource("domains/session/chat/session-page.tsx"),
      ],
      [
        "domains/session/surface/session-surface.tsx",
        readAppSource("domains/session/surface/session-surface.tsx"),
      ],
      [
        "domains/session/workflows/desk-workflow-stage-panel.tsx",
        readAppSource(
          "domains/session/workflows/desk-workflow-stage-panel.tsx",
        ),
      ],
    ]);

    for (const [path, source] of sourceByPath) {
      expect(source, path).toContain("rounded-full text-dls-muted");
      expect(source, path).toContain("strokeWidth={1.55}");
      expect(source, path).not.toContain(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb)",
      );
      expect(source, path).not.toContain(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-dls-hover",
      );
      expect(source, path).not.toContain(
        "absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb)",
      );
    }
  });

  test("settings and session navigation expose current-page semantics", () => {
    const settingsTabs = readAppSource("domains/settings/shell/tabs.tsx");
    const appSidebar = readAppSource("domains/session/sidebar/app-sidebar.tsx");

    expect(settingsTabs).toContain(
      'aria-current={props.active ? "page" : undefined}',
    );
    expect(appSidebar).toContain(
      'aria-current={ctx.selectedWorkspaceId === workspace.id ? "page" : undefined}',
    );
    expect(
      appSidebar.match(/aria-current={isSelected \? "page" : undefined}/g)
        ?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
  });

  test("nested session disclosure keeps native button semantics", () => {
    const sidebar = readAppSource("domains/session/sidebar/app-sidebar.tsx");
    expect(sidebar).toContain('render={<button type="button" />}');
  });

  test("settings sidebar uses quiet navigation instead of outlined status pills", () => {
    const settingsPage = readAppSource(
      "domains/settings/shell/settings-page.tsx",
    );

    expect(settingsPage).toContain("SETTINGS_SIDEBAR_ITEM_CLASS");
    expect(settingsPage).toContain(
      'case "overview":\n      return LayoutDashboard;',
    );
    expect(settingsPage).toContain('case "ai":\n      return Cpu;');
    expect(settingsPage).not.toContain('case "ai":\n      return Zap;');
    expect(settingsPage).toContain("SETTINGS_SIDEBAR_STYLE");
    expect(settingsPage).toContain('"--sidebar": "var(--matterhorn-ink)"');
    expect(settingsPage).toContain('"--sidebar-foreground": "#f4fbff"');
    expect(settingsPage).toContain(
      '"--sidebar-accent-foreground": "var(--matterhorn-blue)"',
    );
    expect(settingsPage).toContain(
      '"--sidebar-border": "rgb(var(--matterhorn-blue-rgb) / 0.16)"',
    );
    expect(settingsPage).toContain(
      '"--sidebar-ring": "var(--matterhorn-blue)"',
    );
    expect(settingsPage).toContain(
      'borderColor: "rgb(var(--matterhorn-blue-rgb) / 0.16)"',
    );
    expect(settingsPage).toContain("matterhorn-settings-sidebar");
    expect(settingsPage).toContain('src="/matterhorn-logo-square.svg"');
    expect(settingsPage).toContain(
      "data-active:bg-[rgb(var(--matterhorn-blue-rgb)/0.13)]",
    );
    expect(settingsPage).toContain(
      "data-active:text-[var(--matterhorn-blue)]",
    );
    expect(settingsPage).toContain(
      "data-active:[&_svg]:text-[var(--matterhorn-blue)]",
    );
    expect(settingsPage).toContain("shouldDisplaySettingsReadinessStatus");
    expect(settingsPage).toContain('"Preview",');
    expect(settingsPage).toContain('"Desktop only",');
    expect(settingsPage).toContain('"Cloud only",');
    expect(settingsPage).toContain('return "Platform setup";');
    expect(settingsPage).not.toContain(
      "border-sky-500/30 bg-sky-500/10 text-sky-300",
    );
    expect(settingsPage).not.toContain(
      "rounded-md border px-1.5 py-0.5 text-[9px]",
    );
  });

  test("Customization uses open sections and inline guidance instead of framed boxes", () => {
    const shellView = readAppSource("domains/settings/pages/shell-view.tsx");

    expect(shellView).toContain("function CustomizationNotice");
    expect(shellView).toContain('<LayoutStack className="gap-y-10">');
    expect(shellView).toContain('<LayoutSectionItem className="py-2">');
    expect(shellView).toContain(
      '<div className="ml-6 flex flex-col gap-3 pl-4">',
    );
    expect(shellView).not.toContain('from "@/components/ui/alert"');
    expect(shellView).not.toContain("<Separator />");
    expect(shellView).not.toContain(
      'className="rounded-lg border border-dls-border p-4"',
    );
    expect(shellView).not.toContain(
      'variant="outline"\n          size="sm"\n          onClick={resetAll}',
    );
    expect(shellView).toContain(
      "<LayoutSectionItemTitle>Application name</LayoutSectionItemTitle>",
    );
    expect(shellView).toContain("{config.appName}");
    expect(shellView).not.toContain('id="shell-app-name"');
    expect(shellView).toContain("function ReadOnlyRow");
    expect(shellView).toContain('status="Host managed"');
    expect(shellView).toContain('status="Allowed"');
    expect(shellView).not.toContain(
      'unavailable="The model picker display control is not available yet."',
    );
    expect(shellView).not.toContain(
      'unavailable="The new workspace button display control is not available yet."',
    );
    expect(shellView).not.toContain("cloudOnly");

    const composer = readAppSource(
      "domains/session/surface/composer/composer.tsx",
    );
    const sessionSurface = readAppSource(
      "domains/session/surface/session-surface.tsx",
    );
    const sidebar = readAppSource("domains/session/sidebar/app-sidebar.tsx");
    expect(composer).toContain("props.showModelPicker !== false");
    expect(sessionSurface).toContain(
      "showModelPicker={shellConfig.modelPicker}",
    );
    expect(sidebar).toContain("shellConfig.addWorkspace ?");
  });

  test("billing management uses a quiet action instead of an outlined control", () => {
    const billingView = readAppSource(
      "domains/settings/pages/billing-view.tsx",
    );

    expect(billingView).toContain("const portalCanOpen =");
    expect(billingView).toContain("{portalCanOpen ? (");
    expect(billingView).toContain('variant="ghost"');
    expect(billingView).toContain('size="sm"');
    expect(billingView).toContain(
      "bg-dls-surface-muted/[0.13] text-dls-secondary",
    );
    expect(billingView).toContain(
      "border-0 bg-dls-surface-muted/[0.13] px-2 text-xs text-dls-secondary",
    );
    expect(billingView).toContain("hover:bg-dls-surface-muted/[0.2]");
    expect(billingView).toContain("Active for this workspace");
    expect(billingView).not.toContain(
      "rounded-md border-dls-border/35 text-xs shadow-none",
    );
  });

  test("main Matterhorn surfaces avoid harsh divider-line scaffolding", () => {
    const sourceByPath = new Map([
      [
        "domains/memory/memory-panel.tsx",
        readAppSource("domains/memory/memory-panel.tsx"),
      ],
      [
        "domains/session/chat/session-page.tsx",
        readAppSource("domains/session/chat/session-page.tsx"),
      ],
      [
        "domains/session/surface/composer/composer.tsx",
        readAppSource("domains/session/surface/composer/composer.tsx"),
      ],
      [
        "domains/session/surface/session-surface.tsx",
        readAppSource("domains/session/surface/session-surface.tsx"),
      ],
      [
        "domains/session/workflows/workflow-stage-card.tsx",
        readAppSource("domains/session/workflows/workflow-stage-card.tsx"),
      ],
      [
        "domains/recent-activity/recent-activity-section.tsx",
        readAppSource("domains/recent-activity/recent-activity-section.tsx"),
      ],
      [
        "domains/recent-activity/project-history-page.tsx",
        readAppSource("domains/recent-activity/project-history-page.tsx"),
      ],
      [
        "domains/settings/backend-capabilities/backend-capability-section.tsx",
        readAppSource(
          "domains/settings/backend-capabilities/backend-capability-section.tsx",
        ),
      ],
      [
        "domains/settings/backend-capabilities/backend-capability-status.tsx",
        readAppSource(
          "domains/settings/backend-capabilities/backend-capability-status.tsx",
        ),
      ],
      [
        "domains/profile/profile-capability-status.tsx",
        readAppSource("domains/profile/profile-capability-status.tsx"),
      ],
      [
        "domains/settings/pages/billing-view.tsx",
        readAppSource("domains/settings/pages/billing-view.tsx"),
      ],
      [
        "domains/settings/pages/general-view.tsx",
        readAppSource("domains/settings/pages/general-view.tsx"),
      ],
      [
        "domains/settings/pages/ai-view.tsx",
        readAppSource("domains/settings/pages/ai-view.tsx"),
      ],
      [
        "domains/settings/pages/wallet-view.tsx",
        readAppSource("domains/settings/pages/wallet-view.tsx"),
      ],
      [
        "domains/settings/pages/cloud-account-view.tsx",
        readAppSource("domains/settings/pages/cloud-account-view.tsx"),
      ],
      [
        "domains/settings/pages/generated-media-view.tsx",
        readAppSource("domains/settings/pages/generated-media-view.tsx"),
      ],
      [
        "domains/settings/pages/marketplace-view.tsx",
        readAppSource("domains/settings/pages/marketplace-view.tsx"),
      ],
      [
        "domains/session/media/session-image-generation-panel.tsx",
        readAppSource(
          "domains/session/media/session-image-generation-panel.tsx",
        ),
      ],
      [
        "domains/session/media/nft-draft-panel.tsx",
        readAppSource("domains/session/media/nft-draft-panel.tsx"),
      ],
      [
        "domains/session/media/nft-publishing-readiness.tsx",
        readAppSource("domains/session/media/nft-publishing-readiness.tsx"),
      ],
      [
        "domains/session/sidebar/app-sidebar.tsx",
        readAppSource("domains/session/sidebar/app-sidebar.tsx"),
      ],
      [
        "domains/session/surface/message-list.tsx",
        readAppSource("domains/session/surface/message-list.tsx"),
      ],
      [
        "domains/session/surface/tool-call.tsx",
        readAppSource("domains/session/surface/tool-call.tsx"),
      ],
      [
        "domains/wallet/pages/BittensorPanel.tsx",
        readAppSource("domains/wallet/pages/BittensorPanel.tsx"),
      ],
      [
        "domains/wallet/sui-workflow-panel.tsx",
        readAppSource("domains/wallet/sui-workflow-panel.tsx"),
      ],
    ]);

    for (const [path, source] of sourceByPath) {
      expect(source, path).not.toContain("border-y border-dls-border/25");
      expect(source, path).not.toContain("border-y border-dls-border/35");
      expect(source, path).not.toContain("border-y border-dls-border/45");
      expect(source, path).not.toContain("border-t border-dls-border/25");
      expect(source, path).not.toContain("border-t border-dls-border/35");
      expect(source, path).not.toContain("border-t border-dls-border/45");
      expect(source, path).not.toContain("divide-y divide-dls-border/25");
      expect(source, path).not.toContain("divide-y divide-dls-border/35");
      expect(source, path).not.toContain("divide-y divide-dls-border/45");
      expect(source, path).not.toContain("divide-y divide-dls-border/50");
      expect(source, path).not.toContain("divide-y divide-dls-border/70");
      expect(source, path).not.toContain("border-l border-white");
      expect(source, path).not.toContain("border-b border-white");
      expect(source, path).not.toContain("w-px bg-dls-border/30");
      expect(source, path).not.toContain("rounded-[16px]");
      expect(source, path).not.toContain("rounded-[18px]");
      expect(source, path).not.toContain("rounded-[20px]");
      expect(source, path).not.toContain("rounded-[24px]");
    }

    expect(sourceByPath.get("domains/memory/memory-panel.tsx")).toContain(
      "Add memory manually",
    );
    expect(sourceByPath.get("domains/memory/memory-panel.tsx")).toContain(
      "bg-dls-surface-muted/[0.08]",
    );
    expect(
      sourceByPath.get("domains/session/surface/session-surface.tsx"),
    ).not.toContain("border-y border-[rgba(var(--matterhorn-desk-rgb),0.24)]");
    expect(
      sourceByPath.get(
        "domains/session/media/session-image-generation-panel.tsx",
      ),
    ).toContain("bg-dls-surface-muted/[0.035]");
    expect(
      sourceByPath.get("domains/session/workflows/workflow-stage-card.tsx"),
    ).toContain("bg-dls-surface-muted/[0.20]");
    expect(
      sourceByPath.get("domains/session/workflows/workflow-stage-card.tsx"),
    ).toContain("bg-dls-surface-muted/[0.38]");
    expect(
      sourceByPath.get("domains/session/surface/message-list.tsx"),
    ).toContain("function MessageActionIconButton");
    expect(
      sourceByPath.get("domains/session/surface/message-list.tsx"),
    ).toContain('block.isUser ? "absolute right-2 top-2" : "mt-2"');
    expect(
      sourceByPath.get("domains/session/surface/message-list.tsx"),
    ).toContain("bg-dls-surface-muted/[0.14] ring-1 ring-white/[0.08]");
    expect(
      sourceByPath.get("domains/session/surface/message-list.tsx"),
    ).not.toContain("absolute bottom-2 flex items-center");
    expect(
      sourceByPath.get("domains/session/surface/message-list.tsx"),
    ).not.toContain("border border-dls-border bg-dls-sidebar");
    expect(sourceByPath.get("domains/wallet/sui-workflow-panel.tsx")).toContain(
      "SUI_PANEL_SECTION_CLASS",
    );
    expect(sourceByPath.get("domains/wallet/sui-workflow-panel.tsx")).toContain(
      "matterhorn-rail-section grid gap-3 py-2",
    );
    expect(
      sourceByPath.get("domains/wallet/sui-workflow-panel.tsx"),
    ).not.toContain('SUI_PANEL_SECTION_CLASS = "grid gap-3 rounded-md');
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).toContain(
      "[grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr))]",
    );
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).toContain("Connected wallet");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).toContain("bg-dls-surface-muted/[0.055]");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("@/components/ui/card");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("@/components/ui/separator");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("<Card");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("<Separator");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("divide-y");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("border border-dls-border");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("border-dls-border/30");
    expect(
      sourceByPath.get("domains/settings/pages/wallet-view.tsx"),
    ).not.toContain("border-b border-dls-border/45");
    expect(
      sourceByPath.get("domains/settings/pages/cloud-account-view.tsx"),
    ).not.toContain("@/components/ui/separator");
    expect(
      sourceByPath.get("domains/settings/pages/cloud-account-view.tsx"),
    ).not.toContain("<Separator");
    expect(
      sourceByPath.get("domains/settings/pages/cloud-account-view.tsx"),
    ).toContain("<DenSignedOutPanel");
    expect(
      sourceByPath.get("domains/settings/pages/cloud-account-view.tsx"),
    ).toContain("compact");
    expect(
      sourceByPath.get("domains/wallet/pages/BittensorPanel.tsx"),
    ).not.toContain("aria-label={`Step");
    expect(
      sourceByPath.get("domains/settings/pages/generated-media-view.tsx"),
    ).toContain("grid gap-1");
    expect(
      sourceByPath.get("domains/settings/pages/marketplace-view.tsx"),
    ).toContain("bg-dls-surface-muted/[0.055]");
    expect(
      sourceByPath.get("domains/settings/pages/marketplace-view.tsx"),
    ).not.toContain("border-b border-gray");
    expect(
      sourceByPath.get("domains/settings/pages/marketplace-view.tsx"),
    ).not.toContain("divide-y divide-gray");
    expect(
      sourceByPath.get("domains/settings/pages/marketplace-view.tsx"),
    ).not.toContain("tracking-wider");
    expect(
      sourceByPath.get("domains/settings/pages/marketplace-view.tsx"),
    ).not.toContain("h-[2px]");
    expect(
      sourceByPath.get("domains/profile/profile-capability-status.tsx"),
    ).toContain("grid min-w-0 gap-1 pl-0 sm:pl-12");
    expect(
      sourceByPath.get(
        "domains/settings/backend-capabilities/backend-capability-status.tsx",
      ),
    ).toContain("inline-flex min-w-0 items-center gap-1.5 text-xs font-medium");
    expect(
      sourceByPath.get(
        "domains/settings/backend-capabilities/backend-capability-status.tsx",
      ),
    ).not.toContain("rounded-md border px-2 py-0.5");
  });

  test("MCP marketplace streams use soft rows instead of divider strips", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(source).toContain("mcp-marketplace-stream");
    expect(source).toContain("matterhorn-mcp-stream");
    expect(source).toContain("hover:bg-dls-surface-muted/[0.08]");
    expect(source).not.toContain("rounded-[18px]");
    expect(source).not.toContain("border-b border-dls-border/25 px-1 py-3");
    expect(source).not.toContain("border-b border-dls-border/25 px-3 py-4");
  });

  test("configured MCP servers use soft raised rows instead of outlined boxes", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(source).toContain(
      '"rounded-md bg-dls-surface-muted/[0.14] transition-colors"',
    );
    expect(source).toContain('? "bg-dls-surface-muted/[0.28]"');
    expect(source).toContain(': "hover:bg-dls-surface-muted/[0.22]"');
    expect(source).not.toContain(
      '"border-dls-border bg-dls-surface hover:bg-dls-hover"',
    );
    expect(source).not.toContain('"border-blue-7 bg-blue-2 shadow-sm"');
  });

  test("compact MCP settings use selection and disclosure instead of a long card document", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");
    const compactSource = source.replace(/\s+/g, " ");
    const displayNameSource = readAppSource(
      "domains/settings/pages/mcp-display-name.ts",
    );
    const extensionsSource = readAppSource(
      "domains/settings/pages/extensions-view.tsx",
    );
    const settingsRoute = readAppSource("shell/settings-route.tsx");
    const compactSettingsRoute = settingsRoute.replace(/\s+/g, " ");
    const english = readFileSync(
      new URL("../src/i18n/locales/en.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("const [selectedCardId, setSelectedCardId]");
    expect(source).toContain('useState<ExtensionFilter>("mcp")');
    expect(source).toContain('aria-label="MCP client"');
    expect(source).toContain("aria-expanded={expanded}");
    expect(source).toContain("setSelectedCardId(expanded ? null : card.id)");
    expect(source).toContain("props.compact");
    expect(source).toContain("Setup details");
    expect(source).toContain("compact={props.compact}");
    expect(source).toContain(
      '"rounded-md bg-transparent transition-colors hover:bg-dls-surface-muted/[0.08]"',
    );
    expect(source).toContain(
      'className="matterhorn-mcp-stream grid min-w-0 gap-1"',
    );
    expect(source).toContain('? "grid gap-1"');
    expect(source).toMatch(
      /cn\(\s*"rounded-md bg-transparent transition-colors"/,
    );
    expect(source).toContain('? "px-1 py-2"');
    expect(source).not.toContain(
      'className="matterhorn-mcp-stream grid min-w-0 gap-0.5 rounded-lg bg-dls-surface-muted/[0.055] p-1"',
    );
    expect(source).not.toContain(
      '"grid gap-0.5 rounded-lg bg-dls-surface-muted/[0.055] p-1"',
    );
    expect(source).toContain("const connectedNames = connectedServers.map");
    expect(source).toContain("fallbackMcpDisplayName(entry.name)");
    expect(source).toContain("matterhornMcpDisplayName(resolvedName)");
    expect(displayNameSource).toContain(
      '"matterhorn-work": "Matterhorn Desks MCP"',
    );
    expect(displayNameSource).toContain(
      '"matterhorn-work-mcp": "Matterhorn Desks MCP"',
    );
    expect(displayNameSource).toContain(
      '"matterhorn-work-ui": "Matterhorn Desks UI Control"',
    );
    expect(extensionsSource).toContain(
      'import { mcpServerDisplayName } from "./mcp-display-name"',
    );
    expect(source).toContain("Connected MCP servers:");
    expect(source).toContain('props.connectedNames.join(" · ")');
    expect(source).toContain("<McpConfiguredServersSection");
    expect(compactSource).toContain(
      "onCopyCommand={copyMatterhornMcpCommand} compact",
    );
    expect(extensionsSource).toContain("mcpConnectedAppNames: string[]");
    expect(extensionsSource).toContain('connectedAppNames.join(" · ")');
    expect(extensionsSource).toContain(
      "h-9 min-w-0 rounded-none border-x-0 border-t-0 border-b-2",
    );
    expect(extensionsSource).toContain(
      '"grid min-w-0 flex-1 grid-cols-2 border-b border-dls-border/40"',
    );
    expect(extensionsSource).toContain(
      "const marketplaceAvailable = Boolean(props.cloudMarketplaceView)",
    );
    expect(extensionsSource).toContain(
      "!marketplaceAvailable ? refreshButton : null",
    );
    expect(extensionsSource).toContain(") : props.cloudMarketplaceView}");
    expect(extensionsSource).not.toContain(
      "Marketplace extensions are post-go-live",
    );
    expect(extensionsSource).toContain("{refreshButton}");
    expect(compactSettingsRoute).toContain("MATTERHORN_CLOUD_ENABLED ? (");
    expect(source).toContain(
      'className="text-xs font-medium text-dls-secondary"',
    );
    expect(compactSettingsRoute).toContain(
      'mcpStatuses[server.name]?.status === "connected"',
    );
    expect(settingsRoute).not.toContain(
      "connectionsSnapshot.mcpServers.length",
    );
    expect(english).toContain('"mcp.app_connected": "MCP server active"');
    expect(english).toContain('"mcp.apps_connected": "MCP servers active"');
    expect(english).not.toContain('"mcp.apps_connected": "apps connected"');
  });

  test("web workspaces refresh MCP truth through the connected backend", () => {
    const connectionsStore = readAppSource("domains/connections/store.ts");
    const settingsRoute = readAppSource("shell/settings-route.tsx");
    const compactSettingsRoute = settingsRoute.replace(/\s+/g, " ");

    expect(connectionsStore).toContain("void refreshMcpServers();");
    expect(connectionsStore).not.toContain(
      "!started || disposed || !isDesktopRuntime() || !changed",
    );
    expect(compactSettingsRoute).toContain(
      'matterhornServerSnapshot.matterhornServerStatus !== "connected" || !runtimeWorkspaceId',
    );
    expect(compactSettingsRoute).toContain(
      "matterhornServerSnapshot.matterhornServerStatus, runtimeWorkspaceId",
    );
  });

  test("right-side panels use the workspace canvas and open compact sections", () => {
    const sessionPage = readAppSource("domains/session/chat/session-page.tsx");
    const settingsShell = readAppSource(
      "domains/settings/shell/settings-shell.tsx",
    );
    const settingsPanel = readAppSource("domains/settings/shell/panel.tsx");
    const walletView = readAppSource("domains/settings/pages/wallet-view.tsx");

    expect(sessionPage).toContain("matterhorn-side-panel hidden h-full");
    expect(sessionPage).toContain("bg-dls-background lg:flex");
    expect(sessionPage).toContain(
      'const embeddedSettingsPanelOpen = visibleSidePanel === "extensions" || visibleSidePanel === "profile" || visibleSidePanel === "wallet";',
    );
    expect(sessionPage).toContain("{!embeddedSettingsPanelOpen ? (");
    expect(settingsShell).toContain(
      "shadow-[0_1px_0_rgb(var(--matterhorn-blue-rgb)/0.08)]",
    );
    expect(settingsPanel).toContain('"items-stretch gap-5 px-4 py-5"');
    expect(walletView).toContain("matterhorn-wallet-rail max-w-none gap-5");
    expect(walletView).toContain("matterhorn-rail-section flex flex-col gap-3");
    expect(walletView).toContain(
      "rounded-lg bg-dls-surface-muted/[0.14] p-1.5",
    );
    expect(walletView).toContain("WALLET_CONNECTOR_ACTION_CLASS");
    expect(walletView).toContain('"h-auto justify-start gap-3 px-3 py-2.5"');
  });

  test("tablet side panels stay visible until the docked lg layout is available", () => {
    const mobileHook = readFileSync("apps/app/src/hooks/use-mobile.ts", "utf8");
    const sessionPage = readFileSync(
      "apps/app/src/react-app/domains/session/chat/session-page.tsx",
      "utf8",
    );
    expect(mobileHook).toContain("const MOBILE_BREAKPOINT = 1024");
    expect(sessionPage).toContain(
      'className="matterhorn-side-panel hidden h-full min-h-0 overflow-hidden bg-dls-background lg:flex lg:flex-col"',
    );
    expect(sessionPage).toContain(
      'className="matterhorn-side-panel fixed inset-0 z-40 flex bg-dls-background lg:hidden"',
    );
  });

  test("Memory rail uses a cognitive icon instead of an archive-bin shape", () => {
    const sessionPage = readAppSource("domains/session/chat/session-page.tsx");

    expect(sessionPage).toContain("<Brain size={17} />");
    expect(sessionPage).not.toContain("<Archive size={17} />");
  });

  test("Profile rail opens the account surface instead of the Settings index", () => {
    const sessionPage = readAppSource("domains/session/chat/session-page.tsx");
    const panelRoute = readAppSource("shell/session-panel-route.ts");
    const accountView = readAppSource(
      "domains/settings/pages/cloud-account-view.tsx",
    );

    expect(sessionPage).toContain('renderCompactSettingsRail("cloud-account")');
    expect(sessionPage).not.toContain('renderCompactSettingsRail("general")');
    expect(sessionPage).toContain('title="Profile and account"');
    expect(sessionPage).toContain("resolveSessionPanelNavigation(currentLocation.search, panel)");
    expect(panelRoute).toContain('params.set("panel", nextPanel)');
    expect(panelRoute).toContain('params.delete("panel")');
    expect(
      readAppSource("domains/settings/shell/settings-shell.tsx"),
    ).toContain('props.compact && props.activeTab === "cloud-account"');
    expect(accountView).toContain("matterhorn-profile-rail max-w-none gap-6");
    expect(accountView).toContain("Open workspace preferences");
    expect(accountView).toContain("bg-dls-surface-muted/[0.32]");
    expect(accountView).toContain("hover:bg-dls-surface-muted/[0.46]");
    expect(accountView).toContain("bg-dls-surface-muted/[0.18] px-2.5 py-1.5");
    expect(accountView).toContain("{cloudAvailable ? <section");
    expect(accountView).toContain("{cloudAvailable ? <SettingsSection>");
    expect(
      readAppSource("domains/profile/profile-capability-status.tsx"),
    ).toContain("bg-dls-surface-muted/[0.20]");
    expect(
      readAppSource("domains/profile/profile-capability-status.tsx"),
    ).toContain("hover:bg-dls-surface-muted/[0.30]");
  });

  test("overlay context menu avoids inherited glass and oversized radius", () => {
    const source = readAppPackageSource("overlay/context-menu.tsx");

    expect(source).toContain("rounded-lg border border-border/70 bg-popover");
    expect(source).toContain("rounded-md px-2.5 py-1.5");
    expect(source).not.toContain("rounded-2xl");
    expect(source).not.toContain("rounded-3xl");
    expect(source).not.toContain("backdrop-blur");
    expect(source).not.toContain("backdrop-saturate");
    expect(source).not.toContain("shadow-lg");
    expect(source).not.toContain("tracking-widest");
  });
});
