#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/notes-memory-browser-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(packageJson.scripts["smoke:notes-memory-browser"], "node scripts/notes-memory-browser-smoke.mjs --strict");
assert.equal(packageJson.scripts["test:notes-memory-browser-smoke"], "node scripts/notes-memory-browser-smoke.test.mjs");

for (const required of [
  "Matterhorn Notes and Memory browser smoke",
  "open_notes",
  "create_note",
  "autosave_note",
  "suggest_memory",
  "find_and_reopen",
  "delete_note",
  "dismiss_memory",
  "Memory-suggested filtering",
  "Nothing is saved until you choose Remember or Save edited",
  "failureCleanupRequired",
  "page.on(\"console\"",
  "page.on(\"pageerror\"",
  "page.on(\"response\"",
]) {
  assert.ok(source.includes(required), `Notes/Memory browser smoke missing ${required}`);
}

for (const forbidden of ["privateKey", "seedPhrase", "mnemonic", "action: \"confirm\"", "action: \"edit\""]) {
  assert.equal(source.includes(forbidden), false, `Notes/Memory browser smoke must not contain ${forbidden}`);
}

assert.ok(source.includes("resolveBrowserSmokeTarget"));
assert.equal(source.includes("http://127.0.0.1:5182"), false);

console.log("Matterhorn Notes and Memory browser smoke contract passed.");
