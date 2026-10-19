import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, chmod, symlink, link, mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeUiControlDiscovery } from "./ui-control-discovery.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ui-control-discovery-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("discovery tokens are private on creation and rotation without changing parent permissions", async (t) => {
  const root = await fixture(t);
  await chmod(root, 0o750);
  const destination = path.join(root, "matterhorn-work-ui-control.json");
  await writeUiControlDiscovery(destination, '{"token":"synthetic-first"}\n');
  assert.equal(await readFile(destination, "utf8"), '{"token":"synthetic-first"}\n');
  if (process.platform !== "win32") assert.equal((await stat(destination)).mode & 0o777, 0o600);
  await chmod(destination, 0o644);
  await writeUiControlDiscovery(destination, '{"token":"synthetic-rotated"}\n');
  assert.equal(await readFile(destination, "utf8"), '{"token":"synthetic-rotated"}\n');
  if (process.platform !== "win32") {
    assert.equal((await stat(destination)).mode & 0o777, 0o600);
    assert.equal((await stat(root)).mode & 0o777, 0o750);
  }
  assert.deepEqual(await readdir(root), ["matterhorn-work-ui-control.json"]);
});

test("rotation replaces a symlink or hardlink leaf without modifying its target", async (t) => {
  const root = await fixture(t);
  const sentinel = path.join(root, "sentinel.json");
  await writeFile(sentinel, "unchanged fixture", { mode: 0o640 });
  for (const [name, makeLink] of [["symbolic", symlink], ["hard", link]]) {
    const destination = path.join(root, `${name}.json`);
    await makeLink(sentinel, destination);
    await writeUiControlDiscovery(destination, "synthetic token");
    assert.equal(await readFile(sentinel, "utf8"), "unchanged fixture");
    assert.equal(await readFile(destination, "utf8"), "synthetic token");
    assert.notEqual((await stat(destination)).ino, (await stat(sentinel)).ino);
    if (process.platform !== "win32") assert.equal((await stat(destination)).mode & 0o777, 0o600);
  }
  assert.equal((await readdir(root)).some((entry) => entry.startsWith(".ui-control-")), false);
});

test("failed publication preserves the existing destination and cleans private staging", async (t) => {
  const root = await fixture(t);
  const destination = path.join(root, "occupied");
  await mkdir(destination);
  await writeFile(path.join(destination, "sentinel"), "unchanged fixture");
  await assert.rejects(writeUiControlDiscovery(destination, "synthetic token"));
  assert.equal(await readFile(path.join(destination, "sentinel"), "utf8"), "unchanged fixture");
  assert.deepEqual(await readdir(root), ["occupied"]);
});

test("desktop publishes both discovery aliases through the private writer", async () => {
  const source = await readFile(new URL("./main.mjs", import.meta.url), "utf8");
  assert.ok(source.includes('from "./ui-control-discovery.mjs"'));
  assert.ok(source.includes("writeUiControlDiscovery(discoveryPath, discoveryPayload)"));
  assert.equal(source.includes("writeFile(discoveryPath, discoveryPayload"), false);
});
