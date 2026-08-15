import { describe, expect, test } from "bun:test";

import {
  noteAttachmentFields,
  noteAttachmentToLink,
  noteFilterMatches,
  noteSuggestedToMemory,
  noteToAttachment,
} from "../src/react-app/domains/notes/notes-types";
import type { MatterhornNote, NoteAttachment } from "../src/react-app/domains/notes/notes-types";
import {
  dispatchMemorySuggestionsChanged,
  sendNoteToMemory,
} from "../src/react-app/domains/notes/send-note-to-memory";

function makeNote(overrides: Partial<MatterhornNote> = {}): MatterhornNote {
  const now = Date.now();
  return {
    version: "matterhorn.note.v1",
    id: "note_1",
    workspaceId: "ws_1",
    title: "Test",
    body: "Body",
    tags: [],
    links: [],
    source: "manual",
    filePath: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Notes type helpers", () => {
  test("noteAttachmentToLink maps desk attachment", () => {
    const link = noteAttachmentToLink({ type: "desk", id: "bittensor", label: "Bittensor" });
    expect(link.kind).toBe("desk");
    expect(link.id).toBe("bittensor");
    expect(link.label).toBe("Bittensor");
  });

  test("noteAttachmentToLink maps output attachment with path", () => {
    const link = noteAttachmentToLink({ type: "output", id: "outputs/report.md", label: "Report" });
    expect(link.kind).toBe("output");
    expect(link.path).toBe("outputs/report.md");
    expect(link.label).toBe("Report");
  });

  test("noteAttachmentFields returns null fields for missing attachment", () => {
    const fields = noteAttachmentFields(null);
    expect(fields.desk).toBeNull();
    expect(fields.sessionId).toBeNull();
    expect(fields.taskId).toBeNull();
    expect(fields.outputPath).toBeNull();
    expect(fields.links).toEqual([]);
  });

  test("noteAttachmentFields sets task id", () => {
    const fields = noteAttachmentFields({ type: "task", id: "task_1", label: "Task" });
    expect(fields.taskId).toBe("task_1");
    expect(fields.links).toHaveLength(1);
    expect(fields.links[0].kind).toBe("task");
  });

  test("noteToAttachment recovers desk from note", () => {
    const note = makeNote({ desk: "bittensor", links: [{ kind: "desk", id: "bittensor", label: "Bittensor" }] });
    const attachment = noteToAttachment(note);
    expect(attachment).toEqual({ type: "desk", id: "bittensor", label: "Bittensor" });
  });

  test("noteToAttachment recovers output from outputPath fallback", () => {
    const note = makeNote({ outputPath: "outputs/chart.png" });
    const attachment = noteToAttachment(note);
    expect(attachment).toEqual({ type: "output", id: "outputs/chart.png", label: "outputs/chart.png" });
  });

  test("noteSuggestedToMemory uses client flag", () => {
    const note = makeNote({ suggestedToMemory: true });
    expect(noteSuggestedToMemory(note)).toBe(true);
  });

  test("noteFilterMatches memory-suggested filter", () => {
    const suggested = makeNote({ suggestedToMemory: true });
    const notSuggested = makeNote();
    expect(noteFilterMatches("memory-suggested", suggested)).toBe(true);
    expect(noteFilterMatches("memory-suggested", notSuggested)).toBe(false);
  });

  test("noteFilterMatches desk filter", () => {
    const bittensor = makeNote({ desk: "bittensor" });
    const hyperliquid = makeNote({ desk: "hyperliquid" });
    expect(noteFilterMatches("bittensor", bittensor)).toBe(true);
    expect(noteFilterMatches("bittensor", hyperliquid)).toBe(false);
  });

  test("noteFilterMatches outputs filter", () => {
    const outputNote = makeNote({ outputPath: "outputs/report.md" });
    const plainNote = makeNote();
    expect(noteFilterMatches("outputs", outputNote)).toBe(true);
    expect(noteFilterMatches("outputs", plainNote)).toBe(false);
  });

  test("noteFilterMatches longevity includes wellness", () => {
    const wellness = makeNote({ desk: "wellness" });
    const longevity = makeNote({ desk: "longevity" });
    expect(noteFilterMatches("longevity", wellness)).toBe(true);
    expect(noteFilterMatches("longevity", longevity)).toBe(true);
  });
});

describe("sendNoteToMemory", () => {
  test("notifies the shell when note-backed Memory review changes", () => {
    const target = new EventTarget();
    let detail: { workspaceId?: string; source?: string } | null = null;
    target.addEventListener("matterhorn:memory-suggestions-changed", (event) => {
      detail = (event as CustomEvent<{ workspaceId?: string; source?: string }>).detail;
    });

    dispatchMemorySuggestionsChanged("ws_1", target);

    expect(detail).toEqual({ workspaceId: "ws_1", source: "user_note" });
  });

  test("returns error when client is missing", async () => {
    const note = makeNote();
    const result = await sendNoteToMemory(null, note);
    expect(result.ok).toBe(false);
  });

  test("returns success when suggestion is created", async () => {
    const note = makeNote();
    const client = {
      suggestMemoryFromNote: async () => ({
        success: true as const,
        suggestionId: "sug_1",
        suggestionStatus: "pending" as const,
        note,
      }),
    };
    const result = await sendNoteToMemory(client as unknown as Parameters<typeof sendNoteToMemory>[0], note);
    expect(result.ok).toBe(true);
  });

  test("returns error when suggestion is not created", async () => {
    const note = makeNote();
    const client = {
      suggestMemoryFromNote: async () => ({
        success: true as const,
        suggestionId: "",
        suggestionStatus: undefined,
        note,
      }),
    };
    const result = await sendNoteToMemory(client as unknown as Parameters<typeof sendNoteToMemory>[0], note);
    expect(result.ok).toBe(false);
  });
});
