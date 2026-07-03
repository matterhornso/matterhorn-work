import { describe, expect, test } from "bun:test";

import {
  filterNotes,
  normalizeTags,
  noteDraftToCreateRequest,
  notePatchToUpdateRequest,
} from "../src/react-app/domains/notes/notes-store";
import type { MatterhornNote } from "../src/react-app/domains/notes/notes-types";

const NOW = new Date("2026-07-03T08:00:00Z").toISOString();

function makeNote(overrides: Partial<MatterhornNote> = {}): MatterhornNote {
  return {
    version: "matterhorn.note.v1",
    id: "note_1",
    workspaceId: "ws_test",
    title: "Note",
    body: "",
    tags: [],
    links: [],
    source: "manual",
    filePath: "notes/note_1.md",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("Notes API helpers", () => {
  test("normalizes tags", () => {
    expect(normalizeTags(["Alpha", "beta", " Alpha ", "", "BETA"])).toEqual(["alpha", "beta"]);
  });

  test("builds create request with safe defaults", () => {
    const request = noteDraftToCreateRequest({
      title: "  Hello ",
      body: "  World ",
      tags: ["Project", "project"],
    });
    expect(request).toMatchObject({
      title: "Hello",
      body: "World",
      tags: ["project"],
      links: [],
      desk: null,
      sessionId: null,
      taskId: null,
      outputPath: null,
      source: "manual",
    });
  });

  test("builds create request for output attachment", () => {
    const request = noteDraftToCreateRequest(
      {
        title: "Artifact",
        attachment: { type: "output", id: "outputs/bittensor/report.md", label: "report.md" },
      },
      "quick_jot",
    );
    expect(request.outputPath).toBe("outputs/bittensor/report.md");
    expect(request.links).toEqual([
      {
        kind: "output",
        id: "outputs/bittensor/report.md",
        path: "outputs/bittensor/report.md",
        label: "report.md",
      },
    ]);
    expect(request.source).toBe("quick_jot");
  });

  test("builds patch request that clears an attachment", () => {
    const request = notePatchToUpdateRequest({ attachment: null });
    expect(request.links).toEqual([]);
    expect(request.desk).toBeNull();
    expect(request.sessionId).toBeNull();
    expect(request.taskId).toBeNull();
    expect(request.outputPath).toBeNull();
  });

  test("filters by query, desk, outputs, and memory status", () => {
    const notes = [
      makeNote({ id: "a", title: "Bittensor staking", body: "Validators", desk: "bittensor" }),
      makeNote({ id: "b", title: "Hyperliquid", body: "Orderbook", desk: "hyperliquid" }),
      makeNote({ id: "c", title: "Output", outputPath: "outputs/report.md" }),
      makeNote({ id: "d", title: "Memory", memorySuggestionStatus: "pending" }),
    ];

    expect(filterNotes(notes, { query: "staking" })).toHaveLength(1);
    expect(filterNotes(notes, { query: "orderbook" })).toHaveLength(1);
    expect(filterNotes(notes, { query: "notfound" })).toHaveLength(0);
    expect(filterNotes(notes, { filterId: "bittensor" }).map((note) => note.id)).toEqual(["a"]);
    expect(filterNotes(notes, { filterId: "outputs" }).map((note) => note.id)).toEqual(["c"]);
    expect(filterNotes(notes, { filterId: "memory-suggested" }).map((note) => note.id)).toEqual(["d"]);
  });
});
