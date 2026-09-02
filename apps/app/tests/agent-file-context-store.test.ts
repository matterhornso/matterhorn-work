import { describe, expect, test } from "bun:test";

import {
  describeMatterhornAgentFileContext,
  readStoredMatterhornAgentFileContexts,
  sanitizeMatterhornAgentFileContext,
  writeStoredMatterhornAgentFileContexts,
} from "../src/react-app/domains/session/surface/agent-file-context-store";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function file(index: number) {
  return {
    id: `file_${index}`,
    name: `research-${index}.md`,
    revision: index + 1,
    content: "must not persist",
    contentSha256: "must not persist",
  };
}

describe("coworker file chat context", () => {
  test("keeps only bounded identifiers and display names in tab storage", () => {
    const context = sanitizeMatterhornAgentFileContext("ses_1", {
      coworker: { id: "coworker_1", name: "Research coworker", role: "Market analyst", revision: 2, ownerId: "hidden" },
      files: Array.from({ length: 10 }, (_, index) => file(index)),
      updatedAt: "2026-09-02T10:00:00.000Z",
      rawFile: "must not persist",
    });

    expect(context?.files).toHaveLength(8);
    expect(context?.files[0]).toEqual({ id: "file_0", name: "research-0.md", revision: 1 });
    expect(JSON.stringify(context)).not.toContain("must not persist");
    expect(JSON.stringify(context)).not.toContain("ownerId");
  });

  test("rejects missing coworkers, unsafe ids, and empty file lists", () => {
    expect(sanitizeMatterhornAgentFileContext("ses_1", { coworker: null, files: [file(0)] })).toBeNull();
    expect(sanitizeMatterhornAgentFileContext("ses_1", {
      coworker: { id: "bad/id", name: "Research coworker", role: "Market analyst", revision: 2 },
      files: [file(0)],
    })).toBeNull();
    expect(sanitizeMatterhornAgentFileContext("ses_1", {
      coworker: { id: "coworker_1", name: "Research coworker", role: "Market analyst", revision: 2 },
      files: [],
    })).toBeNull();
  });

  test("round-trips only session-scoped selection metadata", () => {
    const storage = new MemoryStorage();
    const context = sanitizeMatterhornAgentFileContext("ses_1", {
      coworker: { id: "coworker_1", name: "Research coworker", role: "Market analyst", revision: 2 },
      files: [file(0), file(0), file(1)],
      updatedAt: "2026-09-02T10:00:00.000Z",
    });
    expect(context).not.toBeNull();
    if (!context) return;

    writeStoredMatterhornAgentFileContexts({ ses_1: context }, storage);
    const restored = readStoredMatterhornAgentFileContexts(storage);

    expect(restored.ses_1?.files).toHaveLength(2);
    expect(restored.ses_1?.coworker.id).toBe("coworker_1");
    expect(describeMatterhornAgentFileContext(context)).toBe(
      "Research coworker can read research-0.md, research-1.md",
    );
  });
});
