import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";

// Exercise the actual callback, not a second implementation of its queue.
const source = readFileSync(new URL("../src/react-app/domains/notes/notes-page.tsx", import.meta.url), "utf8");
const body = source.match(/const saveDraft = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[draft,/)?.[1];
if (!body) throw new Error("Update the harness to match the note save callback.");
const run = compileFunction(`return (async () => {${body}\n})();`, [
  "selectedNote", "draftDirty", "setSaving", "update", "draft", "draftTags",
  "showToast", "error", "saveQueueRef", "editorStateRef",
]);

function harness() {
  const requests: Array<{ body: string; finish: (value: object | null) => void; fail: () => void }> = [];
  const saving: boolean[] = [];
  const queue = { current: null };
  const editor = { current: { noteId: "note", draft: { title: "Note", body: "First", tags: "" } } };
  const update = (_id: string, patch: { body: string }) => new Promise<object | null>((resolve, reject) => {
    requests.push({ body: patch.body, finish: resolve, fail: () => reject(new Error("offline")) });
  });
  return {
    requests, saving, editor,
    save: (dirty = true) => run({ id: "note" }, dirty, (value: boolean) => saving.push(value),
      update, editor.current.draft, [], () => {}, null, queue, editor),
  };
}

async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

test("a successful older save must not close an editor containing newer edits", async () => {
  const h = harness();
  const saved = h.save();
  await flush();
  h.editor.current.draft = { title: "Note", body: "Newer unsaved edit", tags: "" };
  h.requests[0].finish({ id: "note" });
  expect(await saved).toBe(false);
});

test("overlapping saves run in order and saving stays true until the queue drains", async () => {
  const h = harness();
  const first = h.save();
  await flush();
  h.editor.current.draft = { title: "Note", body: "Second", tags: "" };
  const second = h.save();
  await flush();
  expect(h.requests.map(r => r.body)).toEqual(["First"]);
  h.requests[0].finish({ id: "note" });
  expect(await first).toBe(false);
  await flush();
  expect(h.saving).not.toContain(false);
  expect(h.requests.map(r => r.body)).toEqual(["First", "Second"]);
  h.requests[1].finish({ id: "note" });
  expect(await second).toBe(true);
  expect(h.saving.at(-1)).toBe(false);
});

test("reverting to the old saved value while a save is pending still persists the revert", async () => {
  const h = harness();
  const first = h.save();
  await flush();
  h.editor.current.draft = { title: "Note", body: "Original server text", tags: "" };
  const reverted = h.save(false);
  h.requests[0].finish({ id: "note" });
  await first;
  await flush();
  expect(h.requests.map(r => r.body)).toEqual(["First", "Original server text"]);
  h.requests[1].finish({ id: "note" });
  expect(await reverted).toBe(true);
});

test("failed saves retain the draft and do not poison the next queued save", async () => {
  const h = harness();
  const first = h.save();
  await flush();
  h.editor.current.draft = { title: "Note", body: "Retry", tags: "" };
  const retry = h.save();
  h.requests[0].finish(null);
  expect(await first).toBe(false);
  await flush();
  h.requests[1].finish({ id: "note" });
  expect(await retry).toBe(true);
});

test("switching notes while saving cannot count as saving the new editor", async () => {
  const h = harness();
  const first = h.save();
  await flush();
  h.editor.current.noteId = "another-note";
  h.requests[0].finish({ id: "note" });
  expect(await first).toBe(false);
});
