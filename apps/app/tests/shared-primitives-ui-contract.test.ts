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

  test("secondary primitives use soft surfaces instead of loud outline boxes", () => {
    const buttonSource = readUiSource("button.tsx");
    const badgeSource = readUiSource("badge.tsx");

    expect(buttonSource).toContain("border-transparent bg-dls-surface-muted/[0.10]");
    expect(buttonSource).toContain("hover:bg-dls-surface-muted/[0.16]");
    expect(buttonSource).not.toContain("border-border bg-background hover:bg-accent");
    expect(badgeSource).toContain("border-transparent bg-dls-surface-muted/[0.10]");
    expect(badgeSource).not.toContain('variant === "outline" && "text-foreground"');
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

  test("session composer avoids oversized pill controls", () => {
    const composerSource = readAppSource("domains/session/surface/composer/composer.tsx");
    const editorSource = readAppSource("domains/session/surface/composer/editor.tsx");

    expect(composerSource).toContain("bg-dls-surface-muted/[0.075]");
    expect(composerSource).toContain("inline-flex h-9 max-h-9 w-9 items-center justify-center rounded-lg");
    expect(editorSource).toContain("min-h-[72px]");
    expect(composerSource).toContain("border border-transparent");
    expect(composerSource).not.toContain("border-b border-dls-border/25");
    expect(composerSource).not.toContain("border-[rgba(var(--matterhorn-blue-rgb),0.24)]");
    expect(composerSource).not.toContain("rounded-full bg-gray-2/45");
    expect(composerSource).not.toContain("h-11 max-h-11");
    expect(composerSource).not.toContain("shadow-[0_8px_24px");
  });

  test("desk info buttons use a slim icon affordance", () => {
    const sourceByPath = new Map([
      ["domains/session/chat/session-page.tsx", readAppSource("domains/session/chat/session-page.tsx")],
      ["domains/session/surface/session-surface.tsx", readAppSource("domains/session/surface/session-surface.tsx")],
      ["domains/session/workflows/desk-workflow-stage-panel.tsx", readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx")],
    ]);

    for (const [path, source] of sourceByPath) {
      expect(source, path).toContain("rounded-full text-dls-muted");
      expect(source, path).toContain("strokeWidth={1.55}");
      expect(source, path).not.toContain("inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb)");
      expect(source, path).not.toContain("inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-dls-hover");
      expect(source, path).not.toContain("absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb)");
    }
  });

  test("main Matterhorn surfaces avoid harsh divider-line scaffolding", () => {
    const sourceByPath = new Map([
      ["domains/memory/memory-panel.tsx", readAppSource("domains/memory/memory-panel.tsx")],
      ["domains/session/chat/session-page.tsx", readAppSource("domains/session/chat/session-page.tsx")],
      ["domains/session/surface/composer/composer.tsx", readAppSource("domains/session/surface/composer/composer.tsx")],
      ["domains/session/surface/session-surface.tsx", readAppSource("domains/session/surface/session-surface.tsx")],
      ["domains/session/workflows/workflow-stage-card.tsx", readAppSource("domains/session/workflows/workflow-stage-card.tsx")],
      ["domains/recent-activity/recent-activity-section.tsx", readAppSource("domains/recent-activity/recent-activity-section.tsx")],
      ["domains/recent-activity/project-history-page.tsx", readAppSource("domains/recent-activity/project-history-page.tsx")],
      ["domains/settings/backend-capabilities/backend-capability-section.tsx", readAppSource("domains/settings/backend-capabilities/backend-capability-section.tsx")],
      ["domains/settings/pages/billing-view.tsx", readAppSource("domains/settings/pages/billing-view.tsx")],
      ["domains/settings/pages/general-view.tsx", readAppSource("domains/settings/pages/general-view.tsx")],
      ["domains/settings/pages/ai-view.tsx", readAppSource("domains/settings/pages/ai-view.tsx")],
      ["domains/settings/pages/wallet-view.tsx", readAppSource("domains/settings/pages/wallet-view.tsx")],
      ["domains/settings/pages/cloud-account-view.tsx", readAppSource("domains/settings/pages/cloud-account-view.tsx")],
      ["domains/session/media/session-image-generation-panel.tsx", readAppSource("domains/session/media/session-image-generation-panel.tsx")],
      ["domains/session/media/nft-draft-panel.tsx", readAppSource("domains/session/media/nft-draft-panel.tsx")],
      ["domains/session/media/nft-publishing-readiness.tsx", readAppSource("domains/session/media/nft-publishing-readiness.tsx")],
      ["domains/wallet/sui-workflow-panel.tsx", readAppSource("domains/wallet/sui-workflow-panel.tsx")],
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
      expect(source, path).not.toContain("border-l border-white");
      expect(source, path).not.toContain("border-b border-white");
      expect(source, path).not.toContain("w-px bg-dls-border/30");
    }

    expect(sourceByPath.get("domains/memory/memory-panel.tsx")).toContain("Add memory manually");
    expect(sourceByPath.get("domains/memory/memory-panel.tsx")).toContain("bg-dls-surface-muted/[0.08]");
    expect(sourceByPath.get("domains/session/surface/session-surface.tsx")).not.toContain("border-y border-[rgba(var(--matterhorn-desk-rgb),0.24)]");
    expect(sourceByPath.get("domains/session/media/session-image-generation-panel.tsx")).toContain("bg-dls-surface-muted/[0.045]");
    expect(sourceByPath.get("domains/session/workflows/workflow-stage-card.tsx")).toContain("bg-dls-surface-muted/[0.075]");
    expect(sourceByPath.get("domains/wallet/sui-workflow-panel.tsx")).toContain("SUI_PANEL_SECTION_CLASS");
    expect(sourceByPath.get("domains/wallet/sui-workflow-panel.tsx")).toContain("bg-dls-surface-muted/[0.055]");
  });
});
