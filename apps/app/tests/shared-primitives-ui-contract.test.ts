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
});
