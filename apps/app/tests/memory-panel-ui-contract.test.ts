import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Memory panel UI contract", () => {
  test("uses a review-first header and four count filters", () => {
    const source = readAppSource("domains/memory/memory-panel.tsx");

    expect(source).toContain(">Memory</div>");
    expect(source).toContain("Review suggestions before saving.");
    expect(source).toContain('useState<SuggestionInboxFilter>("needs_review")');
    expect(source).toContain('label: "Needs review"');
    expect(source).toContain('label: "Saved"');
    expect(source).toContain('label: "Not saved"');
    expect(source).toContain('label: "All"');
  });

  test("keeps safety copy compact and removes lifecycle stat cards", () => {
    const source = readAppSource("domains/memory/memory-panel.tsx");

    expect(source).toContain("Nothing is saved until you choose Remember or Save edited.");
    expect(source).not.toContain("No hidden memory");
    expect(source).not.toContain("No hidden save");
    expect(source).not.toContain("Memory inbox lifecycle summary");
    expect(source).not.toContain("Lifecycle state:");
    expect(source).not.toContain("Available actions:");
    expect(source).not.toContain("Save one manually below");
  });

  test("renders suggestion cards as compact review cards with collapsed details", () => {
    const source = readAppSource("domains/memory/memory-panel.tsx");

    expect(source).toContain('import { Badge } from "@/components/ui/badge"');
    expect(source).toContain("<details");
    expect(source).toContain("Why suggested");
    expect(source).toContain("Source:");
    expect(source).toContain("Scope:");
    expect(source).toContain("Dismissal window:");
    expect(source).toMatch(/>\s*Remember\s*<\/Button>/);
    expect(source).toMatch(/>\s*Edit\s*<\/Button>/);
    expect(source).toMatch(/>\s*Dismiss\s*<\/Button>/);
    expect(source).not.toContain("Edit first");
    expect(source).not.toContain("Content redacted");
  });

  test("blocked suggestions show only policy block copy", () => {
    const source = readAppSource("domains/memory/memory-panel.tsx");

    expect(source).toContain("Blocked by policy");
    expect(source).toContain("The proposed content stays hidden.");
    expect(source).not.toContain("No title, body, source");
  });

  test("manual capture is collapsed below saved memories", () => {
    const source = readAppSource("domains/memory/memory-panel.tsx");

    expect(source).toContain("Saved memories");
    expect(source).toContain("No saved memories yet");
    expect(source).toContain("manualCaptureOpen");
    expect(source).toContain("Add memory manually");
    expect(source).toContain("Save memory");
  });

  test("uses workspace-scoped memory APIs when a workspace id is available", () => {
    const source = readAppSource("domains/memory/memory-panel.tsx");

    expect(source).toContain("searchWorkspaceMemory");
    expect(source).toContain("listWorkspaceMemory");
    expect(source).toContain("captureWorkspaceMemory");
    expect(source).toContain("forgetWorkspaceMemory");
    expect(source).toContain("createWorkspaceMemorySuggestions");
    expect(source).toContain("listWorkspaceMemorySuggestions");
    expect(source).toContain("resolveStoredWorkspaceMemorySuggestion");
    expect(source).toContain("resolveWorkspaceMemorySuggestion");
    expect(source).toContain("exportWorkspaceMemory");
  });
});

describe("Settings overview memory contract", () => {
  test("mirrors Memory review counts and actions", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("GLOBAL_HOME_SIDE_PANEL_KEY");
    expect(source).toContain("workspaceSessionRoute");
    expect(source).toContain("listWorkspaceMemorySuggestions");
    expect(source).toContain("listWorkspaceMemory");
    expect(source).toContain("exportWorkspaceMemory");
    expect(source).toContain("Pending suggestions");
    expect(source).toContain("Saved memories");
    expect(source).toContain("Open Memory review");
    expect(source).toContain("Export memory bundle");
  });
});
