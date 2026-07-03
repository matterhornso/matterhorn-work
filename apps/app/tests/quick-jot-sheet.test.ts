import { describe, expect, test } from "bun:test";

import { normalizeTags } from "../src/react-app/domains/notes/notes-store";
import { noteFilterMatches } from "../src/react-app/domains/notes/notes-types";
import type { MatterhornNote } from "../src/react-app/domains/notes/notes-types";

describe("Quick Jot helpers", () => {
  const baseNote = {
    version: "matterhorn.note.v1" as const,
    workspaceId: "ws",
    title: "",
    body: "",
    tags: [],
    links: [],
    source: "manual" as const,
    filePath: "notes/note.md",
    createdAt: "2026-07-03T08:00:00Z",
    updatedAt: "2026-07-03T08:00:00Z",
  };

  test("normalizes tags", () => {
    expect(normalizeTags(["A", "b", " A ", "", "B"])).toEqual(["a", "b"]);
  });

  test("filter matches desk attachments", () => {
    const note: MatterhornNote = {
      ...baseNote,
      id: "n1",
      desk: "bittensor",
      links: [{ kind: "desk", id: "bittensor", label: "Bittensor" }],
    };
    expect(noteFilterMatches("all", note)).toBe(true);
    expect(noteFilterMatches("bittensor", note)).toBe(true);
    expect(noteFilterMatches("hyperliquid", note)).toBe(false);
    expect(noteFilterMatches("outputs", note)).toBe(false);
    expect(noteFilterMatches("memory-suggested", note)).toBe(false);
  });

  test("filter matches output attachments", () => {
    const note: MatterhornNote = {
      ...baseNote,
      id: "n2",
      outputPath: "out",
      links: [{ kind: "output", id: "out", path: "out", label: "Output" }],
    };
    expect(noteFilterMatches("outputs", note)).toBe(true);
    expect(noteFilterMatches("bittensor", note)).toBe(false);
  });

  test("filter matches memory suggested", () => {
    const note: MatterhornNote = {
      ...baseNote,
      id: "n3",
      memorySuggestionStatus: "pending",
    };
    expect(noteFilterMatches("memory-suggested", note)).toBe(true);
  });
});
