import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";

// Execute the production callback with a controlled save result. This checks
// its failure-path ordering without pretending to mount a browser or React tree.
const source = readFileSync(new URL("../src/react-app/domains/notes/notes-page.tsx", import.meta.url), "utf8");
const callback = source.match(/const closeEditor = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[saveDraft\]\);/)?.[1];
if (!callback) throw new Error("Could not locate the note close callback; update this harness with the implementation.");
const closeEditor = compileFunction(`return (async () => {${callback}\n})();`, ["saveDraft", "setSelectedNoteId"]);

test("keeps the editor and unsaved draft available when saving fails", async () => {
  const selections: Array<string | null> = [];
  await closeEditor(async () => false, (id: string | null) => selections.push(id));
  expect(selections).toEqual([]);
});

test("closes the editor after a successful save", async () => {
  const selections: Array<string | null> = [];
  await closeEditor(async () => true, (id: string | null) => selections.push(id));
  expect(selections).toEqual([null]);
});

test("does not close before the save completes", async () => {
  const selections: Array<string | null> = [];
  let completeSave: (saved: boolean) => void = () => { throw new Error("Save not started"); };
  const pendingSave = new Promise<boolean>((resolve) => { completeSave = resolve; });
  const closing = closeEditor(() => pendingSave, (id: string | null) => selections.push(id));
  expect(selections).toEqual([]);
  completeSave(true);
  await closing;
  expect(selections).toEqual([null]);
});

test("a rejected save does not clear the selected note", async () => {
  const selections: Array<string | null> = [];
  await expect(closeEditor(async () => { throw new Error("offline"); },
    (id: string | null) => selections.push(id))).rejects.toThrow("offline");
  expect(selections).toEqual([]);
});
