import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readUiSource(path: string) {
  return readFileSync(new URL(`../src/components/ui/${path}`, import.meta.url), "utf8");
}

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
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
    const source = readAppSource("domains/workspace/create-workspace-modal.tsx");
    expect(source).not.toContain("bg-[radial-gradient");
    expect(source).not.toContain("shadow-[0_28px");
    expect(source).not.toContain("rounded-[20px]");
  });

  test("settings shell avoids oversized radius on error surfaces", () => {
    const source = readAppSource("domains/settings/shell/settings-shell.tsx");
    expect(source).not.toContain("rounded-2xl");
  });

  test("settings tabs avoid oversized radius and uppercase labels", () => {
    const source = readAppSource("domains/settings/shell/tabs.tsx");
    expect(source).not.toContain("rounded-[24px]");
    expect(source).not.toContain("rounded-2xl");
    expect(source).not.toContain("uppercase");
    expect(source).not.toContain("tracking-[0.18em]");
  });

  test("status toasts use compact accessible surfaces", () => {
    const source = readAppSource("domains/shell-feedback/status-toast.tsx");

    expect(source).toContain('role={semanticRole}');
    expect(source).toContain('aria-live={semanticRole === "alert" ? "assertive" : "polite"}');
    expect(source).toContain("Button");
    expect(source).toContain("rounded-lg");
    expect(source).not.toContain("rounded-[1.4rem]");
    expect(source).not.toContain("rounded-full");
    expect(source).not.toContain("backdrop-blur-xl");
    expect(source).not.toContain("shadow-[var(--dls-shell-shadow)]");
  });

  test("project activity avoids boxed log-list treatment on home", () => {
    const source = readAppSource("domains/recent-activity/recent-activity-section.tsx");

    expect(source).toContain("LatestActivityPreview");
    expect(source).toContain("Project history");
    expect(source).toContain("defaultExpanded = true");
    expect(source).not.toContain("rounded-lg bg-dls-surface-muted/10");
    expect(source).not.toContain("rounded-lg bg-destructive/10");
  });

  test("workflow stage cards keep details collapsed by default", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");

    expect(source).toContain("<details");
    expect(source).toContain("<summary");
    expect(source).toContain("Details");
    expect(source).not.toContain("shadow-[inset_0_0_0_1px");
  });

  test("desk workflow panel keeps idle status and details quiet", () => {
    const source = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");

    expect(source).toContain("shouldShowPanelStatus");
    expect(source).toContain('return status !== "idle"');
    expect(source).toContain("Workflow details");
    expect(source).not.toContain("Workflow:");
    expect(source).not.toContain("rounded-lg bg-dls-surface-muted/20");
    expect(source).not.toContain("rounded-lg border border-dls-border/45 bg-dls-surface/50");
  });

  test("MCP settings use action-oriented setup copy", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(source).toContain('"Set up"');
    expect(source).not.toContain('"Requires setup"');
    expect(source).not.toContain('"Setup required"');
    expect(source).not.toContain('"Command ready"');
  });

  test("legacy Bittensor panel uses calm desk surfaces", () => {
    const source = readAppSource("domains/wallet/pages/BittensorPanel.tsx");

    expect(source).toContain("Safety info");
    expect(source).not.toContain("bg-[radial-gradient");
    expect(source).not.toContain("Boundary</span>");
    expect(source).not.toContain("uppercase tracking-[0.16em]");
    expect(source).not.toContain("uppercase tracking-wider");
  });
});
