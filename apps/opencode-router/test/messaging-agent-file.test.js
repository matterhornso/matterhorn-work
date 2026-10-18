import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { link, mkdtemp, mkdir, open, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MESSAGING_AGENT_FILE_MAX_BYTES, readMessagingAgentFile } from "../dist/messaging-agent-file.js";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "router-agent-file-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, path: join(root, "opencode-router.md") };
}

test("reads UTF-8 instructions without changing prompt text and closes its descriptor", async (t) => {
  const { path } = await fixture(t);
  const text = "  @agent review\n\nKeep these instructions. 🏔️\n";
  await writeFile(path, text);
  let opened;
  const snapshot = await readMessagingAgentFile(path, {
    openFile: async (file, flags) => {
      assert.ok(flags & constants.O_NOFOLLOW);
      assert.ok(flags & constants.O_NONBLOCK);
      opened = await open(file, flags);
      return opened;
    },
  });
  assert.equal(snapshot.text, text);
  assert.equal(opened.fd, -1);
  assert.equal((await readMessagingAgentFile(path)).cacheKey, snapshot.cacheKey);
});

test("refuses final symlinks, directories and missing files", async (t) => {
  const { root, path } = await fixture(t);
  const target = join(root, "synthetic-target.md");
  await writeFile(target, "synthetic target, never prompt content");
  await symlink(target, path);
  await assert.rejects(readMessagingAgentFile(path), { code: "ELOOP" });
  const directory = join(root, "directory");
  await mkdir(directory);
  await assert.rejects(readMessagingAgentFile(directory), /regular file/);
  await assert.rejects(readMessagingAgentFile(join(root, "missing.md")), { code: "ENOENT" });
});

test("reads only the opened inode after its pathname is replaced with a symlink", async (t) => {
  const { root, path } = await fixture(t);
  await writeFile(path, "original workspace instructions");
  const target = join(root, "synthetic-target.md");
  await writeFile(target, "replacement target must not enter prompt");
  const snapshot = await readMessagingAgentFile(path, {
    openFile: async (file, flags) => {
      const handle = await open(file, flags);
      try {
        await rename(path, join(root, "opened-inode.md"));
        await symlink(target, path);
        return handle;
      } catch (error) {
        await handle.close();
        throw error;
      }
    },
  });
  assert.equal(snapshot.text, "original workspace instructions");
  await assert.rejects(readMessagingAgentFile(path), { code: "ELOOP" });
});

test("refuses multiply linked instruction files", async (t) => {
  const { root, path } = await fixture(t);
  await writeFile(path, "synthetic instructions");
  await link(path, join(root, "second-link.md"));
  await assert.rejects(readMessagingAgentFile(path), /multiple hard links/);
});

test("bounds file size before reading and closes rejected descriptors", async (t) => {
  const { path } = await fixture(t);
  await writeFile(path, Buffer.alloc(MESSAGING_AGENT_FILE_MAX_BYTES + 1, 120));
  let opened;
  let reads = 0;
  await assert.rejects(readMessagingAgentFile(path, {
    openFile: async (file, flags) => {
      opened = await open(file, flags);
      const read = opened.read.bind(opened);
      opened.read = (...args) => { reads += 1; return read(...args); };
      return opened;
    },
  }), /size limit/);
  assert.equal(reads, 0);
  assert.equal(opened.fd, -1);
});

test("bounds growth after fstat and rejects content mutation during the read", async (t) => {
  const { path } = await fixture(t);
  for (const [replacement, expected] of [["longer fixture", /size limit/], ["other", /changed while being read/]]) {
    await writeFile(path, "first");
    let opened;
    let changed = false;
    await assert.rejects(readMessagingAgentFile(path, {
      maxBytes: 5,
      openFile: async (file, flags) => {
        opened = await open(file, flags);
        const read = opened.read.bind(opened);
        opened.read = async (...args) => {
          if (!changed) {
            changed = true;
            await writeFile(path, replacement);
          }
          return read(...args);
        };
        return opened;
      },
    }), expected);
    assert.equal(opened.fd, -1);
  }
});

test("cache identity changes when a replacement inode has the same text", async (t) => {
  const { root, path } = await fixture(t);
  await writeFile(path, "same instructions");
  const first = await readMessagingAgentFile(path);
  const replacement = join(root, "replacement.md");
  await writeFile(replacement, "same instructions");
  await rename(replacement, path);
  const next = await readMessagingAgentFile(path);
  assert.equal(next.text, first.text);
  assert.notEqual(next.cacheKey, first.cacheKey);
});

test("accepts an empty file and exact byte limit; rejects unsafe limits", async (t) => {
  const { path } = await fixture(t);
  await writeFile(path, "");
  assert.equal((await readMessagingAgentFile(path, { maxBytes: 0 })).text, "");
  await writeFile(path, "12345");
  assert.equal((await readMessagingAgentFile(path, { maxBytes: 5 })).text, "12345");
  for (const maxBytes of [-1, 0.5, Infinity, MESSAGING_AGENT_FILE_MAX_BYTES + 1]) {
    await assert.rejects(readMessagingAgentFile(path, { maxBytes }), /Invalid/);
  }
});

test("refuses a FIFO without waiting for a writer", { skip: process.platform === "win32", timeout: 2_000 }, async (t) => {
  const { path } = await fixture(t);
  execFileSync("mkfifo", [path]);
  await assert.rejects(readMessagingAgentFile(path), /regular file/);
});
