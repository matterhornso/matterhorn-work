import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function readSessionPageSource() {
  return readAppSource("domains/session/chat/session-page.tsx");
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

  test("visually separates interactive controls from passive memory states", () => {
    const source = readAppSource("domains/memory/memory-panel.tsx");

    expect(source).toContain("MEMORY_ICON_ACTION_CLASS");
    expect(source).toContain("MEMORY_SECONDARY_ACTION_CLASS");
    expect(source).toContain("bg-dls-surface-raised text-dls-secondary");
    expect(source).toContain("bg-dls-surface-raised text-dls-text");
    expect(source).toContain("bg-dls-surface-muted/60 text-dls-text");
    expect(source).toContain("hover:bg-dls-surface-muted/[0.42]");
    expect(source).not.toContain("hover:bg-transparent hover:text-dls-text");
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

describe("Memory rail inbox contract", () => {
  test("counts the same workspace-scoped suggestion inbox shown by the Memory panel", () => {
    const source = readSessionPageSource();

    expect(source).toContain('const workspaceId = (props.runtimeWorkspaceId ?? props.selectedWorkspaceId ?? "").trim();');
    expect(source).toContain('client.listWorkspaceMemorySuggestions(workspaceId, { status: "pending", limit: 50 })');
    expect(source).toContain('client.listMemorySuggestions({ status: "pending", limit: 50 })');
  });
});

describe("Settings overview memory contract", () => {
  test("mirrors Memory review counts and actions", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("workspaceMemoryRoute");
    expect(source).toContain("listWorkspaceMemorySuggestions");
    expect(source).toContain("listWorkspaceMemory");
    expect(source).toContain("exportWorkspaceMemory");
    expect(source).toContain("Pending suggestions");
    expect(source).toContain("Saved memories");
    expect(source).toContain("Open Memory review");
    expect(source).toContain("Export memory bundle");
  });
});
