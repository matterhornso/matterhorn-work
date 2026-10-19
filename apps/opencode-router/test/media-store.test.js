import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MediaStore } from "../dist/media-store.js";
import { publicRouterFailure } from "../dist/public-control-error.js";

const input = {
  channel: "telegram",
  identityId: "default",
  peerId: "12345",
  kind: "file",
  filename: "report.pdf",
  mimeType: "application/pdf",
};

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "matterhorn-media-store-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "media");
  return { directory, root, store: new MediaStore(root) };
}

test("same-name concurrent inbound attachments retain separate bytes and display names", async (t) => {
  const { store } = await fixture(t);
  await store.ensureReady();
  const [first, second] = await Promise.all([
    store.saveInboundBuffer({ ...input, buffer: Buffer.from("first") }),
    store.saveInboundBuffer({ ...input, buffer: Buffer.from("second") }),
  ]);
  assert.notEqual(first.filePath, second.filePath);
  assert.equal(first.filename, "report.pdf");
  assert.equal(second.filename, "report.pdf");
  assert.equal(await fs.readFile(first.filePath, "utf8"), "first");
  assert.equal(await fs.readFile(second.filePath, "utf8"), "second");
  assert.equal(first.sizeBytes, 5);
  assert.equal(second.sizeBytes, 6);
});

test("new media directories and files are private without changing existing directory modes", async (t) => {
  const { store, root } = await fixture(t);
  await store.ensureReady();
  const saved = await store.saveInboundBuffer({ ...input, buffer: Buffer.from("data") });
  if (process.platform === "win32") return; // POSIX mode bits do not certify Windows ACLs.
  assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.dirname(saved.filePath))).mode & 0o777, 0o700);
  assert.equal((await fs.stat(saved.filePath)).mode & 0o777, 0o600);
  await fs.chmod(root, 0o750);
  await store.ensureReady();
  await store.saveInboundBuffer({ ...input, buffer: Buffer.from("later") });
  assert.equal((await fs.stat(root)).mode & 0o777, 0o750);
});

test("dot-only directory identifiers stay in their own inbound segments", async (t) => {
  const { store, root } = await fixture(t);
  const saved = await store.saveInboundBuffer({
    ...input, channel: "..", identityId: ".", peerId: "..", buffer: Buffer.from("data"),
  });
  const segments = path.relative(root, saved.filePath).split(path.sep);
  assert.equal(segments[0], "inbound");
  assert.match(segments[1], /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(segments.slice(2, 5), ["unknown", "unknown", "unknown"]);
  assert.equal(segments.length, 6);
});

test("outbound validation retains useful HTTP statuses without file paths", async (t) => {
  const { store, root } = await fixture(t);
  await store.ensureReady();
  const saved = await store.saveInboundBuffer({ ...input, buffer: Buffer.from("content") });
  const cases = [
    [{ filePath: "" }, 400, "filePath is required"],
    [{ filePath: "../outside" }, 400, "File path must stay within the active workspace."],
    [{ filePath: "missing-sensitive-name.txt" }, 404, "File not found."],
    [{ filePath: "." }, 400, "Not a file."],
    [{ filePath: saved.filePath, maxBytes: 1 }, 413, "File exceeds maximum allowed size."],
  ];
  for (const [options, status, message] of cases) {
    await assert.rejects(store.resolveOutboundFile({ baseDirectory: root, ...options }), (error) => {
      assert.deepEqual(publicRouterFailure(error), { status, message });
      assert.equal(error.message.includes(root), false);
      return true;
    });
  }
  assert.equal((await store.resolveOutboundFile({ baseDirectory: root, filePath: saved.filePath })).filePath, saved.filePath);
});
