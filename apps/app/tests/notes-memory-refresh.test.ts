import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";

// Execute the production callback's effects, without mocking React globally or
// claiming this is a mounted/browser test of the sidebar badge.
const source = readFileSync(new URL("../src/react-app/domains/notes/notes-store.ts", import.meta.url), "utf8");
const callback = source.match(/const suggestMemory = useCallback<NotesStoreState\["suggestMemory"\]>\(\s*async \(noteId\) => \{([\s\S]*?)\n    \},\s*\[client, workspaceId\]/)?.[1];
if (!callback) throw new Error("Could not locate the Memory suggestion callback; update the test harness.");
const execute = compileFunction(`return (async () => {${callback}\n})();`, [
  "noteId", "workspaceId", "client", "setNotes", "setError", "dispatchNotesUpdated", "dispatchMemorySuggestionsChanged", "upsertNote",
]);

function run(suggest: () => Promise<unknown>, workspaceId = " ws_qa ") {
  const notes: string[] = [];
  const memory: string[] = [];
  const errors: unknown[] = [];
  const result = execute("note_qa", workspaceId, { suggestMemoryFromNote: suggest },
    () => {}, (error: unknown) => errors.push(error),
    (id: string) => notes.push(id), (id: string) => memory.push(id), () => {});
  return { result, notes, memory, errors };
}

test("successful note suggestion refreshes Notes and Memory for the same workspace", async () => {
  const note = { id: "note_qa" };
  const state = run(async () => ({ note }));
  expect(await state.result).toEqual(note);
  expect(state.notes).toEqual(["ws_qa"]);
  expect(state.memory).toEqual(["ws_qa"]);
});

test("failed suggestion does not announce a new Memory item", async () => {
  const state = run(async () => { throw new Error("Offline"); });
  expect(await state.result).toBeNull();
  expect(state.notes).toEqual([]);
  expect(state.memory).toEqual([]);
  expect(state.errors).toEqual(["Offline"]);
});

test("missing workspace does not emit refresh events", async () => {
  const state = run(async () => { throw new Error("Must not call the API"); }, "");
  expect(await state.result).toBeNull();
  expect(state.memory).toEqual([]);
  expect(state.errors).toEqual([]);
});
