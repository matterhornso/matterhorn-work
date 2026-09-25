import { expect, test } from "bun:test";
import { createMatterhornServerClient } from "../src/app/lib/matterhorn-server";
import { notesScopeKey } from "../src/react-app/domains/notes/notes-scope-key";

test("notes retain their scope on rerender but isolate different workspaces and clients", () => {
  const first = createMatterhornServerClient({ baseUrl: "http://localhost:1" });
  const replacement = createMatterhornServerClient({ baseUrl: "http://localhost:1" });
  const key = notesScopeKey("workspace", first);
  expect(notesScopeKey("workspace", first)).toBe(key);
  expect(notesScopeKey("workspace", replacement)).not.toBe(key);
  expect(notesScopeKey("other", first)).not.toBe(key);
  expect(notesScopeKey("workspace", null)).not.toBe(key);
  expect(notesScopeKey("workspace", null)).toBe(notesScopeKey("workspace", null));
});

test("notes scope keys do not contain connection credentials or URLs", () => {
  const client = createMatterhornServerClient({ baseUrl: "http://localhost:9", token: "fixture-only-credential" });
  const key = notesScopeKey("workspace", client);
  expect(key).not.toContain(client.token);
  expect(key).not.toContain(client.baseUrl);
});
